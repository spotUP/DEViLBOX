---
date: 2026-09-23
topic: Responsive Phases 1-3, then a night of dub deck faults ending in the always-on recorder
tags: [responsive, mobile, pointer-events, dub, dubbus, dubrecorder, persistence, handoff]
status: final
---

# Responsive Phases 1-3, and the dub deck ghost

32 commits, `fc6cce436..24dfded7a`, all on `origin/main` with the gate green
(type-check, test:ci, test:compliance).

The session began as the responsive/mobile plan and turned, after the first
device test, into a long chain of dub deck faults. The last of those — the
recorder — is the one that mattered most, because it made every other fault
unreadable.

## Task(s)

1. **Responsive plan Phases 1-3** (`thoughts/shared/plans/2026-09-22-responsive-mobile.md`).
   Phase 0 had already landed. Done: R1-1..R1-6, R2-1..R2-6, R3-1..R3-4.
   Phases 4 and 5 are untouched.
2. **Whatever the owner hit while testing.** This became most of the night:
   master volume, the Maschine bridge, a starved dub bus, the lane echo, fader
   width, boot restore, unreachable moves, the return governor, Toast, Liquid,
   the recorder, deck sizing.
3. **Dub plan bookkeeping** — `thoughts/shared/plans/2026-09-17-dub-studio-progress.md`
   went from 13 open items to 8.

## Critical References

- `src/index.css` — `--app-vh` (and `--mobile-tab-bar-height`) are defined once
  at the top. `tailwind.config.js` maps `h-screen`/`min-h-screen`/`max-h-screen`
  onto `--app-vh`.
- `src/components/layout/responsive/ResponsivePanel.tsx` — how a panel degrades
  on a phone: `keep` / `hide` / `collapse` / `sheet`. Off a phone it renders
  children and NO wrapper.
- `src/components/controls/Fader.tsx` — the reference pointer-drag shape.
  `Knob.tsx`, `DJPitchSlider.tsx`, `DeckPitchSlider.tsx` now match it.
- `src/components/controls/__tests__/pointerParity.ratchet.test.ts` — allowlist
  is EMPTY. A new mouse-only drag surface fails the build.
- `src/components/dub/__tests__/everyMoveHasAControl.test.ts` — every entry in
  `DUB_MOVE_TABLE` must have a control in the deck, or an exemption WITH a
  reason in `NO_CONTROL_BY_DESIGN` (also empty).
- `src/engine/dub/DubRecorder.ts:~118` — the arm gate. One line, long comment.
- `src/engine/dub/DubBus.ts` — `holdWetGesture()` and the governor gate inside
  `_startTrimWatch`.
- `src/lib/persistence/recoveryGate.ts` — `decideBootRestore`.
- `thoughts/spot/todos.md` — the live queue; several entries were added tonight
  with their diagnosis already attached.

## Recent Changes

**Responsive (Phases 1-3)**
- `3359e180f` `--app-vh` replaces 85 literal `100vh`; tab-bar height single-sourced;
  `Modal` `sm`/`md` were fixed 320/384 px, now `w-full max-w-*`.
- `9f534e2b5`, `c886c352d`, `1bb988021`, `ac08caa99` — all 43 mouse-only drag
  surfaces onto pointer events. Found on the way: PT2 and FT2 were firing every
  mouse interaction into their WASM twice; four hardware knobs leaked a
  `pointercancel` listener per drag.
- `ab654b0c8` — `MobileTrackerView` deleted, one tree, nine panels declaring how
  they degrade. `BottomSheet` revived from zero consumers.
- `8c095490c` — three defects the phone test exposed: my own latching knob;
  `PatternEditorCanvas` wiping React's children on the iOS branch
  (`NotFoundError: removeChild`); the dub deck expanding itself at boot.

**Audio / MIDI**
- `4b5ddcd6b` — master volume routed through `useAudioStore`, not straight at
  `engine.masterChannel`.
- `6f5f00b46` — `tools/maschine-bridge.ts` stops announcing invented knob
  positions. Those two together explain a −29.76 dB master with NO hardware
  attached: the bridge's software default of 64 landing on CC 77, which the
  Mixer knob bank maps to `masterFx.masterVolume`.
- `8e00ca17d` — the worklet's `play()` tears down every dub slot; the engine
  restored them on a blind 100 ms timer that lost the race. Now driven by a
  `playReady` message, with a 400 ms backstop for a cached worklet.
- `0fb11cf38` — the lane no longer replays the move the user just played.
- `0c158b836` — the return governor may loosen but never tighten while a wet
  gesture is held.
- `8fca84f2a` — Toast's duck reads a TRUE baseline, so toggling cannot walk the
  dry buses down geometrically.
- `f1b3d2757` — Liquid drives the phaser's rate when the bus is in phaser mode.
- `55b38200c` — **the recorder captures nothing until REC is armed.**

**Other**
- `3fc982a76` `Fader` keeps its width while the value changes.
- `2c4c9125b` + `c265349ad` — boot OFFERS stored work, and offers the NEWER of
  the saved project and the crash snapshot.
- `643e549fa` — Riddim, Echo Build Up and Bass Emphasis had no control at all.
- `8cc10adf4` — a riddim breakdown keeps its bass.
- `9483fe935` — the instrument classifier banner comes down on `ready`.
- `24dfded7a` — the deck is sized by its content.

