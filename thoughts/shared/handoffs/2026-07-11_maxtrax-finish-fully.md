---
date: 2026-07-11
topic: maxtrax-finish-fully
tags: [maxtrax, editing, synth, export, todo]
status: draft
---

# MaxTrax — "finish fully" running task tracker

## Pillars & status (verified 2026-07-11 by two Explore agents + tests)

### A. Playback — DONE
All 4 fixtures render non-silent through transpiled WASM after the darkseed
struct-offset fix (commit 7d24740f9). antmusic 75%, funkfest 94% (peaks 1.0 —
check clipping), march 68%, darkseed 60% nonzero.

### B. Binary-compatible export — DONE
`maxtraxFormat.test.ts` = byte-identical re-encode of all fixtures + edited
event survives. Router prefers live `maxTraxData` (nativeExportRouter.ts:299-307),
guarded by maxtraxRouterExport.test.ts (b763ba138).

### C. Pattern editing — PARTIAL (scaffolding done, wiring missing)
Exists & tested: deriveGrid (events->grid), maxtraxGrid.ts inverse
(setNoteField/setNoteDuration/setEffectField/moveNote, lossless), MaxTraxEngine
setEvent/recook API (live WASM update), export preference for live maxTraxData.
MISSING LINKS:
1. useTrackerStore.setCell() has NO MaxTrax branch (has Furnace/OpenMPT/UADE/…
   at lines ~472-639) → cell edits never reach maxTraxData.
2. setCell → MaxTraxEngine.setEvent() not wired → no live playback update.
3. maxTraxData not serialized: absent from getNativeEngineMetaForExport
   (exporters.ts:102-118) and FILE_DATA_FIELDS (formatFileDataFields.ts) →
   edits lost on project save/reload.

### D. Synth / instrument editing — NOT IMPLEMENTED (largest gap)
- Import (MaxTraxParser.ts:70-92) drops tune/octaves/envelope/multi-octave PCM;
  keeps only octave-0 PCM + volume + loop points as a generic Sampler.
- NO encodeMaxTraxSamples — tailRaw written verbatim (maxtraxFormat.ts:155).
- No MaxTrax instrument/patch editor exposing DiskSample fields.
- Not in EditableFormatRegistry; no editorMode='maxtrax'.
- DiskSample struct (driver.i:329): Number,Tune,Volume,Octaves,AttackLength(L),
  SustainLength(L),AttackCount,ReleaseCount, then Attack+Release env points
  (EnvelopeData = WORD duration? + WORD volume, 4 bytes each), then per-octave
  PCM where (attack+sustain) DOUBLES each octave.

## Unrelated TODO (user-flagged 2026-07-11)
- Pattern editor: tabbing between channels can move the cursor outside the
  visible area; the horizontal scrollbar should follow the cursor on Tab.

## Loose ends
- Untracked: public/data/songs/maxtrax/contraptionzack-funkfest.mxtx,
  third-party/uade-3.05/players/MaxTrax (dir), this handoff.
