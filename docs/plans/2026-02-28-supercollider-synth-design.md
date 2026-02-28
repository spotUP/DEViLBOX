---
date: 2026-02-28
topic: supercollider-synth
tags: [supercollider, synth, wasm, audioworklet, presets]
status: approved
---

# SuperCollider Synth for DEViLBOX — Design

## Goal

Add a SuperCollider synth instrument type to DEViLBOX that lets users:
- Write real SuperCollider SynthDef code in-app
- Compile it server-side (sclang on existing backend)
- Play it live via scsynth.wasm (scsynth + sc3-plugins) in an AudioWorklet
- Tweak parameters via auto-extracted knobs
- Save/load/import/export presets as `.scpreset` files

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  DEViLBOX Browser                                               │
│                                                                 │
│  SuperColliderEditor.tsx                                        │
│  ├─ CodeMirror 6 SC editor  ──→  POST /api/sc/compile           │
│  ├─ Auto-extracted knobs    ←──  { binary, params }             │
│  └─ Import / Export .scpreset                                   │
│                                                                 │
│  SuperColliderSynth.ts  →  SuperColliderEngine.ts               │
│       (DevilboxSynth)            (AudioWorklet mgr)             │
│                                        │  OSC messages          │
│                              SC.worklet.js (AudioWorkletNode)   │
│                                        │  WASM calls            │
│                              scsynth.wasm (scsynth + sc3-plugins)│
│                                        │                        │
│                              synthBus ──→ ToneEngine → output   │
└─────────────────────────────────────────────────────────────────┘
         │
         │ HTTP
         ▼
┌─────────────────────┐
│  Existing backend   │
│  POST /api/sc/compile│
│  sclang → .scsyndef │
│  + param extraction │
└─────────────────────┘
```

---

## WASM Binary

Use the **extended build** from [scsynth-wasm-builds](https://github.com/rd--/scsynth-wasm-builds):
- Includes: sc3-plugins (Bhob, MCLD, Josh, SkUGens, VOSIM), portedplugins, vb, sc3-rdu
- 256MB initial memory, 16MB OSC packet size
- Host at: `public/sc/SC.wasm` + `public/sc/SC.js`

---

## New Files

| File | Purpose |
|---|---|
| `public/sc/SC.worklet.js` | AudioWorklet processor — WASM lifecycle, OSC ring buffer, DEViLBOX pattern |
| `public/sc/SC.wasm` | scsynth WASM binary (extended build) |
| `public/sc/SC.js` | scsynth JS glue |
| `src/engine/sc/SuperColliderEngine.ts` | Manages worklet lifecycle, SynthDef loading, node I/O |
| `src/engine/sc/SuperColliderSynth.ts` | Implements `DevilboxSynth`, maps notes → OSC |
| `src/engine/sc/oscEncoder.ts` | Tiny OSC 1.0 message encoder (no external deps) |
| `src/components/instruments/SuperColliderEditor.tsx` | Code editor + knob panel + compile button |

## Modified Files

| File | Change |
|---|---|
| `src/types/instrument.ts` | Add `SuperCollider` to `SynthType`, `SuperColliderConfig`, `DEFAULT_SUPERCOLLIDER` |
| `src/engine/InstrumentFactory.ts` | Add `SuperCollider` case |
| `src/engine/registry/SynthRegistry.ts` | Register `SuperColliderSynth` |

---

## Types

```typescript
// In SynthType union:
| 'SuperCollider'

// SuperColliderConfig:
interface SuperColliderConfig {
  synthDefName: string;      // Name declared in SynthDef(\name, ...)
  source: string;            // SC source code (for display/editing)
  binary: string;            // base64-encoded compiled .scsyndef
  params: SCParam[];         // Tweakable parameters (excl. freq/amp/gate)
}

interface SCParam {
  name: string;
  value: number;       // Current value
  default: number;     // Extracted from SynthDef source
  min: number;         // User-adjustable range
  max: number;
}

