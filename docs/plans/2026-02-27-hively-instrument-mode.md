# HivelyTracker Instrument Mode Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix HivelyTracker instrument editing so playing a note produces audio with correct envelope timing.

**Architecture:** Two changes to `hively-wasm/common/HivelyWrapper.c` only — add a per-player 50Hz sample counter so `hvl_process_frame` fires at the correct rate, then recompile the WASM. No TypeScript changes needed; the entire TS/worklet layer is already correct.

**Tech Stack:** C99, Emscripten, CMake. Build output lands in `public/hively/` automatically.

---

## Background (read this first)

`HivelyWrapper.c` already contains 6 standalone-player functions (`hively_create_player`, `hively_player_set_instrument`, `hively_player_note_on`, `hively_player_note_off`, `hively_player_render`, `hively_destroy_player`) and they are listed in `CMakeLists.txt`'s `EXPORTED_FUNCTIONS`. The WASM binary in `public/hively/` predates them — a recompile alone likely fixes silence.

However there is also a pacing bug: `hively_player_render` calls `hvl_process_frame()` on every invocation. The AudioWorklet calls render with ~128-sample blocks (~344×/sec), but `hvl_process_frame` must run at exactly 50 Hz (once per `sampleRate/50` ≈ 882 samples). At 344 calls/sec instead of 50, ADSR envelopes run ~7× too fast — notes die almost instantly.

Fix: add a `g_playerSamplesLeft[MAX_PLAYERS]` counter. `hvl_process_frame` only fires when the counter hits zero. Reset counter to 0 on `note_on` so the first frame fires immediately (correct attack onset).

### Key file locations

| Path | Role |
|------|------|
| `hively-wasm/common/HivelyWrapper.c` | **Only file to edit** |
| `hively-wasm/build/` | Build directory (run make here) |
| `public/hively/Hively.js` + `.wasm` | Build output (auto-updated) |
| `src/engine/hively/HivelySynth.ts` | TS layer — correct, do not touch |
| `public/hively/Hively.worklet.js` | Worklet — correct, do not touch |

---

## Task 1: Add the 50Hz sample counter

**Files:**
- Modify: `hively-wasm/common/HivelyWrapper.c` (around line 353 — the `MAX_PLAYERS` block)

**Step 1: Open the file and find the player state arrays**

They look like this (around line 353):
```c
#define MAX_PLAYERS 4
static struct hvl_tune *g_players[MAX_PLAYERS] = {NULL};
static int16 *g_playerMixL[MAX_PLAYERS] = {NULL};
static int16 *g_playerMixR[MAX_PLAYERS] = {NULL};
static uint32 g_playerMixSize[MAX_PLAYERS] = {0};
static uint8 g_playerActive[MAX_PLAYERS] = {0};
```

**Step 2: Add the counter array immediately after `g_playerActive`**

Add this one line:
```c
static uint32 g_playerSamplesLeft[MAX_PLAYERS] = {0};
```

Result:
```c
#define MAX_PLAYERS 4
static struct hvl_tune *g_players[MAX_PLAYERS] = {NULL};
static int16 *g_playerMixL[MAX_PLAYERS] = {NULL};
static int16 *g_playerMixR[MAX_PLAYERS] = {NULL};
static uint32 g_playerMixSize[MAX_PLAYERS] = {0};
static uint8 g_playerActive[MAX_PLAYERS] = {0};
static uint32 g_playerSamplesLeft[MAX_PLAYERS] = {0};
```

**Step 3: Reset the counter in `hively_player_note_on`**

Find the last line of `hively_player_note_on` before the closing `}`:
```c
    g_playerActive[handle] = 1;
}
```

Add the counter reset so it becomes:
```c
    g_playerActive[handle] = 1;
    g_playerSamplesLeft[handle] = 0; /* fire hvl_process_frame immediately on first render */
}
```

**Step 4: Fix `hively_player_render` — replace the render loop**

Find the current render loop (around line 655):
```c
    uint32 written = 0;
    while (written < numSamples) {
        /* Process one frame of voice state (ADSR, vibrato, filter sweep, plist) */
        hvl_process_frame(ht, voice);
        hvl_set_audio(voice, ht->ht_FreqF);

        /* Render a chunk of audio */
        uint32 samplesPerFrame = ht->ht_Frequency / 50;
        uint32 toRender = numSamples - written;
        if (toRender > samplesPerFrame) toRender = samplesPerFrame;

        memset(&g_playerMixL[handle][0], 0, toRender * sizeof(int16));
        memset(&g_playerMixR[handle][0], 0, toRender * sizeof(int16));

        hvl_mixchunk(ht, toRender, (int8 *)g_playerMixL[handle], (int8 *)g_playerMixR[handle], 2);

        /* Convert int16 → float32 */
        const float scale = 1.0f / 32768.0f;
        for (uint32 i = 0; i < toRender; i++) {
            outL[written + i] = (float)g_playerMixL[handle][i] * scale;
            outR[written + i] = (float)g_playerMixR[handle][i] * scale;
        }
        written += toRender;
    }
```

