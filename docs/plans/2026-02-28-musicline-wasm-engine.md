# MusicLine WASM Engine Implementation Plan ✅ COMPLETE (2026-02-28)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status:** ✅ All phases complete and working in production.

**Goal:** Compile the C++ MusicLine replayer to WASM and wire it into DEViLBOX for both song playback and per-instrument note preview.

**Architecture:** A `MusicLineWrapper.cpp` shim exposes `extern "C"` functions over `MlineBackend`. A ring-buffer AudioWorklet handles 48 kHz stereo F32 output. `MusicLineEngine.ts` (singleton) owns the worklet; `MusicLineSynth.ts` (DevilboxSynth) drives song and preview modes. Mirrors the HivelyTracker WASM integration exactly.

**Tech Stack:** Emscripten/WASM, C++17, Web Audio Worklet, TypeScript, Zustand

**Reference files:**
- C++ source: `Reference Code/musicline_playback-main/musicline/`
- HVL template: `hively-wasm/`, `src/engine/hively/`, `public/hively/`
- ML parser: `src/lib/import/formats/MusicLineParser.ts`
- TrackerReplayer: `src/engine/TrackerReplayer.ts` (see HVL block at lines 1171–1195)

---

## Phase 1 — WASM Build

### Task 1: Create `musicline-wasm/` build skeleton

**Files:**
- Create: `musicline-wasm/CMakeLists.txt`
- Create: `musicline-wasm/build.sh`
- Create: `musicline-wasm/common/MusicLineWrapper.cpp` (stub — real content in Task 2)

**Step 1: Create directory**
```bash
mkdir -p musicline-wasm/common
```

**Step 2: Create `musicline-wasm/CMakeLists.txt`**
```cmake
cmake_minimum_required(VERSION 3.13)
project(MusicLine)

set(CMAKE_CXX_STANDARD 17)

# Path to the C++ MusicLine replayer source
set(ML_SRC "${CMAKE_SOURCE_DIR}/../../Reference Code/musicline_playback-main/musicline")

# Collect all replayer .cpp files
file(GLOB ML_SOURCES
  "${ML_SRC}/player/mline_backend.cpp"
  "${ML_SRC}/module.cpp"
  "${ML_SRC}/playinst.cpp"
  "${ML_SRC}/fx.cpp"
  "${ML_SRC}/channel.cpp"
  "${ML_SRC}/playinst_256_effects.cpp"
  "${ML_SRC}/playinst_render.cpp"
  "${ML_SRC}/tables.cpp"
  "${ML_SRC}/sfx.cpp"
  "${ML_SRC}/arpeggio.cpp"
  "${ML_SRC}/file.cpp"
  "${ML_SRC}/inst.cpp"
  "${ML_SRC}/init.cpp"
)

add_executable(MusicLine
  common/MusicLineWrapper.cpp
  ${ML_SOURCES}
)

target_include_directories(MusicLine PRIVATE
  "${ML_SRC}"
  "${ML_SRC}/player"
)

set_target_properties(MusicLine PROPERTIES
  LINK_FLAGS "\
    -s MODULARIZE=1 \
    -s EXPORT_NAME='createMusicLine' \
    -s EXPORTED_FUNCTIONS='[ \
      \"_malloc\",\"_free\", \
      \"_ml_init\",\"_ml_load\",\"_ml_render\",\"_ml_stop\",\"_ml_is_finished\", \
      \"_ml_get_subsong_count\",\"_ml_set_subsong\", \
      \"_ml_get_title\",\"_ml_get_author\", \
      \"_ml_detect_duration\", \
      \"_ml_get_position\",\"_ml_get_row\",\"_ml_get_speed\", \
      \"_ml_preview_load\",\"_ml_preview_note_on\",\"_ml_preview_note_off\", \
      \"_ml_preview_render\",\"_ml_preview_stop\" \
    ]' \
    -s EXPORTED_RUNTIME_METHODS='[\"cwrap\",\"setValue\",\"getValue\"]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=8388608 \
    -s FILESYSTEM=0 \
    -O2 \
    -o ${CMAKE_SOURCE_DIR}/../../public/musicline/MusicLine.js"
)
```

**Step 3: Create `musicline-wasm/build.sh`**
```bash
#!/bin/bash
set -e
mkdir -p build
mkdir -p ../../public/musicline
cd build
emcmake cmake ..
emmake make -j4
echo "Build complete: public/musicline/MusicLine.js + .wasm"
```
```bash
chmod +x musicline-wasm/build.sh
```

**Step 4: Create stub `musicline-wasm/common/MusicLineWrapper.cpp`** (just to verify CMake works)
```cpp
// MusicLineWrapper.cpp — stub (populated in Task 2)
#include "mline_backend.h"
extern "C" { void ml_init(int) {} }
```

**Step 5: Attempt build to catch include/path issues**
```bash
cd musicline-wasm && bash build.sh 2>&1 | head -50
```
Expected: CMake configures successfully. Compile errors are expected at this stage — we just want to confirm the source file globs find files.

**Step 6: Commit stub**
```bash
git add musicline-wasm/
git commit -m "chore(musicline): add WASM build skeleton"
```

