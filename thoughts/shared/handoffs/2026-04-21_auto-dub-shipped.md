---
date: 2026-04-21
topic: auto-dub-shipped
tags: [dub, autodub, handoff, shipped]
status: final
---

# Auto Dub shipped — session handoff

Autonomous dub-move performer landed on main as a single feature
commit on top of the two parallel-agent commits from 2026-04-20
(`03e75bb91` ui-smoke flow 10, `7460ebb12` optional plate-stage
insert). Feature is opt-in and off by default — no behavioural
change for any existing user flow.

## Commit

| SHA | Subject |
| --- | --- |
| `209640420` | feat(dub): Auto Dub — autonomous performer with 5 persona voicings |

Pre-push ran `type-check + test:ci + test:compliance` in parallel,
all green. CI + Hetzner auto-deploy triggered by the push.

## What shipped

- `src/engine/dub/AutoDub.ts` (460) — tick loop + pure `chooseMove`,
  `detectTransients`, `hasTransientForRole`; module-local runtime state
  with idempotent `start/stopAutoDub`; panic-off disposes all held
  disposers so no channelMute / dubSiren / filterDrop can stick.
- `src/engine/dub/AutoDubPersonas.ts` (164) — 5 personas + `custom`:
  King Tubby, Scientist, Lee Perry, Mad Professor, Prince Jammy. Each
  has weight multipliers (1.0 default for unlisted moves), intensity
  default, optional `budgetCap` (Jammy=1), `variance` (Perry=0.35),
  `paramOverrides` merged over move defaults under caller params, and
  a `suggestedCharacterPreset` the UI applies on persona pick.
- `src/components/dub/AutoDubPanel.tsx` (117) — toggle + persona picker
  + intensity slider. `useEffect` on `[enabled, busEnabled]` keeps the
  runtime engine in sync (idempotent start/stop guarded by
  `isAutoDubRunning`). Listens for window `dub-panic` to kill the
  engine and flip the store flag.
- `src/stores/useDubStore.ts` — new fields: `autoDubEnabled`,
  `autoDubIntensity` (clamped 0..1), `autoDubPersona`,
  `autoDubMoveBlacklist` + setters. Exports `AutoDubPersonaId` type.
- `src/bridge/analysis/MusicAnalysis.ts` — new `classifyPattern()`
  (WeakMap-memoized per Pattern) with a percussion heuristic added
  post-`classifyChannel`: name regex
  `/noi|noise|drum|perc|kit|hat|kick|snare|clap|cymbal|tom|ride/i` +
  statistical fallback (density≥0.4 && avgInterval≤2.5 &&
  uniqueNotes≤3 && noteCount≥4).
- `src/components/dj/DJView.tsx` + `src/components/dub/DubDeckStrip.tsx`
  — AutoDubPanel mount points. Panel is passed `busEnabled` from
  `useDrumPadStore(s => s.dubBus.enabled)`.
- `src/engine/dub/__tests__/AutoDub.rules.test.ts` (271) — 24 tests:
  budget caps (intensity-derived + persona `budgetCap`), blacklist,
  cooldown decay (fires less over 500 rolls when last-fired is 2 bars
  ago), persona weight bias shifts distribution vs Custom, paramOverride
  flow-through, zero-channel nulls channelId, 'any' role skips
  empty-role channels, detectTransients min-peak + rolling-avg ratio
  guards, hasTransientForRole Phase-1 fallback, transient-triggered
  echoThrow beats bar-phase-only. Wired into `test:ci` + `test:all`.

## Architecture

