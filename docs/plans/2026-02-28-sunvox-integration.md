# SunVox Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate SunVox as a channel type in DEViLBOX's tracker — WASM audio engine, React knob panels, hardware framebuffer editor, per-note channel routing (TB-303 style), and `.sunvox`/`.sunsynth` import-export.

**Architecture:** Two Emscripten WASM builds: audio engine (`SunVoxWrapper.cpp`) and framebuffer UI (`SunVoxUI.cpp`). `SunVoxSynth` implements `DevilboxSynth`. File I/O uses Emscripten MEMFS (write to `/tmp/`, engine loads by path). Controller state accessed directly via `engine->net->items[snum].ctls[i]`.

**Tech Stack:** C++11/Emscripten, TypeScript, React, PixiJS, AudioWorklet API. Source: `Reference Code/sunvox_sources-master/`. Reference patterns: `hively-wasm/` (CMakeLists), `src/engine/hively/HivelySynth.ts` (DevilboxSynth), `src/engine/ToneEngine.ts` (routing), `src/components/instruments/InstrumentList.tsx` (save/load UI).

---

## Key Architecture Facts (read before implementing)

**sunvox_engine.h API (all functions take `sunvox_engine *s` last):**
```c
void sunvox_engine_init(int flags, sunvox_engine *s);   // flags=0 for basic
void sunvox_engine_close(sunvox_engine *s);
void sunvox_load_song(const char *name, sunvox_engine *s);    // filename-based!
void sunvox_save_song(const char *name, sunvox_engine *s);
int  sunvox_load_synth(int x, int y, const char *name, sunvox_engine *s); // returns 0-based id
void sunvox_save_synth(int synth_id, const char *name, sunvox_engine *s);
void sunvox_render_piece_of_sound(int buf_type, void *buf, int frames, int ch, int freq, long out_time, sunvox_engine *s);
void sunvox_send_user_command(sunvox_note *n, int channel_num, sunvox_engine *s);
```

**sunvox_note struct (for note-on/off/ctl):**
```c
struct sunvox_note {
  uchar note;     // 1..127 = note number; 128 = note off; 0 = nothing
  uchar vel;      // 1..129 velocity; 0 = default
  uchar synth;    // 1-INDEXED module number (0 = nothing)
  uchar nothing;
  uint16 ctl;     // XXYY: XX=controller number, YY=std effect (0x0000 for plain note)
  uint16 ctl_val; // controller value or 0
};
```

**Controller access (direct struct, no API):**
```c
int count = engine->net->items[synth_id].ctls_num;
psynth_control *ctl = &engine->net->items[synth_id].ctls[i];
// ctl->ctl_name, ctl->ctl_min, ctl->ctl_max, *(ctl->ctl_val)
```

**File I/O via MEMFS (WASM pattern):**
- JS writes bytes to `/tmp/input.sunvox` via `FS.writeFile()`
- C calls `sunvox_load_song("/tmp/input.sunvox", engine)`
- For save: C calls `sunvox_save_song("/tmp/output.sunvox", engine)`, JS reads it back

**Source files needed (from sunvox_makefile.inc):**
- `sunvox_engine/sunvox_engine.cpp`
- `sunvox_engine/psynth/psynth_net.cpp`
- `sunvox_engine/psynth/psynths_*.cpp` (14 files)
- `sundog_engine/core/code/debug.cpp`
- `sundog_engine/memory/code/memory.cpp`
- `sundog_engine/time/code/timemanager.cpp`

**ToneEngine.ts routing pattern:**
- Add `'SunVoxSynth'` to the `createInstrument` case block near `'HivelySynth'`
- Add to the WASM synth type list at line ~906
- SunVoxSynth handles its own note-on/off (like HivelySynth)

---

## Task 1: Create sunvox-wasm project skeleton

**Files:**
- Create: `sunvox-wasm/src/SunVoxWrapper.cpp`
- Create: `sunvox-wasm/CMakeLists.txt`
- Create: `sunvox-wasm/build/` (empty directory — git keeps it via .gitkeep)

**Step 1: Create directory structure**

```bash
mkdir -p /Users/spot/Code/DEViLBOX/sunvox-wasm/src
mkdir -p /Users/spot/Code/DEViLBOX/sunvox-wasm/build
touch /Users/spot/Code/DEViLBOX/sunvox-wasm/build/.gitkeep
```

**Step 2: Write CMakeLists.txt**

```cmake
cmake_minimum_required(VERSION 3.13)
project(SunVox CXX)

set(CMAKE_CXX_STANDARD 11)

set(SUNVOX_SRC "${CMAKE_SOURCE_DIR}/../Reference Code/sunvox_sources-master/sunvox_engine")
set(SUNDOG_SRC "${CMAKE_SOURCE_DIR}/../Reference Code/sunvox_sources-master/sundog_engine")

set(SOURCES
    src/SunVoxWrapper.cpp
    ${SUNVOX_SRC}/sunvox_engine.cpp
    ${SUNVOX_SRC}/psynth/psynth_net.cpp
    ${SUNVOX_SRC}/psynth/psynths_echo.cpp
    ${SUNVOX_SRC}/psynth/psynths_filter.cpp
    ${SUNVOX_SRC}/psynth/psynths_generator.cpp
    ${SUNVOX_SRC}/psynth/psynths_kicker.cpp
    ${SUNVOX_SRC}/psynth/psynths_sampler.cpp
    ${SUNVOX_SRC}/psynth/psynths_distortion.cpp
    ${SUNVOX_SRC}/psynth/psynths_flanger.cpp
    ${SUNVOX_SRC}/psynth/psynths_spectravoice.cpp
    ${SUNVOX_SRC}/psynth/psynths_loop.cpp
    ${SUNVOX_SRC}/psynth/psynths_delay.cpp
    ${SUNVOX_SRC}/psynth/psynths_fm.cpp
    ${SUNVOX_SRC}/psynth/psynths_lfo.cpp
    ${SUNVOX_SRC}/psynth/psynths_reverb.cpp
    ${SUNVOX_SRC}/psynth/psynths_vocal_filter.cpp
    ${SUNDOG_SRC}/core/code/debug.cpp
    ${SUNDOG_SRC}/memory/code/memory.cpp
    ${SUNDOG_SRC}/time/code/timemanager.cpp
)

set(OUTPUT_NAME "SunVox")
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/sunvox")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME} ${SOURCES})

target_include_directories(${OUTPUT_NAME} PRIVATE
    src
    "${CMAKE_SOURCE_DIR}/../Reference Code/sunvox_sources-master"
    "${SUNVOX_SRC}"
    "${SUNDOG_SRC}"
)

# STYPE_FLOAT: use float32 sample type throughout
target_compile_definitions(${OUTPUT_NAME} PRIVATE STYPE_FLOAT)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc"
        "_free"
        "_sunvox_wasm_create"
        "_sunvox_wasm_destroy"
        "_sunvox_wasm_load_song"
        "_sunvox_wasm_save_song"
        "_sunvox_wasm_load_synth"
        "_sunvox_wasm_save_synth"
        "_sunvox_wasm_get_control_count"
        "_sunvox_wasm_get_control_name"
        "_sunvox_wasm_get_control_min"
        "_sunvox_wasm_get_control_max"
        "_sunvox_wasm_get_control_value"
        "_sunvox_wasm_set_control"
        "_sunvox_wasm_get_module_name"
        "_sunvox_wasm_get_module_count"
        "_sunvox_wasm_note_on"
        "_sunvox_wasm_note_off"
        "_sunvox_wasm_render"
        "_sunvox_wasm_play"
        "_sunvox_wasm_stop"
    )

    string(JOIN "," EXPORTED_FUNCTIONS_STR ${EXPORTED_FUNCTIONS})

    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY ${OUTPUT_DIR}
        OUTPUT_NAME ${OUTPUT_NAME}
        SUFFIX ".js"
    )

    target_link_options(${OUTPUT_NAME} PRIVATE
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createSunVox'"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s ENVIRONMENT='web,worker'"
        "SHELL:-s INITIAL_MEMORY=16777216"
        "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCTIONS_STR}]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','UTF8ToString','FS']"
        "SHELL:-s FILESYSTEM=1"
        "SHELL:-s INVOKE_RUN=0"
        "-O2"
    )
else()
    message(WARNING "This project is designed to be built with Emscripten (emcmake)")
endif()
```