---

### Task 2: Write `MusicLineWrapper.cpp` — song playback functions

**Files:**
- Modify: `musicline-wasm/common/MusicLineWrapper.cpp`

**Step 1: Check `m_ChannelBuf` visibility in module.h**
```bash
grep -n "m_ChannelBuf\|ChannelBuf\|Channel\*" "Reference Code/musicline_playback-main/musicline/module.h" | head -20
```
If `m_ChannelBuf` is private/protected, add a public `TriggerNote(int ch, int instIdx, int note)` method to `module.h` and implement it in `module.cpp` (see Task 3).

**Step 2: Write the full `MusicLineWrapper.cpp`**
```cpp
// musicline-wasm/common/MusicLineWrapper.cpp
// extern "C" WASM shim over MlineBackend

#include "mline_backend.h"
#include "module.h"
#include <cstring>
#include <cstdlib>

// ── Song playback ─────────────────────────────────────────────────────────
static MlineBackend* s_song = nullptr;

extern "C" {

void ml_init(int sampleRate) {
    delete s_song;
    s_song = new MlineBackend();
    s_song->get_module()->SetOutputRate(sampleRate);
}

int ml_load(uint8_t* data, int len) {
    if (!s_song) return 0;
    return s_song->load(data, (size_t)len) ? 1 : 0;
}

// Renders stereo F32 interleaved. Returns frames written, 0=song end, -1=error.
int ml_render(float* buffer, int frames) {
    if (!s_song) return -1;
    return s_song->render(buffer, frames);
}

void ml_stop() {
    if (s_song) s_song->stop();
}

int ml_is_finished() {
    if (!s_song) return 1;
    return s_song->is_finished() ? 1 : 0;
}

int ml_get_subsong_count() {
    if (!s_song) return 0;
    return s_song->get_subsong_count();
}

void ml_set_subsong(int idx) {
    if (s_song) s_song->set_subsong(idx);
}

const char* ml_get_title() {
    if (!s_song) return "";
    return s_song->get_info_title();
}

const char* ml_get_author() {
    if (!s_song) return "";
    return s_song->get_info_author();
}

double ml_detect_duration(int maxSec) {
    if (!s_song) return 0.0;
    return s_song->detect_duration(maxSec);
}

// Position info — read from MLModule internals.
// Replace field names below if module.h uses different names.
int ml_get_position() {
    if (!s_song || !s_song->get_module()) return 0;
    // Access the current pattern/position index.
    // Inspect module.h for the exact field name (m_nTunePos, m_TunePos, etc.)
    return 0; // TODO: return s_song->get_module()->m_nTunePos;
}

int ml_get_row() {
    if (!s_song || !s_song->get_module()) return 0;
    return 0; // TODO: return s_song->get_module()->m_nPartPos;
}

int ml_get_speed() {
    if (!s_song || !s_song->get_module()) return 125;
    return (int)s_song->get_module()->GetSongSpeed();
}

// ── Instrument preview ────────────────────────────────────────────────────
static MlineBackend* s_preview = nullptr;
static int s_preview_inst = -1;

int ml_preview_load(uint8_t* data, int len) {
    delete s_preview;
    s_preview = new MlineBackend();
    // Mirror song output rate
    if (s_song) s_preview->get_module()->SetOutputRate(s_song->get_module()->GetOutputRate());
    return s_preview->load(data, (size_t)len) ? 1 : 0;
}

// Trigger note on instrument instIdx (0-based), midiNote (0–127), velocity 0–127.
void ml_preview_note_on(int instIdx, int midiNote, int velocity) {
    if (!s_preview || !s_preview->get_module()) return;
    s_preview_inst = instIdx;
    MLModule* mod = s_preview->get_module();

    // Solo channel 0 so only the preview note is heard.
    mod->set_single_channel(0);

    // Convert MIDI note to MusicLine period note.
    // MusicLine uses 1-based note numbers (1=C-1, 2=C#1, etc.)
    // Approximate mapping: ML note 1 ≈ MIDI 12 (C0).
    int mlNote = midiNote - 11;  // adjust offset to taste
    if (mlNote < 1) mlNote = 1;
    if (mlNote > 60) mlNote = 60;

    // TriggerNote is a method we add to MLModule (see Task 3).
    // It sets channel 0's m_PartNote + m_PartInst and calls CheckInst().
    mod->TriggerNote(0, instIdx, mlNote);
}

void ml_preview_note_off(int instIdx) {
    (void)instIdx;
    if (!s_preview || !s_preview->get_module()) return;
    // Silence by un-soloing (all channels muted via volume=0 strategy)
    s_preview->stop();
}

// Render preview audio — same F32 stereo interleaved.
int ml_preview_render(float* buffer, int frames) {
    if (!s_preview) {
        memset(buffer, 0, frames * 2 * sizeof(float));
        return frames;
    }
    int result = s_preview->render(buffer, frames);
    if (result <= 0) {
        memset(buffer, 0, frames * 2 * sizeof(float));
        return frames;
    }
    return result;
}

void ml_preview_stop() {
    if (s_preview) s_preview->stop();
}

} // extern "C"
```

