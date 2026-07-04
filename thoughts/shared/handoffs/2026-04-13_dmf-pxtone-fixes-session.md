---
date: 2026-04-13
topic: dmf-pxtone-fixes
tags: [formats, deflemask, pxtone, sawteeth, wasm]
status: final
---

# DefleMask + PxTone Fixes Session Handoff

## Completed

### 1. DefleMask (.dmf) — FIXED (3 bugs)

**Bug 1: Missing `-fexceptions` compile flag (CRITICAL)**
- File: `furnace-fileops-wasm/CMakeLists.txt`
- Furnace's `load()` uses C++ exceptions (`NotZlibException`) for control flow during zlib detection
- Without `-fexceptions`, exceptions leaked from WASM to JS as unrecoverable aborts
- Fix: Added `-fexceptions` compile flag + `-s DISABLE_EXCEPTION_CATCHING=0` linker flag

**Bug 2: Bad zlib checksums in DefleMask files**
- File: `furnace-fileops-wasm/src/fileOpsCommon_patched.cpp` (NEW)
- Many DMF files have invalid Adler-32 checksums — upstream Furnace discards all decompressed data
- Fix: Patched copy of `fileOpsCommon.cpp` that uses raw deflate mode (`inflateInit2(&zl, -15)`) for 0x78-prefixed inputs, bypassing header/checksum validation
- Also tolerates `inflateEnd()` failures and keeps partial data on `Z_DATA_ERROR`

**Bug 3: Redundant JS pre-decompression**
- File: `src/lib/import/ModuleLoader.ts`
- Was pre-decompressing DMF files with pako before sending to WASM
- Removed — WASM now handles decompression internally with tolerant error handling

**Test results:**
- 1,807 DMF files tested from `/Users/spot/Code/Reference Music/Deflemask`
- 82.5%+ pass rate (matches reference Furnace CLI)
- Files that fail are also rejected by reference Furnace CLI (genuinely corrupt)
- Browser-verified: funky_4.dmf (Genesis), S_Stands_For_SID.dmf (C64), BA Round 1.dmf (Genesis), IndonesiaWily2.dmf (NES)
- **DMF songs sound wrong** — need lock-step command debugging like we did for Furnace .fur files

**Files changed:**
- `furnace-fileops-wasm/CMakeLists.txt` — `-fexceptions`, patched source, fileOps include
- `furnace-fileops-wasm/src/fileOpsCommon_patched.cpp` — NEW, tolerant zlib
- `furnace-fileops-wasm/stubs/fileops_preempt.h` — comment update
- `src/lib/import/ModuleLoader.ts` — removed JS pre-decompression
- `public/furnace-fileops/FurnaceFileOps.{js,wasm}` — rebuilt (719KB)
- `public/data/test-songs/deflemask/funky_4.dmf` — NEW test file
- `public/data/test-songs/deflemask/S_Stands_For_SID.dmf` — NEW test file

### 2. PxTone (.ptcop/.pttune) — FIXED

**Root cause:** Wrong success code check in `pxtone_harness.cpp`
- `pxtnOK = 0` is success, `pxtnERR_VOID = 1` is NOT success
- Harness was checking `if (err != pxtnERR_VOID)` — treating success (0) as failure
- Fix: Changed all three checks to `if (err != pxtnOK)`

**File changed:** `pxtone-wasm/src/pxtone_harness.cpp` — 3 lines changed
**WASM rebuilt:** `public/pxtone/Pxtone.{js,wasm}`
**Browser-verified:** obj1263-1.ptcop — RMS 0.31, peak 1.00, sounds good

### 3. Browser Verification of All New Formats

| Format | Audio | Patterns | Status |
|--------|-------|----------|--------|
| V2M (.v2m) | RMS 0.23 | 26 orders | Working |
| PxTone (.ptcop) | RMS 0.31 | 1 order (streaming) | **Fixed this session** |
| Organya (.org) | RMS 0.07 | 1 order (streaming) | Working (WASM streaming, no pattern display by design) |
| SunVox (.sunvox) | RMS 0.05 | 28 orders | Working |
| Sawteeth (.st) | Silent | 6 orders | **Blocked — needs WASM engine** |
| DefleMask (.dmf) | Audible | Yes | **Fixed this session** (sounds wrong, needs lock-step) |

## Outstanding: Sawteeth (.st) — Needs New WASM Engine

**Problem:** Sawteeth uses `injectUADE: true` in `withNativeThenUADE()` — routes audio through UADE. But UADE/libuade does NOT have a Sawteeth replayer plugin. Error: `[UADEEngine] UADE could not play: okolaNUKE.st`

**What exists:**
- `src/lib/import/formats/SawteethParser.ts` — full TS parser, extracts patterns correctly
- `src/engine/uade/encoders/SawteethEncoder.ts` — chip RAM encoder (useless without UADE playback)
- Test file: `public/data/test-songs/sawteeth/okolaNUKE.st`

**What's needed:**
1. Port Sawteeth synthesis from NostalgicPlayer C# (`Source/Agents/Players/Sawteeth/`) to C/WASM
2. Create `src/engine/sawteeth/SawteethEngine.ts` (singleton pattern)
3. Create worklet at `public/sawteeth/Sawteeth.worklet.js`
4. Add `sawteethFileData` field to TrackerSong, useFormatStore, usePatternPlayback
5. Add WASM_ENGINES entry in NativeEngineRouting.ts
6. Update SawteethParser to set `sawteethFileData` instead of relying on `uadeEditableFileData`
7. Remove `injectUADE: true` from AmigaFormatParsers.ts Sawteeth section

**References:**
- **emoon/HippoPlayer (or RetrovertApp)** — likely has Sawteeth in C already, check first!
- NostalgicPlayer C# fallback: `/Users/spot/Code/Reference Code/NostalgicPlayer/Source/Agents/Players/Sawteeth/`

## Outstanding: DefleMask Lock-Step Debugging

DMF files load and play but sound wrong. Need lock-step command comparison like we did for Furnace .fur files. This is a separate effort — the DMF loading infrastructure is now correct.

## Notes
- `Darude - Sandstorm.dmf` is a genuinely corrupt file (truncated sample data) — fails in reference Furnace CLI too. Not a bug in our code.
- Node 24 has a CJS module loading issue with Emscripten's MODULARIZE output — needs vm.runInNewContext workaround for testing. Not relevant for browser usage.
