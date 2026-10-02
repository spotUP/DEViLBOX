---
date: 2026-10-02
topic: Review of the dub bus branches (PR 79 and feature/dub-bus-move-inaudibility) and the fixes landed on main
tags: [dub, review, gain-staging, autodub, panic]
status: implemented
---

# Review: dub bus branches from 2026-10-01/02

Two branches, both cut from main `a0a83f0ad`:

- `feature/dub-bus-dead-return-recovery` (PR 79, 3 commits): measurement probes
  no longer persist; a stored dead return is repaired on load.
- `feature/dub-bus-move-inaudibility` (8 commits): panic re-enable, send seeding,
  desired-vs-actual diagnostics, `measure_dub_knob`, Dub Mute relabel, plate
  reachability, hold buttons, Sub Harmonic modes, Liquid wiring, sidechain
  'drums', Auto Dub transport tape stop, returnGain 0.85 -> 3.0.

Both are merged into main and then corrected. Ledger (tick as landed):

| ID | Finding | Fix | Status |
|----|---------|-----|--------|
| R1 | `returnGain` default 3.0 and presets x3.53, but the knob, MIDI CC map, NKS map and `performanceContext` are all 0..1. First touch of the knob dropped the return ~10 dB. Also every generated layer that joins `return_` (siren, crack, thump, reverse, crush/osc bass) got +11 dB it was never calibrated for. | Wet-chain make-up node (send-fed paths only) carries the +11 dB; defaults and presets back in range; stored values above 1 clamped on load. | done |
| R2 | Two send-seeding mechanisms (`ensureBusIsFed` and `seedAutoDubSends`), run in an order that made the flat seed pre-empt Auto Dub's role levels on channel 0. `seedAutoDubSends` counted the BLEED floor as a user's send. | One module, one entry point. | done |
| R3 | `setSettings(..., { force: true })` added to get past the no-op guard after a panic. The guard compared `enabled` against the desired mirror instead of the engine's actual state. | The guard compares `enabled` with the engine's actual flag; `force` removed. | done |
| R4 | `djKillAll` writes zeros to the persisted store to beat the mirror, then a timer writes them back. A reload inside the 2.2 s window still persists the zeros (the original bug). The engine already ignores echo/spring writes while `_draining`. | Zero writes and the restore timer removed; KILL writes only `enabled: false`. | done |
| R5 | `heldMoveBlocksSettingsDrive` duplicates `DubBus.isSettingOwned`; both are used in the same method. | Use `isSettingOwned`; module removed. | done |
| R6 | `measure_dub_knob` writes the store on every arm: each probe value persisted, and `enabled: true` seeds a channel send as a side effect. PR 79 fixed exactly this for `measure_dub_bus_stages`. | Use `applyEphemeralDubSettings`. | done |
| R7 | `getLiveState()` desired values for `inputGain`/`returnGain` ignore drain/disable; re-derived instead of reading `_inputGainTarget()`/`_returnGainTarget()`. | Read the targets. | done |
| R8 | Sub Bass Bed: `SUB_BED_MAX_MIX = 8` is a "diagnostic overdrive" ceiling in a product control; `_subBedTap` is one shared field, so a re-fire inside 600 ms has its tap disconnected by the previous release. | Ceiling 1; the release disconnects only its own tap. | done |
| R9 | 9 of the branch's new tests are outside `test:ci`. | Wired in. | done |
| R10 | `src/test/audio/testWebAudio.ts` (375 lines) has no users. | Deleted: it never constructed a DubBus (Tone's import fails against it). | done |
| R11 | Sidechain 'drums' re-resolves on `patterns.length`, so two songs with the same pattern count keep the first song's drum channel. | Key on a real song identity. | done |
| R12 | PR 79's `repairDeadDubBusVoicing` and R1's clamp both sanitise a stored voicing. | One sanitiser on both load paths. | done |
| R13 | `MODE_LATCHED_MOVES` declared inside the component. | Module scope. | done |
| R14 | Tail measurement mode (owner-approved, not built). | `probe: 'tail'` on `measure_dub_knob`. | done |

Kept as they are (checked, correct): Dub Mute relabel, Auto Dub transport tape
stop rule, hold-button CSS, Liquid native connects, SpaceEcho `describe()`,
plate stage reconcile, panic drain re-enable intent, sub pulse pitch tracking,
`measurementSettings.ts`.

## Not verified live

No browser was connected to the relay during the fixes, so nothing above was
measured in the running app:

- The wet make-up reproduces the branch's wet level exactly by arithmetic
  (`0.85 x 3.0/0.85 = 3.0`); generated layers are back at main's level.
- `measure_dub_knob` `probe: 'tail'` is unit-checked only. First live run:
  `springWet` 0.1 vs 0.8 and `echoWet` 0.1 vs 0.8 with `probe: 'tail'`; a
  working tail control should read several dB, where steady mode read +0.3.
  The relay process must be restarted to expose the `tail` enum.