**Step 3: Commit**
```bash
git add musicline-wasm/common/MusicLineWrapper.cpp
git commit -m "feat(musicline-wasm): write MusicLineWrapper.cpp C shim"
```

---

### Task 3: Add `TriggerNote()` to MLModule for instrument preview

**Files:**
- Modify: `Reference Code/musicline_playback-main/musicline/module.h`
- Modify: `Reference Code/musicline_playback-main/musicline/module.cpp`

**Step 1: Read `module.h` to find where public methods are declared and what `m_ChannelBuf` is**
```bash
grep -n "m_ChannelBuf\|Channel\*\|TriggerNote\|PlayVoice\|public:" \
  "Reference Code/musicline_playback-main/musicline/module.h" | head -40
```

**Step 2: Add `TriggerNote` declaration to `module.h`** (in the public section)

Find the block with other public void methods (`PlayMusic`, `PlayTune`, `UpdateChannel`, etc.) and add:
```cpp
// Preview API: trigger a single note on one channel (for WASM instrument preview)
void TriggerNote(int chanIdx, int instIdx, int midiNote);
void StopNote(int chanIdx);
```

**Step 3: Implement in `module.cpp`**

Find where `PlayTune()` iterates channels (the loop `for(i=0; i<MAXCHANS; i++) m_ChannelBuf[i]->PlayVoice(this)`) to understand the channel type. Then add at the bottom of module.cpp:

```cpp
// Called from WASM wrapper for instrument preview (single note on one channel)
void MLModule::TriggerNote(int chanIdx, int instIdx, int midiNote) {
    if (chanIdx < 0 || chanIdx >= (int)m_ChanNum) return;

    // Convert MIDI note (0-127) to MusicLine note (1-60):
    // C4=MIDI60 → try offset 23 to land near the middle of ML's range.
    int mlNote = midiNote - 23;
    if (mlNote < 1) mlNote = 1;
    if (mlNote > 60) mlNote = 60;

    // m_ChannelBuf[chanIdx] is a Channel (or CPlayInst) — access depends on type.
    // Set the note/instrument fields and flag new note:
    auto& ch = m_ChannelBuf[chanIdx];
    ch.m_PartNote = (s8)mlNote;
    ch.m_PartInst = (u8)(instIdx + 1);  // 1-based instrument index
    ch.m_Sfx.m_bNewNote = true;         // or ch.m_bNewNote depending on the type
    ch.CheckInst(this);
}

void MLModule::StopNote(int chanIdx) {
    if (chanIdx < 0 || chanIdx >= (int)m_ChanNum) return;
    auto& ch = m_ChannelBuf[chanIdx];
    ch.m_Sfx.m_fVolume = 0.0f;
}
```

> **Note:** The exact field names (`m_ChannelBuf`, `m_Sfx.m_bNewNote`, `m_fVolume`) must be verified against the actual `module.h` and `channel.h` / `sfx.h` headers. Adjust as needed. The agent researching this found that `m_bNewNote`, `m_PartNote`, `m_PartInst` are the correct state flags; verify `m_ChannelBuf` is the right array name.

**Step 4: Update `ml_preview_note_on` in `MusicLineWrapper.cpp`** to call `mod->TriggerNote(0, instIdx, midiNote)` (already in Task 2 stub — just verify it compiles).

**Step 5: Commit**
```bash
git add "Reference Code/musicline_playback-main/musicline/module.h" \
        "Reference Code/musicline_playback-main/musicline/module.cpp"
git commit -m "feat(musicline-wasm): add TriggerNote/StopNote to MLModule for preview"
```

---

### Task 4: Build WASM and fix compile errors

**Files:** (whatever fails during build)

**Step 1: Run the build**
```bash
cd musicline-wasm && bash build.sh 2>&1
```

**Step 2: Fix each compile error systematically**

Common issues to expect:
- Missing includes: add `#include <cstdint>`, `#include <cstring>` to wrapper
- `module.h` fields with different names than expected — read the header and fix
- C++ standard compat issues (Emscripten uses Clang; avoid GNU extensions)
- Missing source files in CMake glob — add them explicitly
- `GetSongSpeed()` may return different type — cast to int

**Step 3: Verify output files exist**
```bash
ls -la public/musicline/MusicLine.js public/musicline/MusicLine.wasm
```

**Step 4: Smoke test — load a .ml file in Node.js**
```bash
node -e "
const { createMusicLine } = require('./public/musicline/MusicLine.js');
createMusicLine({}).then(m => {
  m._ml_init(48000);
  console.log('ml_init OK');
  const fs = require('fs');
  const data = fs.readFileSync('Reference Music/Musicline Editor/- unknown/pink2.ml');
  const ptr = m._malloc(data.length);
  m.HEAPU8.set(data, ptr);
  const ok = m._ml_load(ptr, data.length);
  console.log('ml_load result:', ok);
  m._free(ptr);
});
" 2>&1
```
Expected: `ml_init OK` and `ml_load result: 1`

**Step 5: Commit built artifacts**
```bash
git add public/musicline/MusicLine.js public/musicline/MusicLine.wasm musicline-wasm/
git commit -m "feat(musicline-wasm): build WASM binary, song+preview API"
```

