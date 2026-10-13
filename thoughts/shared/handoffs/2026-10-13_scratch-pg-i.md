---
date: 2026-10-13
topic: Scratch full demo port - final phases run (PG-I engine, X7, R5, D1, Juggle Now); what is left
tags: [scratch, juggle, dj, demo-port, pg-i, pg-h, handoff]
status: final
---

# Final-phases handoff (62 of 81, 19 open)

## Task(s)

Agent run 2026-10-13 on `thoughts/shared/plans/2026-10-12-scratch-full-demo-port.md` (section "PG-I / final-phases
progress"). Started at a97b50e14 (60 of 81). Nothing pushed.

| Item | State | Commit |
|---|---|---|
| Juggle Now skips the intensity wobble (owner decision, not a row) | done | 28d6146b8 |
| PG-I engine: beat_juggle.py + three_deck A/B layer + drum voices + shipped records | built, NOT wired (rows open) | cd7087c15 |
| X7 module deck duck from its rendered-ahead audio | closed | fe3c1b507 |
| R5 phrase WAV dropped on Deck C | closed | 459556db9 |
| D1 Deck C platter / fader / slip from the strokes | partial (deck_active, gesture_id streams open) | 91bf5113f |

## Critical references

- Engine: `src/engine/dj/scratch/beatJuggle.ts` (J1-J10 pure), `demoDrums.ts` (kick808 / snare808 / snare909 / hat909 /
  tape_sat / the int8 tanh LUT), records `public/data/samples/packs/juggle-records/` (PROVENANCE.md; `.gitignore`
  negation for that folder). Fixture `tools/scratch-fixtures/gen_beat_juggle.py`; test `beatJuggleIsTheDemos`.
- D1: `deckCMotion.ts` (timeline on the Deck C bus sample clock; `deckCMotionNow`), `renderGesture().viz`,
  `ScratchVoicePool.renderStrokeViz`, `DeckCScratchLanes.tsx`, `DeckCssTurntable.tsx` (Deck C angle while strokes play).
- R5: `scratchPhrase.ts`, `autoScratchRuntime.loadDeckCPhrase`, store `autoDJScratchPhrase`, `DJScratchDJ` input
  `phrase`; catalogue extras (`registerExtraRecord`: `getScratchRecord` now knows tracker samples and phrase cues).
- X7: `autoScratchRuntime.moduleDeckRender` / async `scratchShapeDecks`.
- Demo: beat_juggle.py (whole), three_deck.py :155-235, :351-522; dj_viz.py :141-421; scratch.py :67-121, :1002-1192.

## Open rows (19) and what each needs

1. **J1-J10 (10) + X8 - DECISION NEEDED: where the routine's own A/B layer plays.** The engine is exact
   (`buildJuggleBus` nulls three_deck's bus < -120 dB on synth breaks + amen and on the records). Every DEViLBOX
   deck A/B plays the set's tracks, so the demo's A/B layer has no place yet. Options:
   - A) the three-deck routine plays its own A/B layer (J10 + X8 small_room .06, 0.72 mix, duck, peak .98) on its
     own bus and the set's decks are faded out for the routine's 32 bars;
   - B) a "Three Deck Showcase" action (Auto DJ panel button + MCP) that plays the demo's whole three_deck render
     (own A/B records + Deck C) while the set holds - the demo's Render as-is;
   - C) J10 drives the real decks (play + fade every 2-bar phrase, the rotation in the juggle sections) on the set's
     tracks; X8 stays off (owner: never on the real decks).
   Recommended: B - the demo's own render, no change to the DJ mixer, no two beats layered. Once chosen: wire it,
   add the offline full-mix renderer (juggle bus + X8 + Deck C chain + level/duck/peak) and a null against
   `three_deck.render(..., records=build_hiphop_records(...))` (<= -100 dB), reachability through the entry point.
2. **R6 + R12.** Port scratch.py `build_sources` / `_anchor_safe` / scratch_routine `build_cue_sources` /
   scratch_dj `_synth_cues`: needs `sampler.process` generalised (sp1200 profile; refactor `scratchGrit.s950` into it),
   synth_dsp `osc('saw')` (PolyBLEP), `distort('rat')`, `noise`, `snare909` (ported in demoDrums) and
   **vocalstab.render_voice** (int8 output; ~450 Python lines: render_speech, formant tracks, consonants, radio
   colour, echo, reverb, the intelligibility optimiser). Owner question: port vocalstab, or ship its int8 renders
   as data (11 words; lossless)? Recommended: port (the rule is "nothing skipped"); shipping is exact but leaves
   the speech synth unported. Then R12's synthesized-cue branch (`_routine_cues` without a record set) and R8's
   'style' pool switch from the clean crate to the synthesized sources.
3. **D1 remainder:** dj_viz `_gesture_id_stream` (gesture shown per tick) and `_deck_active_stream` (A/B/C audible
   mask per arc section) on Deck C's view.
4. **D2 parameter panel:** scratch.py param_schema (~40 params: style, section, density_rate, scale, records +
   per-record checkboxes, gesture_count, routine, synth sources, VEL / PLAN_VEL, FX overrides), three_deck (budget,
   EQ, level_scale, duck_depth, juggle_reverb_mix, rest_prob), beat_juggle (routine, style, rewind speed, render
   tune, ramps, kit) and the grit switch. Every knob must move the output (wire each into its engine value). PG-K
   options stay out (owner).
5. **D3 upfaders, D4 tonearms (CUE_GROOVE, TONEARM_SLEW), D5 A/B platter juggle motion, D6 streams** - D3 / D5 and
   the juggle parts of D6 read the A/B layer's events, so they follow the J10 decision.

## Learnings

- numpy `RandomState.uniform` = `low + (high-low) * random_sample()`; `NumpyRandomState` in turntableSim is exact.
- The pool's transient records were invisible to the planner and the governor (`getScratchRecord`); the catalogue
  now holds them as extras - one lookup for every reader.
- A deck in tracker playback has no AudioBuffer; its DJ pipeline render is in the audio cache by file name.
- The pre-commit hook runs the affected tests: a commit touching `useDJStore.ts` takes several minutes.

## Next steps (ordered)

1. Owner: J10 placement (A / B / C), vocalstab port vs ship, the LOCAL listening + visual test (report).
2. R6 (+ vocalstab per the answer), then R12.
3. J10 wiring + X8 + the full-mix null; tick J1-J10, X8.
4. D1 remainder, D3-D6, D2 panel.
5. Batch push after the owner listened (pre-push gate ~125 s; confirm with ls-remote).
