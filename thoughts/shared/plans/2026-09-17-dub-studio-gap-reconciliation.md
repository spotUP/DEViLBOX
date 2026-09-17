---
date: 2026-09-17
topic: Dub Studio — reviewer plan reconciled against the current tree
tags: [dub, dubbus, autodub, personas, ai-performer, gap-analysis]
status: final
plan: thoughts/shared/plans/2026-09-17-dub-studio-master-implementation-plan.md
ledger: thoughts/shared/plans/2026-09-17-dub-studio-progress.md
---

# Reconciliation — reviewer plan vs. actual code

The reviewer's plan states its baseline as **2026-04-20**. That baseline is stale: it counts
**27 moves** and a `gatedFlanger` character preset. The tree today has **43 moves**
(`DubRouter.MOVES`) and the fifth preset is **`jammy`** (Prince Jammy), not `gatedFlanger`.

Consequence: **Stages 1–5 of the plan (items 1–31) are almost entirely already shipped.** The
genuinely open work is Stage 6 (items 32–50, the AI performer), plus five real gaps the plan
identifies as invariants and two the reviewer flagged that the audit confirms.

This document is the Phase-0 "architecture audit" deliverable the plan asks for in §7, plus the
execution checklist.

---

## 1. Verified-done (no work) — plan items 1–31

Each row was checked against the tree, not assumed.

| Plan item | Gap | Status | Evidence |
|---|---|---|---|
| Stage 1.2 | G1 MIDI move registry | **DONE** | `DUB_MOVE_KINDS` has 43/43 registry moves; 0 missing. `midi/performance/__tests__/dubCCSweep.test.ts`, `dubMovesDefaultCCMappings.test.ts`, `dubRouting.test.ts` |
| Stage 1.3 | G2 lane colors | **DONE** | `engine/dub/moveColors.ts` — 43/43 keys, no fallback grey |
| Stage 1.4 | G3 keyboard | **DONE** | `engine/keyboard/commands/dubMoves.ts` covers 43/43; contract test `dubMovesContract.test.ts` fails CI if a registry move has no binding. No full-screen mode recreated. |
| Stage 1.5 | G10 DJ Toast | **DONE** | `components/dj/DJMicControl.tsx`, `DeckFXPads.tsx` fire the existing `toast` move |
| Stage 1.6 | G11 preset A/B | **DONE** | A/B stash in `useDrumPadStore.ts:99-106,527` — captures pre-preset settings, swap is lossless; `stores/__tests__/dubBusStash.test.ts` |
| Stage 1.7 | G8 MCP move sweep | **DONE** | `tools/dub-untested-sweep.ts`; MCP surface `fire_dub_move` / `release_dub_move` / `get_dub_bus_state` / `set_auto_dub_config` present in `server/src/mcp/mcpServer.ts` |
| Stage 2.8 | G4 `.dbx` export of dubLane | **DONE** | `lib/export/__tests__/dbxExport.dubLane.test.ts` |
| Stage 2.9 | G5 persistence round-trip | **DONE** | above + `hooks/__tests__/dubLaneMigration.test.ts`, `lib/export/__tests__/AutomationBaker.dub.test.ts` |
| Stage 3.10 | G6 channel activation retry | **DONE** | `engine/tone/__tests__/channelDubPendingActivation.test.ts` — one-shot readiness retry, not polling |
| Stage 3.11 | G12 BPM-following echo | **DONE** | `bpmSyncedEchoRate()` in `DubActions.ts` + `components/dub/__tests__/dubDeckStripBpmSync.test.ts`. DJ context resolves BPM from the loudest audible deck's beat grid rather than the tracker transport. |
| Stage 3.12 | G13 sidechain source | **DONE** | `sidechainSource: 'bus' \| 'channel'` + `sidechainChannelIndex` in `types/dub.ts`; `sidechainSourceContract.test.ts`, `stores/__tests__/dubBusSidechainSource.test.ts` |
| Stage 3.13 | G15 master insert transition | **DONE** | `DubBus.wireMasterInsert/unwireMasterInsert` ramp `masterInsertEnvelope` over 10 ms before rewiring; `masterInsertGlitchGuard.test.ts` |
| Stage 3.14 | G16 preset/edit coherence | **DONE** | `stores/__tests__/dubBusCharacterCoherence.test.ts` — any manual edit sets `characterPreset: 'custom'` without erasing other values |
| Stage 3.15 | G9 echo/spring self-oscillation | **DONE** | `feedbackShelfComp` (inverse of `bassShelf`, keeps round-trip bass at 0 dB), in-feedback HPF/LPF, three NaN scrubbers; `chainSwapGuard.test.ts`, `echoEngineSwap.contract.test.ts`, `dryBusRegression.test.ts` |
| Stage 4.16 | DSP-01 Tubby bass shelf | **DONE, retuned** | Shipped at **+9 dB @ 60 Hz Q 0.9** (plan target was +6 @ 90 Hz). Code comment: 200 Hz "just clouds the mids", real weight is sub fundamental. Plus `masterBassPunchDb` on the dry path only, so the shelf never feeds the loop. |
| Stage 4.17 | DSP-02 Scientist mid scoop | **DONE, deeper** | **−10 dB @ 700 Hz Q 1.6** (plan target −6 @ Q 1.4) and `glueBypass: true` — a real 1:1 bypass, as the plan demanded. `engine/__tests__/dubBusCompressorBypass.contract.test.ts` |
| Stage 4.18 | DSP-03 feedback filtering | **DONE** | `echoFeedbackHpfHz` / `echoFeedbackLpfHz` inside the feedback path, per-preset (Tubby 180/5500, Scientist 300/5000, Perry 220/3500, Mad Prof 400/8000) |
| Stage 4.19 | DSP-07 return M/S width | **DONE** | M/S matrix at the return, `stereoWidth` 0–2; Perry 0.25 / Tubby 0.45 / Scientist 1.4 / Jammy 1.3 / Mad Prof 1.9 |
| Stage 4.20 | DSP-04 Altec stepped HPF | **DONE, exceeded** | 11 `ALTEC_HPF_STEPS`, log-domain snapping, 3-biquad 18 dB/oct cascade, **plus** `hpfResonanceDb` T-network hump the plan didn't ask for |
| Stage 4.21 | DSP-05 liquid flanger | **DONE, exceeded** | Parallel comb pre-echo with HPF'd feedback, **plus** a `sweepMode: 'phaser'` CalfPhaser WASM all-pass cascade. Not permanently on; per-preset. |
| Stage 4.22 | DSP-06 Perry tape stack | **DONE** | `tapeSatMode: 'stack'` — 3 parallel WaveShapers, different drives, uncorrelated wow (independent LFO phase), plus a third `tape15ips` mode |
| Stage 4.23 | DSP-08 character macro | **DONE, exceeded** | `DUB_CHARACTER_PRESETS` sets coloring + spring params + tape drive + **per-role default sends** + **per-role channel FX** |
| Stage 5.24–31 | test hardening | **LARGELY DONE** | 24 test files under `engine/dub/__tests__/` alone (`moves.unit.test.ts`, `moveRegistryContract.test.ts`, `DubRouter.test.ts`, `DubRecorder.test.ts`, `laneMode.test.ts`, `effectCommand.test.ts`, `oscBassHeadroom.test.ts`, `plateStageContract.test.ts`, …) plus 12 more across stores/midi/export/hooks |
| §30 | character ≠ persona | **DONE** | `characterPreset` (bus) and `autoDubPersona` (performer) are independent; personas only *suggest* a preset, never auto-apply it |
| §6 | Pixi parity obsolete | **N/A** | Pixi already removed |