---

## Phase 2 — AudioWorklet

### Task 5: Write `public/musicline/MusicLine.worklet.js`

**Files:**
- Create: `public/musicline/MusicLine.worklet.js`

**Reference:** `public/hively/Hively.worklet.js` (ring buffer + WASM init pattern)

**Step 1: Write the worklet**
```js
// public/musicline/MusicLine.worklet.js
// AudioWorklet processor for MusicLine WASM engine

class MusicLineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._mod = null;
    this._ready = false;
    this._playing = false;
    this._previewing = false;
    // Ring buffer: 8192 stereo F32 samples (enough for ~6 frames at 48kHz/50Hz)
    this._ringL = new Float32Array(8192);
    this._ringR = new Float32Array(8192);
    this._ringRead = 0;
    this._ringWrite = 0;
    this._ringFill = 0;
    // Temp decode buffer: 512 stereo interleaved samples
    this._decodeFrames = 512;
    this._decodeBuf = null;   // set after WASM init (ptr into WASM heap)
    this._decodeBufPtr = 0;
    // Position reporting
    this._samplesSincePositionReport = 0;
    this._positionReportInterval = 12000; // ~250ms at 48kHz
    this.port.onmessage = (e) => this._onMessage(e.data);
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'init': this._init(msg); break;
      case 'load': this._load(msg.buffer); break;
      case 'play': this._playing = true; this._previewing = false; break;
      case 'stop':
        this._playing = false;
        if (this._mod) this._mod._ml_stop();
        break;
      case 'set-subsong':
        if (this._mod) this._mod._ml_set_subsong(msg.index);
        break;
      case 'preview-load': this._previewLoad(msg.buffer); break;
      case 'preview-note-on':
        if (this._mod) {
          this._mod._ml_preview_note_on(msg.instIdx, msg.note, msg.velocity);
          this._previewing = true;
        }
        break;
      case 'preview-note-off':
        if (this._mod) {
          this._mod._ml_preview_note_off(msg.instIdx);
          this._previewing = false;
        }
        break;
      case 'preview-stop':
        this._previewing = false;
        if (this._mod) this._mod._ml_preview_stop();
        break;
    }
  }

  _init(msg) {
    // Load MusicLine.js Emscripten factory via Function constructor (no import() in worklet)
    try {
      const jsText = msg.jsText
        .replace(/import\.meta\.url/g, "'.'")
        .replace(/\bimport\s*\(/g, 'fetch(');
      const factory = new Function('return ' + jsText.match(/function createMusicLine[\s\S]+/)?.[0])();
      const wasmBinary = msg.wasmBinary;

      // Polyfills required by Emscripten in worklet context
      globalThis.document = globalThis.document || { currentScript: null };
      globalThis.location = globalThis.location || { href: './' };

      const factoryFn = eval(
        jsText.replace(/var createMusicLine/, 'self.__mlFactory =')
      );
      (self.__mlFactory || factory)({
        wasmBinary,
        locateFile: (f) => f,
      }).then((m) => {
        this._mod = m;
        // Mirror HEAPU8/HEAPF32 for compatibility
        m.HEAPU8 = m.HEAPU8 || new Uint8Array(m.wasmMemory?.buffer || m.asm?.memory?.buffer);
        m.HEAPF32 = m.HEAPF32 || new Float32Array(m.wasmMemory?.buffer || m.asm?.memory?.buffer);
        m._ml_init(sampleRate);
        // Allocate decode buffer in WASM heap
        this._decodeBufPtr = m._malloc(this._decodeFrames * 2 * 4);
        this._decodeBuf = new Float32Array(m.HEAPF32.buffer, this._decodeBufPtr, this._decodeFrames * 2);
        this._ready = true;
        this.port.postMessage({ type: 'ready' });
      }).catch(err => {
        this.port.postMessage({ type: 'error', message: String(err) });
      });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: String(err) });
    }
  }

  _load(buffer) {
    if (!this._mod) return;
    const data = new Uint8Array(buffer);
    const ptr = this._mod._malloc(data.length);
    this._mod.HEAPU8.set(data, ptr);
    const ok = this._mod._ml_load(ptr, data.length);
    this._mod._free(ptr);
    if (!ok) {
      this.port.postMessage({ type: 'error', message: 'ml_load failed' });
      return;
    }
    // Reset ring buffer
    this._ringRead = this._ringWrite = this._ringFill = 0;
    this.port.postMessage({ type: 'loaded' });
  }

  _previewLoad(buffer) {
    if (!this._mod) return;
    const data = new Uint8Array(buffer);
    const ptr = this._mod._malloc(data.length);
    this._mod.HEAPU8.set(data, ptr);
    this._mod._ml_preview_load(ptr, data.length);
    this._mod._free(ptr);
  }

  _fillRing() {
    const mod = this._mod;
    const ringSize = this._ringL.length;
    while (this._ringFill < ringSize - this._decodeFrames) {
      const n = mod._ml_render(this._decodeBufPtr, this._decodeFrames);
      if (n <= 0) {
        this._playing = false;
        this.port.postMessage({ type: 'ended' });
        return;
      }
      const buf = this._decodeBuf;
      for (let i = 0; i < n; i++) {
        const w = (this._ringWrite + i) & (ringSize - 1);
        this._ringL[w] = buf[i * 2];
        this._ringR[w] = buf[i * 2 + 1];
      }
      this._ringWrite = (this._ringWrite + n) & (ringSize - 1);
      this._ringFill += n;
    }
  }

  process(_inputs, outputs) {
    if (!this._ready || !this._mod) return true;
    const outL = outputs[0][0];
    const outR = outputs[0][1] || outputs[0][0];
    const blockSize = outL.length; // always 128

    if (this._previewing) {
      // Direct render — no ring buffer
      const n = this._mod._ml_preview_render(this._decodeBufPtr, blockSize);
      const buf = this._decodeBuf;
      for (let i = 0; i < blockSize; i++) {
        outL[i] = buf[i * 2];
        outR[i] = buf[i * 2 + 1];
      }
      return true;
    }

    if (!this._playing) return true;

    // Fill ring buffer, then drain 128 samples
    this._fillRing();

    const ringSize = this._ringL.length;
    const avail = this._ringFill;
    const toCopy = Math.min(blockSize, avail);
    for (let i = 0; i < toCopy; i++) {
      const r = (this._ringRead + i) & (ringSize - 1);
      outL[i] = this._ringL[r];
      outR[i] = this._ringR[r];
    }
    this._ringRead = (this._ringRead + toCopy) & (ringSize - 1);
    this._ringFill -= toCopy;

    // Position reporting
    this._samplesSincePositionReport += toCopy;
    if (this._samplesSincePositionReport >= this._positionReportInterval) {
      this._samplesSincePositionReport = 0;
      this.port.postMessage({
        type: 'position',
        position: this._mod._ml_get_position(),
        row: this._mod._ml_get_row(),
        speed: this._mod._ml_get_speed(),
      });
    }

    return true;
  }
}

registerProcessor('musicline-processor', MusicLineProcessor);
```

