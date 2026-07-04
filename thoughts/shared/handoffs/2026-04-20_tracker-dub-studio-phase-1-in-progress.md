---
date: 2026-04-20
topic: tracker-dub-studio-phase-1-in-progress
tags: [dub, tracker, phase-1, isolation, worklet, in-progress]
status: draft
---

# Tracker Dub Studio — Phase 1 in progress, blocked on per-channel worklet outputs

## Task(s)

Build a tracker-view dub deck (Phase 1 of the Tracker Dub Studio). Live dubbing of tracker channels via the shared `DubBus`: per-channel dub-send knob + on/off toggle per channel + Echo Throw stab (keyboard `W`), with recording/replay into a pattern-level `dubLane`.

**Phase 1 closed out on paper** (all UI + pipeline) **but audio doesn't actually flow from WASM tracker channels into the dub bus yet.** That requires a worklet refactor (see design doc below) which is the next unit of work.

## Critical References

### Design + plan docs
- `thoughts/shared/plans/2026-04-19-tracker-dub-studio-design.md` — the top-level spec (vibe, 14 moves, architecture, data model, UI shells, rollout).
- `thoughts/shared/plans/2026-04-19-tracker-dub-studio-phase-1-plan.md` — Phase 1 implementation plan (13 tasks).
- **`thoughts/shared/plans/2026-04-20-dub-per-channel-worklet-outputs.md`** — the architectural refactor that unblocks WASM tracker dub. **Start here when resuming.**
- `thoughts/shared/plans/2026-04-19-tracker-dub-studio-phase-0-plan.md` — Phase 0 (refactor), all complete.

### Visual companion
Spec brainstorm mockups live at `.superpowers/brainstorm/5584-1776608858/content/shells-v2.html` (not committed).

### Key files touched this session

**Types / stores (new):**
- `src/types/dub.ts` — `DubEvent`, `DubLane`, `QuantizeMode`, existing `DubBusSettings`
- `src/types/tracker.ts` — `Pattern.dubLane?: DubLane`
- `src/stores/useDubStore.ts` — `armed` flag + `scheduleDubStoreSync()` rAF batcher

**Engine layer:**
- `src/engine/dub/DubBus.ts` — `registerChannelTap` / `openChannelTap` / `modulateFeedback` for Echo Throw; also `deckHpf` DJ-only 180Hz HPF
- `src/engine/dub/DubRouter.ts` — `fire(moveId, channelId, params, source)` one entry point
- `src/engine/dub/DubRecorder.ts` — captures live events to current pattern's dubLane when armed
- `src/engine/dub/DubLanePlayer.ts` — replays lane events on tracker tick; wired into `useTransportStore.setCurrentRow`
- `src/engine/dub/moves/_types.ts`, `echoThrow.ts` — first move
- `src/engine/ChannelEffectsManager.ts` — `setChannelDubSend()` with per-channel `Tone.Gain` tap → `DubBus.inputNode`. **THIS IS THE DEAD-PATH TAP FOR WASM TRACKER FORMATS. Remove in the worklet refactor.**

**UI:**
- `src/components/dub/DubDeckStrip.tsx` — bottom strip in tracker view. REC/KILL/bus-enable + per-channel button (toggle hold) + per-channel Knob (dubSend) + lane timeline
- `src/components/dub/DubLaneTimeline.tsx` — event viz, click-to-delete

**Hooks / router / keyboard:**
- `src/hooks/drumpad/useMIDIPadRouting.ts` — added `ensureDrumPadEngine()` export (needed by tracker to ensure DubBus exists)
- `src/hooks/useGlobalKeyboardHandler.ts` — `W` fires `echoThrow` on tracker cursor channel when bus is on
- `src/stores/useMixerStore.ts` — `dubSend: number` on `MixerChannelState` + `setChannelDubSend` store action

### Session commits (bottom = oldest)