Two plan items in Stage 4 are only **partly** done:

- **DSP-09 per-source mix hygiene** — `perChannelFxByRole` gives each preset a per-role filter
  mode + frequency, direct reverb send and sweep depth, which covers the *routing* half. The
  research's per-source EQ curves (kick 60–80 Hz boost / 300–500 Hz cut, skank HPF 150 + 2–4 kHz
  boost, vocal 80 Hz HPF / ~300 Hz cut / 3–5 kHz presence) are **not** implemented. The plan
  itself says these must wait for musical source classification, which is item P3 below.

---

## 2. Real open gaps

### F — fixes to the existing system (small, high value)

| ID | Gap | Why it matters | Where |
|---|---|---|---|
| **F1** | `getAutoDubBarClock()` hardcodes 16 rows/bar (`bar = floor(row/16)`, `barPos = (row%16)/16`) | Directly violates plan §79 invariant "Do not assume every 4/4 pattern is 16 rows per bar". Every phrase rule (`bar % 4`, `% 8`, `% 16`), the phrase arc and the whole persona phrasing model land in the wrong place on any song not at speed 6. Rows/beat is derivable: `24 / ticksPerRow`, so rows/bar = `96 / speed` in 4/4 (speed 6 → 16, speed 3 → 32, speed 12 → 8). | `engine/dub/AutoDub.ts` |
| **F2** | `riddimSection` returns the skank at a hardcoded 60 % of hold duration — unquantized, lands mid-bar | Plan AI-17 names this exact number as the thing to remove. Return should snap to a musical boundary (next beat / next bar / phrase boundary). | `engine/dub/moves/riddimSection.ts` |
| **F3** | 6 moves cannot be written to pattern cells: `hpfRise`, `madProfPingPong`, `combSweep`, `versionDrop`, `skankEchoThrow`, `riddimSection` | `DUB_MOVE_TABLE` has 37 entries; `encodeDubEffect` refuses index ≥ 32 because only slots 36/37/39/40 exist. Appending these six needs slots 41/42 (`DUB_EFFECT_GLOBAL_X2` / `_PERCHANNEL_X2`). Until then, an AutoDub performance of the most structural moves records to automation curves but never to a cell. **Append-only contract — must not reorder.** | `engine/dub/moveTable.ts` |
| **F4** | `skankEchoThrow` sets **dotted quarter** (`beat × 1.5`); the classic reggae/dub skank delay is **dotted eighth** (`beat × 0.75`, which `echoSyncDivision: '1/8D'` already provides) | Needs the reviewer's ruling: intentional "floating at 2/3 tempo" or an off-by-one-octave mistake. Cheap to make a parameter. | `engine/dub/moves/skankEchoThrow.ts` |
| **F5** | Tubby's `returnEqEnabled: false` — his most-cited technique (sweeping a resonant peak across the return) is not part of his preset's standing character | Deliberate (a parked peak was a constant 700 Hz beep). The fix is a *swept* default, not a parked one — which is really an AI-performer concern (P8). Flag, don't patch blindly. | `types/dub.ts` |