> **Note:** The WASM factory loading approach (via `eval`/`Function`) follows exactly what `Hively.worklet.js` does. If the Hively worklet uses a different technique (e.g., `importScripts` polyfill or binary injection via `msg.jsText`), mirror that exactly. Read `public/hively/Hively.worklet.js` lines 1–80 and copy the init pattern verbatim.

**Step 2: Verify the worklet file exists**
```bash
ls -la public/musicline/MusicLine.worklet.js
```

**Step 3: Commit**
```bash
git add public/musicline/MusicLine.worklet.js
git commit -m "feat(musicline): add MusicLine.worklet.js AudioWorklet processor"
```

---

## Phase 3 — TypeScript Engine + Synth

### Task 6: Write `MusicLineEngine.ts`

**Files:**
- Create: `src/engine/musicline/MusicLineEngine.ts`

**Reference:** `src/engine/hively/HivelyEngine.ts` — mirror the singleton pattern, WeakMap per AudioContext, Promise-based ready(), dynamic worklet loading.

**Step 1: Write `MusicLineEngine.ts`**
```typescript
// src/engine/musicline/MusicLineEngine.ts
// Singleton WASM engine for MusicLine Editor format.
// Mirrors HivelyEngine exactly — one WASM instance, one AudioWorkletNode per AudioContext.

import type { AudioWorkletNode as ToneWorkletNode } from 'tone';

type PositionCallback = (position: number, row: number, speed: number) => void;
type EndedCallback = () => void;

export class MusicLineEngine {
  private static _instance: MusicLineEngine | null = null;

  // Per AudioContext state
  private _workletNode: AudioWorkletNode | null = null;
  private _context: AudioContext | null = null;
  private _readyPromise: Promise<void> | null = null;
  private _resolveReady!: () => void;

  // Output node that connects to ToneEngine.masterInput
  output: GainNode | null = null;

  private _positionCallbacks = new Set<PositionCallback>();
  private _endedCallbacks = new Set<EndedCallback>();

  private _playing = false;

  static getInstance(): MusicLineEngine {
    if (!MusicLineEngine._instance) {
      MusicLineEngine._instance = new MusicLineEngine();
    }
    return MusicLineEngine._instance;
  }

  static hasInstance(): boolean {
    return MusicLineEngine._instance !== null;
  }

  private constructor() {}

  async ready(): Promise<void> {
    if (this._readyPromise) return this._readyPromise;
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });
    return this._readyPromise;
  }

  async init(context: AudioContext): Promise<void> {
    if (this._context === context && this._workletNode) return;
    this._context = context;

    // Create output gain node
    this.output = context.createGain();
    this.output.gain.value = 1.0;

    // Load worklet module
    await context.audioWorklet.addModule('/musicline/MusicLine.worklet.js');

    // Fetch WASM + JS factory
    const [wasmResp, jsResp] = await Promise.all([
      fetch('/musicline/MusicLine.wasm'),
      fetch('/musicline/MusicLine.js'),
    ]);
    const [wasmBinary, jsText] = await Promise.all([
      wasmResp.arrayBuffer(),
      jsResp.text(),
    ]);

    this._workletNode = new AudioWorkletNode(context, 'musicline-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this._workletNode.connect(this.output);

    this._workletNode.port.onmessage = (e) => this._onWorkletMessage(e.data);

    this._workletNode.port.postMessage(
      { type: 'init', sampleRate: context.sampleRate, jsText, wasmBinary },
      [wasmBinary],
    );
  }

  private _onWorkletMessage(msg: Record<string, unknown>) {
    switch (msg.type) {
      case 'ready':
        this._resolveReady?.();
        break;
      case 'position':
        for (const cb of this._positionCallbacks) {
          cb(msg.position as number, msg.row as number, msg.speed as number);
        }
        break;
      case 'ended':
        this._playing = false;
        for (const cb of this._endedCallbacks) cb();
        break;
      case 'error':
        console.error('[MusicLineEngine] Worklet error:', msg.message);
        break;
    }
  }

  async loadSong(data: Uint8Array): Promise<void> {
    await this.ready();
    this._workletNode?.port.postMessage(
      { type: 'load', buffer: data.buffer },
      [data.buffer],
    );
    // Wait for 'loaded' — handled in worklet, no separate ack needed for now
  }

  play(): void {
    this._playing = true;
    this._workletNode?.port.postMessage({ type: 'play' });
  }

  stop(): void {
    this._playing = false;
    this._workletNode?.port.postMessage({ type: 'stop' });
  }

  setSubsong(idx: number): void {
    this._workletNode?.port.postMessage({ type: 'set-subsong', index: idx });
  }

  isPlaying(): boolean {
    return this._playing;
  }

  // Instrument preview
  async loadPreview(data: Uint8Array): Promise<void> {
    await this.ready();
    const copy = data.slice(0);
    this._workletNode?.port.postMessage(
      { type: 'preview-load', buffer: copy.buffer },
      [copy.buffer],
    );
  }

  previewNoteOn(instIdx: number, note: number, velocity: number): void {
    this._workletNode?.port.postMessage({
      type: 'preview-note-on', instIdx, note, velocity,
    });
  }

  previewNoteOff(instIdx: number): void {
    this._workletNode?.port.postMessage({ type: 'preview-note-off', instIdx });
  }

  previewStop(): void {
    this._workletNode?.port.postMessage({ type: 'preview-stop' });
  }

  // Callbacks
  onPosition(cb: PositionCallback): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onEnded(cb: EndedCallback): () => void {
    this._endedCallbacks.add(cb);
    return () => this._endedCallbacks.delete(cb);
  }
}
```

