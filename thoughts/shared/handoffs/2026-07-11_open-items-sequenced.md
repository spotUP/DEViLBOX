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

### 1. MaxTrax pattern editing — DONE (2026-07-11)
The "3 missing links" framing was stale — it assumed MaxTrax rides the generic
`useTrackerStore.setCell()`. It does NOT: MaxTrax renders through its own
`MaxTraxView`/`MaxTraxGrid` + `useMaxTraxGrid` hook.
- Links 1+2 (cell edit → store + live WASM) were ALREADY live via the dedicated
  grid: `MaxTraxGrid.tsx:178-182` → `edit.*` → `useMaxTraxGrid.apply()` writes
  the store once, `projectEventToWorklet` per changed index, then `recook`.
  `maxTraxFileData` was already in `FILE_DATA_FIELDS` (line 89).
- Link 3 (edits survive save/reload) WAS missing and was actually two-part —
  fixed in `src/lib/export/exporters.ts`:
  - `getNativeEngineDataForExport` re-encodes live `maxTraxData` → the persisted
    `maxTraxFileData` bytes (edits were being dropped for the pristine bytes).
  - `restoreNativeEngineData` re-parses those bytes back into `maxTraxData`, so
    `applyEditorMode`'s dispatch (keyed on `maxTraxData`, useFormatStore:1009)
    enters `maxtrax` mode with a populated grid instead of `classic`.
  Revert-checked round-trip test `maxtraxPersistenceRoundtrip.test.ts` in
  test:ci. Committed. No localStorage schema bump needed (byte field unchanged).

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

### 3. MaxTrax loose ends — DONE (2026-07-11)
- Committed untracked: `contraptionzack-funkfest.mxtx`,
  `third-party/uade-3.05/players/MaxTrax` (the compiled UADE eagleplayer, an
  8.6 KB file — not a dir), the two 2026-07-11 handoffs + the plan.
- Funkfest clipping check: NOT clipping. The transpile engine's Paula mixer
  (`tools/asm68k-to-c/runtime/paula_soft.c:157-160`) sums two hard-panned
  voices per side (`int8/128 * vol` ∈ [-1,1], `-128/128 = -1.0` exactly) then
  scales `* 0.5` — so output is bounded to exactly ±1.0 and can never overflow.
  Measured over a 20 s funkfest render (563k frames): peak 1.0, but only 147
  isolated full-scale samples out of 1.13M and `longestClipRun = 1` (zero
  consecutive rail runs). Clipping = sustained flat-topped runs; this is a hot
  but clean master touching full-scale at waveform tips. Matches UADE's
  identical two-voice-per-side Paula sum. No code change.

### 4. Pattern editor — Tab scroll-follow bug — DONE (2026-07-11)
The horizontal channel-follow scroll effect was gated on `isMobile`, so on
desktop tabbing/arrowing to an off-screen channel left the cursor outside the
viewport. Added a desktop follow effect keyed on the cursor's channel index
(`PatternEditorCanvas.tsx`) that scrolls the minimum amount to keep the active
channel visible, reusing the wheel handler's scroll-space math. Scroll math
extracted to pure `computeChannelFollowScroll` (`src/lib/tracker/followScroll.ts`)
with a revert-checked test in test:ci. Commit `204955f30`.

### 5. UADE full editability — Phase 1
Plan: `thoughts/shared/plans/2026-07-07-uade-full-native-editability.md`
(7 phases; Phase 0 shipped `72700b0e`). Next = encoder round-trip harness.
Larger, multi-session on its own.

## Dropped
- White boot flash — user decided 2026-07-11 it can be ignored. Not a work item.

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