```
94d2afa7f  feat(dub): add DubEvent, DubLane, QuantizeMode types for Phase 1
ac570a75a  feat(dub): optional dubLane field on Pattern
c06010b99  chore(persistence): bump SCHEMA_VERSION 19→20 for Pattern.dubLane
e95e9975f  feat(dub): useDubStore — armed flag + rAF-batched write helper
77661204b  feat(dub): tracker channel dubSend tap + DubBus openChannelTap/modulateFeedback   (SUBAGENT)
8be415b76  feat(dub): Echo Throw move — first tracker-dub move
781be9152  feat(dub): DubRouter — single fire() entry for all dub moves
9e742ff5d  refactor(dub): rename DubEvent.beat → row (tracker-native)
efb1515c5  feat(dub): DubRecorder + useTrackerStore.setPatternDubLane action
c425c27e3  feat(dub): DubLanePlayer + wire into transport setCurrentRow
1d78a07d4  feat(dub): DubDeckStrip + DubLaneTimeline rendered in TrackerView
054c491f0  feat(dub): bind W to Echo Throw on the selected tracker channel
0f1b44494  fix(dub): auto-apply default dubSend on tracker channels when bus enables
605e525a5  tweak(dub): lower default HPF cutoff 180 → 40 Hz
0230b6772  feat(dub): DJ-only 180 Hz HPF on deck taps (always kick-dodge for DJ)
c20b48d4b  fix(dub): replace 'selected channel' highlight with click-flash feedback
e26dc48c8  fix(dub): more distinct click-flash + fire setFlashedChannel on click
bc5eecac4  fix(dub): ensure DrumPadEngine exists on tracker-view mount
c56bd342f  feat(dub): per-channel toggle-hold + dubSend knob
```

## Recent Changes

Phase 1 infrastructure shipped end-to-end:
- Every piece of the pipeline (types → store → recorder → lane player → router → UI) wires correctly.
- `.dbx` persistence schema bumped to v20 to include `dubLane`.
- UI is visible in the tracker view: bottom strip with per-channel toggle buttons (multiple can be held), Knob for continuous send level, REC arm, KILL, lane timeline.
- Keyboard `W` + on-screen button + lane replay all go through the single `DubRouter.fire()` entry.
- Drumpad dub bus untouched — Phase 0 remains gig-safe.

## Learnings / gotchas

1. **The dead-path tap.** `ChannelEffectsManager.setChannelDubSend` taps `chain.output` (Tone.js node). For WASM tracker formats (LibOpenMPT / Furnace / Hively / UADE — which cover 180+ formats including the `.mod` the user tests with), audio doesn't flow through these Tone.js chains. Their worklets output directly to native master nodes. **The tap is sitting on a dead node. Phase 1 infrastructure is in place but no audio reaches the dub bus on WASM tracker playback.**

2. **User explicitly prefers "proper from the start" over incremental/quick-fix splits.** Saved as `memory/feedback_proper_first_not_incremental.md`. Don't offer quick-fix-now/refactor-later splits; propose the proper design and execute.

3. **Flash UX** — on-click highlight tracking the tracker cursor was confusing because most users don't navigate the cursor between channels while performing. Replaced with click-flash (`e26dc48c8`). Button also became a toggle (not a momentary stab) since user wants multi-channel simultaneous dub (`c56bd342f`). **Echo Throw stab now lives on keyboard `W` only**, not the channel button.

4. **HPF split for kick-dodge.** DJ view always wants deck audio HPF'd at 180 Hz to keep kicks out of the echo tail. Drumpad + tracker do per-channel mixing and shouldn't have broadband bass stripped. Solution (`0230b6772` + `605e525a5`): dub bus default HPF lowered to 40 Hz (drumpad/tracker-friendly) + a dedicated DJ-only `deckHpf` fixed at 180 Hz inserted between deck taps and bus input. DJ master FX bass-lock in `DJMixerEngine.ts:399-438` is a separate concern — user wants per-FX bassLock in Phase 2+.

5. **Existing IsolationCapableEngine is the wrong tap point for dub.** 4-slot budget, shared with per-channel effects. Research at `src/engine/tone/ChannelRoutedEffects.ts` + the IS-1 subagent report (see design doc §"Per-engine implementation").

## Artifacts

- Plans: see Critical References
- Memories: `feedback_proper_first_not_incremental.md` added to MEMORY.md

## Next Steps (in order)

The next session starts with the **worklet refactor** detailed in `thoughts/shared/plans/2026-04-20-dub-per-channel-worklet-outputs.md`. Executive summary:

Each isolation-capable worklet (LibOpenMPT / Furnace / Hively / UADE) gets 32 extra `AudioWorkletNode` outputs (`output[5..36]`) for per-channel dub taps. Lazily activated via `dubChannelEnable/Disable` messages — disabled outputs stay zero-filled, so no CPU cost for channels that aren't being dubbed. Per-channel send level is a `GainNode` downstream of the worklet output, wired into `DubBus.inputNode`, driven by `MixerChannelState.dubSend`. Echo Throw temporarily ramps that GainNode to 1.0.

### Task order (resume from IS-3)

Tasks IS-1 (research) and IS-2 (protocol definition) are done. Remaining:

1. **IS-5** Infrastructure: `ChannelRoutedEffects.setupDubBusWiring(dubBusInput)` — owns the 32 `GainNode`s + hooks `setChannelDubSend` that lazily connects the worklet output, registers gain with DubBus.
2. **IS-6** Store rewire: `useMixerStore.setChannelDubSend` → new wiring. Remove `ChannelEffectsManager.setChannelDubSend` (deleted, not deprecated).
3. **IS-7** DubBus: `registerChannelTap` now receives the new per-channel `GainNode` from `ChannelRoutedEffects` instead of from `ChannelEffectsManager`. No API change on `DubBus` side.
4. **IS-3/IS-4** LibOpenMPT: worklet (`public/chiptune3/chiptune3.worklet.js`) handles new messages, lazily allocates a secondary module instance per active dub channel. Engine wrapper (`src/engine/libopenmpt/LibopenmptEngine.ts:130-134`) bumps output count from 5 to 37.
5. **IS-8** Gig-sim LibOpenMPT end-to-end. Load `.mod`, enable bus, confirm channel click → echo on that channel only.
6. **IS-11** UADE (trivial retrofit — Paula buffers already exist in JS).
7. **IS-10** Hively (extend oscilloscope solo-render pattern).
8. **IS-9** Furnace (multi-chip indexing; most complex).
9. **IS-12** Full-format gig-sim across all four engines.

### Follow-up Phase 2+ items (from this session)

- **Per-FX bassLock refactor** for DJ master FX chain (`DJMixerEngine.ts:399-438`) — user wants per-FX `bassLock: boolean` metadata so only delay/reverb FX get HPF'd input, not the whole chain.
- **Aelapse spring reverb swap** in `DubBus` — replace `SpringReverbEffect` (simple Tone.js) with `AelapseSpringsRenderer` for authentic King Tubby spring character. See shells-v2.html mockup context.
- **13 remaining dub moves** — Phase 2+: Dub Stab, Channel Mute, Channel Throw, Spring Slam, Filter Drop, Dub Siren, Tape Stop, Tape Wobble, Backward Reverb, Toast, Snare Crack, Delay-Time Throw, Master Drop. Pattern: each is a new file under `src/engine/dub/moves/` following `echoThrow.ts`; register in `DubRouter.MOVES`.
- **Full-Screen Dub Mode** (spec Shell 2) — Tab-to-enter, big touch targets. Deferred.
- **Proper `Fader` component** in `src/components/controls/` — Knob is being used as a stand-in in the channel strip but real dub desks have faders, not knobs. User wants authentic aesthetic eventually.
- **MIDI CC for dub moves** — needs a trigger-route type added to `parameterRouter.ts` (currently continuous-only). User asked to defer to Phase 1.5.

## Other Notes

- **Drumpad is gig-safe.** Phase 0 refactor didn't regress. User's live gigs still work. All dub work is additive; drumpad touches go through the same shared `DubBus` that was extracted in Phase 0 and works identically to pre-refactor.
- **Task IDs to track in fresh session:** existing tasks from this session are in a stale list. Recommend starting fresh with task creation referencing the IS-* numbers in the design doc.
- **`useDrumPadStore.ts` WIP** (drumpad silence debugging from the 2026-04-18 handoff) is still uncommitted. Left alone per that earlier handoff's "don't merge until silence resolved" note — unclear if user wants to resolve that before continuing or leave it.
- **`.claude/scheduled_tasks.lock` deletion** was in the initial git status but hasn't been committed. Likely fine to leave.