// DEFAULT_SUPERCOLLIDER:
const DEFAULT_SUPERCOLLIDER: SuperColliderConfig = {
  synthDefName: '',
  source: `SynthDef(\\mySynth, { |freq=440, amp=0.5, gate=1|
  var sig = SinOsc.ar(freq) * amp;
  var env = EnvGen.kr(Env.adsr(0.01, 0.1, 0.7, 0.5), gate, doneAction: 2);
  Out.ar(0, (sig * env).dup);
}).add`,
  binary: '',
  params: [],
};
```

---

## Compilation Server

**Endpoint:** `POST /api/sc/compile`

**Request:**
```json
{ "source": "SynthDef(\\acidBass, { |freq=440, cutoff=800, resonance=0.3, gate=1| ... }).add" }
```

**Response (success):**
```json
{
  "success": true,
  "synthDefName": "acidBass",
  "binary": "<base64 .scsyndef>",
  "params": [
    { "name": "cutoff",    "default": 800,  "min": 20,  "max": 20000 },
    { "name": "resonance", "default": 0.3,  "min": 0,   "max": 1    }
  ]
}
```
Note: `freq`, `amp`, `gate` are excluded from params (reserved for playback).

**Response (error):**
```json
{
  "success": false,
  "error": "ERROR: SyntaxError: unexpected token",
  "line": 4,
  "col": 12
}
```

**Server implementation:**
1. Write source to temp file
2. `sclang -e "source.interpret; 0.exit"` (or equivalent)
3. Capture .scsyndef output from working directory
4. Parse SynthDef args via regex on source for defaults
5. Return binary + params

---

## OSC Message Layer

**Key messages to implement in `oscEncoder.ts`:**
- `/d_recv <binary>` — Load SynthDef
- `/s_new <defName> <nodeId> <addAction> <targetId> [key val ...]` — Create synth node
- `/n_set <nodeId> [key val ...]` — Set node parameters
- `/n_free <nodeId>` — Release node

**Communication pattern (same as UADE):**
- Main thread → worklet: `port.postMessage({ type, data })` with ArrayBuffer transfers
- Worklet → main: `port.postMessage({ type, data })`
- OSC packets written to ring buffer in shared ArrayBuffer, consumed by WASM tick

---

## Note Playback Flow

```
SuperColliderSynth.triggerAttack(note, velocity)
  → freq = midiToHz(note)
  → nodeId = nextNodeId++
  → engine.noteOn(nodeId, synthDefName, { freq, amp: velocity/127, gate: 1, ...currentParams })
    → OSC /s_new "synthDefName" nodeId 0 0 "freq" 440 "amp" 0.8 "gate" 1 "cutoff" 800 ...

SuperColliderSynth.triggerRelease()
  → engine.noteOff(nodeId)
    → OSC /n_set nodeId "gate" 0
```

---

## Preset Format (.scpreset)

```json
{
  "version": 1,
  "name": "Acid Bass",
  "synthDefName": "acidBass",
  "source": "SynthDef(\\acidBass, { |freq=440, cutoff=800, resonance=0.3, gate=1|\n  ...\n}).add",
  "binary": "<base64 .scsyndef>",
  "params": [
    { "name": "freq",      "value": 440,  "min": 20,   "max": 8000,  "default": 440  },
    { "name": "cutoff",    "value": 800,  "min": 20,   "max": 20000, "default": 800  },
    { "name": "resonance", "value": 0.3,  "min": 0,    "max": 1,     "default": 0.3  }
  ]
}
```

Import/export uses existing `exportInstrument()`/`importInstrument()` infrastructure from `src/lib/export/exporters.ts`.

---

## Editor UI Layout

```
┌─────────────────────────────────────────────────────┐
│ SuperCollider  [Preset: "Acid Bass" ▾] [Import] [Export]│
├─────────────────────────────────┬───────────────────┤
│                                 │  PARAMETERS       │
│  SynthDef(\acidBass, {          │                   │
│    |freq=440, cutoff=800,       │  cutoff    [▬▬▬○] │
│     resonance=0.3, gate=1|      │  resonance [▬▬○  ]│
│    var sig = VarSaw.ar(freq);   │  decay     [▬○   ]│
│    var filt = RLPF.ar(sig,      │  amp       [▬▬▬▬○]│
│      cutoff, resonance);        │                   │
│    var env = EnvGen.kr(         │  + / - params     │
│      Env.adsr, gate,            │                   │
│      doneAction: 2);            │                   │
│    Out.ar(0, filt * env);       │                   │
│  }).add                         │                   │
│                                 │                   │
├─────────────────────────────────┴───────────────────┤
│ [▶ Compile & Load]   ● Compiled  ⚠ Error on line 4  │
└─────────────────────────────────────────────────────┘
```

- **Left pane:** CodeMirror 6 with SuperCollider syntax highlighting
- **Right pane:** Auto-generated sliders/knobs per param (excluding `freq`, `amp`, `gate`)
- **Status bar:** idle / compiling / ✓ compiled / ✗ error:line:col
- **Param ranges:** user can click param name to edit min/max

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Compilation error | Highlight error line in editor, show error message in status bar |
| WASM not ready | Queue SynthDef load + note-on, replay on ready |
| No binary yet | Show "⚠ Not compiled" badge, editor still usable |
| Server unreachable | Show "⚠ Compilation server unavailable", preserve existing binary |
| Invalid .scpreset on import | Show parse error, do not update state |

---

## Testing

- **Unit:** `oscEncoder.ts` — encode/decode round-trips for all message types
- **Unit:** Param extraction from SC source — edge cases (no args, complex defaults like `LFNoise0.kr(1)`)
- **Integration:** `POST /api/sc/compile` with real sclang (CI Docker with SC installed)
- **E2E:** Load preset → play note → assert audio output non-silent (OfflineAudioContext)

---

## References

- [SuperSonic (scsynth in browser)](https://github.com/samaaron/supersonic) — Sam Aaron
- [scsynth-wasm-builds](https://github.com/rd--/scsynth-wasm-builds) — Hanns Holger Rutz
- [SuperCollider WASM PR #6569](https://github.com/supercollider/supercollider/pull/6569)
- DEViLBOX UADE pattern: `public/uade/UADE.worklet.js`, `src/engine/uade/UADEEngine.ts`
