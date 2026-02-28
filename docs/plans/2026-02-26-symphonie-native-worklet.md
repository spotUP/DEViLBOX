---
date: 2026-02-26
topic: symphonie-native-worklet
tags: [symphonie, amiga, audio-worklet, dsp, playback, 1:1]
status: draft
---

# Symphonie Pro Native AudioWorklet Replayer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace UADE delegation for `.symmod` files with a 100% 1:1 TypeScript AudioWorklet replayer ported from Patrick Meng's 2008 Java reference implementation, with complete DSP echo/delay effects.

**Architecture:** The Java replayer (`/Users/spot/Downloads/SymphoniePlayer/`) is the authoritative reference; a java2typescript transpile already lives at `/tmp/symtest/out/symreader/`. The monolithic worklet (`public/symphonie/Symphonie.worklet.js`) contains a de-jree'd port of `VoiceExpander.java`. A TypeScript singleton `SymphonieEngine.ts` follows the existing `SoundMonEngine.ts` pattern. Integration follows the `TFMXSynth`/`FCEngine` model: one instrument in the TrackerSong carries `synthType: 'SymphonieSynth'` and a `config.symphonie` holding all playback data.

**Tech Stack:** TypeScript engine + vanilla-JS AudioWorklet (no module imports), Web Audio API, `Float32Array` PCM, existing `SymphonieProParser.ts` extended with sample extraction.

---

## Reference Sources

| What | Where |
|---|---|
| Authoritative Java replayer | `/Users/spot/Downloads/SymphoniePlayer/src/symreader/` |
| Transpiled TypeScript (read-only) | `/tmp/symtest/out/symreader/*.ts` |
| Engine pattern to clone | `src/engine/soundmon/SoundMonEngine.ts` |
| Synth wrapper pattern to clone | `src/engine/tfmx/TFMXSynth.ts` |
| InstrumentFactory wiring | `src/engine/InstrumentFactory.ts` (lines 865-920) |
| Parser to extend | `src/lib/import/formats/SymphonieProParser.ts` |
| Type definitions | `src/types/instrument.ts` |

---

## DSP Architecture (from VoiceExpander.java — understand before Task 3)

```
Ring buffer: Float32Array[64000 * 2] = 128 000 entries (shared for all channels)

DSP types: 0=Off, 1=CrEcho, 2=Echo, 3=Delay, 4=CrDelay
  Echo  / CrEcho: OverWritePrevSample=false  → buffer accumulates (echo tail)
  Delay / CrDelay: OverWritePrevSample=true  → buffer cleared after read (clean repeat)
  Cross (1,4): BufferLenSub=2               → 2-slot offset between L/R read ptrs

Per output sample per channel (PlayActualMixThread lines 1229-1246 of VoiceExpander.ts):
  1. drySample = getNextMixSample(ch)   // sums voices; non-NoDsp voices call
                                         //   DSP.addVoiceSampleIntoDSP(s) (no ptr advance)
  2. DSP.advanceWritePtr()              // advance write ptr (wraps at FXLength-BufferLenSub)
  3. wetSample = DSP.getWetMixSample()  // doDSP() → RingBuffer[readPtr]*=DSPIntensity,
                                         //   then read, optionally clear, return*WetMixVolume
  4. DSP.advanceReadPtr()               // advance read ptr
  5. output = (drySample + wetSample) * masterVolume

NoDsp instruments bypass addVoiceSampleIntoDSP (VoiceExpander.ts:1098-1100).
```

## Pattern Timing

```
samplesPerRow = Math.round(178900 * Cycle / BPM)   (VoiceExpander.ts line ~541)
```

## Instrument Loop Calculation (ImportSample.java)

```javascript
// loopStart and loopLen are stored as percentage × (100 × 256 × 256) in the file
loopStartSample = Math.floor((loopStart * numSamples) / (100 * 256 * 256));
loopLenSamples  = Math.floor((loopLen   * numSamples) / (100 * 256 * 256));
```

## Delta-Pack Decompression

Chunk types in `.symmod` for sample data:
- Chunk `-11` = raw 8-bit signed PCM
- Chunk `-17` = 8-bit delta (each byte is a signed delta, accumulate)
- Chunk `-18` = 16-bit delta (big-endian signed delta pairs, accumulate)

