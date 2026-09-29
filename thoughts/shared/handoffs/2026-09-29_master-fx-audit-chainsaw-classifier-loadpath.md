---
date: 2026-09-29
topic: Master FX level audit, Swedish Chainsaw / Chip Metal, classifier, single load/save path
tags: [master-fx, effects, chainsaw, classifier, load-path, handoff]
status: draft
---

# Handoff 2026-09-29 (evening)

Resume in Claude Code with `claude --continue` in this repo (same conversation),
or start fresh and read this file plus `thoughts/spot/todos.md` (the ledger -
gitignored, local only; trust it over memory).

## State at handoff

- Branch `main`, **18 commits unpushed** (`git log origin/main..HEAD`). Deploy is
  manual and only on the owner's request (`./scripts/deploy-manual.sh`).
- Working tree: only files that are not this session's (changelog/manifest
  generated files, uade memory.c/h, idle-audio-graph plan, format-state.json,
  FXChainPlayer-Releases-1.3.11/, tools/zz-fxprobe.ts, tools/zz-presetfreq.ts) plus
  `tools/master-fx-response-audit.json` (audit data, leave uncommitted or commit
  with the next audit change) and the scratch
  `src/engine/effects/__tests__/zz-chainsaw.render.test.ts` (Dry Guitar renderer:
  `START=13 SECONDS=30 PRESETS='{"name":[tight,pedal,amp,bass,mid,treble,vol]}' npx vitest run <it>`;
  delete when the Chainsaw work is closed).
- Local test audio (gitignored): `test-data/audio/dry-guitar.wav` (owner's DI;
  silent for the first 12.5 s - start renders at 13 s), renders in
  `test-data/audio/renders/`, copies on `~/Desktop/chainsaw-renders/`.

## Tasks

### 1. IN PROGRESS - single load/save/export path (owner: "asked a million times")
- Research: `thoughts/shared/research/2026-09-29_load-save-export-paths.md`
- Plan: `thoughts/shared/plans/2026-09-29-single-load-save-path.md` - checklist
  L0.1-L6.3, **0 of 22 done**. Was starting L0.2 (unit: `applyEditorMode({})` after
  an AHX clears native fields) + L1.1 (`useFormatStore.ts:1115` classic branch must
  call `clearNative(state)`; `clearNative` is at `useFormatStore.ts:342`). No code
  changed yet.
- Trigger: dragging `micro15.mod` after an AHX opened the hively editor
  (`editorMode: 'hively'`). Suspected branch: `importTrackerModule`'s libopenmpt
  fallback `UnifiedFileLoader.ts:496-519` (no `applyEditorMode`). L0.1 must log which
  branch ran.
- Owner questions OPEN (plan "Owner questions"): (1) does loading a song reset the
  master FX chain and dub bus (recommended: keep master chain, reset per-song
  state unless the file is a project that carries its own); (2) clear undo history
  on load (recommended: yes). They block L1.2's exact behaviour, not L0/L1.1.
- Memory: `feedback_single_load_save_path.md`.

### 2. WAITING ON OWNER - classifier quality
- Research: `thoughts/shared/research/2026-09-29_channel-classifier.md` (measured
  9/28 judgeable channels right, ~32 %).
- Plan: `thoughts/shared/plans/2026-09-29-channel-classifier.md` - owner decisions
  recorded (labels by ear, conversationally; categories drums/bass/lead/harmony/
  fx-vocal + skank/arpeggio sub-labels; per song first) and a draft 30-song corpus
  (commit e1fd69f7e). Next: owner may swap songs; build P0 (corpus file +
  scored eval in test:ci, pre-filled with current verdicts; Modland files into
  `src/__tests__/fixtures/classifier-corpus/`), then label with the owner: load each
  song in their tab, list verdicts per channel, record corrections.
- Done today: looped samples classified as they SOUND (`SampleSpectrum.soundingPcm`),
  single-cycle loops give no register (e06b5d588; test chipWaveformNotDrums, fixture
  `src/__tests__/fixtures/micro15-goto80.mod`). micro15: only channel 3 (kit) is
  percussion; owner said "channel 2 is drums+bass" - the file puts the one-shot
  kick/snare (samples 2, 10, 11) on channel 3; asked the owner to solo ch 3,
  NO ANSWER yet.