### P — the AI performer (plan Stage 6, items 32–50)

**None of this exists.** Grep for `MusicalEventProvider`, `PerformanceContext`, `wetEnergy`,
`beginGesture`, `GestureEngine`, `instrumentFamily`, `musicalFunction`, `arrangementMask`,
`restraint` returns nothing in `src/`. Today's AutoDub is exactly the loop the plan §85 says it
should stop being: 250 ms timer → roll probability → effect → cooldown → repeat.

| ID | Plan item | Deliverable |
|---|---|---|
| **P1** | 33 · AI-01 | `MusicalEventProvider` — one event stream (`channel, timestamp, beat, bar, role, instrumentFamily, eventType, strength, confidence`) with a tracker implementation (pattern look-ahead) and a DJ implementation (beat grid + stems). Removes the current split where `AutoDub` and `StreamAutoDub` build context two different ways. |
| **P2** | 35 · AI-02 | Event prediction — short look-ahead horizon so a gesture is *prepared before* the hit, not reacted to after it. Today `detectTransients()` is purely retrospective. |
| **P3** | 34 · Phase E | Musical channel model — replace the single `ChannelRole` enum with orthogonal `instrumentFamily` / `musicalFunction` / `register` / `importance` / `density`. Fixes the piano-chord-vs-skank-vs-pad collapse. Unblocks DSP-09. |
| **P4** | 36 · AI-03 | `PerformanceContext` — bar/beat/phrase position, active channels + importance, recent events, recent moves, active throws/holds/rides, echo/spring/feedback/return energy, last major action, time since action, current intention. The key property is **memory**. |
| **P5** | 40 · AI-09 | Wet-energy model — per-move `wetCost` / `duration` / `feedbackCost` / `spectralDensity`; the performer reads the *actual state of the return*, not just its own cooldown timers. Replaces (does not delete) `WET_FIRES_PER_BAR_CAP`. |
| **P6** | 37 · AI-04 | Intention layer — `REST · ACCENT · ANSWER · SPACE · BUILD · DROP · TEXTURE · TRANSITION · RESET`. Decision chain becomes music → condition → intention → target → move → gesture, instead of weighted-roulette-over-rules. |
| **P7** | 38 · AI-06 + AI-05 | Performer state machine `LISTENING → ANTICIPATING → PREPARING → EXECUTING → RIDING → RELEASING → LISTENING` plus `BUILDING/DROPPING/RECOVERING`, and **REST as an explicit state**, not a failed dice roll. |
| **P8** | 39 · AI-07 + AI-08 | Gesture engine — `beginGesture/updateGesture/endGesture/cancelGesture` with attack/hold/release/ramp/sweep/rebound and quantized start/release. Decision loop stays at 250 ms; *timing* moves to the transport/audio scheduler. This is what makes the Tubby filter sweep (F5) a performance rather than a parked value. |
| **P9** | 41 · AI-11 | Consequence model — after each move evaluate `targetWasAudible / contrastCreated / maskingIncrease / wetEnergyIncrease / feedbackIncrease / structuralImpact` and feed it back into the next decision. |
| **P10** | 42 · Phase F + AI-18 | Arrangement intelligence — `foundation / accent / harmonic / melodic / texture / sacrificial` mask; version drops become "remove because of musical purpose", with a throw on the sacrificial element *before* removing it. |
| **P11** | 43 · AI-12 | Personas become behavioral profiles: `activity / depth / risk / restraint`, anticipation, patience, target preference, throw length, feedback/filter/drop preference, release style, timing + gesture variance, phrase preference — replacing weight tables as the primary definition. Includes **AI-10 split intensity** (one scalar today drives budget, roll probability and depth together). |
| **P12** | 44 · AI-13 | Contextual variance — Perry's 0.35 `variance` is currently literally `rng() < variance * 0.1` against a false condition. Replace with music-constrained alternatives (snare → echo / filter / spring / REST). |
| **P13** | 45 · AI-14 | Call and response between interventions. |
| **P14** | 46 · AI-15 | Repetition-vs-novelty tracking, with per-persona responses (Tubby repeats a working move, Perry varies, Mad Prof waits, Jammy stops). |
| **P15** | 47 · AI-16 | Phrase awareness — normalized `phrasePosition` 0..1 from real transport/arrangement data, replacing the fixed 16-bar `getPhraseIntensityMult` curves. Depends on **F1**. |
| **P16** | 48 · AI-21 | Lane metadata — `intent / targetEvent / persona / gestureStart / gestureEnd / quantization` on `DubEvent`, **additively**, without breaking lane compatibility. Depends on F3 for the cell side. |
| **P17** | 49 · AI-22 | Performance monitor UI — persona / state / intent / target / phrase / wet energy / last move / next event, plus the optional `WHY?` diagnostic. |
| **P18** | 50 · §78 | Deterministic offline performance simulator (project, BPM, persona, seed, duration → bar-by-bar decision log) so the performer can be tuned without booting the UI. |
| **P19** | 58/59 · AI-19/AI-20 | Keep `tubbyScream`, `oscBass`, `crushBass` manual-first; safety governor that corrects *musically* (reduce feedback → close filter → reduce send) before limiting. Existing safeguards stay. |