**Step 2: Commit**
```bash
git add src/engine/musicline/MusicLineEngine.ts
git commit -m "feat(musicline): add MusicLineEngine.ts singleton WASM manager"
```

---

### Task 7: Write `MusicLineSynth.ts` + `index.ts`

**Files:**
- Create: `src/engine/musicline/MusicLineSynth.ts`
- Create: `src/engine/musicline/index.ts`

**Reference:** `src/engine/hively/HivelySynth.ts` — DevilboxSynth interface, two operational modes.

**Step 1: Write `MusicLineSynth.ts`**
```typescript
// src/engine/musicline/MusicLineSynth.ts
// DevilboxSynth implementation for MusicLine Editor.
// Song mode: loads raw .ml bytes → WASM plays the whole song.
// Preview mode: triggers individual instrument notes via WASM preview API.

import { MusicLineEngine } from './MusicLineEngine';
import type { InstrumentConfig } from '@typedefs/instrument';

// Tracks whether engine output has been connected to audio graph
let engineOutputConnected = false;

export class MusicLineSynth {
  readonly synthType = 'MusicLineSynth';
  private _engine = MusicLineEngine.getInstance();
  private _instIdx = 0;
  private _activeNote = -1;

  output: GainNode | null = null;

  async init(context: AudioContext): Promise<void> {
    await this._engine.init(context);
    if (!engineOutputConnected && this._engine.output) {
      this.output = this._engine.output;
      engineOutputConnected = true;
    }
  }

  // Called by ToneEngine when user plays a note or song starts
  async triggerAttack(
    note: number,
    _time: number,
    velocity: number,
    inst: InstrumentConfig,
  ): Promise<void> {
    const songData: Uint8Array | undefined =
      (inst.metadata as Record<string, unknown>)?.mlSongData as Uint8Array | undefined;

    if (songData) {
      // Song mode: load raw .ml and play
      await this._engine.loadSong(songData);
      this._engine.play();
    } else {
      // Instrument preview mode
      const instIdx = (inst.metadata as Record<string, unknown>)?.mlInstIdx as number ?? 0;
      this._instIdx = instIdx;
      this._activeNote = note;
      this._engine.previewNoteOn(instIdx, note, Math.round(velocity * 127));
    }
  }

  triggerRelease(_note: number): void {
    if (this._activeNote >= 0) {
      this._engine.previewNoteOff(this._instIdx);
      this._activeNote = -1;
    }
  }

  dispose(): void {
    this._engine.stop();
    engineOutputConnected = false;
  }
}
```

**Step 2: Write `src/engine/musicline/index.ts`**
```typescript
export { MusicLineEngine } from './MusicLineEngine';
export { MusicLineSynth } from './MusicLineSynth';
```