### 3. DONE, owner listening pending - Swedish Chainsaw + Chip Metal
- Chainsaw (135ac9022): upstream gain ranges, 4x oversampled clippers (openWurli
  half-band x2), 600 Hz amp HPF (upstream intent), HM-2 biquads carried 48k->fs,
  4x12 speaker from shared `wasm-common/cabinet_curves.h` (9d91584c1), output trim
  -21 dB (dry guitar in -24.7 / out -24.4). NB juce-wasm builds land in
  `juce-wasm/public/<name>/` - copy to `public/<name>/` by hand.
- Presets: 'Gothenburg (Everything Max)' first in the Chainsaw list; 'Swedish
  Chainsaw' master preset everything-max, wet 100, comp -4.4. Owner is from
  Gothenburg (memory `user_gothenburg_metal_scene.md`); their ear is the reference.
- 'Chip Metal' master preset (003a4521b, 60ba954c3): Chainsaw everything-max, tight,
  wet 65 %, `channelRole: 'nonDrums'` (new EffectConfig field, resolved by the
  classifier per song, re-resolved on song load, empty -> whole mix; NO DRUMS toggle
  on the master FX card). Level measured +0.1 dB. Owner test: micro15.mod with Chip
  Metal after a tab reload (their tab still had HMR-era state).

### 4. DONE - master FX level audit
- Research: `thoughts/shared/research/2026-09-29_master-fx-response-audit.md`
  (incl. "Measurement correction" section).
- Measurement fixes: test_tone pink = RMS at `level`, 20 Hz HP, centre (13b61ebce);
  harness pink HP 20 Hz + centre option.
- DSP fixes: Dragonfly x3 (2bb4d306a), Satma (30510c049), Jeskola Freeverb LowCut 0
  (b427aaf14), comp table recal for 27 drive/sat/EQ/amp effects (13159e6a0).
- OPEN (ledger): delays/reverbs/modulation level belongs in the WET path (comp gain
  sits after dry/wet); neural per-model compensation; Bass Enhancer read SILENT in
  the sweep (re-check); WAM Graphic EQ +4.9 dB at defaults (at-source bug?).

## Learnings / gotchas
- Calibrate on pink noise HIGH-PASSED at 20 Hz and CENTRED; unfiltered Kellet pink
  over-reads comb reverbs (sub-audio in-phase DC gain).
- `test_tone` pink was 14 dB under its level before 13b61ebce - any broadband row
  recorded before it is invalid; the full re-sweep after it is in
  `tools/master-fx-response-audit.json` (`at >= 2026-09-29T15:06`).
- Evaluating in the page: import modules by their LOADED URL (Vite `?t=` HMR stamp,
  find via `performance.getEntriesByType('resource')`); importing the bare path
  creates a second ToneEngine and breaks test_tone ("different audio context").
- Any second DEViLBOX page (any browser) evicts the MCP relay's tab - owner must not
  open one while a sweep runs.
- Editing src/ while an in-app sweep runs triggers a reload; the audit tool waits
  it out but the row in flight may be bad.
- Buzz probes in the browser froze the tab earlier; Buzz work is headless
  (`src/engine/buzzmachines/__tests__/fixtures/runBuzzMachine.cjs`, modes incl. `pink`).

## Owner manual checks outstanding (http://localhost:5174, after Cmd+R)
1. micro15.mod + master preset 'Chip Metal': guitars distorted, kit clean; card
   shows "All but drums (auto)".
2. micro15.mod + 'Swedish Chainsaw': buzzsaw at the no-FX level.
3. Solo channel 3 of micro15.mod: is it the kit?
4. Buzz synths/effects by ear; Modern presets after the fixes (from earlier).

## Next steps (in order)
1. Plan single-load-path: L0.1-L0.3 (failing tests), L1.1, then ask/confirm owner Q1/Q2, L1.2-L6.3.
2. Classifier P0 once the owner confirms the corpus.
3. Push the 18+ commits when the owner asks.