```javascript
// Chunk -17: 8-bit delta
function decodeDelta8(bytes) {                    // bytes: Uint8Array
  const out = new Float32Array(bytes.length);
  let acc = 0;
  for (let i = 0; i < bytes.length; i++) {
    acc = (acc + bytes[i]) & 0xFF;
    out[i] = (acc < 128 ? acc : acc - 256) / 128.0;
  }
  return out;
}

// Chunk -18: 16-bit delta
function decodeDelta16(bytes) {                   // bytes: Uint8Array
  const count = bytes.length >> 1;
  const out = new Float32Array(count);
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const delta = ((bytes[i*2] << 8) | (bytes[i*2+1] & 0xFF));
    const signedDelta = delta > 32767 ? delta - 65536 : delta;
    acc = ((acc + signedDelta) + 65536) & 0xFFFF;
    out[i] = (acc < 32768 ? acc : acc - 65536) / 32768.0;
  }
  return out;
}

// Chunk -11: raw 8-bit signed
function decodeRaw8(bytes) {                      // bytes: Uint8Array
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out[i] = (b < 128 ? b : b - 256) / 128.0;
  }
  return out;
}
```

## DSP Pattern Events (CMD_DSP_ECHO=24, CMD_DSP_DELAY=25)

From `ImportSongSymphonie.java` ConvertEvent():
- `ev.note`  → DSP type (0=Off, 1=CrEcho, 2=Echo, 3=Delay, 4=CrDelay)
- `ev.inst`  → feedback intensity 0-127 → divide by 127.0 → `DSPIntensity`
- `ev.param` → delay buffer length as percentage 0-127
  - Used to set `NewFXLength`: `NewDelayLen = ((FXLength-2) * param) / 100`

## jree Dependency Replacements (apply everywhere in worklet)

| jree construct | Replace with |
|---|---|
| `extends JavaObject` | remove (`super()` calls too) |
| `type int`, `type float`, `type short`, `type byte` | `number` |
| `java.lang.String` | `string` |
| `java.util.Arrays.fill(arr, 0.0)` | `arr.fill(0)` |
| `java.lang.Math.abs(x)` | `Math.abs(x)` |
| `java.lang.Thread.yield()` | remove |
| `javax.sound.sampled.*` | remove entirely |
| `Float64Array` (samples) | `Float32Array` |
| `Int8Array` (MixBuffer) | remove (not needed in worklet) |
| `S` (jree string helper) | remove |

---

## Task 1: Create SymphoniePlaybackData.ts interfaces

**Files:**
- Create: `src/engine/symphonie/SymphoniePlaybackData.ts`

**Step 1: Write the file**

```typescript
// src/engine/symphonie/SymphoniePlaybackData.ts

export interface SymphonieInstrumentData {
  name: string;
  type: number;              // 0=None, 4=Loop, 8=Sustain, -4=Kill, -8=Silent
  volume: number;            // 0-100
  tune: number;              // signed semitone offset (already includes downsample correction)
  fineTune: number;          // signed fine tune
  noDsp: boolean;            // if true, voice bypasses DSP ring buffer
  multiChannel: number;      // 0=mono, 1=stereoL, 2=stereoR, 3=lineSrc
  loopStart: number;         // raw file value (percentage × 100×256×256) — loop calc in worklet
  loopLen: number;           // raw file value
  numLoops: number;          // 0=infinite
  newLoopSystem: boolean;    // bit 4 of LineSampleFlags
  samples: Float32Array | null;       // null if type is -8/−4/0 (no PCM)
  sampledFrequency: number;  // original sample rate in Hz (0 if unknown → assume 8363)
}

export interface SymphonieDSPEvent {
  row: number;
  channel: number;
  type: number;      // 0=Off, 1=CrEcho, 2=Echo, 3=Delay, 4=CrDelay
  feedback: number;  // 0-127
  bufLen: number;    // 0-127 (percentage of max buffer)
}

export interface SymphoniePatternEvent {
  row: number;
  channel: number;
  note: number;       // 0=no note, 1-127=pitch index
  instrument: number; // 1-based, 0=no instrument change
  volume: number;     // 0-100; 255=no volume change
  cmd: number;
  param: number;
}

export interface SymphoniePattern {
  numRows: number;
  events: SymphoniePatternEvent[];
  dspEvents: SymphonieDSPEvent[];
}

export interface SymphoniePlaybackData {
  title: string;
  bpm: number;
  cycle: number;           // rows per pattern tick (1-8 typical)
  numChannels: number;
  orderList: number[];     // indices into patterns[]
  patterns: SymphoniePattern[];
  instruments: SymphonieInstrumentData[];
  globalDspType: number;   // song-level DSP type (0-4) from header
  globalDspFeedback: number;
  globalDspBufLen: number;
}
```

**Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors.

**Step 3: Commit**

```bash
git add src/engine/symphonie/SymphoniePlaybackData.ts
git commit -m "feat(symphonie): SymphoniePlaybackData interfaces"
```

---

## Task 2: Add parseSymphonieForPlayback() to SymphonieProParser.ts

**Files:**
- Modify: `src/lib/import/formats/SymphonieProParser.ts`

Read this file top-to-bottom before touching it. The existing `parseSymphonieProFile()` already walks chunks and returns a `TrackerSong`. The new `parseSymphonieForPlayback()` uses the same chunk-walking but extracts PCM + DSP data for the worklet.

**Step 1: Add the import at top of file**

After the existing imports, add:
```typescript
import type {
  SymphoniePlaybackData,
  SymphonieInstrumentData,
  SymphoniePattern,
  SymphoniePatternEvent,
  SymphonieDSPEvent,
} from '@/engine/symphonie/SymphoniePlaybackData';
```

**Step 2: Add delta-decode helpers after imports**

```typescript
// ── Delta-pack decompressors ──────────────────────────────────────────────────

function _decodeDelta8(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  let acc = 0;
  for (let i = 0; i < bytes.length; i++) {
    acc = (acc + bytes[i]) & 0xFF;
    out[i] = (acc < 128 ? acc : acc - 256) / 128.0;
  }
  return out;
}

function _decodeDelta16(bytes: Uint8Array): Float32Array {
  const count = bytes.length >> 1;
  const out = new Float32Array(count);
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const raw = (bytes[i * 2] << 8) | (bytes[i * 2 + 1] & 0xFF);
    const delta = raw > 32767 ? raw - 65536 : raw;
    acc = ((acc + delta) + 65536) & 0xFFFF;
    out[i] = (acc < 32768 ? acc : acc - 65536) / 32768.0;
  }
  return out;
}

function _decodeRaw8(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out[i] = (b < 128 ? b : b - 256) / 128.0;
  }
  return out;
}
```

**Step 3: Add parseSymphonieForPlayback() at end of file**

Study the existing parser's chunk-walking code first. The existing code already reads:
- Instrument name/definition blocks (every 256 bytes, chunkId > 0)
- Pattern data (chunkId = -2)
- Order list (chunkId = -3)
- Song header BPM/cycle (chunkId = -4)

The new function must ALSO collect:
- Sample PCM from chunkId -11 (raw 8-bit), -17 (delta-8), -18 (delta-16)
  - Samples arrive in instrument order — track a sample counter to map them to instruments
- DSP pattern events (cmd === CMD_DSP_ECHO || cmd === CMD_DSP_DELAY)
- Global DSP settings from song header

Key instrument data to extract (from ImportSongSymphonie.ts LoadInstrumentDefBlock):
```typescript
// instrument block starts at SrcOffset (every 256 bytes per instrument)
const type       = view.getInt8(srcOffset + 128);   // signed: 0=none, 4=loop, 8=sust, -4=kill, -8=silent
const multiCh    = view.getInt8(srcOffset + 132);
const volume     = view.getUint8(srcOffset + 134) || 100;
const fineTune   = view.getInt8(srcOffset + 138);
const tune       = view.getInt8(srcOffset + 139);
const downsample = view.getUint8(srcOffset + 143); // 1→-12, 2→-24, 3→-36, 4→-48 semitones
const lsFlags    = view.getUint8(srcOffset + 140);
const playFlag   = view.getUint8(srcOffset + 142);
const loopStart  = view.getUint8(srcOffset + 129) * 256 * 256;
const loopLen    = view.getUint8(srcOffset + 130) * 256 * 256;
const numLoops   = view.getUint8(srcOffset + 131);
const newLoopSystem = (lsFlags & 16) !== 0;
const noDsp      = (playFlag & 2) !== 0;           // SPLAYFLAG_NODSP bit 1
// apply downsample tune correction: tune -= 12 * downsample
```

