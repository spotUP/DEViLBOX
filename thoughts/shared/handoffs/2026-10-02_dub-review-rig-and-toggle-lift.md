---
date: 2026-10-02
topic: Review of the other agent's dub branches, real-DubBus render rig, toggle wet lift, remaining-issues ledger
tags: [dub, review, testing, node-web-audio-api, autodub, handoff]
status: draft
---

# Handoff — dub branch review, render rig, toggle lift

## Tasks

1. **Review and fix another agent's dub branches** — DONE, pushed. Both
   `feature/dub-bus-dead-return-recovery` (PR 79, closed) and
   `feature/dub-bus-move-inaudibility` merged into main, 14 review findings
   fixed. Ledger: `thoughts/shared/research/2026-10-02_review-dub-bus-branches.md`.
2. **Behaviour tests on the real DubBus** (owner: "fix it") — DONE, pushed.
3. **Toggle row dead** (Wide/Wobble/Sub Harm/Liquid/Sweep/Ring/Starve/Ping-Pong)
   — FIXED (owner chose option A), pushed, NOT verified by ear.
4. **"Fix all remaining issues"** — IN PROGRESS: 1 of 9 done. Ledger:
   `thoughts/shared/plans/2026-10-02-remaining-dub-and-fx-issues.md`.

## State of the repo

- main pushed through `be851b9d8`. One local commit NOT pushed: `13e8bcb70`
  (set_dub_bus_settings validation). Push runs the ~3 min pre-push gate; use
  `GIT_SSH_COMMAND="ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=30"`
  or GitHub drops the idle connection during the hook.
- Live (devilbox.uprough.net) is `9a375ce7a` — does NOT have the toggle lift
  (`be851b9d8`) or `13e8bcb70`. Deploy with `./scripts/deploy-manual.sh` only
  when the owner asks.
- Dev stack: start ONCE with `nohup bash -c 'exec ./dev.sh' </dev/null >log 2>&1 & disown`.
  Two launches collide on :5174 and both shut down (happened today).
- The DEViLBOX MCP server was disconnected all session; `tools/zz-relay.ts
  <method> '<json>'` (scratch, uncommitted) drives the relay directly. It
  attaches to the NEWEST browser tab — a stale :5175 tab held it at the end.
- `src/generated/changelog.ts` is modified by dev.sh — generated, don't commit.
  `thoughts/lars/todos.md` is someone else's scratchpad — leave untracked.

## Commits this session (on main)

| SHA | What |
|-----|------|
| merge `7cd0cbaf2` + PR 79 merge | the two branches |
| `e6ae504dc` | DJ Kill All writes only enabled:false (no persisted zero levels) |
| `b77206da6` | measure_dub_knob off the store + `probe: 'tail'`; one `seededPinkNoise()` |
| `59ae9e988` | 'drums' sidechain key follows the song (`onSongChange` in sidechainKey.ts) |
| `2a6e3dd6c` | WET_CHAIN_MAKEUP node (Return knob back to 0..1); settingsWriteChangesBus replaces `force`; one seeding decision in applySong; sub bed fixes; tests into test:ci |
| `da5a76ef0` | siren feedback loop closed through a 128-sample DelayNode (spec engines — Firefox — muted the whole bus) |
| `59346580b` | the render rig + `dubBus.behaviour.test.ts` |
| `deed05a8e` | test files out of Tailwind content scan (ENOENT overlay) |
| `9a375ce7a` | rig registers suspends a tick before rendering |
| `be851b9d8` | WET_GESTURE_LIFT: held return processor lifts the wet +12 dB |
| `13e8bcb70` | checkDubBusPatch for set_dub_bus_settings (unpushed) |

## Critical references

- Render rig: `src/test/audio/realWebAudio.ts`, `src/test/audio/dubBusRig.ts`;
  tests `src/engine/dub/__tests__/dubBus.behaviour.test.ts` (in test:ci).
