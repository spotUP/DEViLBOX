---
date: 2026-02-27
topic: uade-format-reverse-engineering-handover
tags: [uade, amiga, reverse-engineering, handover, onboarding]
status: final
---

# UADE Format Reverse-Engineering: Handover & Agent Guide

This document explains the full process for implementing native WASM synths for Amiga music formats
that currently fall through to UADE's 68k emulation. Read this before claiming any format from
[`docs/uade-reverse-engineering-progress.md`](uade-reverse-engineering-progress.md).

---

## Context

DEViLBOX plays 130+ Amiga music formats via UADE (Universal Amiga Demod-player), a 68k CPU
emulator that runs the original Amiga replay routines. While UADE works for playback, it produces
opaque `UADESynth` instruments with no editable parameters and no real instrument names.

The goal: implement native WASM synths for each format so DEViLBOX can:
- Show real instrument names extracted from the file
- Let users edit synthesis parameters (cutoff, waveform, ADSR, etc.)
- Play audio without needing UADE's 68k emulation

**Proven pattern:** 12 formats are already fully native (SoundMon, SidMon1/2, DigMug, FC, TFMX,
Fred, OctaMED, HippelCoSo, RobHubbard, DavidWhittaker, Symphonie, HivelyTracker).

---

## How to Claim a Format

1. Open [`docs/uade-reverse-engineering-progress.md`](uade-reverse-engineering-progress.md)
2. Find a format with status `not-started`
3. Change its status to `claimed by <your-agent-id> YYYY-MM-DD` and update the file
4. Work through the pipeline steps below
5. Update the status and checkboxes as you complete each step

**Parallel work:** Multiple agents CAN work on different formats simultaneously.
Never claim a format already claimed by another agent.

---

## Full Implementation Pipeline

### Step 1 — Binary Analysis

```bash
# Hex dump, strings, instrument table scan, Amiga fingerprints
npx tsx scripts/binary-inspector.ts "Reference Music/<Format>/<file>" --all

# Get eagleplayer info (player name, binary path, size, options)
npx tsx scripts/eagleplayer-info.ts --ext <ext>
```

**What to look for:**
- Magic bytes at offset 0 (format identifier)
- Instrument table: look for repeating fixed-stride patterns at offsets 0x10–0x400
  - 22-byte stride = ProTracker-style sample header
  - 30-byte stride = common Amiga instrument struct
  - 40-byte stride = extended instrument with envelope
- Instrument names: ASCII strings before or inside instrument structs
- Waveform/macro data: byte arrays at the end of the file
- Song data: pattern/row arrays with note + instrument + effect columns

**Record your findings** in the "Binary analysis findings" section of the format entry.

---

### Step 2 — Eagleplayer Binary Analysis (if needed)

If the TypeScript binary analysis doesn't reveal enough structure, disassemble the eagleplayer binary:

```bash
# The eagleplayer binary is a 68k executable
ls -la "Reference Code/uade-3.05/players/<PlayerName>"

# Use objdump or a 68k disassembler to read it
# On macOS: install m68k-linux-gnu-objdump via cross-tools, or use online disassemblers
# The player binary implements: init(), play(), and sample data tables
```

The eagleplayer binary shows:
- Register offsets for instrument struct fields
- Sample playback calls (custom.period, custom.dmacon, etc.)
- Synthesis opcodes (volume tables, waveform switching, ADSR state machine)

---

### Step 3 — Extend the TypeScript Parser

**File to create or extend:** `src/lib/import/formats/<FormatName>Parser.ts`

Look at `src/lib/import/formats/SoundMonParser.ts` as a template:

```typescript
// Key things the parser must do:
// 1. Detect the format (magic bytes or extension check)
// 2. Parse the instrument struct at the correct offset
// 3. Emit InstrumentConfig with synthType: '<FormatName>Synth'
// 4. Extract real instrument names (not "Instrument 1")
// 5. Return a TrackerSong with patterns if the format has them

// Instrument struct parsing (example for a 30-byte struct):
const instrOffset = header.instrumentTableOffset;
for (let i = 0; i < numInstruments; i++) {
  const base = instrOffset + i * 30;
  const name = readNullTerminatedString(data, base, 16);
  const waveformId = data[base + 16];
  const volume = data[base + 17];
  const attack = data[base + 18];
  const decay = data[base + 19];
  // ... etc
  instruments.push({ name, synthType: '<FormatName>Synth', config: { waveformId, volume, attack, decay } });
}
```