For pattern events, split by command:
```typescript
if (cmd === CMD_DSP_ECHO || cmd === CMD_DSP_DELAY) {
  dspEvents.push({ row, channel, type: note, feedback: inst, bufLen: param });
} else {
  patternEvents.push({ row, channel, note, instrument: inst, volume, cmd, param });
}
```

**Step 4: Export the new function**

```typescript
export { parseSymphonieForPlayback };
```

**Step 5: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors.

**Step 6: Commit**

```bash
git add src/lib/import/formats/SymphonieProParser.ts src/engine/symphonie/SymphoniePlaybackData.ts
git commit -m "feat(symphonie): parseSymphonieForPlayback() with PCM extraction and DSP events"
```

---

## Task 3: Create public/symphonie/Symphonie.worklet.js

**Files:**
- Create: `public/symphonie/Symphonie.worklet.js`

This is the most complex task. Use the transpiled output at `/tmp/symtest/out/symreader/VoiceExpander.ts` as the starting blueprint. Port to plain JS, applying all jree replacements. The worklet is monolithic — no `import` statements (AudioWorklet scope does not support ES modules unless explicitly set up, and DEViLBOX worklets do not use them).

**Step 1: Read the reference files before starting**

Read these sections in full before writing a single line:
- `/tmp/symtest/out/symreader/VoiceExpander.ts` — the entire file (1267 lines)
- `public/soundmon/SoundMon.worklet.js` — to understand the existing worklet skeleton/message protocol
- The DSP architecture section at the top of this plan document

**Step 2: Write the file structure**

```javascript
// public/symphonie/Symphonie.worklet.js
// Symphonie Pro AudioWorklet Processor
// Ported 1:1 from Patrick Meng's Java replayer (2008)
// Reference: /Users/spot/Downloads/SymphoniePlayer/src/symreader/VoiceExpander.java

'use strict';

// ── SymphonieDSP ──────────────────────────────────────────────────────────────
// Port of SymphonieDSP class (VoiceExpander.ts lines 26-258)
// Removes all jree types; Float64Array → Float32Array
class SymphonieDSP { ... }

// ── VoiceSmoother ─────────────────────────────────────────────────────────────
// Port of VoiceSmoother class (VoiceExpander.ts lines 260-413)
class VoiceSmoother { ... }

// ── VoiceLFO ──────────────────────────────────────────────────────────────────
// Port of VoiceLFO class (VoiceExpander.ts lines 302-412)
class VoiceLFO { ... }

// ── Voice ─────────────────────────────────────────────────────────────────────
// Port of Voice class (VoiceExpander.ts lines 413-504)
class Voice { ... }

// ── VoiceExpander ─────────────────────────────────────────────────────────────
// Port of VoiceExpander class (VoiceExpander.ts lines 506-1253)
// Key changes:
//   - Remove PlayActualMixThread() — replaced by process() in SymphonieProcessor
//   - Remove OpenMixSystem() and all javax.sound.* code
//   - Remove SampleToBuffer() — not needed, we output Float32
//   - Add loadSong(playbackData) to configure from SymphoniePlaybackData
//   - Add setOrderPosition(idx) for subsong support
class VoiceExpander { ... }

// ── SymphonieProcessor ────────────────────────────────────────────────────────
class SymphonieProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._expander = new VoiceExpander();
    this._ready = false;
    this._masterVolume = 0.8;

    this.port.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'load':    this._loadSong(msg.playbackData); break;
        case 'play':    this._expander.startAll?.(); break;
        case 'stop':    this._expander.stopAll(); break;
        case 'volume':  this._masterVolume = msg.value; break;
        case 'subsong': this._expander.setOrderPosition?.(msg.index); break;
      }
    };
  }

  _loadSong(data) {
    this._expander.loadSong(data);  // configure instruments, patterns, BPM
    this._ready = true;
    this.port.postMessage({ type: 'ready' });
  }

  process(inputs, outputs) {
    if (!this._ready) return true;
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const len = L.length;  // typically 128

    for (let i = 0; i < len; i++) {
      // Mirror PlayActualMixThread (VoiceExpander.ts lines 1229-1245):
      const dryL = this._expander.getNextMixSample(0);
      this._expander.DSP.advanceWritePtr();
      const wetL = this._expander.DSP.getWetMixSample();
      this._expander.DSP.advanceReadPtr();

      const dryR = this._expander.getNextMixSample(1);
      this._expander.DSP.advanceWritePtr();
      const wetR = this._expander.DSP.getWetMixSample();
      this._expander.DSP.advanceReadPtr();

      L[i] = Math.max(-1, Math.min(1, (dryL + wetL) * this._masterVolume));
      R[i] = Math.max(-1, Math.min(1, (dryR + wetR) * this._masterVolume));
    }
    return true;
  }
}

registerProcessor('symphonie-processor', SymphonieProcessor);
```

