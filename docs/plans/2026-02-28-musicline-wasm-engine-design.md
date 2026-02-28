# MusicLine WASM Engine — Design

**Date:** 2026-02-28
**Status:** Approved, ready for implementation

---

## Overview

Add a native WASM-based playback engine for MusicLine Editor (`.ml`) files, replacing the
TrackerReplayer path for MusicLine songs and adding accurate instrument preview for waveform
synth instruments. Mirrors the HivelyTracker WASM integration exactly.

**Two operational modes:**
- **Song mode** — load raw `.ml` bytes, render stereo F32 audio via ring buffer
- **Instrument preview mode** — trigger individual notes per instrument index using the
  loaded module's channel/Paula mixer

---

## Architecture

```
Reference Code/musicline_playback-main/musicline/   (C++ source, ~8500 LOC)
        ↓  compiled by Emscripten
musicline-wasm/
  CMakeLists.txt              — Emscripten build config
  common/MusicLineWrapper.cpp — extern "C" shim over MlineBackend + channel hooks
        ↓  output
public/musicline/
  MusicLine.js                — Emscripten factory (createMusicLine)
  MusicLine.wasm
  MusicLine.worklet.js        — AudioWorklet processor

src/engine/musicline/
  MusicLineEngine.ts          — Singleton: WASM init, worklet load, message routing
  MusicLineSynth.ts           — DevilboxSynth impl: song mode + instrument preview mode
  index.ts
```

**Sample rate:** `SetOutputRate(48000)` called in C++ at init — internal resampling from
native 28150 Hz Amiga Paula rate. No resampling in the worklet.

---

## C Wrapper API (`MusicLineWrapper.cpp`)

### Song playback
```c
void    ml_init(int sampleRate);
int     ml_load(uint8_t* data, int len);       // 1=ok, 0=fail
int     ml_render(float* buffer, int frames);  // returns frames, 0=end, -1=err
void    ml_stop();
int     ml_is_finished();
int     ml_get_subsong_count();
void    ml_set_subsong(int idx);
const char* ml_get_title();
const char* ml_get_author();
double  ml_detect_duration(int maxSec);
int     ml_get_position();
int     ml_get_row();
int     ml_get_speed();
```

### Instrument preview
```c
int     ml_preview_load(uint8_t* data, int len);
void    ml_preview_note_on(int instIdx, int note, int velocity);
void    ml_preview_note_off(int instIdx);
int     ml_preview_render(float* buffer, int frames);
void    ml_preview_stop();
```

Preview uses a **separate static `MlineBackend` instance** so song playback and instrument
preview never clobber each other. `ml_preview_load` loads the same `.ml` file into the
preview backend; `ml_preview_note_on` triggers a single note on channel 0 via the CMLineSfx
entry point in `playinst.cpp`.

---

## AudioWorklet (`MusicLine.worklet.js`)

Ring-buffer pattern, identical to HVL worklet.

### Engine → Worklet messages
```js
{ type: 'init',            sampleRate }
{ type: 'load',            buffer: Uint8Array }   // Transferable
{ type: 'play' }
{ type: 'stop' }
{ type: 'set-subsong',     index }
{ type: 'preview-load',    buffer: Uint8Array }
{ type: 'preview-note-on', instIdx, note, velocity }
{ type: 'preview-note-off', instIdx }
{ type: 'preview-stop' }
```

### Worklet → Engine messages
```js
{ type: 'ready' }
{ type: 'position', position, row, speed }   // posted ~4× per second
{ type: 'ended' }
{ type: 'error', message }
```

### `process()` loop
- **Song playing:** fill ring buffer via `ml_render(tempBuf, 512)` chunks; copy 128 stereo
  samples per block to outputs
- **Instrument preview:** `ml_preview_render(tempBuf, 128)` → outputs directly (no ring buffer)
- **Position polling:** every ~250 ms of rendered samples, post `position` message

---

## TypeScript — `MusicLineEngine.ts` (singleton)

Loads WASM factory + worklet on first use. Exposes:
```ts
loadSong(data: Uint8Array): Promise<void>
play(): void
stop(): void
setSubsong(idx: number): void
detectDuration(maxSec?: number): Promise<number>
onPosition(cb: (pos: number, row: number, speed: number) => void): void
onEnded(cb: () => void): void
loadPreview(data: Uint8Array): Promise<void>
previewNoteOn(instIdx: number, note: number, velocity: number): void
previewNoteOff(instIdx: number): void
```

Output node connects to `ToneEngine.masterInput`.

---

## TypeScript — `MusicLineSynth.ts` (implements `DevilboxSynth`)

- `triggerAttack(note, time, velocity, inst)`:
  - `inst.metadata?.mlSongData` present → song mode: `engine.loadSong(bytes).then(play)`
  - Otherwise → preview mode: `engine.previewNoteOn(inst.metadata.mlInstIdx, note, velocity)`
- `triggerRelease(note)` → `engine.previewNoteOff(instIdx)`
- `dispose()` → `engine.stop()`

---

## Integration Points

| File | Change |
|------|--------|
| `musicline-wasm/CMakeLists.txt` | Create — Emscripten build |
| `musicline-wasm/common/MusicLineWrapper.cpp` | Create — C shim |
| `public/musicline/MusicLine.worklet.js` | Create — AudioWorklet |
| `src/engine/musicline/MusicLineEngine.ts` | Create — singleton manager |
| `src/engine/musicline/MusicLineSynth.ts` | Create — DevilboxSynth impl |
| `src/engine/musicline/index.ts` | Create — exports |
| `src/types/tracker.ts` | Add `rawData?: Uint8Array` to TrackerSong |
| `src/types/instrument.ts` | Add `'MusicLineSynth'` to SynthType union + DEFAULT_MUSICLINE |
| `src/engine/ToneEngine.ts` | Wire MusicLineSynth |
| `src/lib/import/parseModuleToSong.ts` | Attach `rawData` on ML parse |

**Build:** `musicline-wasm/build.sh` — `emcmake cmake .. && emmake make` → `public/musicline/`

---

## Reference

- C++ source: `Reference Code/musicline_playback-main/musicline/`
- HVL WASM template: `hively-wasm/` + `src/engine/hively/`
- MusicLine parser: `src/lib/import/formats/MusicLineParser.ts`
- MusicLine exporter: `src/lib/export/MusicLineExporter.ts`