**Step 3: Verify the CMakeLists.txt references correct paths**

```bash
ls "/Users/spot/Code/DEViLBOX/Reference Code/sunvox_sources-master/sunvox_engine/sunvox_engine.cpp"
ls "/Users/spot/Code/DEViLBOX/Reference Code/sunvox_sources-master/sundog_engine/core/code/debug.cpp"
```

Expected: both files exist.

**Step 4: Commit skeleton**

```bash
cd /Users/spot/Code/DEViLBOX
git add sunvox-wasm/
git commit -m "feat(sunvox): add sunvox-wasm project skeleton with CMakeLists.txt"
```

---

## Task 2: Write SunVoxWrapper.cpp

**Files:**
- Modify: `sunvox-wasm/src/SunVoxWrapper.cpp`

**Step 1: Write the wrapper**

Write `sunvox-wasm/src/SunVoxWrapper.cpp`:

```cpp
/**
 * SunVoxWrapper.cpp - Emscripten WASM bridge for sunvox_engine
 *
 * File I/O uses MEMFS: JS writes data to /tmp/ before calling load,
 * reads back from /tmp/ after calling save.
 *
 * Note: synth numbers in sunvox_note are 1-indexed (module 0 → pass 1).
 */
#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include "sunvox_engine/sunvox_engine.h"

#define MAX_ENGINES 8

static sunvox_engine g_engines[MAX_ENGINES];
static int g_engine_used[MAX_ENGINES] = {0};

static int find_free_slot() {
    for (int i = 0; i < MAX_ENGINES; i++) {
        if (!g_engine_used[i]) return i;
    }
    return -1;
}

extern "C" {

/**
 * Create a new engine instance. Returns handle (0..7) or -1 on failure.
 * freq: sample rate (e.g. 44100 or 48000)
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_create(int freq) {
    int h = find_free_slot();
    if (h < 0) return -1;
    memset(&g_engines[h], 0, sizeof(sunvox_engine));
    sunvox_engine_init(0, &g_engines[h]);
    /* Store freq for render calls — engine doesn't expose a getter */
    g_engines[h].net->sampling_freq = freq;
    g_engine_used[h] = 1;
    return h;
}

/** Destroy engine and free slot. */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_destroy(int handle) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return;
    sunvox_engine_close(&g_engines[handle]);
    g_engine_used[handle] = 0;
}

/**
 * Load song from MEMFS path. Call from JS after writing data to path.
 * Returns 0 on success.
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_load_song(int handle, const char *path) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return -1;
    sunvox_load_song(path, &g_engines[handle]);
    return 0;
}

/**
 * Save song to MEMFS path. Read back from JS after this returns.
 * Returns 0 on success.
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_save_song(int handle, const char *path) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return -1;
    sunvox_save_song(path, &g_engines[handle]);
    return 0;
}

/**
 * Load a .sunsynth patch from MEMFS path. Returns 0-based module id or -1.
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_load_synth(int handle, const char *path) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return -1;
    return sunvox_load_synth(0, 0, path, &g_engines[handle]);
}

/**
 * Save module synth_id to MEMFS path. Read back from JS after this returns.
 */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_save_synth(int handle, int synth_id, const char *path) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return -1;
    sunvox_save_synth(synth_id, path, &g_engines[handle]);
    return 0;
}

/** Number of controllers for module synth_id. */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_get_control_count(int handle, int synth_id) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return 0;
    psynth_net *net = g_engines[handle].net;
    if (!net || synth_id < 0 || synth_id >= net->items_num) return 0;
    return net->items[synth_id].ctls_num;
}

/** Controller name string (null-terminated, static lifetime). */
EMSCRIPTEN_KEEPALIVE
const char* sunvox_wasm_get_control_name(int handle, int synth_id, int ctl_id) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return "";
    psynth_net *net = g_engines[handle].net;
    if (!net || synth_id < 0 || synth_id >= net->items_num) return "";
    psynth_net_item *item = &net->items[synth_id];
    if (ctl_id < 0 || ctl_id >= item->ctls_num) return "";
    return item->ctls[ctl_id].ctl_name ? item->ctls[ctl_id].ctl_name : "";
}

EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_get_control_min(int handle, int synth_id, int ctl_id) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return 0;
    psynth_net *net = g_engines[handle].net;
    if (!net || synth_id < 0 || synth_id >= net->items_num) return 0;
    if (ctl_id < 0 || ctl_id >= net->items[synth_id].ctls_num) return 0;
    return net->items[synth_id].ctls[ctl_id].ctl_min;
}

EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_get_control_max(int handle, int synth_id, int ctl_id) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return 256;
    psynth_net *net = g_engines[handle].net;
    if (!net || synth_id < 0 || synth_id >= net->items_num) return 256;
    if (ctl_id < 0 || ctl_id >= net->items[synth_id].ctls_num) return 256;
    return net->items[synth_id].ctls[ctl_id].ctl_max;
}

EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_get_control_value(int handle, int synth_id, int ctl_id) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return 0;
    psynth_net *net = g_engines[handle].net;
    if (!net || synth_id < 0 || synth_id >= net->items_num) return 0;
    psynth_net_item *item = &net->items[synth_id];
    if (ctl_id < 0 || ctl_id >= item->ctls_num) return 0;
    int *val_ptr = item->ctls[ctl_id].ctl_val;
    return val_ptr ? *val_ptr : 0;
}

/** Set controller value. value should be in [ctl_min, ctl_max]. */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_set_control(int handle, int synth_id, int ctl_id, int value) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return;
    sunvox_note n;
    memset(&n, 0, sizeof(n));
    n.note = 0;
    n.vel = 0;
    n.synth = (uchar)(synth_id + 1); /* 1-indexed */
    n.ctl = (uint16)((ctl_id + 1) << 8); /* XX=ctrl_num (1-indexed), YY=0 */
    n.ctl_val = (uint16)value;
    sunvox_send_user_command(&n, 0, &g_engines[handle]);
}

/** Module item_name (null-terminated, up to 32 chars). */
EMSCRIPTEN_KEEPALIVE
const char* sunvox_wasm_get_module_name(int handle, int synth_id) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return "";
    psynth_net *net = g_engines[handle].net;
    if (!net || synth_id < 0 || synth_id >= net->items_num) return "";
    return net->items[synth_id].item_name;
}

/** Total number of modules in the engine (including output at index 0). */
EMSCRIPTEN_KEEPALIVE
int sunvox_wasm_get_module_count(int handle) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return 0;
    psynth_net *net = g_engines[handle].net;
    return net ? net->items_num : 0;
}

/**
 * Trigger note-on for module synth_id.
 * note: 1..127 (MIDI note, SunVox 1-based)
 * vel: 1..129 (velocity)
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_note_on(int handle, int synth_id, int note, int vel) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return;
    sunvox_note n;
    memset(&n, 0, sizeof(n));
    n.note = (uchar)note;
    n.vel = (uchar)vel;
    n.synth = (uchar)(synth_id + 1); /* 1-indexed */
    n.ctl = 0;
    n.ctl_val = 0;
    sunvox_send_user_command(&n, 0, &g_engines[handle]);
}

/** Trigger note-off for module synth_id. */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_note_off(int handle, int synth_id) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return;
    sunvox_note n;
    memset(&n, 0, sizeof(n));
    n.note = 128; /* note off */
    n.vel = 0;
    n.synth = (uchar)(synth_id + 1);
    n.ctl = 0;
    n.ctl_val = 0;
    sunvox_send_user_command(&n, 0, &g_engines[handle]);
}

/**
 * Render interleaved stereo float32 into outBuf (float*, length = frames * 2).
 * freq: output sample rate.
 */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_render(int handle, float *outBuf, int frames, int freq) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return;
    /* buffer_type=1 → float32; channels=2 → stereo interleaved */
    sunvox_render_piece_of_sound(1, outBuf, frames, 2, freq, 0, &g_engines[handle]);
}

/** Start playing song from current position. */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_play(int handle) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return;
    sunvox_play(&g_engines[handle]);
}

/** Stop playback. */
EMSCRIPTEN_KEEPALIVE
void sunvox_wasm_stop(int handle) {
    if (handle < 0 || handle >= MAX_ENGINES || !g_engine_used[handle]) return;
    sunvox_stop(&g_engines[handle]);
}

} // extern "C"
```