## Learnings

**The recorder was the root of the night.** `DubRecorder` ignored
`useDubStore.armed` — `628d70f18` (April) removed the gate with no reason
recorded and pinned it with a test called "writes regardless of armed state".
So every press made while TRYING the deck out was written as `dub.*` automation
and replayed for ever. It arrived four different ways, none of them looking
like a recorder: "i turned autodub off but he keeps going" (AutoDub was off —
`enabled:false`, `isRunning:false`, and not one `origin=ai` line), "are you
pushing the buttons now they are firing like crazy", "version drop only works
sometimes" (a recorded hold latched 60 s, so it was already held when pressed),
and "there is no visible recording in the dub lanes" (the capture went to
automation CURVES, which the lane overlay does not draw).

**`source=` in the DubRouter log is the fastest diagnostic in this subsystem.**
`live/user` is a hand, `live/ai` is AutoDub, `lane/lane` is a recording. Three
of tonight's reports were answered by reading that column alone.

**One symptom, three stacked causes.** "Liquid is dead" was, in order: the bus
starved (`busInput 0.000001`), then the governor clamping at −14 dB, then the
phaser running at its resting 0.15 Hz. Each fix was real and none of them alone
made it audible. Do not stop at the first cause that explains the symptom.

**Source-shape tests cannot see any of this.** The suite was green all evening
while `busInput` sat at 1e-6. happy-dom has no AudioWorklet, no audio graph and
no layout. The check that would have caught the starvation, the −30 dB master
AND the dead controls is the same one: play a song and assert the meters, which
the MCP probes already return. That gap is still open and is the single highest-
value thing left.

**A test that passes on broken code is worse than no test.** Three separate
times tonight a test passed against the unfixed source: the knob latch (stale
anchor, then a value the rAF batch had not written), and Toast twice (instant
ramps cannot reproduce a mid-ramp race; no mocked mic means the duck never
runs). Always run the new test against the OLD code before believing it.

**I was wrong three times by pattern-matching** — blaming the user's Maschine
(no device was attached), then device emulation (it was only on while the
console was open), then my own diff (the bisect was inconclusive). Each cost
real time. The measurement that settled each one existed from the start.

**HMR reverting the loaded song made every live reading untrustworthy** for
hours, because the boot restore preferred a stale saved project over the newer
snapshot. `c265349ad` fixes the preference; the HMR reload itself (X27) remains.

## Artifacts

- `thoughts/shared/plans/2026-09-22-responsive-mobile.md` — checklist R1-1..R5-4,
  Phases 1-3 ticked with notes on what only a human can close.
- `thoughts/shared/plans/2026-09-17-dub-studio-progress.md` — 8 open, X23/X32/X4
  closed as stale, H15 answered by reading the vendored WASM, X31 closed by ear.
- `thoughts/shared/plans/2026-09-22-dub-personas-completeness.md` — a measured
  section at the top explaining why no persona drops a song to drums and bass.
- `thoughts/shared/handoffs/2026-09-22_dead-dub-controls-open.md` — resolved.
- `thoughts/spot/todos.md` — the queue.

## Next Steps

1. **The runtime meter check.** Play a song, assert `busInput` is non-silent with
   sends up, `masterChannelVolumeDb` agrees with the store, and a capture's peak
   clears the abort threshold. Everything that hurt tonight was invisible to the
   suite and obvious in `get_dub_bus_state`.
2. **The seven toggles, measured as a set, not one at a time.** Wide, Wobble,
   Sub Harm, Liquid, Ring, Starve, Ping-Pong. Fire each through MCP and record
   rms, band energy, `busReturn` and the move's own log line. That separates
   "not running" / "running but inaudible" / "running and making it worse" —
   three faults that have been treated as one all night. NOTE: `stereoDoubler`
   measured rms 0.1823 -> 0.1173 with the high band down, which is what a
   cross-fed doubler does to a mono sum; the MCP analyser cannot show width, so
   that one needs ears.
3. **Responsive Phase 4** (R4-1..R4-4) and **Phase 5** (R5-1..R5-4).
4. Smaller, each with its diagnosis already in `todos.md`: Riddim's missing
   active state; Sweep is a timed one-shot dressed as a toggle; Ghost should be
   a hold; Version Drop's intermittency; Play/Stop stacking when the dub bus is
   disabled; the audition "no colour stage engaged" message; BUS tab sliders
   full-width; X27 HMR wiping the loaded song.
5. **CF-10** is still unticked in the UADE companion plan.

## Other Notes

- The owner is the sole owner of this repo now; no other agents are working in it.
- `FXChainPlayer-Releases-1.3.11/` is left untracked deliberately — 2.1 MB of a
  competitor's release, the artefact behind the competitive audit. Either commit
  it or gitignore it; it clutters every `git status`.
- A local `npm run build` bakes `http://localhost:3011/api` into `dist/`, and
  `deployBundle.test.ts` correctly blocks the push. Delete `dist/` after a local
  build.
- The pattern editor logged `renderer stalled (worker booted but GL init did not
  complete after 42 s)` once tonight. Not investigated.
- `docs/DUB_SYSTEM.md` was not updated for the arm gate; it should say recording
  requires REC.