```
useDubStore (enabled/intensity/persona/blacklist)
           │
           ▼
AutoDubPanel ── (mounted in DJView header + DubDeckStrip header)
           │
           ▼  useEffect
start/stopAutoDub()  ◄── also 'dub-panic' event
           │
           ▼  setInterval(250ms)
 tickImpl
   │
   ├─ read useTransportStore (isPlaying? bpm?)
   ├─ compute bar/barPos from (now - enableTimeMs) * bpm/60
   ├─ read useTrackerStore → classifyPattern → roles[]
   ├─ read useOscilloscopeStore → detectTransients(data, rollingPeaks)
   │
   ├─ chooseMove(ctx, rng)  ◄── pure, test-driven
   │    ├─ check blacklist, budget, roll probability (intensity*0.6)
   │    ├─ for each rule: condition + roles + cooldown decay + weights
   │    ├─ weighted roulette over eligible rules
   │    └─ pick channel from matchingChannels if role-targeted
   │
   └─ fire(moveId, channelId, params, 'live')
        │ returns disposer for hold-kind moves
        ▼
     _heldDisposers.add(disposer)
     setTimeout(holdMs) → disposer.dispose()
```

## Where Auto Dub reads state

- `useDubStore` — control state (enable/intensity/persona/blacklist)
- `useTransportStore` — `isPlaying` gates ticks; `bpm` drives bar clock
- `useMixerStore` — `channels.length` fallback when no pattern loaded
- `useTrackerStore` — current `patterns` + `currentPatternIndex`
  (from useTransportStore) → `classifyPattern` → roles per channel
- `useOscilloscopeStore` — `channelData` Int16Array per channel for
  transient detection

## UI behaviour

- Panel disabled when dub bus is off (greys out toggle + controls)
- Persona picker auto-applies that persona's bus character preset via
  `setDubBus({ characterPreset })` and snaps intensity to the
  persona's `intensityDefault`
- Toggle is idempotent vs engine state — safe to mount the panel in
  multiple views (DJView + DubDeckStrip) without engine collision

## Learnings / gotchas

- **Stash pop cross-merged with another agent's WIP.** The
  dub-automation-lanes branch had uncommitted `smartCuts.test.ts`
  references in `package.json` + untracked `src/engine/dj/smartCuts.*`
  files from a parallel agent. Stash pop merged those into my
  package.json. Had to manually remove the `smartCuts.test.ts`
  entry before staging so my commit only contained the AutoDub
  test wiring. See `feedback_respect_other_agent_wip.md`.
- **Panel mounted in both DJView and DubDeckStrip.** Not
  duplication — it's the same component consumed in two places. All
  logic lives in `AutoDub.ts` engine + `useDubStore`. Idempotent
  start/stop makes double-mount safe. Two `dub-panic` listeners
  register but that's fine: both call `stopAutoDub()` + `setEnabled(false)`
  which are both idempotent.
- **Pure functions over test-only hooks where possible.** `chooseMove`,
  `detectTransients`, `hasTransientForRole` are exported and drive
  tests directly with a seeded linear-congruential RNG — no DubBus
  mocking needed. `_setAutoDubRngForTest` / `_resetAutoDubStateForTest`
  exist as underscore-prefixed hooks but the 24 current tests don't
  need them; they're for future integration-level tests.

## Next steps

- **Manual browser smoke test** — I shipped without actually clicking
  the button in a browser. The feature passed type-check + 24 unit
  tests + full test:ci + test:compliance, but that's not the same as
  watching bar 3 fire an echoThrow while a real song plays. If the
  next session wants to verify: load any song, enable the dub bus,
  flip `AUTO DUB ON`, pick Tubby, raise intensity to ~0.7, watch
  console for `fire(moveId, ...)` calls in the DubRouter and listen
  for the moves landing on-beat.
- **Persona bus preset "Custom" case** — if the user has hand-tuned
  the bus voicing and flips to a persona, the current behaviour
  clobbers the bus character preset. The Custom persona is the
  documented escape hatch. If users complain, consider an explicit
  "apply persona voicing" button instead of silent on-pick.
- **Phase-4 idea (not shipped):** intensity ramping over bar
  boundaries instead of the per-tick constant — sweeping intensity
  across 4 or 8 bars to simulate a "build" / "breakdown" arc
  without the user touching the slider.
