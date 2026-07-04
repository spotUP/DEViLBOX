---
date: 2026-07-02
topic: cinter4-editability
tags: [cinter4, import, export, decompile]
status: in-progress
---

# Handoff: Cinter4 editability (decompile-to-editable)

## Task
Make `.cinter4` imports fully editable (plan #5). Approved approach: **Path A** — lossless
tick-level decode + direct tick-stream exporter (see
`thoughts/shared/plans/2026-07-02-cinter4-editability.md`, REVISION block).

## Done (Phases 0–2 + Phase 3 export core) — all proven byte-exact, headless, in test:ci
- **Phase 0**: byte-map of the music section →
  `thoughts/shared/research/2026-07-02_cinter4-music-section-bytemap.md`. Upstream Cinter
  cloned to `/Users/spot/Code/Reference Code/Cinter`.
- **Phase 1a**: extracted `encodeFromStreams(...)` from `Cinter4Exporter.encodeCinter4FromMod`
  (the stream→songdata tail, format-agnostic). MOD path unchanged, guarded by a new
  byte-exact golden test.
- **Phase 1b/c**: `src/lib/import/formats/cinter4Music.ts` — `decodeCinter4Music` inverts the
  note-word encoding to per-tick streams (trigger / abs-note / slide; note-range walk ported
  1:1). Proven `decode → encodeFromStreams === original` byte-for-byte.
- **Phase 2**: `foldCinter4ToPatterns` / `rebuildCinter4Streams` (speed-1, 64-row patterns;
  triggers→note+inst+vol cells, automation carries exact period+vol; 9xx offset in effect col).
  Wired into `Cinter4Parser.ts` (replaced the placeholder block; fixed the little-endian
  docstring bug). Added `TrackerSong.cinter4Music = { ticksPerTrack, restartTick }`.
  Playback stays WASM (`suppressNotes`, `cinter4FileData`) → no double audio.
- **Phase 3 core**: `encodeCinter4FromSong(song)` in `Cinter4Exporter.ts` — instruments verbatim
  from the original file, music rebuilt from patterns. Tests: unedited re-export byte-identical
  (raw + generated), edited note propagates.

Tests (9, all green, wired into `test:ci` + `test:all`):
`src/lib/export/__tests__/cinter4Export.golden.test.ts`,
`src/lib/import/formats/__tests__/cinter4Music.roundtrip.test.ts`.
Fixtures: `src/lib/export/__tests__/fixtures/cinter4/` (JazzCat-Automatic + CurtCool-BackInSpace
MODs + golden .cinter4/.raw). `npm run type-check` clean.

## Key facts / gotchas
- `notedata` is 1-based (0 = no trigger). Global instrument index g → notedata value g+1 →
  InstrumentConfig id g+1. Off-by-one here was the one decode bug (instrument 0 = "no trigger").
- `xmNoteToPeriod` is formula-rounded and does NOT equal the ProTracker period table — map notes
  through the local `PERIOD_TABLE` instead (exact).
- `public/test-automatic.cinter4` and `public/back_in_space.cinter4` are byte-identical (both
  BackInSpace) and were made by an OLDER converter than upstream Python 3 (raw-header quirk, 58
  cmd errors) — do NOT use them as canonical goldens; the fixtures are freshly Python-generated.
- Instrument-param editing is out of scope (task #3): re-export emits instruments verbatim.

## Phase 3 live reload — DONE (wired, needs browser verification)
- Debounced edit→reload wired into `debouncedWasmEngineReexport()` in `useTrackerStore.ts`
  (Cinter4 case, mirrors the Symphonie precedent; shared 300ms debounce; `setCell`/`clearCell`
  already call it). On edit: `encodeCinter4FromSong(song)` → persist `cinter4FileData`
  (+`cinter4RawData` if raw) → `Cinter4Engine.loadTune(bytes, raw?)`. User picked "debounced on
  edit". Type-check clean; 175 tests pass (incl. format detection 154, parser robustness 12).

## Remaining
1. **Live MCP verification (needs user):** full `npm run dev` (Express :3011 + relay :4003, not
   just Vite) + browser open + click to unlock audio. Then: load a real `.cinter4`, confirm
   patterns render, WASM plays without doubling (`suppressNotes`), edit one trigger note, hear it
   within ~300ms. At handoff only Vite :5173 was up, so this is unverified.
2. **Export-UI download branch (optional):** route a DECOMPILED Cinter song (has `cinter4Music`)
   through `encodeCinter4FromSong` for a lossless `.cinter4` download, instead of the authoring
   `exportCinterCrunched` (patterns→MOD→recompile, lossy for decompiled songs). Lives in
   `ModuleExportPanel.tsx` — which has PRE-EXISTING uncommitted WIP not from this session; left
   untouched to avoid tangling. Confirm ownership before editing.

## Not committed
Nothing committed yet (user hasn't asked). Working-tree changes: Cinter4Exporter.ts,
Cinter4Parser.ts, cinter4Music.ts (new), TrackerReplayer.ts (+cinter4Music field), package.json
(test globs), 2 new test files + fixtures, plan + research + this handoff.