### T — tests the new work needs

| ID | Deliverable |
|---|---|
| **T1** | `F1` regression: bar clock derives rows/bar from speed; a speed-3 song puts bar edges at row 32, not 16. Must fail before the fix. |
| **T2** | `F2` regression: riddim skank return lands on a musical boundary at several BPM/hold combinations. |
| **T3** | `F3` round-trip: all 43 moves encode → decode → same moveId + channel; append-only ratchet still asserts `DUB_MOVE_TABLE.length === DUB_MOVE_TABLE_VERSION`. |
| **T4** | Performance invariants from plan §79 as executable assertions over the simulator (P18): no throws on silent channels, no unlimited wet stacking, no stale gestures across stop/seek, foundation never removed, DubRouter never bypassed. |
| **T5** | Listening-test project (plan §72): deterministic kick / bass / skank / snare / horn / vocal / pad / percussion reggae arrangement, reused for every character A/B and every persona simulation. **Human verification — cannot be self-certified.** |

---

## 3. Recommended order

`F1 → T1 → F2/T2 → F3/T3 → P1 → P3 → P4 → P2 → P5 → P6 → P7 → P8 → P18/T4 → P9 → P10 → P11 → P12 → P13 → P14 → P15 → P16 → P17 → P19`

Rationale: F1 is a correctness bug that silently misplaces every existing phrase rule — fixing it
improves what already ships, before anything is layered on top. F2/F3 are small and bounded.
Then the performer stack in dependency order: you cannot build intention (P6) without context
(P4), and context without a unified event stream (P1) just re-forks the tracker/DJ split the plan
is trying to close. P18 (the simulator) lands as early as it can be useful, because tuning P9–P15
by ear through the UI is the slow path.

**F4 and F5 need the reviewer's ruling before any code changes** — both are "is this intentional?"
questions, not defects.

---

## 4. Standing constraints (from the plan, carried into every task)

- One canonical implementation of each thing. No `AI DubBus`, `AI DubRouter`, `AI MoveRegistry`,
  `AI LanePlayer`. The AI is a decision layer **above** the existing infrastructure. (§82)
- Everything still goes through `DubRouter.fire()`. (§83)
- Keep the 250 ms decision tick for reasoning; it must never own sample-accurate timing. (AI-08)
- Never remove an existing safety mechanism to make Auto Dub more dramatic. (AI-20)
- Do not add an abstraction from this plan just because it appears in the plan — first confirm
  existing code doesn't already provide it and that it reduces complexity. (§81)
- Audio path and control path stay conceptually separate. (§83)