**Step 2: Verify the file compiles (native, not WASM) to catch obvious errors**

```bash
cd /Users/spot/Code/DEViLBOX
g++ -std=c++11 -DSTYPE_FLOAT \
  -I"Reference Code/sunvox_sources-master" \
  -I"Reference Code/sunvox_sources-master/sunvox_engine" \
  -I"Reference Code/sunvox_sources-master/sundog_engine" \
  -fsyntax-only sunvox-wasm/src/SunVoxWrapper.cpp 2>&1
```

Expected: no errors (or only warnings about `EMSCRIPTEN_KEEPALIVE` / `emscripten.h` not found — that's OK for native check).

If there are `uchar`/`uint16` undefined errors, the sundog `core.h` or `memory.h` defines them. Add `-include "Reference Code/sunvox_sources-master/sundog_engine/core/core.h"` to the check command.

**Step 3: Commit**

```bash
cd /Users/spot/Code/DEViLBOX
git add sunvox-wasm/src/SunVoxWrapper.cpp
git commit -m "feat(sunvox): write SunVoxWrapper.cpp WASM bridge"
```

---

## Task 3: Compile audio WASM and verify

**Files:**
- Create: `public/sunvox/SunVox.js` and `public/sunvox/SunVox.wasm` (auto-generated)

**Step 1: Initialize CMake build**

```bash
cd /Users/spot/Code/DEViLBOX/sunvox-wasm/build && emcmake cmake .. 2>&1
```

Expected: `-- Configuring done` and `-- Build files have been written`.

If there are missing file errors, verify the paths in CMakeLists.txt point to the correct source locations under `Reference Code/sunvox_sources-master/`.

**Step 2: Build**

```bash
cd /Users/spot/Code/DEViLBOX/sunvox-wasm/build && emmake make 2>&1
```

Expected output ending with:
```
[100%] Linking CXX executable /Users/spot/Code/DEViLBOX/public/sunvox/SunVox.js
[100%] Built target SunVox
```

**Handling build failures:**

- `undefined type 'ticks_t'`: Add `typedef long ticks_t;` to the top of `SunVoxWrapper.cpp` before the includes.
- `undefined type 'uchar'`: The type is defined in sundog's `core/core.h`. Add `#include "core/core.h"` at the top of the wrapper.
- `undefined type 'UTF8_CHAR'`: Same fix — it comes from `core/core.h`.
- `undefined reference to 'sunvox_engine_init'`: Check the sunvox_engine.cpp is in the SOURCES list.
- `#include <windows.h>` error in timemanager: The sundog timemanager may have platform guards. Check `sundog_engine/time/code/timemanager.cpp` for `#ifdef WIN32` and ensure there's an else-branch or add `-DLINUX` to compile definitions.

**Step 3: Verify output files exist**

```bash
ls -la /Users/spot/Code/DEViLBOX/public/sunvox/
```

Expected: `SunVox.js` (~20-40KB) and `SunVox.wasm` (~150-300KB), timestamps from right now.

**Step 4: Commit**

```bash
cd /Users/spot/Code/DEViLBOX
git add public/sunvox/SunVox.js public/sunvox/SunVox.wasm
git commit -m "feat(sunvox): compile SunVox audio engine WASM"
```

---

## Task 4: Write AudioWorklet and TypeScript engine wrapper

**Files:**
- Create: `public/sunvox/SunVox.worklet.js`
- Create: `src/engine/sunvox/SunVoxEngine.ts`

**Step 1: Write AudioWorklet**

Create `public/sunvox/SunVox.worklet.js`:

```javascript
/**
 * SunVox.worklet.js — AudioWorklet processor for SunVox engine
 *
 * Messages IN (from main thread):
 *   { type: 'init', sampleRate: number }
 *   { type: 'note-on', handle: number, synthId: number, note: number, vel: number }
 *   { type: 'note-off', handle: number, synthId: number }
 *   { type: 'set-control', handle: number, synthId: number, ctlId: number, value: number }
 *   { type: 'load-song', handle: number, data: ArrayBuffer }   (data is transferable)
 *   { type: 'save-song', handle: number }
 *   { type: 'load-synth', handle: number, data: ArrayBuffer }  (data is transferable)
 *   { type: 'save-synth', handle: number, synthId: number }
 *   { type: 'play', handle: number }
 *   { type: 'stop', handle: number }
 *
 * Messages OUT (to main thread):
 *   { type: 'ready' }
 *   { type: 'song-saved', data: ArrayBuffer }
 *   { type: 'synth-saved', data: ArrayBuffer }
 *   { type: 'synth-loaded', synthId: number }
 *   { type: 'controls', handle: number, synthId: number, controls: Array }
 */

let m = null;  // WASM module instance

class SunVoxProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ready = false;
    this._activeHandles = new Set();
    this.port.onmessage = (e) => this._handleMessage(e.data);
    this._initWasm();
  }

  async _initWasm() {
    try {
      // Load SunVox.js from the same directory as this worklet
      const scriptUrl = new URL('./SunVox.js', import.meta.url).href;
      importScripts(scriptUrl);
      m = await createSunVox({});
      this._ready = true;
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      console.error('[SunVox.worklet] WASM load failed:', err);
    }
  }

  _handleMessage(msg) {
    if (!this._ready) return;
    switch (msg.type) {
      case 'create': {
        const handle = m._sunvox_wasm_create(sampleRate);
        this._activeHandles.add(handle);
        this.port.postMessage({ type: 'created', handle });
        break;
      }
      case 'destroy':
        m._sunvox_wasm_destroy(msg.handle);
        this._activeHandles.delete(msg.handle);
        break;
      case 'note-on':
        m._sunvox_wasm_note_on(msg.handle, msg.synthId, msg.note, msg.vel);
        break;
      case 'note-off':
        m._sunvox_wasm_note_off(msg.handle, msg.synthId);
        break;
      case 'set-control':
        m._sunvox_wasm_set_control(msg.handle, msg.synthId, msg.ctlId, msg.value);
        break;
      case 'load-song': {
        const bytes = new Uint8Array(msg.data);
        m.FS.writeFile('/tmp/input.sunvox', bytes);
        m._sunvox_wasm_load_song(msg.handle, '/tmp/input.sunvox');
        m.FS.unlink('/tmp/input.sunvox');
        this.port.postMessage({ type: 'song-loaded' });
        break;
      }
      case 'save-song': {
        m._sunvox_wasm_save_song(msg.handle, '/tmp/output.sunvox');
        const data = m.FS.readFile('/tmp/output.sunvox');
        m.FS.unlink('/tmp/output.sunvox');
        this.port.postMessage({ type: 'song-saved', data: data.buffer }, [data.buffer]);
        break;
      }
      case 'load-synth': {
        const bytes = new Uint8Array(msg.data);
        m.FS.writeFile('/tmp/input.sunsynth', bytes);
        const synthId = m._sunvox_wasm_load_synth(msg.handle, '/tmp/input.sunsynth');
        m.FS.unlink('/tmp/input.sunsynth');
        this.port.postMessage({ type: 'synth-loaded', synthId });
        break;
      }
      case 'save-synth': {
        m._sunvox_wasm_save_synth(msg.handle, msg.synthId, '/tmp/output.sunsynth');
        const data = m.FS.readFile('/tmp/output.sunsynth');
        m.FS.unlink('/tmp/output.sunsynth');
        this.port.postMessage({ type: 'synth-saved', data: data.buffer }, [data.buffer]);
        break;
      }
      case 'get-controls': {
        const count = m._sunvox_wasm_get_control_count(msg.handle, msg.synthId);
        const controls = [];
        for (let i = 0; i < count; i++) {
          controls.push({
            name: m.UTF8ToString(m._sunvox_wasm_get_control_name(msg.handle, msg.synthId, i)),
            min: m._sunvox_wasm_get_control_min(msg.handle, msg.synthId, i),
            max: m._sunvox_wasm_get_control_max(msg.handle, msg.synthId, i),
            value: m._sunvox_wasm_get_control_value(msg.handle, msg.synthId, i),
          });
        }
        this.port.postMessage({ type: 'controls', handle: msg.handle, synthId: msg.synthId, controls });
        break;
      }
      case 'get-modules': {
        const count = m._sunvox_wasm_get_module_count(msg.handle);
        const modules = [];
        for (let i = 0; i < count; i++) {
          modules.push({ id: i, name: m.UTF8ToString(m._sunvox_wasm_get_module_name(msg.handle, i)) });
        }
        this.port.postMessage({ type: 'modules', handle: msg.handle, modules });
        break;
      }
      case 'play':
        m._sunvox_wasm_play(msg.handle);
        break;
      case 'stop':
        m._sunvox_wasm_stop(msg.handle);
        break;
    }
  }

  process(inputs, outputs) {
    if (!this._ready || this._activeHandles.size === 0) return true;
    const out = outputs[0];
    if (!out || out.length < 2) return true;

    const frames = out[0].length;  // 128 typically
    // Allocate interleaved stereo buffer in WASM heap
    const byteLen = frames * 2 * 4;  // float32 stereo
    const ptr = m._malloc(byteLen);
    if (!ptr) return true;

    // Render each active engine and mix into output
    for (const handle of this._activeHandles) {
      m._sunvox_wasm_render(handle, ptr, frames, sampleRate);
      const buf = new Float32Array(m.HEAPF32.buffer, ptr, frames * 2);
      for (let i = 0; i < frames; i++) {
        out[0][i] += buf[i * 2];
        out[1][i] += buf[i * 2 + 1];
      }
    }

    m._free(ptr);
    return true;
  }
}

registerProcessor('sunvox-processor', SunVoxProcessor);
```

**Step 2: Create SunVoxEngine.ts**

Create `src/engine/sunvox/SunVoxEngine.ts`:

```typescript
/**
 * SunVoxEngine.ts - Singleton AudioWorklet manager for SunVox engine
 *
 * Manages the SunVox AudioWorklet. All SunVoxSynth instances share
 * this one worklet (one WASM instance, multiple engine handles).
 */
import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface SunVoxControl {
  name: string;
  min: number;
  max: number;
  value: number;
}

export interface SunVoxModule {
  id: number;
  name: string;
}

export class SunVoxEngine {
  private static _instance: SunVoxEngine | null = null;
  private _node: AudioWorkletNode | null = null;
  private _readyPromise: Promise<void>;
  private _readyResolve!: () => void;
  private _pendingCallbacks = new Map<string, (data: unknown) => void>();

  readonly output: GainNode;

  private constructor() {
    const ctx = getDevilboxAudioContext();
    this.output = ctx.createGain();
    this._readyPromise = new Promise((res) => { this._readyResolve = res; });
    this._init(ctx);
  }

  static getInstance(): SunVoxEngine {
    if (!SunVoxEngine._instance) SunVoxEngine._instance = new SunVoxEngine();
    return SunVoxEngine._instance;
  }

  private async _init(ctx: AudioContext): Promise<void> {
    await ctx.audioWorklet.addModule('/sunvox/SunVox.worklet.js');
    this._node = new AudioWorkletNode(ctx, 'sunvox-processor');
    this._node.connect(this.output);
    this._node.port.onmessage = (e) => this._onMessage(e.data);
  }

  private _onMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'ready') { this._readyResolve(); return; }
    const cb = this._pendingCallbacks.get(msg.type as string);
    if (cb) { this._pendingCallbacks.delete(msg.type as string); cb(msg); }
  }

  ready(): Promise<void> { return this._readyPromise; }

  sendMessage(msg: Record<string, unknown>, transfer?: Transferable[]): void {
    this._node?.port.postMessage(msg, transfer ?? []);
  }

  waitFor<T>(type: string): Promise<T> {
    return new Promise<T>((res) => {
      this._pendingCallbacks.set(type, res as (d: unknown) => void);
    });
  }

  /** Create a new engine handle. Returns handle number. */
  async createHandle(): Promise<number> {
    await this.ready();
    this.sendMessage({ type: 'create' });
    const resp = await this.waitFor<{ handle: number }>('created');
    return resp.handle;
  }

  async getControls(handle: number, synthId: number): Promise<SunVoxControl[]> {
    this.sendMessage({ type: 'get-controls', handle, synthId });
    const resp = await this.waitFor<{ controls: SunVoxControl[] }>('controls');
    return resp.controls;
  }

  async getModules(handle: number): Promise<SunVoxModule[]> {
    this.sendMessage({ type: 'get-modules', handle });
    const resp = await this.waitFor<{ modules: SunVoxModule[] }>('modules');
    return resp.modules;
  }

  async loadSong(handle: number, data: ArrayBuffer): Promise<void> {
    this.sendMessage({ type: 'load-song', handle, data }, [data]);
    await this.waitFor('song-loaded');
  }

  async saveSong(handle: number): Promise<ArrayBuffer> {
    this.sendMessage({ type: 'save-song', handle });
    const resp = await this.waitFor<{ data: ArrayBuffer }>('song-saved');
    return resp.data;
  }

  async loadSynth(handle: number, data: ArrayBuffer): Promise<number> {
    this.sendMessage({ type: 'load-synth', handle, data }, [data]);
    const resp = await this.waitFor<{ synthId: number }>('synth-loaded');
    return resp.synthId;
  }

  async saveSynth(handle: number, synthId: number): Promise<ArrayBuffer> {
    this.sendMessage({ type: 'save-synth', handle, synthId });
    const resp = await this.waitFor<{ data: ArrayBuffer }>('synth-saved');
    return resp.data;
  }
}
```

**Step 3: Run TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: zero errors.

**Step 4: Commit**

```bash
cd /Users/spot/Code/DEViLBOX
git add public/sunvox/SunVox.worklet.js src/engine/sunvox/SunVoxEngine.ts
git commit -m "feat(sunvox): add AudioWorklet and SunVoxEngine singleton"
```

---

## Task 5: Write SunVoxSynth.ts

**Files:**
- Create: `src/engine/sunvox/SunVoxSynth.ts`
- Test: `src/engine/sunvox/__tests__/SunVoxSynth.test.ts`

**Step 1: Write SunVoxSynth.ts**

Create `src/engine/sunvox/SunVoxSynth.ts`:

```typescript
/**
 * SunVoxSynth.ts - DevilboxSynth wrapper for SunVox per-note synthesis
 *
 * Each instance manages one SunVox engine handle containing one module.
 * The module is loaded from a .sunsynth ArrayBuffer via setModule().
 *
 * Note mapping: MIDI note 60 = SunVox note 60 (both are middle C, 1-based).
 */
import type { DevilboxSynth } from '@/types/synth';
import type { SunVoxConfig } from '@/types/instrument';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { SunVoxEngine } from './SunVoxEngine';
import type { SunVoxControl } from './SunVoxEngine';

export class SunVoxSynth implements DevilboxSynth {
  readonly name = 'SunVoxSynth';
  readonly output: GainNode;

  private _engine: SunVoxEngine;
  private _handle = -1;
  private _synthId = -1;
  private _disposed = false;

  private static _engineConnected = false;
  private _ownsConnection = false;

  constructor() {
    const ctx = getDevilboxAudioContext();
    this.output = ctx.createGain();
    this._engine = SunVoxEngine.getInstance();

    if (!SunVoxSynth._engineConnected) {
      this._engine.output.connect(this.output);
      SunVoxSynth._engineConnected = true;
      this._ownsConnection = true;
    }
  }

  /** Load a .sunsynth patch. Call before using note-on/off. */
  async setModule(data: ArrayBuffer): Promise<void> {
    await this._engine.ready();
    if (this._handle < 0) {
      this._handle = await this._engine.createHandle();
    }
    this._synthId = await this._engine.loadSynth(this._handle, data);
  }

  /** Get all controls for the loaded module. */
  async getControls(): Promise<SunVoxControl[]> {
    if (this._handle < 0 || this._synthId < 0) return [];
    return this._engine.getControls(this._handle, this._synthId);
  }

  /** Save current module state as .sunsynth bytes. */
  async saveSynth(): Promise<ArrayBuffer> {
    if (this._handle < 0 || this._synthId < 0) throw new Error('No module loaded');
    return this._engine.saveSynth(this._handle, this._synthId);
  }

  triggerAttack(note: string | number, _time?: number, velocity = 100): void {
    if (this._handle < 0 || this._synthId < 0) return;
    const midiNote = typeof note === 'string' ? noteNameToMidi(note) : Math.round(note);
    // SunVox notes are 1-based same as MIDI; velocity 1..129
    this._engine.sendMessage({
      type: 'note-on',
      handle: this._handle,
      synthId: this._synthId,
      note: Math.max(1, Math.min(127, midiNote)),
      vel: Math.max(1, Math.min(129, Math.round((velocity / 127) * 128 + 1))),
    });
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (this._handle < 0 || this._synthId < 0) return;
    this._engine.sendMessage({
      type: 'note-off',
      handle: this._handle,
      synthId: this._synthId,
    });
  }

  set(param: string, value: number): void {
    if (this._handle < 0 || this._synthId < 0) return;
    const ctlId = parseInt(param, 10);
    if (isNaN(ctlId)) return;
    this._engine.sendMessage({
      type: 'set-control',
      handle: this._handle,
      synthId: this._synthId,
      ctlId,
      value: Math.round(value),
    });
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this._handle >= 0) {
      this._engine.sendMessage({ type: 'destroy', handle: this._handle });
      this._handle = -1;
    }
    if (this._ownsConnection) {
      this._engine.output.disconnect(this.output);
      SunVoxSynth._engineConnected = false;
    }
    this.output.disconnect();
  }
}

function noteNameToMidi(name: string): number {
  const NOTE_MAP: Record<string, number> = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
    E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8,
    A: 9, 'A#': 10, Bb: 10, B: 11,
  };
  const m = name.match(/^([A-G]#?b?)(-?\d+)$/);
  if (!m) return 60;
  return (parseInt(m[2], 10) + 1) * 12 + (NOTE_MAP[m[1]] ?? 0);
}
```

**Step 2: Write unit tests**

Create `src/engine/sunvox/__tests__/SunVoxSynth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SunVoxSynth } from '../SunVoxSynth';

// Mock the engine to avoid WASM loading in unit tests
vi.mock('../SunVoxEngine', () => ({
  SunVoxEngine: {
    getInstance: () => ({
      output: { connect: vi.fn(), disconnect: vi.fn() },
      ready: vi.fn().mockResolvedValue(undefined),
      createHandle: vi.fn().mockResolvedValue(0),
      loadSynth: vi.fn().mockResolvedValue(1),
      saveSynth: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      getControls: vi.fn().mockResolvedValue([
        { name: 'Volume', min: 0, max: 256, value: 128 },
      ]),
      sendMessage: vi.fn(),
    }),
  },
}));

vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({
    createGain: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
  }),
}));

describe('SunVoxSynth', () => {
  beforeEach(() => {
    // Reset static connection flag between tests
    (SunVoxSynth as unknown as { _engineConnected: boolean })._engineConnected = false;
  });

  it('implements DevilboxSynth interface', () => {
    const synth = new SunVoxSynth();
    expect(synth.name).toBe('SunVoxSynth');
    expect(synth.output).toBeDefined();
    expect(typeof synth.triggerAttack).toBe('function');
    expect(typeof synth.triggerRelease).toBe('function');
    expect(typeof synth.dispose).toBe('function');
  });

  it('setModule resolves and stores synthId', async () => {
    const synth = new SunVoxSynth();
    await synth.setModule(new ArrayBuffer(10));
    // No errors thrown = pass; getControls should work now
    const controls = await synth.getControls();
    expect(controls).toHaveLength(1);
    expect(controls[0].name).toBe('Volume');
  });

  it('triggerAttack sends note-on message', async () => {
    const synth = new SunVoxSynth();
    await synth.setModule(new ArrayBuffer(10));
    const engine = (synth as unknown as { _engine: { sendMessage: ReturnType<typeof vi.fn> } })._engine;
    synth.triggerAttack(60, undefined, 100);
    expect(engine.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'note-on', note: 60 })
    );
  });

  it('dispose cleans up handle and connection', async () => {
    const synth = new SunVoxSynth();
    await synth.setModule(new ArrayBuffer(10));
    const engine = (synth as unknown as { _engine: { sendMessage: ReturnType<typeof vi.fn> } })._engine;
    synth.dispose();
    expect(engine.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'destroy' })
    );
  });
});
```

**Step 3: Run tests**

```bash
cd /Users/spot/Code/DEViLBOX && npx vitest run src/engine/sunvox/__tests__/SunVoxSynth.test.ts 2>&1
```

Expected: 4 tests pass.

**Step 4: Run TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: zero errors.

**Step 5: Commit**

```bash
cd /Users/spot/Code/DEViLBOX
git add src/engine/sunvox/SunVoxSynth.ts src/engine/sunvox/__tests__/SunVoxSynth.test.ts
git commit -m "feat(sunvox): add SunVoxSynth DevilboxSynth implementation + tests"
```

---

## Task 6: Add types and wire InstrumentFactory + ToneEngine

**Files:**
- Modify: `src/types/tracker.ts`
- Modify: `src/types/instrument.ts`
- Modify: `src/engine/InstrumentFactory.ts`
- Modify: `src/engine/ToneEngine.ts`

**Step 1: Add 'sunvox' to channelType in tracker.ts**

Find the `channelType` union in `src/types/tracker.ts`. It looks like:
```typescript
channelType?: 'sample' | 'synth' | 'hybrid';
```
Change to:
```typescript
channelType?: 'sample' | 'synth' | 'hybrid' | 'sunvox';
```

Also add `sunvoxModuleId` to `channelMeta`:
```typescript
channelMeta?: {
  channelType?: 'sample' | 'synth' | 'hybrid' | 'sunvox';
  sunvoxModuleId?: number;
  [key: string]: unknown;
};
```

**Step 2: Add SunVoxConfig to instrument.ts**

Find `src/types/instrument.ts` (where `HivelyConfig`, `TB303Config` etc. are defined). Add:

```typescript
export interface SunVoxConfig {
  synthType: 'SunVoxSynth';
  synthId: number;       // 0-based module id within the engine
  patchData?: string;    // base64-encoded .sunsynth bytes, or undefined for blank
  moduleName?: string;   // display name
}

export const DEFAULT_SUNVOX: SunVoxConfig = {
  synthType: 'SunVoxSynth',
  synthId: -1,
  patchData: undefined,
  moduleName: 'SunVox',
};
```

Also add `sunvox?: SunVoxConfig` to the `InstrumentConfig` interface in the same file, following the pattern of `hively?: HivelyConfig`.

**Step 3: Wire InstrumentFactory.ts**

In `src/engine/InstrumentFactory.ts`:

1. Add import at the top (with other synth imports):
```typescript
import { SunVoxSynth } from './sunvox/SunVoxSynth';
```

2. Find the `createInstrument` switch block where `'HivelySynth'` appears. Add:
```typescript
case 'SunVoxSynth':
  instrument = new SunVoxSynth();
  break;
```

**Step 4: Wire ToneEngine.ts**

In `src/engine/ToneEngine.ts`:

1. Find the line (~906) with the array of synth types that starts with `['TB303', 'Buzz3o3', ...]`. Add `'SunVoxSynth'` to that array.

2. Find the `createInstrument` case block that handles `'HivelySynth'`. Add `'SunVoxSynth'` to the same `case` group:
```typescript
case 'SunVoxSynth':
case 'HivelySynth':
case 'UADESynth':
  instrument = InstrumentFactory.createInstrument(config);
  break;
```

3. Find the per-note routing block. For SunVox we don't need special per-note routing since `SunVoxSynth.triggerAttack/Release` handles everything — it will be picked up by the existing `instrument.triggerAttack?.()` path.

**Step 5: Run TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: zero errors. Fix any type mismatches before proceeding.

**Step 6: Commit**

```bash
cd /Users/spot/Code/DEViLBOX
git add src/types/tracker.ts src/types/instrument.ts src/engine/InstrumentFactory.ts src/engine/ToneEngine.ts
git commit -m "feat(sunvox): add SunVoxConfig type, wire InstrumentFactory + ToneEngine"
```

---

## Task 7: Write PixiSunVoxChannelView.tsx

**Files:**
- Create: `src/pixi/views/sunvox/PixiSunVoxChannelView.tsx`

**Step 1: Read the TB-303 channel renderer for reference**

Read `src/pixi/views/tracker/PixiTB303View.tsx` — understand how it renders note/flag cells, what color constants it uses, and what props it receives.

**Step 2: Write the renderer**

Create `src/pixi/views/sunvox/PixiSunVoxChannelView.tsx`:

```tsx
/**
 * PixiSunVoxChannelView.tsx — PixiJS cell renderer for SunVox channels
 *
 * Renders note, velocity, and effect columns for a SunVox channel row.
 * Layout: [NOTE 3ch] [VEL 2ch] [FX 4ch] where ch = character width
 *
 * Props follow the same pattern as other Pixi channel views.
 */
import React from 'react';
// This component registers itself with the Pixi tracker channel renderer registry.
// Exact implementation depends on how PixiTrackerView dispatches to per-channel-type renderers.
// Follow the same pattern as PixiTB303View.tsx exactly.
// Key rendering: note column, 2-digit hex velocity, 2-digit hex effect code + 2-digit param.
// Empty note = "---", note off = "===", normal note = e.g. "C-4".
```

> **Note to implementer:** Read `src/pixi/views/tracker/PixiTB303View.tsx` completely before writing this component. Match its exact prop interface, color constants, and PixiJS Graphics API usage. The SunVox channel has: note column (same as any tracker note), velocity column (2 hex digits, 0=default), effect column (2 hex effect code + 2 hex param). Render empty cells as `---` / `..` / `....`.

**Step 3: Register channel type in PixiTrackerView**

Read `src/pixi/views/PixiTrackerView.tsx`. Find where `channelType === 'tb303'` (or similar) dispatches to the TB-303 renderer. Add a parallel dispatch for `channelType === 'sunvox'` → `PixiSunVoxChannelView`.

**Step 4: Run TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: zero errors.

**Step 5: Commit**

```bash
cd /Users/spot/Code/DEViLBOX
git add src/pixi/views/sunvox/ src/pixi/views/PixiTrackerView.tsx
git commit -m "feat(sunvox): add PixiSunVoxChannelView + channel type dispatch"
```

---

## Task 8: Write SunVoxControls.tsx (React parameter panel)

**Files:**
- Create: `src/components/instruments/controls/SunVoxControls.tsx`

**Step 1: Write the generic controls panel**

Create `src/components/instruments/controls/SunVoxControls.tsx`:

```tsx
/**
 * SunVoxControls.tsx — Generic parameter panel for SunVox modules
 *
 * Reads psynth_control[] from WASM at mount time via SunVoxSynth.getControls().
 * Renders one knob per controller, labeled with the controller name.
 * Follows the configRef pattern from CLAUDE.md to avoid stale state.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { SunVoxConfig } from '@/types/instrument';
import type { SunVoxControl } from '@/engine/sunvox/SunVoxEngine';

interface Props {
  config: SunVoxConfig;
  onChange: (config: SunVoxConfig) => void;
  getSynth?: () => import('@/engine/sunvox/SunVoxSynth').SunVoxSynth | null;
}

export const SunVoxControls: React.FC<Props> = ({ config, onChange, getSynth }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const [controls, setControls] = useState<SunVoxControl[]>([]);

  useEffect(() => {
    const synth = getSynth?.();
    if (!synth) return;
    synth.getControls().then(setControls);
  }, [getSynth]);

  const handleChange = useCallback((ctlId: number, value: number) => {
    const synth = getSynth?.();
    if (synth) synth.set(String(ctlId), value);
    // Persist the new value in config (patchData regenerated on save)
    onChange({ ...configRef.current });
  }, [getSynth, onChange]);

  if (controls.length === 0) {
    return <div className="p-4 text-gray-400 text-sm">No module loaded</div>;
  }

  return (
    <div className="grid grid-cols-4 gap-2 p-3">
      {controls.map((ctl, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <input
            type="range"
            min={ctl.min}
            max={ctl.max}
            value={ctl.value}
            onChange={(e) => handleChange(i, parseInt(e.target.value, 10))}
            className="w-full"
          />
          <span className="text-xs text-gray-300 truncate w-full text-center" title={ctl.name}>
            {ctl.name}
          </span>
          <span className="text-xs text-gray-500">{ctl.value}</span>
        </div>
      ))}
    </div>
  );
};
```

**Step 2: Run TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: zero errors.

**Step 3: Commit**

```bash
cd /Users/spot/Code/DEViLBOX
git add src/components/instruments/controls/SunVoxControls.tsx
git commit -m "feat(sunvox): add SunVoxControls React parameter panel"
```

---

## Task 9: Framebuffer UI — SunVoxUI.cpp + CMakeLists

**Files:**
- Create: `sunvox-wasm/src/SunVoxUI.cpp`
- Create: `sunvox-wasm/CMakeLists.ui.txt`

> **Note:** The sundog window_manager requires significant platform initialization. This task focuses on getting a minimal framebuffer UI working. Full module-specific visuals may require additional sundog subsystems — investigate and add as needed.

**Step 1: Read the sundog framebuffer header**

Read `Reference Code/sunvox_sources-master/sundog_engine/window_manager/wmanager.h` and `Reference Code/sunvox_sources-master/sundog_engine/window_manager/code/wm_framebuffer.h` to understand:
- How to create a window_manager in framebuffer mode
- How to create a window
- How to tick / flush framebuffer
- What `WINDOWPTR` is and how to get a raw pixel pointer

**Step 2: Write minimal SunVoxUI.cpp**

The goal is: create a window_manager in framebuffer mode, host a psynth control panel window, expose the BGRA framebuffer pointer. Write `sunvox-wasm/src/SunVoxUI.cpp` based on what the sundog API provides. This file is separate from the audio engine — it does NOT include sunvox_engine.h.

Exported functions needed:
```c
int  sunvox_ui_create(int width, int height);   // returns handle
void sunvox_ui_destroy(int handle);
void sunvox_ui_tick(int handle);                // process pending events + update visuals
void* sunvox_ui_get_framebuffer(int handle);    // BGRA pixel data
int  sunvox_ui_get_fb_width(int handle);
int  sunvox_ui_get_fb_height(int handle);
void sunvox_ui_mouse_down(int handle, int x, int y, int btn);
void sunvox_ui_mouse_up(int handle, int x, int y, int btn);
void sunvox_ui_mouse_move(int handle, int x, int y);
```

**Step 3: Write CMakeLists.ui.txt**

Create `sunvox-wasm/CMakeLists.ui.txt` as a separate CMake project (named `SunVoxUI`) that builds only the UI module. It needs sundog window_manager source files but NOT sunvox_engine sources. Output: `public/sunvox/SunVoxUI.js` + `SunVoxUI.wasm`.

**Step 4: Compile and verify**

```bash
cd /Users/spot/Code/DEViLBOX/sunvox-wasm/build
emcmake cmake .. -DCMAKE_TOOLCHAIN_FILE=... -DPROJECT=UI  # adjust for separate CMakeLists
emmake make SunVoxUI 2>&1
ls -la /Users/spot/Code/DEViLBOX/public/sunvox/SunVoxUI.js
```

Expected: SunVoxUI.js and SunVoxUI.wasm exist.

**Step 5: Commit**

```bash
cd /Users/spot/Code/DEViLBOX
git add sunvox-wasm/src/SunVoxUI.cpp sunvox-wasm/CMakeLists.ui.txt public/sunvox/SunVoxUI.js public/sunvox/SunVoxUI.wasm
git commit -m "feat(sunvox): add SunVoxUI framebuffer WASM build"
```

---

## Task 10: Write SunVoxFramebufferView.tsx

**Files:**
- Create: `src/components/instruments/controls/SunVoxFramebufferView.tsx`

**Step 1: Write the framebuffer canvas component**

Create `src/components/instruments/controls/SunVoxFramebufferView.tsx`:

```tsx
/**
 * SunVoxFramebufferView.tsx — Hardware framebuffer UI for SunVox modules
 *
 * Loads SunVoxUI.wasm, blits its BGRA framebuffer to a canvas each rAF frame.
 * Mouse/key events forwarded to the WASM UI. BGRA→RGBA byte swap same as PT2/FT2.
 */
import React, { useEffect, useRef } from 'react';

interface Props {
  width?: number;
  height?: number;
}

export const SunVoxFramebufferView: React.FC<Props> = ({
  width = 400,
  height = 300,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moduleRef = useRef<unknown>(null);
  const handleRef = useRef(-1);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    (async () => {
      // Dynamically load the UI WASM module
      const script = document.createElement('script');
      script.src = '/sunvox/SunVoxUI.js';
      document.head.appendChild(script);
      await new Promise<void>((res) => { script.onload = () => res(); });

      const m = await (window as unknown as { createSunVoxUI: (opts: object) => Promise<unknown> }).createSunVoxUI({});
      if (cancelled) return;
      moduleRef.current = m;

      const api = m as Record<string, (...args: unknown[]) => unknown>;
      handleRef.current = api._sunvox_ui_create(width, height) as number;

      const tick = () => {
        if (cancelled) return;
        const h = handleRef.current;
        api._sunvox_ui_tick(h);
        const fbPtr = api._sunvox_ui_get_framebuffer(h) as number;
        const fbWidth = api._sunvox_ui_get_fb_width(h) as number;
        const fbHeight = api._sunvox_ui_get_fb_height(h) as number;

        if (fbPtr && fbWidth > 0 && fbHeight > 0) {
          const src = new Uint8Array((m as { HEAPU8: { buffer: ArrayBuffer } }).HEAPU8.buffer, fbPtr, fbWidth * fbHeight * 4);
          const imgData = ctx.createImageData(fbWidth, fbHeight);
          const dst = imgData.data;
          /* BGRA→RGBA swap */
          for (let i = 0; i < fbWidth * fbHeight * 4; i += 4) {
            dst[i]   = src[i + 2]; // R
            dst[i+1] = src[i + 1]; // G
            dst[i+2] = src[i];     // B
            dst[i+3] = 255;        // A
          }
          ctx.putImageData(imgData, 0, 0);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      const api = moduleRef.current as Record<string, (...args: unknown[]) => unknown> | null;
      if (api && handleRef.current >= 0) {
        api._sunvox_ui_destroy(handleRef.current);
      }
    };
  }, [width, height]);

  const sendMouse = (type: string, e: React.MouseEvent) => {
    const api = moduleRef.current as Record<string, (...args: unknown[]) => unknown> | null;
    if (!api || handleRef.current < 0) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    const btn = e.button;
    if (type === 'down') api._sunvox_ui_mouse_down(handleRef.current, x, y, btn);
    else if (type === 'up') api._sunvox_ui_mouse_up(handleRef.current, x, y, btn);
    else if (type === 'move') api._sunvox_ui_mouse_move(handleRef.current, x, y);
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ imageRendering: 'pixelated', cursor: 'default' }}
      onMouseDown={(e) => sendMouse('down', e)}
      onMouseUp={(e) => sendMouse('up', e)}
      onMouseMove={(e) => sendMouse('move', e)}
    />
  );
};
```

**Step 2: Run TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: zero errors.

**Step 3: Commit**

```bash
cd /Users/spot/Code/DEViLBOX
git add src/components/instruments/controls/SunVoxFramebufferView.tsx
git commit -m "feat(sunvox): add SunVoxFramebufferView hardware framebuffer canvas"
```

---

## Task 11: Write SunVoxImportDialog.tsx

**Files:**
- Create: `src/components/instruments/SunVoxImportDialog.tsx`

**Step 1: Read HivelyImportDialog for reference**

Read `src/components/instruments/HivelyImportDialog.tsx` — match its structure exactly. The SunVox dialog differs only in:
- Accepts `.sunvox` files
- Calls `SunVoxEngine.getInstance().loadSong(handle, buffer)` then `getModules()` to list modules
- Filters out module id 0 (Output node, always exists at index 0)

**Step 2: Write SunVoxImportDialog.tsx**

```tsx
/**
 * SunVoxImportDialog.tsx — Import SunVox modules from a .sunvox file
 *
 * Opens a .sunvox file, lists all modules (excluding Output at id=0),
 * lets the user select which to import into the current song.
 */
import React, { useState, useRef } from 'react';
import { SunVoxEngine } from '@/engine/sunvox/SunVoxEngine';
import type { SunVoxModule } from '@/engine/sunvox/SunVoxEngine';

interface Props {
  onClose: () => void;
  onImport: (modules: SunVoxModule[]) => void;
}

export const SunVoxImportDialog: React.FC<Props> = ({ onClose, onImport }) => {
  const [modules, setModules] = useState<SunVoxModule[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const engine = SunVoxEngine.getInstance();
      const handle = await engine.createHandle();
      await engine.loadSong(handle, buf);
      const mods = await engine.getModules(handle);
      // Filter out Output node (id=0, name usually "Output")
      const filtered = mods.filter((m) => m.id !== 0 && m.name.trim() !== '');
      setModules(filtered);
      setSelected(new Set(filtered.map((m) => m.id)));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleImport = () => {
    onImport(modules.filter((m) => selected.has(m.id)));
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-96 p-4 flex flex-col gap-3">
        <h2 className="text-white font-semibold">Import from .sunvox</h2>
        <input ref={fileRef} type="file" accept=".sunvox" onChange={handleFile} className="hidden" />
        <button
          onClick={() => fileRef.current?.click()}
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm"
        >
          Choose .sunvox file…
        </button>
        {loading && <p className="text-gray-400 text-sm">Loading…</p>}
        {modules.length > 0 && (
          <>
            <div className="flex gap-2 text-xs text-gray-400">
              <button onClick={() => setSelected(new Set(modules.map((m) => m.id)))}>All</button>
              <button onClick={() => setSelected(new Set())}>None</button>
            </div>
            <div className="overflow-y-auto max-h-48 flex flex-col gap-1">
              {modules.map((mod) => (
                <label key={mod.id} className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(mod.id)}
                    onChange={() => toggle(mod.id)}
                  />
                  <span>{mod.name || `Module ${mod.id}`}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm">Cancel</button>
          <button
            onClick={handleImport}
            disabled={selected.size === 0}
            className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white px-3 py-1 rounded text-sm"
          >
            Import ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
};
```

**Step 2: Run TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: zero errors.

**Step 3: Commit**

```bash
cd /Users/spot/Code/DEViLBOX
git add src/components/instruments/SunVoxImportDialog.tsx
git commit -m "feat(sunvox): add SunVoxImportDialog module picker modal"
```

---

## Task 12: Wire InstrumentList.tsx and TrackerView.tsx

**Files:**
- Modify: `src/components/instruments/InstrumentList.tsx`
- Modify: `src/components/tracker/TrackerView.tsx`

**Step 1: Read InstrumentList.tsx**

Read `src/components/instruments/InstrumentList.tsx` in full. It already has Hively save/load buttons added in the previous session. Follow the **exact same pattern** for SunVox.

**Step 2: Add SunVox import/export to InstrumentList**

In `InstrumentList.tsx`:

1. Add imports:
```typescript
import { SunVoxImportDialog } from './SunVoxImportDialog';
import { SunVoxSynth } from '@/engine/sunvox/SunVoxSynth';
```

2. Add `showSunVoxImport?: boolean` to `InstrumentListProps`.

3. Add state: `const [showSunVoxImportDialog, setShowSunVoxImportDialog] = useState(false);`

4. Add `handleSaveSunsynth` — calls `synth.saveSynth()` → download `<name>.sunsynth`:
```typescript
const handleSaveSunsynth = useCallback(async (instrumentId: number) => {
  // Get the SunVoxSynth for this instrument and save it
  // Follow the Hively handleSaveAhi pattern exactly
}, [/* dependencies */]);
```

5. Add `handleLoadSunsynth` — opens file input → reads ArrayBuffer → calls synth.setModule(buf):
```typescript
const handleLoadSunsynth = useCallback((instrumentId: number) => {
  // Follow the Hively handleLoadAhi pattern exactly
}, [/* dependencies */]);
```

6. Add per-instrument Download/Upload buttons for instruments where `config.synthType === 'SunVoxSynth'`.

7. Add `showActionBar` condition: `|| showSunVoxImport`.

8. Add "Import from .sunvox…" button in action bar.

9. Render `<SunVoxImportDialog>` conditionally at component root.

**Step 3: Wire TrackerView.tsx**

In `src/components/tracker/TrackerView.tsx`, add `showSunVoxImport={editorMode === 'sunvox'}` to `<InstrumentList>` (mirroring how `showHivelyImport={editorMode === 'hively'}` was added).

**Step 4: Run TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: zero errors.

**Step 5: Commit**

```bash
cd /Users/spot/Code/DEViLBOX
git add src/components/instruments/InstrumentList.tsx src/components/tracker/TrackerView.tsx
git commit -m "feat(sunvox): wire SunVox instrument save/load + import dialog into InstrumentList"
```

---

## Task 13: Final TypeScript check and integration test

**Step 1: Run full TypeScript check**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: zero errors. Fix any remaining issues.

**Step 2: Run all unit tests**

```bash
cd /Users/spot/Code/DEViLBOX && npx vitest run src/engine/sunvox/ 2>&1
```

Expected: all tests pass.

**Step 3: Manual smoke test (if dev server available)**

```bash
cd /Users/spot/Code/DEViLBOX && npm run dev
```

- Load a `.sunvox` file from the file browser
- Verify modules appear in the instrument list
- Click a SunVox instrument → controls panel should show knobs
- Play a note → audio output from WASM engine

**Step 4: Final commit**

```bash
cd /Users/spot/Code/DEViLBOX
git add -p  # add any remaining changes
git commit -m "feat(sunvox): complete SunVox integration — WASM engine, channel type, React controls, import/export"
```

---

## Quick Reference: File Paths

| File | Status |
|------|--------|
| `sunvox-wasm/CMakeLists.txt` | New |
| `sunvox-wasm/src/SunVoxWrapper.cpp` | New |
| `sunvox-wasm/src/SunVoxUI.cpp` | New |
| `sunvox-wasm/CMakeLists.ui.txt` | New |
| `public/sunvox/SunVox.js` + `.wasm` | Generated |
| `public/sunvox/SunVox.worklet.js` | New |
| `public/sunvox/SunVoxUI.js` + `.wasm` | Generated |
| `src/engine/sunvox/SunVoxEngine.ts` | New |
| `src/engine/sunvox/SunVoxSynth.ts` | New |
| `src/engine/sunvox/__tests__/SunVoxSynth.test.ts` | New |
| `src/pixi/views/sunvox/PixiSunVoxChannelView.tsx` | New |
| `src/components/instruments/controls/SunVoxControls.tsx` | New |
| `src/components/instruments/controls/SunVoxFramebufferView.tsx` | New |
| `src/components/instruments/SunVoxImportDialog.tsx` | New |
| `src/types/tracker.ts` | Modified — add `'sunvox'`, `sunvoxModuleId` |
| `src/types/instrument.ts` | Modified — add `SunVoxConfig`, `DEFAULT_SUNVOX` |
| `src/engine/InstrumentFactory.ts` | Modified — add `'SunVoxSynth'` case |
| `src/engine/ToneEngine.ts` | Modified — add `'SunVoxSynth'` to routing |
| `src/components/instruments/InstrumentList.tsx` | Modified — save/load/import buttons |
| `src/components/tracker/TrackerView.tsx` | Modified — wire `showSunVoxImport` |
