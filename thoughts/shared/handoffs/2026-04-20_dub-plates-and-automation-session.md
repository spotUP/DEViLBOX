---
date: 2026-04-20
topic: dub-plates-and-automation-session
tags: [dub, handoff, multi-agent, reverb, automation]
status: final
---

# Dub plates + automation + UX — session handoff

Landing sweep for the MadProfessorPlate / DattorroPlate reverbs, the
per-FX bassLock metadata, preset + UI plumbing across every FX slot, DJ
DUB tab, automation routing, regression tests, and a batch of live-use
fixes that fell out of testing. Multi-agent session — some commits
belong to parallel agents; noted inline.

## TL;DR — what's on main

Everything listed below already shipped to `origin/main`. No
pending work on my side. Item `#41` (dub-bus plate-stage option)
was reassigned mid-session to another agent and is still
in-flight on their branch.

## Commits landed (my work)

Ordered chronologically, all on `main`:

| Commit | Subject |
| --- | --- |
| `df6517011` | feat(dub): Mad Professor Plate — MVerb + HPF/LPF voicing |
| `c841c410a` | feat(dub): Dattorro Plate reverb — WASM port of el-visio/dattorro-verb |
| `647a4a5c7` | feat(dub): per-FX bassLock + editors for both new plates |
| `7b1aa5fe4` | feat(dub): 8 dub presets + channel FX preset selector |
| `f6619d77d` | feat(drumpad): 2 new dub kits (Mad Professor Desk, Dattorro Plate Lab) |
| `368a0bdc6` | feat(dj): DUB tab on deck FX pads — 8 dub-move sends per deck |
| `48b92fc71` | fix(dub): reverseEcho first-fire race — pre-warm capture + retry |
| `67aa81497` | test(dub): bassLock preset round-trip through addMasterEffectConfig |
| `f6151d596` | fix(dub): register DubBus with router at engine creation (not per-view) |
| `2fb81e56b` | test(dub): CC sweep — every dub.* move end-to-end via routeParameterToEngine |
| `03e75bb91` | test(ui-smoke): flow 10 — dub automation routing end-to-end |