- Gain staging: `src/lib/dub/wetChainMakeup.ts` (WET_CHAIN_MAKEUP 3.0/0.85,
  WET_GESTURE_LIFT 4); `DubBus._wetMakeupTarget()` / `holdWetGesture()`.
- Move audit: `src/engine/dub/moveAudibilityLog.ts` (verdict line 72).
- Router fire event: `src/engine/dub/DubRouter.ts` ~line 358.

## Learnings

- **The rig** (node-web-audio-api in vitest/happy-dom) renders the real bus.
  Determinism needs all three: wait for worklet/WASM loads
  (`audioLoadsSettled`), fake timers advanced by rendered audio time with
  `suspend()` every 10 ms (the bus schedules from `setTimeout` and reads
  `currentTime`), and a seeded `Math.random`/`crypto` prelude in worklets (the
  Aelapse spring seeds from `std::random_device`; renders otherwise differ
  2 dB). Level is repeatable to ±0.1 dB; samples are NOT identical between
  contexts, so compare levels/bands, never sample diffs. Suspends must be
  registered a real tick before `startRendering()`.
- The rig can't reproduce browser-only Tone.connect failures (the Liquid
  phaser wiring keeps a source check).
- **Toggles were dead before the merge too** (owner A/B'd his branch on :5175).
  Root: resting sends 0.1-0.2 (kept low for throw contrast) put the return
  30-40 dB under the music; toggles reshape that and open nothing. Lift is on
  the post-chain make-up, NOT the bus input — the siren feedback loop
  re-enters at the input and would have its loop gain ×4.
- **The live move audit is unreliable as a verdict**: level-only, peak vs
  peak. False OKs when the music swells (all toggles read OK while the owner
  heard nothing); false SILENTs for filter/pitch moves and for moves that
  DECLINE (execute returns null — the router still emits a fire event).
- Rendered (fixed input) results, `hold` 1.5 s window:
  filterDrop -17 dB, tapeStop (Dub Mute) -45 dB, hpfRise only -3.8 dB in the
  lows, delayTimeThrow bends pitch strongly on both engines (off-tone energy
  0.32→0.56 SpaceEcho, 0.01→0.47 RE-201) — i.e. delayTimeThrow WORKS.
- His fake Web Audio (`testWebAudio.ts`) never worked; deleted.
- `measure_dub_knob` params: `{knob, a, b, rounds?, probe?: 'return'|'input'|'tail', tailMs?}`.
  `set_dub_bus_settings` takes `{settings: {...}}`.

## Next steps (in order)

1. Push `13e8bcb70`.
2. Owner checks (below); deploy when asked.
3. L2 finish: make the move audit honest — (a) router event carries
   `declined` when a `hold` move returns null, audit logs DECLINED with no
   level verdict; (b) verdict also uses return/master band levels (low/high)
   and return DROPS, so filter moves are seen; (c) say UNCLEAR when the bus
   input moved ≥3 dB without the move opening a send (music swell). Then look
   at hpfRise depth (-3.8 dB in 1.5 s — step timing?) and channelMute (mixer
   move; test via the mixer store). bassEmphasis declines because channels are
   mis-identified — that is the channel-identity blocker from the previous
   handoff, not a move bug.
4. L3-L9 per the ledger. A rendered test per fix where the fault is in the bus.
5. Remove the probe `tools/zz-relay.ts` only if the MCP is reliably back.

## Owner checks (not done — only the owner can)

At http://localhost:5174 (hard reload; close any :5175 tab first):
- Hold each toggle: the wash swells while held, the toggle's colour is clear,
  falls back on release.
- Firefox: dub bus audible with a send open.
- KILL then reload: echo/spring levels unchanged. Panic: bus back by itself
  after ~2 s, panel still ON.

## Other notes

- `node-web-audio-api` 2.2.0 added as devDependency (prebuilt binaries incl.
  linux-x64); `yarn.lock` and `package-lock.json` both updated by npm.
- The behaviour test file adds ~40 s to test:ci (one 25 s DubBus import).
