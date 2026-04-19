# Playback smoke-test baselines

Snapshots of `tools/playback-smoke-test.ts` results used as a regression gate.
Each snapshot captures, per test case: `name`, `family`, `status` (pass / fail
/ skip), `rmsAvg`, and `instrumentCount`.

## Why

`playback-smoke-test.ts` runs 300+ format fixtures against the live
browser/MCP stack. It's slow (minutes) but catches the class of regression
that is most painful in DEViLBOX — a song that used to play now plays silent,
or has lost its instruments, or throws a WASM error mid-playback.

The SidMon1 migration was reverted **twice** because a silent regression
slipped through. A committed baseline makes that regression loud: any
`pass → fail` or significant RMS drop surfaces on the next run.

## Files

- `playback-smoke.json` — current reference snapshot. Committed to the repo.

## Workflow

1. **Set up a known-good baseline** (after a confirmed good state —
   e.g., just before a release):
   ```bash
   # In one shell:
   npm run dev
   # Open http://localhost:5173, click anywhere to unlock AudioContext.

   # In another shell:
   npm run test:playback:update
   ```
   Commit the resulting `playback-smoke.json` with a message noting what the
   baseline represents (e.g., `baseline: post-2026-04-20 regression-test PR`).

2. **Run a regression check** at any later point:
   ```bash
   npm run dev   # same prerequisites
   npm run test:playback
   ```
   The script exits non-zero if:
   - any test that was `pass` in the baseline is now `fail` / `skip`, or
   - any previously-passing test's `rmsAvg` drops below 50 % of baseline
     (catches the "technically loaded, but silent" class of regression).

3. **Updating the baseline is a deliberate action.** Only do it when you
   genuinely expect the new results to become the new truth. Review the
   `playback-smoke.json` diff in the PR before merging.

## What is not covered

- Tests that were `skip` in the baseline remain `skip` — the check only
  flags `pass → fail` transitions.
- New tests added since the baseline are ignored.
- The RMS threshold of 50 % is an intentional coarse filter; finer
  regression tracking needs per-test tolerances.