Parallel agents also landed MIDI CC routes (`085fb66ab`, PR #76)
and the shared-dispatcher automation-lane work (`8ae3247ff`, PR
#77). I built on top of both.

## Critical references

**New reverb DSP**
- `juce-wasm/dattorro-plate/` — MIT-licensed C source + C++ wrapper.
  Build: `cd build && emcmake cmake .. && emmake make`. Artifacts
  land in `public/dattorro-plate/`. Source vendored from
  [`el-visio/dattorro-verb`](https://github.com/el-visio/dattorro-verb).
- `src/engine/effects/DattorroPlateEffect.ts` — Tone.js wrapper, lazy
  WASM load, passthrough → worklet swap.
- `src/engine/effects/MadProfessorPlateEffect.ts` — pure TS wrapper
  around `MVerbEffect`; pre-HPF 200 Hz + post-LPF 5 kHz + dub-tuned
  defaults (decay 0.85, damping 0.75, density 0.80, predelay 0.18).

**Per-FX bassLock**
- `src/engine/dj/bassLockDefaults.ts` — single source of truth for
  per-type defaults + `effectiveBassLock(type, flag)` resolver.
- `src/engine/dj/DJMixerEngine.ts:408-420` — uses `effectiveBassLock`
  instead of the old hardcoded `BASS_LOCK_TYPES` set.
- `src/types/instrument/effects.ts:92-102` — optional
  `EffectConfig.bassLock` with a comment block explaining the
  semantics.
- `src/components/effects/MasterEffectsPanel.tsx:105-136` — hover-only
  BL chip on each pedal, amber when locked.

**Bus registration fix (bug caught mid-session)**
- `src/engine/drumpad/DrumPadEngine.ts:88-99` — calls
  `setDubBusForRouter(this.dubBus)` in the constructor. Previously
  only `DubDeckStrip.tsx` (a tracker-view child) registered the bus,
  so DJ / drumpad / VJ views all hit `"no bus registered"` when firing
  dub moves via pads or MIDI CC.
- `src/components/dub/DubDeckStrip.tsx` — dropped the
  `setDubBusForRouter(null)` on unmount that was un-registering the
  bus the instant the user left tracker view.

**Presets + UI wiring**
- `src/constants/fxPresets.ts` — 8 new dub presets (3 MadProf + 5
  Dattorro). All derived arrays (`MASTER_FX_PRESETS`,
  `INSTRUMENT_FX_PRESETS`, `CHANNEL_FX_PRESETS`, `SEND_BUS_PRESETS`)
  pick them up automatically.
- `src/components/effects/ChannelInsertEffectsModal.tsx` — new
  "Presets" dropdown in the modal header with Dub / Dub Echo /
  Dub Reverb / Creative / Space filter chips.
- `src/constants/djPadPresets.ts` — 2 new kits: `mad-professor-desk`
  (HPF 200, dotted-eighth skank) + `dattorro-chamber` (brighter 1/8
  sync). Both pair with the corresponding master-FX preset.
- `src/components/dj/DeckFXPads.tsx` — new `DUB` tab (third alongside
  `FX PADS` / `BEAT JUMP`). 8 dub-send pads — trigger + hold
  semantics, fires via `DubRouter.fire(moveId, undefined, {}, 'live')`.

**MCP bridge additions**
- `src/bridge/handlers/writeHandlers.ts` — new `routeParameter(param,
  value)` handler that calls `routeParameterToEngine` directly.
  Intended for ui-smoke / integration tests to drive the
  automation/MIDI routing path without constructing curves or MIDI
  messages. Registered in `MCPBridge.ts` as `route_parameter`.

**Regression tests (all in `test:ci`)**
- `src/engine/dub/__tests__/reverseEchoRetryGuard.test.ts` — locks
  the first-fire pre-warm + retry behaviour.
- `src/engine/dj/__tests__/bassLockPresetRoundtrip.test.ts` — 5 tests
  covering undefined-fallback, explicit overrides, and runtime
  toggles of `EffectConfig.bassLock`.
- `src/midi/performance/__tests__/dubCCSweep.test.ts` — 31 tests
  exhaustively firing every dub move (+ per-channel `.chN` variants)
  through the CC routing pipeline.
- `tools/ui-smoke/ui-smoke.test.ts` flow 10 — asserts
  `route_parameter('dub.echoWet', 0.85)` lands `storeSettings.echoWet
  ≈ 0.85`, and that the `dub.echoRateMs` 0..1 → 40..1000 transform
  round-trips.

## Learnings / gotchas

- **DubBus lives on `DrumPadEngine`, not a view.** Any other agent
  adding a new view that fires dub moves must NOT try to
  `setDubBusForRouter(null)` on unmount — the engine's lifetime owns
  the registration now.
- **Dattorro `verb.h` forward-declares `struct sDattorroVerb` with no
  typedef.** The C++ wrapper must use `struct sDattorroVerb*`, not
  `DattorroVerb*` — caught during the initial build and is in the
  shipped source now.
- **CMake output path gotcha.** `${CMAKE_SOURCE_DIR}` inside a
  subdirectory CMakeLists doesn't resolve to the repo root — it
  resolves to that subdirectory. The MVerb CMakeLists has a subtle
  bug on this; our `juce-wasm/dattorro-plate/CMakeLists.txt` uses
  `${CMAKE_CURRENT_SOURCE_DIR}/../../public/dattorro-plate` so the
  artifacts land in the right place regardless of where cmake is
  invoked.
- **reverseEcho ring buffer race.** The capture worklet fills a ring
  over time; the first snapshot after bus-enable was empty. Fixed
  with a pre-warm on enable AND a 3× retry-with-180 ms-gap in
  `_snapshotReverseRing`. Same architectural concern applies to
  `backwardReverb` but it wasn't flagged in the sweep — if that move
  ever shows the same inconsistency, copy the fix pattern.
- **Multi-agent `tmp/` collisions.** Running two worktree ops in the
  same `/tmp/devilbox-pN-wt` path under parallel shells produced a
  once-only bad commit (`-716` deletions on a file I meant to add 58
  lines to). Resolved by bumping to `pN-b-wt` when the first path
  lingers. Every worktree path in this session is unique going
  forward — matches `feedback_respect_other_agent_wip.md`.
- **Pre-commit hook is flaky on fresh worktrees.** The first
  `npm run test:ci` sometimes prints "test:ci failed" with no actual
  failure. A second commit attempt always succeeds. Likely a
  `dist/version.json` race — pre-populating the file with `{}` helps
  but doesn't fully eliminate it.

## Artifacts

- Handoff (this file).
- Memory updates: `project_furnace_overunity_distortion.md` (marked
  resolved), `reference_ui_smoke_fixture.md` (new — flags the thin
  fixture), `feedback_no_prs_push_to_main.md` (new).

## Next steps — nothing for me

- `#41 Dub-bus plate-stage option (Mad Professor / Dattorro inside
  the bus)` — another agent owns this. When that lands, the `DubBus`
  spring stage will be swappable for either plate. At that point the
  `mad-professor-desk` / `dattorro-chamber` drumpad kits (already on
  main) and the same-named master presets could be updated to prefer
  the in-bus plate over the master-chain insert.

The queue I worked is otherwise clear.