**Step 3: Implement loadSong(data) in VoiceExpander**

This method bridges `SymphoniePlaybackData` (produced by the parser) into the internal voice/song state:

```javascript
loadSong(data) {
  // Store song structure
  this._orderList = data.orderList;
  this._patterns  = data.patterns;
  this._orderPos  = 0;
  this._rowPos    = 0;

  // Set timing
  this.setSongSpeed(data.bpm, data.cycle);

  // Load instruments: build internal SymphonieInstrument-like objects
  this._instruments = data.instruments.map((inst, i) => ({
    ...inst,
    sp: inst.samples ? {
      Samples: inst.samples,
      NumbOfSamples: inst.samples.length,
      // compute loop indices from raw percentage values
      LoopStart: Math.floor((inst.loopStart * inst.samples.length) / (100 * 256 * 256)),
      LoopLen:   Math.floor((inst.loopLen   * inst.samples.length) / (100 * 256 * 256)),
      EndlessLoop: inst.numLoops === 0 && inst.loopLen > 0,
      hasLoop() { return this.LoopLen > 0; },
      getLoopStart() { return this.LoopStart; },
      getLoopEndSampleIndex() { return this.LoopStart + this.LoopLen; },
      getEndlessLoop() { return this.EndlessLoop; },
      getNumbOfSamples() { return this.NumbOfSamples; },
    } : null,
    checkReady() { return this.type !== -8 && this.type !== -4 && this.sp !== null; },
  }));

  // Set global DSP
  if (data.globalDspType !== 0) {
    this.setDSPFxIndex(data.globalDspType);
    this.DSP.DSPIntensity = data.globalDspFeedback / 127.0;
  }

  // Initialize voices
  for (let i = 0; i < this.NumbOfVoices; i++) {
    this.Voices[i] = new Voice();
  }

  this.isReady = true;
}
```

**Step 4: Implement checkSongEvent() to advance the sequencer**

Port `checkSongEvent()` from `VoiceExpander.ts` (line ~629). It counts down `SamplesTillSongEvent` and calls `playSongEvent()` when the counter reaches 0. `playSongEvent()` reads the next row from the current pattern, fires note-on/off/DSP events, and advances row/order counters.

For note-on events, call `PlayInstrumentNote(instrument, noteIndex, volume)` which is already in the ported VoiceExpander code.

For DSP events (type 24/25 from pattern dspEvents):
```javascript
// When a DSP event fires:
const fb  = dspEv.feedback / 127.0;
const len = Math.round(((this.DSP.FXLength - 2) * dspEv.bufLen) / 100);
this.DSP.DSPIntensity = fb;
this.DSP.setDelay(len > 0 ? len : this.DSP.RingBufferLenSamples);
this.DSP.SetFxClass(dspEv.type);
if (dspEv.type === 0) this.DSP.stop(); else this.DSP.start();
```

**Step 5: Manual smoke test**

Open DEViLBOX in browser. Load any `.symmod` from `Reference Music/`. Open DevTools console. Verify:
- No JS syntax/runtime errors
- `[Symphonie] ready` log appears
- Audio plays

**Step 6: Commit**