**Step 3: Commit**
```bash
git add src/engine/musicline/
git commit -m "feat(musicline): add MusicLineSynth.ts DevilboxSynth implementation"
```

---

## Phase 4 — Data Model & Integration Wiring

### Task 8: Add `'ML'` format + `musiclineFileData` to TrackerSong/TrackerFormat

**Files:**
- Modify: `src/engine/TrackerReplayer.ts` (lines 222–244 for format, line 387+ for TrackerSong)

**Step 1: Add `'ML'` to TrackerFormat union** (line ~223)

Current:
```typescript
export type TrackerFormat =
  | 'MOD' | 'XM' | 'IT' | 'S3M' | 'HVL' | 'AHX'
```
After:
```typescript
export type TrackerFormat =
  | 'MOD' | 'XM' | 'IT' | 'S3M' | 'HVL' | 'AHX' | 'ML'
```

**Step 2: Add `musiclineFileData` to TrackerSong** (after `hivelyFileData` at line ~387)
```typescript
  /** Raw HVL/AHX binary for loading into the HivelyEngine WASM */
  hivelyFileData?: ArrayBuffer;
  /** Raw MusicLine Editor (.ml) binary for loading into the MusicLineEngine WASM */
  musiclineFileData?: Uint8Array;
```

**Step 3: Fix any TypeScript errors**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**
```bash
git add src/engine/TrackerReplayer.ts
git commit -m "feat(musicline): add ML TrackerFormat and musiclineFileData to TrackerSong"
```

---

### Task 9: Set `musiclineFileData` in `MusicLineParser.ts` + change format to `'ML'`

**Files:**
- Modify: `src/lib/import/formats/MusicLineParser.ts`

**Step 1: Change format from `'MOD'` to `'ML'`** (line ~406)

Find:
```typescript
format: 'MOD' as const,
```
Replace:
```typescript
format: 'ML' as const,
```

**Step 2: Set `musiclineFileData` after building the TrackerSong**

Find where `parseMusicLineFile` returns the song object. Right before the `return` statement, add:
```typescript
  // Attach raw binary so MusicLineEngine WASM can load the original file
  song.musiclineFileData = bytes.slice(0);
  return song;
```

**Step 3: Run TypeScript check**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**
```bash
git add src/lib/import/formats/MusicLineParser.ts
git commit -m "feat(musicline): set format='ML' and musiclineFileData in parser"
```

---

### Task 10: Wire MusicLine routing in `TrackerReplayer.ts`

**Files:**
- Modify: `src/engine/TrackerReplayer.ts`

**Step 1: Import MusicLineEngine** at the top of TrackerReplayer.ts, near the HivelyEngine import:
```typescript
import { MusicLineEngine } from './musicline/MusicLineEngine';
```

**Step 2: Add ML routing block** — right after the HVL block (after line ~1195):
```typescript
    // MusicLine Editor: load raw binary into MusicLineEngine WASM before playback.
    if (this.song.musiclineFileData && this.song.format === 'ML') {
      try {
        const mlEngine = MusicLineEngine.getInstance();
        await mlEngine.init(engine.context as unknown as AudioContext);
        await mlEngine.ready();
        await mlEngine.loadSong(this.song.musiclineFileData.slice(0));

        // Pre-connect output to audio graph
        const firstML = this.song.instruments.find(i => i.synthType === 'MusicLineSynth');
        if (firstML) {
          engine.getInstrument(firstML.id, firstML);
        }

        if (!this._muted) {
          mlEngine.play();
          console.log('[TrackerReplayer] MusicLineEngine loaded & playing');
        }
      } catch (err) {
        console.error('[TrackerReplayer] Failed to load ML tune into WASM:', err);
      }
    }
```

**Step 3: Add ML to the native engine routing loop** (line ~1203, after HVL/UADE):
```typescript
        if ((st === 'UADESynth' || st === 'HivelySynth' || st === 'MusicLineSynth')
            && !this.routedNativeEngines.has(st)) {
```

**Step 4: Add ML stop in `stopNativeEngine`** (near the HVL stop block, line ~486):
```typescript
    } else if (type === 'MusicLineSynth') {
      const { MusicLineEngine } = await import('./musicline/MusicLineEngine');
      if (MusicLineEngine.hasInstance()) {
        MusicLineEngine.getInstance().stop();
      }
    }
```

**Step 5: TypeScript check**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 6: Commit**
```bash
git add src/engine/TrackerReplayer.ts
git commit -m "feat(musicline): wire MusicLineEngine in TrackerReplayer play/stop"
```

---

### Task 11: Add `'MusicLineSynth'` to `SynthType` and wire in `ToneEngine.ts`

**Files:**
- Modify: `src/types/instrument.ts`
- Modify: `src/engine/ToneEngine.ts`

**Step 1: Add `'MusicLineSynth'` to SynthType union in `instrument.ts`**

Find where `'HivelySynth'` is declared (line ~194) and add below it:
```typescript
  | 'MusicLineSynth'  // MusicLine Editor native WASM replayer
```

**Step 2: Wire into `ToneEngine.ts` — 4 locations**

