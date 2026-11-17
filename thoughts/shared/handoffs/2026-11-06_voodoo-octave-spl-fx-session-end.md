---
date: 2026-11-06
author: spot
status: handoff
topic: Voodoo Supreme grid octave + rhythm, FX display batch 4 (spl done, rk open), owner test round
---

# Handoff 2026-11-06: Voodoo grid, spl effects, owner test round

The session stopped on the owner's request once the running agents had finished.
The ledger (`thoughts/spot/todos.md`) is the source of truth. Trust it over this file where they disagree.

## Commits this session (on main)

| Commit | What | Pushed |
|--------|------|--------|
| ebb701dcb | OctaMED MMD3 grid notes 24 semitones below the MMD0-2 reading (OpenMPT MED loader) | yes |
| 8842f6c5c | PreTracker worklet silent after load, renders only between play and stop | yes |
| 84281211c | Voodoo Supreme read-only tick grid, .vss routed through the native parser | yes |
| 1f84aaada | Voodoo grid note = periodToNote of the period written to Paula, per-song octave lift removed | see "Push state" |
| c2d41f7b0 | Sound Programming Language extra note bytes shown as effect cells (ids 0x540-0x542), byte-exact write-back | see "Push state" |
| (Voodoo follow-up agent) | bass below C-0, step row clock, registry entries | see "Voodoo follow-up" |

## Owner test round (localhost)

These passed: the MMD3 octave on bounty hunter, PreTracker silent on load, the Ben Daglish motorhead scopes, StoneTracker hypnosphere.spm (8 tracks), and apb.dw Play Pattern.

The Voodoo test failed, on voo8 and silkworm. Owner's verdict: "plays patterns too fast".
- Cause: the grid is one row per replayer tick (6289 and 6913 rows).
- Fix: put the grid on the shared step row clock (`stepRowClock.ts` makeRowClock + makeOnsetPlacer, as the David Whittaker and Tim Follin grids do).
- Ledger row: VOODOO-ROW-SPEED. The owner must re-test after that fix lands.

## Voodoo follow-up

The agent's brief had three jobs:
1. Map periods above 1712 into the octave below C-0, using the shared helper (moved into `periodNotes.ts` from `fpGrid.ts`).
2. Put the grid on the step row clock.
3. Add the FormatRegistry and gridProvenance entries.

Its findings are appended to `thoughts/spot/2026-11-06-voodoo-octave.md`. Check that file and `git log` for which jobs landed.

Known gap: `VoodooSynth.triggerAttack` is a no-op (`src/engine/.../VoodooSynth.ts:22`), so a key press on a Voodoo instrument makes no sound.

## FX-DISPLAY-ALL (shows hidden effect bytes in the grid effect columns)

- Survey file: `thoughts/spot/2026-11-05-fx-display-survey.md`, section "## Fixes 2026-11-06 batch 4".
- Done: bss, riff, hd, hipc, tcb, c67, spl.
- Next: rk (Ron Klaren). The plan is in the survey file:
  - Add RK_FX ids from 0x550: 0x80 arpeggio, 0x81 portamento (3 args), 0x84 ADSR speed.
  - Add a uadePatternLayout.writeCell hook that emits the note patch plus the arg byte patches.
  - Keep native rk_set_cell in sync.
- After rk: glue, sc, st, mcmd, mxtx, rh, sog, dat, and the rest of IS10 (partly done).
- Id ranges: CS_FX_MAX is now 0x542. The next free block is 0x550.

## Still open in the ledger

- CI-RUNNER-LOST: a hosted runner lost contact during the test:ci regression gate. Check whether it repeats.
- Every unticked row in `thoughts/spot/todos.md`.

## Rules for the next session (unchanged)

- Two sonnet subagents run at all times. One of them always works on format editability.
- Commit by path with a zsh array, never `git add -A`.
- Push in the background with the keepalive sshCommand, then check that ls-remote matches HEAD. Batch the pushes, and never push while an agent is mid-test.
- Do not touch these files: public/data/data, package-lock.json, src/generated/*, thoughts/shared/plans/*, tools/nuade/*, and the unknown-owner files listed in the ledger.

## Update at session end

- a8b02e8aa: Voodoo bass periods above 1712 now land in the octave below C-0, through the shared `periodToGridNote` in `periodNotes.ts` (used by `fpGrid.ts` too).
  - Periods above about 3424 give 0, an empty cell. These notes are dropped from the grid; the table goes up to 32256. No rule was added for them yet.
  - On voo8 voice 3 the replayer writes periods 66-99 units below the table period. Cause unknown; the test allows one semitone.
- 0d3bc7cfb: the Voodoo grid now runs on the shared step clock at 8 ticks per row: voo8 787 rows, silkworm 865. This is the fix for the owner's "plays patterns too fast"; the owner has to re-test it.
- Still open: the FormatRegistry and gridProvenance entries for voodoo.
- 1f84aaada, c2d41f7b0, a8b02e8aa and 0d3bc7cfb go out in one push, which deploys them.

## Deploy state at session end (CI-REGRESSION-5)

- Push landed: origin/main = 0d3bc7cfb.
- The deploy did NOT land. CI run 42251360242 (84281211c) failed in the build-server "CI regression gate" on 5 tests:
  - dedicatedEngineFromRegistry.test.ts:49: the registry module now loads an engine.
  - modlandIndexer.contract.test.ts:21: `MODLAND_INDEX_SCHEMA_VERSION` is gone from the indexer source.
  - preTrackerPlayheadFollowsGrid.test.ts:60 and pretrackerMetersCountNoteStarts.test.ts:32: zero notes (suspect 8842f6c5c, worklet silent until play).
  - encoderRoundtrip.harness.test.ts:337: tcbTracker was byte-exact, now 99.13%.
- A sonnet agent is fixing these at the root (findings: session scratchpad ci-findings.md). After its commits: push, then check `gh run list` and the live bundle.

- 2026-11-06 17:52 UTC: deploy green. CI 42258893831 passed, live buildHash 57b3e19d2 (build 9595), GitHub Release `latest` (v1.0.1 assets). The release details went to vtcon-c1 (Amarchy/patina).