```bash
git add public/symphonie/Symphonie.worklet.js
git commit -m "feat(symphonie): Symphonie.worklet.js — VoiceExpander AudioWorklet processor"
```

---

## Task 4: Create SymphonieEngine.ts and SymphonieSynth.ts

**Files:**
- Create: `src/engine/symphonie/SymphonieEngine.ts`
- Create: `src/engine/symphonie/SymphonieSynth.ts`

**Step 1: Write SymphonieEngine.ts**

Clone `src/engine/soundmon/SoundMonEngine.ts` structure exactly. Key differences:
- Worklet URL: `/symphonie/Symphonie.worklet.js`
- Processor name: `'symphonie-processor'`
- `loadSong(audioContext, data: SymphoniePlaybackData)` posts `{ type: 'load', playbackData: data }` with sample buffer transfers
- Waits for `{ type: 'ready' }` response before resolving

```typescript
// src/engine/symphonie/SymphonieEngine.ts
import type { SymphoniePlaybackData } from './SymphoniePlaybackData';

const WORKLET_URL = '/symphonie/Symphonie.worklet.js';

export class SymphonieEngine {
  private static _instance: SymphonieEngine | null = null;
  private _node: AudioWorkletNode | null = null;
  private _ctx: AudioContext | null = null;
  private _readyResolve: (() => void) | null = null;
  private _readyPromise: Promise<void> | null = null;

  static getInstance(): SymphonieEngine {
    if (!SymphonieEngine._instance) SymphonieEngine._instance = new SymphonieEngine();
    return SymphonieEngine._instance;
  }

  private constructor() {}

  async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this._node && this._ctx === ctx) return;
    this._ctx = ctx;
    await ctx.audioWorklet.addModule(WORKLET_URL);
    this._node = new AudioWorkletNode(ctx, 'symphonie-processor', {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this._node.port.onmessage = (e) => {
      if (e.data.type === 'ready' && this._readyResolve) {
        this._readyResolve();
        this._readyResolve = null;
      }
    };
    this._node.connect(ctx.destination);
  }

  async loadSong(ctx: AudioContext, data: SymphoniePlaybackData): Promise<void> {
    await this.ensureInitialized(ctx);
    this._readyPromise = new Promise((res) => { this._readyResolve = res; });
    const transfers: Transferable[] = [];
    data.instruments.forEach((inst) => {
      if (inst.samples) transfers.push(inst.samples.buffer);
    });
    this._node!.port.postMessage({ type: 'load', playbackData: data }, transfers);
    await this._readyPromise;
  }

  play()  { this._node?.port.postMessage({ type: 'play' }); }
  stop()  { this._node?.port.postMessage({ type: 'stop' }); }
  setVolume(v: number) { this._node?.port.postMessage({ type: 'volume', value: v }); }
  getNode(): AudioWorkletNode | null { return this._node; }

  dispose(): void {
    this._node?.disconnect();
    this._node = null;
    this._ctx = null;
    SymphonieEngine._instance = null;
  }
}
```

**Step 2: Write SymphonieSynth.ts**

Read `src/engine/tfmx/TFMXSynth.ts` before writing this. Clone its structure. The key method is `setInstrument(config: SymphoniePlaybackData)` which calls `SymphonieEngine.getInstance().loadSong(audioContext, config)`.

```typescript
// src/engine/symphonie/SymphonieSynth.ts
import type { DevilboxSynth } from '@/engine/DevilboxSynth';  // or wherever the interface lives
import type { SymphoniePlaybackData } from './SymphoniePlaybackData';
import { SymphonieEngine } from './SymphonieEngine';

export class SymphonieSynth implements DevilboxSynth {
  readonly name = 'SymphonieSynth';
  private _engine = SymphonieEngine.getInstance();

  async setInstrument(data: SymphoniePlaybackData): Promise<void> {
    // audioContext must come from the audio engine — look at how TFMXSynth gets it
    // (likely via a shared AudioContextProvider or parameter)
    const ctx = /* get AudioContext — copy from TFMXSynth */ null!;
    await this._engine.loadSong(ctx, data);
  }

  // Implement remaining DevilboxSynth interface methods — copy from TFMXSynth
  // (noteOn, noteOff, dispose, getAudioNode, etc.)
}
```