**Types to add in `src/types/instrument.ts`:**

```typescript
// Add to SynthType union:
| '<FormatName>Synth'

// Add Config interface:
export interface <FormatName>Config {
  waveformId: number;   // 0-N
  volume: number;       // 0-64 or 0-255
  attack: number;       // 0-15 or similar
  // ... other params
}
```

**Wire up in `src/lib/import/parseModuleToSong.ts`:**

```typescript
if (/\.<ext>$/.test(filename)) {
  if (prefs.<formatName> === 'native') {
    try {
      const { parse<FormatName>File } = await import('@lib/import/formats/<FormatName>Parser');
      return parse<FormatName>File(buffer, file.name);
    } catch (err) {
      console.warn(`[<FormatName>Parser] Native parse failed, falling back:`, err);
    }
  }
  const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
  return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
}
```

---

### Step 4 — Build the WASM Synth

**Directory to create:** `<formatname>-wasm/`

Follow the pattern from `soundmon-wasm/`:

```
<formatname>-wasm/
  CMakeLists.txt          # Emscripten build config
  include/
    format_synth_api.h    # Copy from soundmon-wasm/include/ (DO NOT MODIFY)
  src/
    <formatname>_synth.c  # The synth implementation
```

**C API contract** (from `soundmon-wasm/include/format_synth_api.h`):

```c
// The WASM module must export:
void synth_init(int sample_rate);
void synth_set_instrument(int channel, const uint8_t* data, int len);
void synth_note_on(int channel, int note, int velocity);
void synth_note_off(int channel);
void synth_render(float* left, float* right, int frames);
```

**Build the WASM:**
```bash
cd <formatname>-wasm
mkdir build && cd build
emcmake cmake ..
emmake make
# Output: ../../public/<formatname>/<FormatName>.wasm + .worklet.js
```

**Build command in `package.json`** (add to scripts):
```json
"build:<formatname>-wasm": "cd <formatname>-wasm/build && emcmake cmake .. && emmake make"
```

---

### Step 5 — AudioWorklet

**File to create:** `public/<formatname>/<FormatName>.worklet.js`

Use `public/hively/Hively.worklet.js` as a template. Key points:
- Load the WASM module via `createXXX({})`
- `process()` calls `_render()` to fill the output buffer
- Handle note-on/note-off/parameter messages from the main thread
- Force correct initialization (e.g., `_init(sampleRate)` in constructor)

---

### Step 6 — TypeScript Engine + Synth Class

**Files to create:**
- `src/engine/<formatname>/<FormatName>Engine.ts` — singleton WASM loader
- `src/engine/<formatname>/<FormatName>Synth.ts` — implements `DevilboxSynth`

Use `src/engine/hively/HivelySynth.ts` as the cleanest template.

```typescript
// HivelySynth pattern:
export class <FormatName>Synth implements DevilboxSynth {
  private worklet: AudioWorkletNode;

  constructor(ctx: AudioContext, config: <FormatName>Config) {
    this.worklet = new AudioWorkletNode(ctx, '<formatname>-processor');
    this.applyConfig(config);
  }

  applyConfig(config: <FormatName>Config) {
    this.worklet.port.postMessage({ type: 'set-config', config });
  }

  triggerAttack(note: number, velocity: number) {
    this.worklet.port.postMessage({ type: 'note-on', note, velocity });
  }

  triggerRelease() {
    this.worklet.port.postMessage({ type: 'note-off' });
  }

  dispose() { this.worklet.disconnect(); }
  connect(dest: AudioNode) { this.worklet.connect(dest); }
}
```

---

### Step 7 — UI Controls

**File to create:** `src/components/instruments/controls/<FormatName>Controls.tsx`

Use `src/components/instruments/controls/SoundMonControls.tsx` as the simplest template.

Key points:
- Use the `configRef` pattern (see CLAUDE.md section on Knob/Control Handling Pattern)
- Each synth parameter gets a `<Knob>` or `<Select>` component
- Follow existing styling conventions (same CSS classes as other controls)

---

### Step 8 — Wire Up

**ToneEngine.ts** — add to `WASM_SYNTH_TYPES`:
```typescript
const WASM_SYNTH_TYPES = new Set([
  // ... existing ...
  '<FormatName>Synth',
]);
```

**InstrumentFactory.ts** — add case:
```typescript
case '<FormatName>Synth':
  return new <FormatName>Synth(ctx, config as <FormatName>Config);
```