*Location 1* — `ensureWASMSynthsReady` list (line ~906):
```typescript
['TB303', ..., 'HivelySynth', 'UADESynth', 'SymphonieSynth', 'MusicLineSynth', ...]
```

*Location 2* — native player deduplication (line ~918):
```typescript
if (c.synthType === 'HivelySynth' || c.synthType === 'UADESynth' || c.synthType === 'SymphonieSynth' || c.synthType === 'MusicLineSynth') {
```

*Location 3* — case statement (line ~1991):
```typescript
      case 'HivelySynth':
      case 'UADESynth':
      case 'MusicLineSynth':
```

*Location 4* — dynamic import to create synth instance (right after or inside the case block):
```typescript
      case 'MusicLineSynth': {
        const { MusicLineSynth } = await import('./musicline/MusicLineSynth');
        synth = new MusicLineSynth();
        await (synth as MusicLineSynth).init(this.context as unknown as AudioContext);
        break;
      }
```

**Step 3: TypeScript check**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**
```bash
git add src/types/instrument.ts src/engine/ToneEngine.ts
git commit -m "feat(musicline): add MusicLineSynth to SynthType and ToneEngine"
```

---

### Task 12: Wire `musiclineFileData` through store + usePatternPlayback

**Files:**
- Modify: `src/stores/useTrackerStore.ts`
- Modify: `src/hooks/audio/usePatternPlayback.ts`

**Step 1: Add `musiclineFileData` to tracker store state**

In `useTrackerStore.ts`, find where `hivelyFileData: ArrayBuffer | null` is declared (~line 125) and add:
```typescript
  musiclineFileData: Uint8Array | null;
```

Find initial state (~line 370):
```typescript
    hivelyFileData: null,
    musiclineFileData: null,
```

Find `applyEditorMode` (~line 2681-2715) — wherever `hivelyFileData` is cleared or assigned, add matching lines for `musiclineFileData`:
```typescript
    // Clear on format change:
    state.musiclineFileData = null;
    // Assign from song:
    state.musiclineFileData = song.musiclineFileData ?? null;
```

Also update the `applyEditorMode` function signature to include `musiclineFileData?: Uint8Array`.

**Step 2: Pass `musiclineFileData` to TrackerReplayer in `usePatternPlayback.ts`**

Near line 20, add `musiclineFileData` to the store selector:
```typescript
  const { ..., hivelyFileData, musiclineFileData, ... } = useTrackerStore(useShallow((s) => ({
    ...
    hivelyFileData: s.hivelyFileData,
    musiclineFileData: s.musiclineFileData,
  })));
```

In the `replayer.loadSong({...})` call (~line 310), add:
```typescript
          musiclineFileData: musiclineFileData ?? undefined,
```

**Step 3: TypeScript check**
```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: zero errors.

**Step 4: Commit**
```bash
git add src/stores/useTrackerStore.ts src/hooks/audio/usePatternPlayback.ts
git commit -m "feat(musicline): wire musiclineFileData through store and usePatternPlayback"
```

---

## Phase 5 — Verification

### Task 13: End-to-end test

**Step 1: Start the dev server**
```bash
npm run dev
```

**Step 2: Load a MusicLine test file**
- Open the file browser
- Navigate to `Reference Music/Musicline Editor/- unknown/`
- Load `pink2.ml` or `rush.ml`

**Step 3: Verify song plays via WASM**
- Check browser console for: `[TrackerReplayer] MusicLineEngine loaded & playing`
- Press Play — audio should start
- Verify it sounds like proper Amiga music (not garbled)

**Step 4: Verify instrument list**
- Open the instrument editor
- MusicLine instruments should appear as `Sampler` type
- Clicking a Sampler instrument + pressing a key should trigger instrument preview

**Step 5: Verify no regression on other formats**
- Load a .mod file → plays via TrackerReplayer (not MusicLineEngine)
- Load a .hvl file → plays via HivelyEngine
- Load a .ml file again → MusicLineEngine

**Step 6: Final TypeScript check**
```bash
npx tsc --noEmit 2>&1
```
Expected: zero errors.

**Step 7: Commit changelog bump**
```bash
npm run generate-changelog 2>/dev/null || true
git add src/generated/changelog.ts
git commit -m "feat(musicline): native WASM engine — song playback + instrument preview"
```

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `m_ChannelBuf` is private in MLModule | Add `TriggerNote()`/`StopNote()` public methods directly to module.h/module.cpp |
| Position field names differ from what's assumed in wrapper | Read module.h during Task 4 to find exact field names for `m_nTunePos`/`m_nPartPos` |
| MIDI-to-ML note offset is wrong for preview | Adjust the offset constant in `MusicLineWrapper.cpp` based on listening test |
| Worklet WASM init pattern differs from HVL | Copy Hively.worklet.js init block verbatim and adapt |
| `ml_render` returns 0 immediately (song finishes instantly) | Verify `InitTune()` is called correctly in `MlineBackend::load()`; check format detection |
| C++ source compile errors (missing headers, Emscripten compat) | Fix one at a time in Task 4; Emscripten uses Clang so most C++17 is fine |
