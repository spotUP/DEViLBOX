---
date: 2026-10-13
topic: Scratch full demo port - last rows run (Three Deck Showcase, D rows) and three owner reports; what is left
tags: [scratch, juggle, dj, demo-port, showcase, handoff]
status: final
---

# Last-rows handoff (78 of 81, 3 open)

## Task(s)

Agent run 2026-10-13 on `thoughts/shared/plans/2026-10-12-scratch-full-demo-port.md` (section "Last-rows progress"),
started at d9779750e (62 of 81). Nothing pushed (batch push after the owner's listening test).

| Item | State | Commit |
|---|---|---|
| J1-J10, X8 via the Three Deck Showcase | closed | 679015014 |
| D1 rest (gesture_id, deck_active), D3, D4, D5, D6 | closed | 679015014 |
| SHOWCASE-VISUALS-DEAD (owner report) | fixed, needs the owner's look | 679015014 |
| DECK-C-BPM-125 (owner report) | fixed | 0768c40c3 |
| SCRATCH-TOO-LOUD (owner report) | main cause fixed, one transient open (below) | 5706b2b3b |
| R6 vocalstab port, then R12 | open | - |
| D2 parameter panel | open | - |

## Open rows, in order

1. **R6** - port scratch.py `build_sources` / `_anchor_safe`, scratch_routine `build_cue_sources`, scratch_dj
   `_synth_cues`: generalise `sampler.process` (sp1200; fold `scratchGrit.s950` into it), synth_dsp `osc('saw')`
   (PolyBLEP), `distort('rat')`, `noise`, `snare909` (in demoDrums), and **vocalstab.render_voice** whole (1093
   Python lines: render_speech, formants, consonants, radio colour, echo, reverb, the intelligibility optimiser;
   int8 output). Owner decision: port, not ship the renders. Null the 11 words and the 7 sources against the demo
   (new fixture script). Nothing started.
2. **R12** - `_routine_cues` synthesized-cue branch (no record set) and R8's 'style' pool on the synthesized
   sources; needs R6.
3. **D2** - parameter panel (~40 knobs: scratch.py / three_deck / beat_juggle `param_schema`, the R8 selector and
   per-record checkboxes, the grit switch; PG-K options stay out). `@components/controls/Knob` with `paramKey`,
   configRef, perf invariants. The showcase already takes `ShowcaseParams` (bpm, seed, budget, levelScale,
   duckDepth, juggleReverbMix) - add eq_hp / eq_lp / eq_presence (worklet coefficients) and rest_prob
   (`buildThreeDeckRoutine` has no override yet). Note: a seed other than 0 re-renders the juggle and Deck C, but
   the shipped hip-hop records are the seed-0 renders (hiphop.py is not ported).

## Owner reports

- **SHOWCASE-VISUALS-DEAD** ("the plate is dead and the crossfader is dead"). Two causes: the showcase's strokes
  never reached Deck C's motion timeline (D1 wired only the live pool), and the canvas turntable (deck view
  'visualizer') read only Deck C's own clock and slept while it had no rate. Fixed: the player places every stroke
  on the timeline; both turntables read `deckCPlatterRadians`; the worker takes an 'angle' message. The DJ mixer's
  A/B crossfader does not move during the showcase by design (owner decision: never changes the mixer); the
  scratch fader is Deck C's lane and the showcase view's crossfader lane. Not verified in a browser.
- **DECK-C-BPM-125**: Deck C (no track) had no tempo writer; 125 is the store default. Now the store keeps it at the
  master deck's tempo (`setMasterDeck`: the playing A/B deck, or the one the crossfader favours); dj_get_state
  reports Deck C and masterDeck. Auto Scratch strokes were never on the 125 clock (the executor times them on the
  track's analysis tempo); pads, keyboard and MCP strokes on Deck C were. Not done: a test that every pad stroke
  onset lands on the A/B grid within 1 ms (pads fire now or quantized; no grid placement path to test).
- **SCRATCH-TOO-LOUD**: measured offline. (a) Fixed: the planned level (default Render three_deck plans every
  routine) read raw track audio weighted only by the crossfader, missing the channel fader and the trim; scratch /
  heard beat was 1.197 at trim -6 dB, 1.496 at trim -6 dB + fader 0.8, now 0.600 in all four cases. (b) Open: the
  live follower (overlay, pads) starts every bus at level 1 and glides (1 s): first bar 0.98 instead of 0.60 on a
  -20 dBFS beat; with no beat on its input (nothing playing) it stays at the raw level (-16.7 dBFS). Settled it is
  0.59-0.60. Needs a decision on the start level (an estimate before the first stroke, or a fade-in). (c) The
  idle-CPU agent's uncommitted DeckEngine change unplugs a silent deck from the mixer; the live follower hears
  decks A + B on those inputs, so check that a deck re-plugs before its first sounding block, or the first strokes
  after a start see no beat. Not measured: the Showcase (its level is the demo's, offline) and module decks live.

## Learnings

- `ScratchRenderSpec.stepSamples`: three_deck.render uses the integer step (`steps * step / rate`); the live
  routine uses the float step (gestures up to 2 samples longer than the demo's). Not a row; reported.
- A test that mocks `getDJEngine` with a fresh object per call: key per-engine state on the mixer's sampler input.
- The showcase reachability test preloads the real `StreamAutoDub`: mocked or not, a pause's dynamic import hit a
  TDZ in the runner.
- Pre-existing failure, not from this run: `useTabsStore.nativeTeardown` 'stops the replayer' fails on HEAD too.

## Next steps

1. Owner: the LOCAL test below; decide the live follower's start level (SCRATCH-TOO-LOUD b); bind a key for
   `dj_three_deck_showcase` if wanted (registered, unbound).
2. R6 (vocalstab), R12, D2.
3. Batch push after the owner listened (confirm with ls-remote).

LOCAL test: http://localhost:5174 -> DJ view -> Auto DJ panel -> "Three Deck Showcase" with decks A and B playing.
Pass: A/B pause, the 83 s routine plays (hip-hop juggle + Deck C scratching), Deck C's platter turns and its
scratch fader moves in both deck view modes, the showcase view below the button animates; at the end (or "End
Showcase") A and B resume where they stopped; the crossfader and volumes never move. Deck C shows the A/B tempo.