**UnifiedInstrumentEditor.tsx** — add routing:
```typescript
case '<FormatName>Synth':
  return <FormatName>Controls config={config as <FormatName>Config} onChange={onChange} />;
```

---

### Step 9 — Tests

**File to create:** `src/lib/import/__tests__/<FormatName>Parser.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse<FormatName>File } from '../formats/<FormatName>Parser';

const SAMPLE_FILE = resolve('Reference Music/<Format>/<sample>.<ext>');

describe('<FormatName>Parser', () => {
  it('parses instrument names', () => {
    const buf = readFileSync(SAMPLE_FILE).buffer;
    const song = parse<FormatName>File(buf, SAMPLE_FILE);
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments[0].name).not.toBe('Instrument 1');
    expect(song.instruments[0].synthType).toBe('<FormatName>Synth');
  });
});
```

Run: `npx vitest run src/lib/import/__tests__/<FormatName>Parser.test.ts`

---

### Step 10 — Verify

**Automated:**
```bash
npx tsc --noEmit                              # No TypeScript errors
npx vitest run src/lib/import/__tests__/<FormatName>Parser.test.ts  # Parser tests pass
```

**Manual (in DEViLBOX UI):**
1. Load a reference file from `Reference Music/<Format>/`
2. Instrument list shows **real instrument names** (not "Instrument 1")
3. Individual instruments trigger **sound** on piano keyboard click
4. Instrument editor **opens** and shows format-specific parameters
5. Parameters **can be changed** and sound updates in real time
6. Console shows **no UADE load messages** for this format

Once all 10 steps pass, mark the format as `complete` in the progress doc.

---

## Key Files Reference

| File | Role |
|------|------|
| `src/lib/import/formats/UADEParser.ts` | `UADE_EXTENSIONS` set, catch-all parser |
| `src/lib/import/parseModuleToSong.ts` | Format routing dispatch |
| `src/types/instrument.ts` | All Config types + SynthType union |
| `src/engine/ToneEngine.ts` | WASM_SYNTH_TYPES registration |
| `src/engine/InstrumentFactory.ts` | Synth instantiation cases |
| `src/components/instruments/editors/UnifiedInstrumentEditor.tsx` | UI editor routing |
| `soundmon-wasm/include/format_synth_api.h` | C WASM API contract |
| `Reference Code/uade-3.05/eagleplayer.conf` | Player → extension mapping |
| `Reference Code/uade-3.05/players/` | Compiled eagleplayer binaries |

## Analysis Tools

| Tool | Usage |
|------|-------|
| `scripts/uade-audit.ts` | `npx tsx scripts/uade-audit.ts` — full synthesis status audit |
| `scripts/count-ref-files.ts` | `npx tsx scripts/count-ref-files.ts` — format popularity by file count |
| `scripts/binary-inspector.ts` | `npx tsx scripts/binary-inspector.ts <file> --all` — binary analysis |
| `scripts/eagleplayer-info.ts` | `npx tsx scripts/eagleplayer-info.ts --ext <ext>` — player info |

## Critical Rules (from CLAUDE.md)

1. **ALWAYS use the knob/control ref pattern** — see CLAUDE.md "Knob/Control Handling Pattern"
2. **NEVER use `git add -A`** — add specific files only
3. **NEVER commit `thoughts/` directory**
4. **Always run `tsc --noEmit` after code changes**
5. **Always check Reference Code first** — never guess format structures

---

## Quick-Start Checklist for a New Format

```
[ ] Read this document
[ ] Pick an unclaimed format from uade-reverse-engineering-progress.md
[ ] Claim it (change status, save file)
[ ] Run: npx tsx scripts/eagleplayer-info.ts --ext <ext>
[ ] Run: npx tsx scripts/binary-inspector.ts "Reference Music/<dir>/<file>" --all
[ ] Map instrument struct layout from binary analysis
[ ] Create <FormatName>Parser.ts
[ ] Add <FormatName>Config + '<FormatName>Synth' to src/types/instrument.ts
[ ] Wire up in parseModuleToSong.ts
[ ] Build <formatname>-wasm/
[ ] Create AudioWorklet (public/<formatname>/<FormatName>.worklet.js)
[ ] Create TypeScript engine + synth class
[ ] Create UI controls
[ ] Wire up in ToneEngine + InstrumentFactory + UnifiedInstrumentEditor
[ ] Write tests
[ ] Run: npx tsc --noEmit (no errors)
[ ] Run: npx vitest run (tests pass)
[ ] Manual verification in UI
[ ] Mark format as complete in progress doc
```
