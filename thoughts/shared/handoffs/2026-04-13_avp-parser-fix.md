---
date: 2026-04-13
topic: activision-pro-parser-fix
tags: [activision-pro, parser, pattern-decoding, routing, playback]
status: partial
---

# Activision Pro Parser Fix — Handoff

## What Was Done

### 1. Position list parsing — FIXED
The core bug: position list logic was **inverted**. 
- Entries with bit 6 CLEAR are **normal track entries** (2 bytes: loopTrackCounter + trackNumber)
- Entries with bit 6 SET are **loop markers** (count in lower 6 bits)
- Old code had this backwards — counted loop markers as positions and skipped real entries

Replaced `countPositions()` + `getPositionTrackNumber()` with `extractTrackSequence()` that mirrors NostalgicPlayer's `ParseNextPosition` — walks the position list, handles loop markers, volume fade commands (0xFD), and end markers (0xFE/0xFF), returning a flat array of track numbers.

Reference: NostalgicPlayer `ActivisionProWorker.cs` → `ParseNextPosition()` (line 1613)

### 2. Subsong selection — FIXED
Subsong 0 is often a tiny jingle (1 position per channel). Parser now picks the subsong with the most total positions across all 4 channels. For kingmaker.avp this selects subsong 5 (119 positions, 38 patterns).

### 3. UADE extension bypass — FIXED (from previous session)
Removed 'avp','mw' from UADE_EXTENSIONS in UADEParser.ts so files go through native parser.

### 4. Missing playback wiring — FIXED but needs testing
Added 12 missing `fileDataKey` fields to `usePatternPlayback.ts` (store selector, destructuring, and song object):
- `activisionProFileData`, `actionamicsFileData`, `ronKlarenFileData`, `synthesisFileData`
- `dssFileData`, `soundFactoryFileData`, `faceTheMusicFileData`, `klysFileData`
- `fredReplayerFileData`, `oktalyzerFileData`, `futureComposerFileData`, `quadraComposerFileData`

These were in the format store and NativeEngineRouting WASM_ENGINES but never passed through to `replayer.loadSong()`, so their WASM engines never activated.

## What Remains

### Playback still silent
Despite wiring `activisionProFileData` through usePatternPlayback → loadSong → startNativeEngines, playback is still silent. The `startNativeEngines` debug log never appeared, suggesting the playback path for this format might not go through the standard `replayer.play()` → `startNativeEngines()` chain.

**Possible causes to investigate:**
1. The format `'AVP'` / `'Activision Pro'` may need a special early-return case in `usePatternPlayback` (like JamCracker and MusicLine have) to bypass the reload loop
2. The `editorMode: "classic"` may trigger a playback path that doesn't call `startNativeEngines`
3. The instruments (Sampler type with IDs 1-9) get mangled to weird IDs (131071, 196607...) — something in the instrument loading chain may be corrupting them
4. Vite HMR was extremely unreliable during this session — changes often required full server restart + hard refresh. The 12-format fix may not have been properly tested yet.

### Track decoding quality
Pattern data IS decoded (38 patterns, notes like C-3, A#2, G-2 visible). The note mapping uses avpNoteToXM which may need verification against NostalgicPlayer. Some row-0 entries show C-0 (noteIdx=1 → very low) which could be an off-by-one or a legitimate low note.

### Other .avp files
Only tested kingmaker.avp. Need to test gettysburg.avp and other files.

## Files Changed
- `src/lib/import/formats/ActivisionProParser.ts` — Position list fix, subsong selection
- `src/lib/import/formats/UADEParser.ts` — Removed avp/mw from UADE_EXTENSIONS
- `src/hooks/audio/usePatternPlayback.ts` — Added 12 missing fileData fields
- `src/engine/replayer/NativeEngineRouting.ts` — (debug log added then removed, no net change)

## Key Reference
- NostalgicPlayer `ActivisionProWorker.cs` at `/Users/spot/Code/Reference Code/NostalgicPlayer/Source/Agents/Players/ActivisionPro/`
- Position list format: see `ParseNextPosition()` (line 1613) and `LoadPositionList()` (line 969)
