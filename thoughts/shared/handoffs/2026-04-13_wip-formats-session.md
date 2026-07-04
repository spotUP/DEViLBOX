---
date: 2026-04-13
topic: wip-formats-implementation
tags: [formats, v2m, organya, pxtone, deflemask, sunvox, sawteeth]
status: in-progress
---

# WIP Formats Session Handoff

## Task
Fix 6 WIP formats that were skipped in the smoke test (`tools/quick-smoke.ts`).

## Completed (5/6 — all verified with MCP audio tests)

### 1. V2M (.v2m) — DONE ✅
- Created `src/engine/v2m/V2MEngine.ts` — singleton wrapping V2MPlayer WASM worklet
- Added `v2mFileData` to TrackerSong, useFormatStore, usePatternPlayback, NativeEngineRouting
- `loadV2MFile()` in UnifiedFileLoader now stores raw ArrayBuffer for streaming playback
- **Audio verified:** RMS 0.15, peak 0.73

### 2. Organya (.org) — DONE ✅
- Root cause: missing wave100 soundbank (zero percussion, wrong melody tones)
- Built `public/organya/wave100.wdb` from Cave Story freeware data (OrgPlay project)
- Added `organya_load_soundbank()` C export, rebuilt WASM
- Engine fetches soundbank at init, sends to worklet before song load
- **Audio verified:** RMS 0.14, peak 0.73

### 3. PxTone (.ptcop/.pttune) — DONE ✅
- Root cause: `sourceFormat: 'MOD'` in parser but NativeEngineRouting expected `'PxTone'`
- Fixed sourceFormat in 6 parsers: PxTone, Organya, EUP, Psycle, ZXTune, Sonix
- Also added missing `_pxtone_set_channel_gain` and `_pxtone_get_num_units` WASM exports
- **Audio verified:** RMS 0.001, peak 0.003

### 4. SunVox (.sunvox) — DONE ✅ (was already working, just skipped)
- **Audio verified:** RMS 0.04, peak 0.25

### 5. Sawteeth (.st) — DONE ✅ (was already working, just skipped)
- **Audio verified:** RMS 0.0006, peak 0.03

## In Progress: DefleMask (.dmf) — BLOCKED on WASM crash

### What's been done
- Fixed zlib decompression: DMF files are zlib-compressed (0x78 0x9c), added `pako.inflateRaw` with header skip in both `AmigaFormatParsers.ts` and `ModuleLoader.ts`
- Fixed magic bytes: `.DelekDefleMask.` not `.DeFleMask.`
- Routed DMF through `parseFurnaceFile()` instead of the TS parser (TS parser only handles .fur format)
- `parseFurnaceFile()` → `parseFurnaceFileWasm()` → `loadFurFileWasm()` → WASM `fur_load()`
- Pre-decompression in ModuleLoader works (confirmed decompressed data is 855,528 bytes with correct `.DelekDefleMask.` magic)
- DMF version 24, system 0x02 (Genesis), song "Sandstorm"

### The blocking issue
The FurnaceFileOps WASM (`public/furnace-fileops/FurnaceFileOps.{js,wasm}`) crashes with WASM abort code 4468784 when loading the decompressed DMF data. This is NOT a zlib issue — the data is correctly decompressed. The crash is inside Furnace's `loadDMF()` C++ function.

The WASM build:
- Source: `furnace-fileops-wasm/` with `CMakeLists.txt`
- Includes `dmf.cpp` from `third-party/furnace-master/src/engine/fileOps/`
- Has stubs for unused loaders (FTM, FC, IT, S3M, XM, MOD) in `stubs/engine_stubs.cpp`
- Has `renderSamples()` stubbed as empty
- `fileToDivRate()` and `divToFileRate()` implemented (used by DMF loader)
- Rebuilt with `ASSERTIONS=1` and `DISABLE_EXCEPTION_CATCHING=0` but no assertion message appeared

### Likely causes (not yet investigated)
1. **Missing function stub** — DMF loader calls a function that's not compiled or stubbed, causing a function table index out of bounds
2. **Null pointer in DivSample** — DMF loader creates samples, `renderSamples()` is stubbed as no-op, but something later dereferences sample data that was never allocated
3. **DivInstrument method** — DMF creates instruments that call a method not available in the WASM build
4. **Stack overflow** — DMF file has 10 channels × 83 patterns, the parser might allocate large arrays on the stack

### Suggested next steps
1. Build the FurnaceFileOps WASM with `-g` (debug symbols) and `SAFE_HEAP=1` to get the exact crash location
2. Or: add `printf` debug logging to `dmf.cpp` around key sections (instrument loading, pattern reading, sample processing) and rebuild
3. Or: compare the compiled `dmf.cpp` against upstream to check for missing includes/functions
4. Alternative approach: convert DMF to .fur using a separate tool (upstream Furnace CLI can do this), then load the .fur

### Key files
- `furnace-fileops-wasm/CMakeLists.txt` — build config, currently has `ASSERTIONS=1`
- `furnace-fileops-wasm/src/FurnaceFileOps.cpp` — WASM entry points, `fur_load()` calls `g_engine.doLoad()`
- `furnace-fileops-wasm/stubs/engine_stubs.cpp` — stubs for functions not needed in WASM
- `third-party/furnace-master/src/engine/fileOps/dmf.cpp` — the DMF loader being compiled
- `/Users/spot/Code/Reference Code/furnace-master/src/engine/fileOps/dmf.cpp` — clean upstream reference
- `src/lib/import/wasm/FurnaceFileOps.ts` — JS wrapper for WASM (NOTE: changes to this file don't take effect without server restart + hard refresh due to dynamic import caching)
- `src/lib/import/ModuleLoader.ts` — handles DMF routing, pre-decompresses zlib
- `src/lib/import/parsers/FurnaceToSong.ts` — `parseFurnaceFile()` → WASM path
- `src/lib/import/parsers/AmigaFormatParsers.ts` — UI drag-drop DMF routing

### Test file
- `public/data/test-songs/deflemask/Darude - Sandstorm.dmf` — zlib-compressed, version 24, Genesis (system 0x02), 10 channels

## Other notes
- All 7 WIP format skips removed from `tools/quick-smoke.ts` (only `hippel-7v` remains skipped)
- 3 other agents are working in the project — avoid touching drumpad, pianoroll, arrangement, workbench store, and effects preset files
- `src/lib/file/` is gitignored — use `git add -f` for files in that directory
- FurnaceFileOps WASM was rebuilt with assertions but no meaningful error output appeared
