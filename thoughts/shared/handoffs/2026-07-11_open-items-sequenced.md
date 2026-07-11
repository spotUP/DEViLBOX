---
date: 2026-07-11
topic: open-items-sequenced
tags: [handoff, todo, maxtrax, uade, ui, sequenced]
status: draft
---

# Open items — sequenced for one-by-one fresh sessions

Ordered worklist. Each item is self-contained: do it, verify, commit, push,
then start a fresh session for the next. Detail lives in the linked plan/handoff
files — this is the index + acceptance criteria, not a re-dump.

## Just shipped (context, no action)
- Heat fix: all visualizer rAF loops gated onto `useVisualizationAnimation`
  (0 CPU when stopped/hidden), 60fps while playing, DeckVisualizer both loops
  gated. Commits `306211807` + `f8b68934e`, pushed to main. Ratchet:
  `src/hooks/__tests__/visualizerRafGating.ratchet.test.ts` (10 files / 20 tests).
- Follow-up worth one live check: on the DJ view, confirm the DeckVisualizer
  gain via MCP `get_frame_stats` (needs a focused Chrome tab at :5174 — was
  disconnected when shipped). Not blocking.

---

## Ordered worklist

### 1. MaxTrax pattern editing — wire the 3 missing links
Plan: `thoughts/shared/plans/2026-07-11-maxtrax-inplace-sample-live-edit.md`
Handoff detail: `thoughts/shared/handoffs/2026-07-11_maxtrax-finish-fully.md` (§C)

Scaffolding + tests already exist (deriveGrid, maxtraxGrid inverse ops,
MaxTraxEngine setEvent/recook, export prefers live `maxTraxData`). Missing:
1. `useTrackerStore.setCell()` — add a MaxTrax branch (mirror the
   Furnace/OpenMPT/UADE branches at ~lines 472-639) so cell edits reach
   `maxTraxData`.
2. From that branch, call `MaxTraxEngine.setEvent()` → live WASM playback update.
3. Serialize `maxTraxData`: add to `getNativeEngineMetaForExport`
   (exporters.ts:102-118) AND `FILE_DATA_FIELDS` (formatFileDataFields.ts) so
   edits survive project save/reload.

Acceptance: edit a MaxTrax cell → hear it change live → export byte-diff shows
the edit → save project, reload, edit still present. Regression test (revert-
checked, in test:ci) per link. Watch localStorage schema version bump if
FILE_DATA_FIELDS change is breaking.

### 2. MaxTrax synth / instrument editing — the big gap
Handoff detail: `2026-07-11_maxtrax-finish-fully.md` (§D) — read the DiskSample
struct layout there (driver.i:329) before starting.

Sub-steps (each could be its own session):
2a. Import: `MaxTraxParser.ts:70-92` currently drops tune/octaves/envelope/
    multi-octave PCM, keeps octave-0 PCM + volume + loop as generic Sampler.
    Parse ALL DiskSample fields (Number,Tune,Volume,Octaves,AttackLength,
    SustainLength,AttackCount,ReleaseCount, Attack+Release env points, per-octave
    PCM where attack+sustain DOUBLES each octave). No minimal editor — expose
    every field (house rule).
2b. Encoder: write `encodeMaxTraxSamples` (today `tailRaw` is written verbatim,
    maxtraxFormat.ts:155). Round-trip: import → export → re-import byte-identical.
2c. First-class synth: register `synthType='MaxTraxSynth'` (mirror Sonix
    pattern), add `editorMode='maxtrax'` to the EditorMode union
    (SynthTypeDispatcher.tsx:~200), `getEditorMode` case
    (UnifiedInstrumentEditor.tsx:~190), lazy-import a MaxTraxControls render
    case. Change the 13 samples in MaxTraxParser.ts:70-84 to
    type:'synth'/synthType:'MaxTraxSynth'. Add it to EditableFormatRegistry.
2d. Instrument editor: DiskSample field editor (all fields + envelope point
    editor + per-octave PCM). Live editing during playback via engine setter.

Acceptance per sub-step: round-trip test green; editor exposes every struct
field; live param change audible without restart.

### 3. MaxTrax loose ends (fold into item 1 or 2's commit)
- Commit untracked: `public/data/songs/maxtrax/contraptionzack-funkfest.mxtx`,
  `third-party/uade-3.05/players/MaxTrax` dir, the two 2026-07-11 handoffs +
  the plan.
- Check funkfest clipping: playback peaks at 1.0 (handoff §A). Confirm it's
  not clipping vs UADE (lock-step, no WAV).

### 4. Pattern editor — Tab scroll-follow bug (user-flagged, unrelated)
Tabbing between channels can move the cursor outside the visible area. The
horizontal scrollbar should follow the cursor on Tab. Small, self-contained.

### 5. White boot flash
Memory: `white_boot_flash_todo.md`. White screen during boot burns eyes in dark
rooms — likely FOUC before the dark theme mounts. Fix html/body bg to a dark
token so first paint is dark. Not started.

### 6. UADE full editability — Phase 1
Plan: `thoughts/shared/plans/2026-07-07-uade-full-native-editability.md`
(7 phases; Phase 0 shipped `72700b0e`). Next = encoder round-trip harness.
Larger, multi-session on its own.

## Lower priority / record-only (don't start without go-ahead)
- Dub refinement — ongoing (AutoDub persona hints; Perry extFeedbackGain 0.06).
- Komplete Kontrol libs — flmidi-kompletekontrol + reaKontrol (memory
  `reference_komplete_kontrol_libs.md`).
- Format wiki docs — DEFERRED (memory `project_format_wiki_docs_todo.md`).

## Working rules reminder for the next session
- Direct to main, no worktrees. `git add` by name only. Commit/push only when
  asked. Every bug fix ships a revert-checked test wired into test:ci.
- MaxTrax verification = state/command lock-step vs UADE, NEVER WAV.
- MCP + real Chrome for live debugging, never Playwright.
- `npm run type-check` (tsc -b --force) must pass before done.
