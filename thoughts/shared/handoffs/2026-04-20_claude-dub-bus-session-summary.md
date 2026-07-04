---
date: 2026-04-20
topic: claude-dub-bus-session-summary
tags: [handoff, dub, automation, midi, format-registry, session-summary]
status: draft
---

# Session handoff — 18 PRs across dub-bus, MIDI, format-registry, smoke test

I ran a long autonomous session on 2026-04-20 that closed the
`thoughts/shared/plans/2026-04-20-tracker-dub-bus-world-class.md` plan
and a handful of adjacent items. Another agent was working in parallel
on oscBass over-unity, chain-swap guard, reverb tail leak, and
reverseEcho audibility — their work stayed in their lane, mine stayed
in mine, zero file-ownership collisions.

## PRs merged to main (this session)

| PR | Scope | Area |
|---|---|---|
| #62 | G6 — retry dub-channel activation on late engine attach | DubBus wiring |
| #64 | G3 — keyboard bindings for all 27 dub moves | `src/engine/keyboard/commands/dubMoves.ts` |
| #65 | G11 — A/B character-preset compare button | `useDrumPadStore` + `DubDeckStrip` |
| #66 | G12 — BPM-follow echo sync in tracker view | `DubDeckStrip` effect |
| #67 | G14 — unit coverage for 22 dub moves (39 tests) | `moves.unit.test.ts` |
| #68 | G16 — auto-flip preset to 'custom' on character-field edit | `useDrumPadStore.setDubBus` |
| #69 | G13 — sidechain source selector (bus vs channel) | `DubBus` + `DubBusPanel` |
| #70 | G15 — master-insert glitch envelope ramp | `DubBus.wireMasterInsert` |
| #71 | FORMAT_REGISTRY debt — 5 broken detectFns cleared | `FormatRegistry.ts` + test |
| #72 | Smoke — peak-level gate (distortion >=4.0 FAIL, 1.5-4.0 WARN) | `playback-smoke-test.ts` |
| #73 | Smoke — silent-format reporting + baseline peak/silent tracking | `playback-smoke-test.ts` |
| #74 | Dub sweep FLAT diagnostics — backwardReverb + reverseEcho logs | `DubBus.ts` reverse-capture branches |
| #75 | Contract test locking the FLAT-move diagnostic logs | `reverseCaptureDiagnostics.test.ts` |
| #76 | #37 — default CC routes for 27 moves + 7 bus params + toggles | `useMIDIStore.DEFAULT_CC_MAPPINGS` + `DubMoveParameter` type |
| #77 | #35 — route dub.* automation curves through `routeParameterToEngine` | `AutomationPlayer.applyParameter` |

