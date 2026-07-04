---
date: 2026-04-05
topic: universal-baking-and-instrument-sync
tags: [baking, instruments, furnace, wasm, playback]
status: implemented
---

# Handoff: Universal Synth Baking + Live Instrument Replacement

## Tasks Completed

### 1. Universal Synth Baking (All Synths Bakeable)
Made all WASM synths bakeable via live real-time audio capture.

**Key files created/modified:**
- `src/lib/audio/LiveCapture.ts` — NEW: ScriptProcessorNode capture with silence detection, auto-trim, mix/normalize
- `src/engine/ToneEngine.ts` — Added `liveBakeInstrument()` and `liveBakeChord()` methods
- `src/stores/useInstrumentStore.ts` — Routes WASM synths (DevilboxSynth) to live bake path
- `src/components/tracker/CellContextMenu.tsx` — Removed `wasmSynthTypes` blocklist, added live chord bake routing

**How it works:**
- Tone.js synths still use fast `Tone.Offline()` path (no change)
- WASM synths: disconnect output → ScriptProcessorNode capture → silence detection → trim → reconnect
- Chord bake: poly synths capture simultaneously, mono synths (`MONO_WASM_SYNTHS` set in LiveCapture.ts) use sequential capture + mix
- Silent bake (user hears nothing during capture)

**Commits:** `c57f82b`, `88d3bda`, `91cec52`

### 2. Key-Off Fix (=== Now Works in Patterns)
**File:** `src/engine/PatternScheduler.ts`

**Bug:** When `===` (note-off, note value 97) appeared on a row without an instrument number, `instrumentId` resolved to 0 and the release was skipped.

**Fix:** Fall back to `channelActiveInstruments` map when `instrumentId` is 0 on key-off rows.

**Commit:** `d206a7c`

### 3. Instrument Replacement During Playback (MOD/XM/IT/S3M)
**Files:** `src/engine/TrackerReplayer.ts`, `src/stores/useInstrumentStore.ts`

**Bug:** TrackerReplayer snapshotted `instrumentMap` at `loadSong()` and never synced. Replaced instruments were invisible to playback.

**Fix:** Added `updateInstrument(config)` to TrackerReplayer. Called from store's `updateInstrument()` synchronously. Note: `usePatternPlayback.ts:211` already had a bulk `updateInstruments()` via useEffect, but the synchronous store-level call covers timing edge cases.

**Commit:** `b916c5e`

### 4. Furnace Live Instrument Replacement (WASM Sync)
**Files:**
- `src/engine/furnace-dispatch/FurnaceInstrumentSync.ts` — NEW: Serializers + sync orchestrator
- `src/stores/useInstrumentStore.ts` — Calls `syncInstrumentToWasm()` for Furnace instruments

**How it works:**
- Two paths: (1) rawBinaryData/INS2 direct upload for preset loads, (2) platform-specific serializers for parameter edits
- FM serializer covers all FM variants (OPN/OPM/OPL/OPZ/ESFM) — 112-byte binary
- GB serializer — 8-byte header + hw sequence
- C64/SID serializer — 15-byte binary
- Calls `forceIns()` after upload so changes take effect
- Other platforms fall through to null (work via INS2 path for preset loads only)

**Commits:** `4a31426`, `1e2ffd4`

## Critical References

| File | Purpose |
|------|---------|
| `src/lib/audio/LiveCapture.ts` | Real-time audio capture for WASM synth baking |
| `src/engine/furnace-dispatch/FurnaceInstrumentSync.ts` | Furnace instrument store → WASM sync |
| `src/engine/PatternScheduler.ts:585-596` | Key-off handling with channelActiveInstruments fallback |
| `src/engine/TrackerReplayer.ts:708-721` | updateInstrument() for live instrument replacement |
| `docs/superpowers/specs/2026-04-05-universal-synth-baking-design.md` | Baking spec |
| `docs/superpowers/specs/2026-04-05-furnace-live-instrument-replacement-design.md` | Furnace sync spec |

## Learnings

- `ScriptProcessorNode` (deprecated but universal) is ideal for one-shot PCM capture — no encode/decode roundtrip like MediaRecorder
- Furnace WASM has 63 platform-specific instrument setters already exposed — no C changes needed
- `loadIns2()` is the fastest upload path when rawBinaryData is available (native INS2 format)
- TrackerReplayer already had a bulk `updateInstruments()` called from useEffect, but the synchronous store-level call is more reliable for immediate changes

## Next Steps

1. **Right-click without prior left-click doesn't work** — separate event handling bug, not yet investigated
2. **UADE instrument replacement** — next tier of live instrument sync (chip RAM patching, per-format)
3. **Add more Furnace platform serializers** — NES, Amiga, SNES, etc. (currently only FM/GB/C64 have dedicated serializers; others use INS2 fallback)
4. **Manual testing** — bake a WASM synth (ZynAddSubFX, Monique), edit a Furnace instrument during playback, verify key-offs work

## Branch State

- Branch: `feat/zoopertracker-features`
- 16 commits ahead of main
- All type-checks passing
