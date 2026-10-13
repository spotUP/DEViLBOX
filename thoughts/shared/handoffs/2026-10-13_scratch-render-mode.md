---
date: 2026-10-13
topic: Scratch full demo port - Render mode (S2), C15, the null-test NaN flake, PG-K, PG-G; handoff for the next phase agent
tags: [scratch, dj, demo-port, render-mode, c15, pg-k, pg-g, handoff]
status: final
---

# Render mode + C15 + PG-K + PG-G handoff

## Task(s)

Agent run 2026-10-13 on thoughts/shared/plans/2026-10-12-scratch-full-demo-port.md (section "Render-mode progress").
Started at 02c916994 (53 of 81). Ended at 60 of 81, 21 open. Nothing pushed (batch push is the owner's / main session's call).

| Item | State | Commit |
|---|---|---|
| S2 Render mode (section / three_deck / dj_routine, default three_deck; PEAK / PERFORMER / BATTLE gate gone; panel, store, MCP) | done | 8a7bc9a71 |
| C15 the two hands (juggle only while Deck C is out) | done (row closed) | 8a7bc9a71 |
| scratchNullsTheDemo NaN flake | root-caused + fixed in the test harness | b7cb579ac |
| PG-K: T6, T8, T10, F5, F6 | done (5 rows) | 731c68c83 |
| PG-G: R3 | done | 7d031fd3a |
| PG-G: R5 | ported + fixture; no product entry point (owner) | 7d031fd3a |

## Critical references

- Ledger: "OWNER DECISIONS 2026-10-13 (S2 ...)", "FLAKE (root-caused ...)", "Render-mode progress", the Rows table.
- Demo: scratch.py `param_schema` "mode" :1059-1072 and the mode dispatch :1333-1374; three_deck.py `_perf_events` /
  `_section_juggles` :195-235, `FADER_ASSIGN` :72; turntable.py :99-185, :250-320, :402-418; scratch_bank.py :115-353;
  scratch_routine.py :55-159.

## Code map (new / changed)

- `scratchStyles.ts`: `ScratchRenderMode`, `SCRATCH_RENDER_MODES`, `DEFAULT_SCRATCH_RENDER` ('three_deck'),
  `SCRATCH_RENDER_LABELS`, `scratchRenderModeOf`. Store `autoDJScratchRender` (config key `scratchRender`).
- `DJScratchDJ.planWindow`: `input.render` ('section' when omitted - the Auto DJ always passes the store's value).
  Routine modes: Deck C waits silent for the phrase, then the 32-bar routine back to back (`scratchDJStats.routines`).
  Section: overlay + extras; a 32-bar arc is no longer a feature there. Arc phase labels reset when a window starts.
- C15: `scratchDemoRoutines.threeDeckJuggleAllowed` / `sectionJuggles` / `THREE_DECK_JUGGLE_JL_MIN`;
  `DJScratchDJ.handsInUse` (6 or 0 inside a three-deck routine) and `deckCHoldsTheJuggle()`; DJAutoDJ.juggleTick passes
  it as `TickInput.deckCHolds`; `juggleController.abortReason` releases a running juggle on it.
- UI: DJAutoDJPanel "Scratch Render" CustomSelect (Section Overlay / Three Deck Routine / DJ Routine).
  MCP: `set_auto_dj_config` (scratchRender, scratchMode, scratchStyle, scratchRecords, juggleMode) -> djHandlers.setAutoDJConfig.
- Harness: `realWebAudio.installRealWebAudio` pins every `getChannelData` array to its AudioBuffer (WeakMap).
- `turntableSim.ts`: `TT_GRIP_STATES`, `simulate` option `skip`, `cartridgeLp`, `cartridgeResponse`.
  `scratchRender.ts`: `faderCurve` (the one transfer curve), `FADER_ASSIGN`, `faderFromPattern` options
  contactBounce / lagMs / deck / cutIn / seed. The duplicate `scratchFaderModel.faderCurve` is deleted.
- `scratchBankAnalysis.ts` (R3 + R5); `trackerSampleRecord(deck, info, pcm)` now analyses the sample (vowel home);
  `scratchGrit.demoResample` factored out of `demoMonoPcm`.
- Fixture scripts: tools/scratch-fixtures/gen_three_deck_two_hands.py, gen_pg_k.py, gen_bank_analysis.py.

## Learnings

- The NaN flake: node-web-audio-api's `getChannelData` array does not keep its AudioBuffer alive; a GC frees the
  memory under the array (a dropped buffer changed in 5 of 20 renders after a GC; held 0 of 20). 17 test files keep
  only the array; the harness fix covers all of them. Any new realWebAudio-like harness must keep that pin.
- With the defaults (Render three_deck + Auto Juggle MUSICAL) C15 lets the Auto DJ juggle only in bars 20-23 and
  28-29 of each 32-bar routine. The stand-alone juggle rigs pin Render 'section' (they test juggle mechanics).
- The demo's render_gesture passes none of skip / contact_bounce / lag / deck / cartridge_response; ported as
  available, applied nowhere (owner T6 precedent). hamster + left deck flip twice (= no flip), as in the demo.
- load_wav_cues has no 24-bit branch in the demo: of the crate's phrases only IF_YOU_REALLY... (16-bit) loads there.

## Open rows (21) and why

- R5 (PG-G): ported, no DEViLBOX entry point for a user's phrase WAV (demo: CLI `--wav`). Owner: where it enters.
- X7 (PG-F): the duck is exact for planned routines (decks with buffers); a module deck (no buffer to read ahead)
  gets no duck. Needs either the module's audio rendered ahead or a live duck (non-causal max in the demo).
- X8 (PG-F): the juggle bus small_room / 0.72 mix / 0.98 peak cap belongs to the routine's own A/B audio layer (J10).
  Applying it to the real A/B decks would change the DJ mixer during a routine: owner call, or with J10.
- R12 (PG-E): synthesized-cue branch waits on R6.
- PG-H D1-D6: visuals / UI (Deck C platter from the strokes, the parameter panel D2, upfaders, tonearms, A/B platters,
  streams).
- PG-I J1-J10 + R6: beat_juggle.py (833 lines) + drummachine kick808 / snare808 / hat, tape_sat, bp, the a500 linear
  render with loop, hiphop.render_track (J3 records), vocalstab / sp1200 (R6). Largest phase; one fresh agent.

## Next steps (ordered)

1. Owner: the Render-mode listening test (report); R5 entry point; X7 approach; X8 placement; whether PG-K's
   options should be exposed in D2 though the demo never applies them.
2. PG-I (J1, J2, J5, J7, J8, J9, J4 first - beat_juggle core on make_break; then J3 / J6 records and breaks, J10, R6,
   then R12). Fixtures from the demo for every function, as in this run.
3. PG-H (D1 first: renderGesture's recordVel / slipVel / fade to the Deck C view).
4. Batch push once the owner has listened (pre-push gate ~125 s; confirm with ls-remote).