Plus 3 earlier-in-day PRs (#59-61) that landed G1/G2/G4/G5 before this
session started.

## What's effectively closed

- **Dub-bus world-class plan**: 13/14 gaps shipped, G7 (Pixi parity) obsolete.
  Frontmatter on the plan file marked `status: implemented`.
- **FORMAT_REGISTRY detection debt** (`memory/project_format_registry_detection_debt.md`):
  all 5 offenders fixed, test now 153/153 with 0 skipped.
- **Playback smoke gates both directions**: silence AND distortion.
  Baseline tracks peakMax + wasSilent; `--check-baseline` flags
  PEAK_REGRESSION when a previously-clean format crosses into warn or
  clip territory.
- **Dub moves reachable out-of-the-box** via MIDI (27 CCs at 20-46)
  + automation curves (any `dub.*` parameter name works).

## What's still pending (and why I didn't touch)

- **#36 reverseEcho audibility** (in_progress, other agent). I shipped
  the diagnostic logs + their contract test in #74/#75 to give the
  next live sweep actionable evidence. The other agent is now running
  that sweep + wiring a pre-warm-ring in `DubBus.setSettings` +
  `reverseEchoRetryGuard.test.ts` — all uncommitted in their working
  tree at session end.
- **Furnace tracker-effects regression**
  (`handoffs/2026-04-20_furnace-tracker-effects-regression.md`).
  Needs live audio + lockstep debugging.
  `memory/feedback_no_speculation_audio` forbids guessing.
- **SidMon 1 sample-based silence**
  (`handoffs/2026-04-19_wasm-singleton-base-plus-sidmon1-silence.md`).
  Format-support gap in the WASM replayer — sample table is ignored.
  Deep C work + live audio verification.

## Test infrastructure added

~145 new tests across these test files (all wired into `test:ci`):

- `src/engine/dub/__tests__/moves.unit.test.ts` — 39 move-level
- `src/engine/dub/__tests__/moveRegistryContract.test.ts` — lockstep DubRouter ↔ DUB_MOVE_KINDS ↔ MOVE_COLOR
- `src/engine/dub/__tests__/masterInsertGlitchGuard.test.ts` — G15 wire/unwire ramp
- `src/engine/dub/__tests__/sidechainSourceContract.test.ts` — G13 router + UI + getSidechainInput
- `src/engine/dub/__tests__/reverseCaptureDiagnostics.test.ts` — FLAT-move log strings
- `src/engine/tone/__tests__/channelDubPendingActivation.test.ts` — G6 retry field
- `src/engine/__tests__/AutomationPlayer.dubRouting.test.ts` — #35 dub.* forwarding
- `src/engine/keyboard/commands/__tests__/dubMovesContract.test.ts` — G3 27-move registry lockstep
- `src/midi/performance/__tests__/dubMovesDefaultCCMappings.test.ts` — #37 CC collision / reserved-CC guard
- `src/components/dub/__tests__/dubDeckStripBpmSync.test.ts` — G12 BPM dep contract
- `src/stores/__tests__/dubBusStash.test.ts` — G11 A/B stash semantics
- `src/stores/__tests__/dubBusCharacterCoherence.test.ts` — G16 auto-flip rule

## Memory changes

- `memory/project_pixi_removed.md` (new) — Pixi is gone, DOM-only app;
  CLAUDE.md "DOM + Pixi parity" rule is defunct.
- `memory/project_format_registry_detection_debt.md` (updated) — marked
  PAID OFF with explanation of the 5 fixes.
- `memory/MEMORY.md` (updated) — index entries flipped to reflect above.

## Data-layer additions

- `DubBusSettings.sidechainSource: 'bus' | 'channel'` +
  `sidechainChannelIndex: number` (G13)
- `DrumPadState.dubBusStash: DubBusSettings | null` + `swapDubBusStash()` (G11)
- `MappableParameter` union extended with `DubMoveParameter` — every
  `dub.*` string the router dispatches is now strictly typed (#37)

## Not done

- **UI curve editor for dub.* automation parameters** — the data layer
  is wired (#35/#77), but `AutomationCurveEditor` doesn't expose a
  picker for `dub.*` names. Current path: user has to manually type
  or `useAutomationStore.addCurve(patternId, channel, 'dub.echoWet')`
  from dev tools. Follow-up: add a parameter picker menu that lists
  every move + bus param with friendly labels.
- **Per-move automation curves** — the data model is pattern-level
  (curve lives on `pattern.automationCurves`). Shaping a held move's
  internal params over its duration would need a different model.
- **Bus tabbed sections in DJ view** — #34 marked complete by other
  agent; I didn't audit it.

## File-ownership map (to avoid future collisions)

My files this session (fully mine, safe to rework):

- `src/engine/dub/moves/*.ts` (added logs to backwardReverb + reverseEcho)
- `src/engine/dub/DubBus.ts` — `getSidechainInput`, `masterInsertEnvelope`, reverse-capture diagnostic logs
- `src/engine/dub/__tests__/*.ts` (tests)
- `src/engine/keyboard/commands/dubMoves.ts` + test
- `src/components/dub/DubBusPanel.tsx` — SC-source row
- `src/components/dub/DubDeckStrip.tsx` — A/B button, sidechain router effect, BPM sync effect
- `src/stores/useDrumPadStore.ts` — stash + CHARACTER_FIELDS auto-flip
- `src/stores/useMIDIStore.ts` — DEFAULT_CC_MAPPINGS dub entries
- `src/midi/types.ts` — DubMoveParameter type
- `src/engine/AutomationPlayer.ts` — dub.* branch
- `src/lib/import/FormatRegistry.ts` — detectFn alignments
- `tools/playback-smoke-test.ts` — peak/silent gates

Other agent's files (leave alone unless coordinated):

- `src/engine/dub/DubBus.ts` spring-related, oscBass tanh soft-clip,
  reverse-capture pre-warm-ring, chain-swap guard
- `src/components/effects/ChannelInsertEffectsModal.tsx`
- `src/constants/fxPresets.ts`
- `src/engine/dj/bassLockDefaults.ts`
- `src/engine/dub/__tests__/reverseEchoRetryGuard.test.ts` (in flight)
- `src/engine/dub/__tests__/chainSwapGuard.test.ts` (landed earlier)

## Next agent — where to look first

1. Run `npm run test:ci` — should show 44 files / 2235+ tests. If
   any fail, likely because the other agent's uncommitted work has
   moved since I last verified (`reverseEchoRetryGuard.test.ts` +
   `DubBus` pre-warm-ring).
2. Check `thoughts/shared/plans/2026-04-20-tracker-dub-bus-world-class.md`
   frontmatter — `gaps_shipped` / `gaps_obsolete` lists are accurate.
3. `memory/MEMORY.md` is the fastest orientation — the "Upcoming"
   section was trimmed as items completed.
4. For any further dub UI work: parameter picker in
   `AutomationCurveEditor` is the cleanest next feature to ship.

## Artifacts

- All PRs on GitHub, all merged to main
- Plan file updated in place
- Memory files updated in place
- No active branches (all merged + auto-deleted by GitHub after merge)