Replace it entirely with:
```c
    uint32 written = 0;
    const uint32 samplesPerFrame = ht->ht_Frequency / 50;
    const float scale = 1.0f / 32768.0f;

    while (written < numSamples) {
        /* Fire voice state update at 50 Hz */
        if (g_playerSamplesLeft[handle] == 0) {
            hvl_process_frame(ht, voice);
            hvl_set_audio(voice, ht->ht_FreqF);
            g_playerSamplesLeft[handle] = samplesPerFrame;
        }

        /* Render up to the end of the current 50Hz frame */
        uint32 toRender = numSamples - written;
        if (toRender > g_playerSamplesLeft[handle])
            toRender = g_playerSamplesLeft[handle];

        memset(&g_playerMixL[handle][0], 0, toRender * sizeof(int16));
        memset(&g_playerMixR[handle][0], 0, toRender * sizeof(int16));

        hvl_mixchunk(ht, toRender, (int8 *)g_playerMixL[handle], (int8 *)g_playerMixR[handle], 2);

        for (uint32 i = 0; i < toRender; i++) {
            outL[written + i] = (float)g_playerMixL[handle][i] * scale;
            outR[written + i] = (float)g_playerMixR[handle][i] * scale;
        }

        written += toRender;
        g_playerSamplesLeft[handle] -= toRender;
    }
```

**Step 5: Also reset the counter in `hively_destroy_player`**

Find `hively_destroy_player`. At the end, add:
```c
    g_playerSamplesLeft[handle] = 0;
    g_playerActive[handle] = 0;
```

(It likely already resets `g_playerActive`; just add the `g_playerSamplesLeft` reset alongside it.)

---

## Task 2: Recompile the WASM

**Step 1: Run the build**

```bash
cd /Users/spot/Code/DEViLBOX/hively-wasm/build && emmake make 2>&1
```

Expected: build succeeds, outputs something like:
```
[ 50%] Building C object CMakeFiles/Hively.dir/common/HivelyWrapper.c.o
[ 50%] Building C object CMakeFiles/Hively.dir/common/hvl_replay.c.o
[100%] Linking C executable /path/to/public/hively/Hively.js
[100%] Built target Hively
```

**If the build fails** with undefined reference errors on `hvl_process_frame`, `hvl_set_audio`, `hvl_mixchunk`, `panning_left`, `panning_right`, or `waves` — those symbols are declared `static` in `hvl_replay.c`. Check by running:
```bash
grep -n "^static.*hvl_process_frame\|^static.*hvl_set_audio\|^static.*hvl_mixchunk\|^static int8 waves\|^static uint32 panning" /Users/spot/Code/DEViLBOX/hively-wasm/common/hvl_replay.c
```

If any match, remove the `static` keyword from those declarations in `hvl_replay.c` (the extern declarations in `HivelyWrapper.c` require them to be non-static).

**Step 2: Verify output files were updated**

```bash
ls -la /Users/spot/Code/DEViLBOX/public/hively/Hively.js /Users/spot/Code/DEViLBOX/public/hively/Hively.wasm
```

Expected: timestamps are from right now, sizes are plausible (Hively.wasm ~60–100KB, Hively.js ~15–20KB).

---

## Task 3: TypeScript check + commit

**Step 1: Run the TypeScript compiler**

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

**Step 2: Commit**

```bash
git add hively-wasm/common/HivelyWrapper.c public/hively/Hively.js public/hively/Hively.wasm
git commit -m "fix(hively): implement 50Hz pacing for standalone instrument player, recompile WASM"
```

---

## Task 4: Manual verification

**Step 1: Start the dev server**

```bash
cd /Users/spot/Code/DEViLBOX && npm run dev
```

**Step 2: Load a HivelyTracker file**

- Open the app in the browser
- Load any `.hvl` file from `Reference Music/HivelyTracker/`
- Open the Instruments panel

**Step 3: Test instrument playback**

- Click any instrument to open the HivelyTracker controls editor
- Click a key on the on-screen keyboard (or press a MIDI key)
- **Expected:** Audible note with HivelyTracker timbre (chip-style, filtered square/saw waves)
- **Expected:** Note sustains while key is held, fades on release
- **Expected:** Changing envelope knobs (Attack, Decay, Sustain, Release) perceptibly affects the sound

**Step 4: Test song playback regression**

- Press play on the song
- **Expected:** Song plays back normally (song playback path unchanged)

---

## If something goes wrong

**No audio, no error in console:**
- Check browser console for any WASM instantiation errors
- Check that `Hively.wasm` was actually updated (timestamp from build)
- Reload the page with hard refresh (Cmd+Shift+R)

**"function not found" or similar WASM error:**
- The CMakeLists.txt exports list may need updating — verify `_hively_create_player` etc. are in the `EXPORTED_FUNCTIONS` list in `hively-wasm/CMakeLists.txt`
- Re-run the cmake configure step: `cd hively-wasm/build && emcmake cmake .. && emmake make`

**Audio but wrong pitch / very short notes:**
- The 50Hz pacing fix may not have applied — double-check the render loop was replaced correctly
- Verify `g_playerSamplesLeft` is being decremented: add a `printf` debug statement temporarily

**Song playback broken after change:**
- The standalone player and song playback share `g_initialized` and the global waveform init — verify `hively_init()` still works and `g_tune` is unaffected by player changes