> **Note:** The AudioContext acquisition pattern varies — read `TFMXSynth.ts` fully before writing `SymphonieSynth.ts` to match exactly.

**Step 3: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors.

**Step 4: Commit**

```bash
git add src/engine/symphonie/SymphonieEngine.ts src/engine/symphonie/SymphonieSynth.ts
git commit -m "feat(symphonie): SymphonieEngine singleton + SymphonieSynth wrapper"
```

---

## Task 5: Wire into InstrumentFactory + types + parser

**Files:**
- Modify: `src/types/instrument.ts`
- Modify: `src/engine/InstrumentFactory.ts`
- Modify: `src/lib/import/formats/SymphonieProParser.ts`

**Step 1: Add SymphonieSynth to SynthType union in instrument.ts**

Find the `SynthType` union (grep for `'TFMXSynth'` to locate). Add:
```typescript
| 'SymphonieSynth'    // Symphonie Pro (native AudioWorklet)
```

Find the `InstrumentConfig` interface. Add:
```typescript
symphonie?: SymphoniePlaybackData;
```

Import `SymphoniePlaybackData` at top of `instrument.ts`.

**Step 2: Wire SymphonieSynth in InstrumentFactory.ts**

Import at top:
```typescript
import { SymphonieSynth } from './symphonie/SymphonieSynth';
```

Add case in the switch block (after the last existing engine case):
```typescript
case 'SymphonieSynth': {
  const synth = new SymphonieSynth();
  if (config.symphonie) {
    synth.setInstrument(config.symphonie).catch(err =>
      console.error('[InstrumentFactory] Symphonie load failed:', err)
    );
  }
  instrument = synth;
  break;
}
```

**Step 3: Update parseSymphonieProFile() to embed playback data**

In `SymphonieProParser.ts`, update the primary instrument of the returned TrackerSong to carry `synthType: 'SymphonieSynth'` and `symphonie: playbackData` when `prefs.symphoniePro === 'native'`.

Find where the TrackerSong instruments are built. For the instrument at index 0 (the "player" instrument), set:
```typescript
instruments[0].config.synthType = 'SymphonieSynth';
instruments[0].config.symphonie = parseSymphonieForPlayback(buffer, filename);
```

Or alternatively, call `parseSymphonieForPlayback()` inside `parseSymphonieProFile()` and attach it to the first instrument. Study how `TFMXParser.ts` embeds its module data to match the exact pattern.

**Step 4: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors.

**Step 5: Manual verification checklist**

- [ ] Load a `.symmod` file — audio plays via native worklet (not UADE)
- [ ] Pattern display shows instrument names
- [ ] A song with Echo DSP events has audible echo effect
- [ ] Loop instruments sustain correctly (don't cut off abruptly)
- [ ] Stop/restart works without stale audio
- [ ] No JS errors in console
- [ ] `tsc --noEmit` passes with zero errors

**Step 6: Commit**

```bash
git add src/types/instrument.ts src/engine/InstrumentFactory.ts src/lib/import/formats/SymphonieProParser.ts
git commit -m "feat(symphonie): wire SymphonieSynth into InstrumentFactory and parser"
```

---

## Completion Checklist

- [ ] `src/engine/symphonie/SymphoniePlaybackData.ts` — interfaces defined
- [ ] `src/lib/import/formats/SymphonieProParser.ts` — `parseSymphonieForPlayback()` exported, PCM + DSP events extracted
- [ ] `public/symphonie/Symphonie.worklet.js` — de-jree'd VoiceExpander, `SymphonieProcessor` registered
- [ ] `src/engine/symphonie/SymphonieEngine.ts` — singleton following SoundMonEngine pattern
- [ ] `src/engine/symphonie/SymphonieSynth.ts` — DevilboxSynth wrapper following TFMXSynth pattern
- [ ] `src/types/instrument.ts` — `'SymphonieSynth'` in SynthType, `symphonie?` in InstrumentConfig
- [ ] `src/engine/InstrumentFactory.ts` — `'SymphonieSynth'` case wired
- [ ] `tsc --noEmit` — zero errors
- [ ] Manual test — at least one `.symmod` plays audio via native worklet with audible DSP
