---
date: 2026-09-23
topic: AutoDub rides the faders — implementing the RIDING state
tags: [dub, autodub, personas, performance]
status: draft
supersedes: nothing
implements: 2026-09-17-dub-studio-master-implementation-plan.md items AI-03, AI-06/P7, DSP-08
---

# AutoDub rides the faders — implementing the RIDING state

## This is not a new idea

The first draft of this document designed a riding system from scratch. It was
reinventing: the master plan
(`2026-09-17-dub-studio-master-implementation-plan.md`) already specifies all
of it, and specifies it better.

What that plan already says:

- **`RIDING` is a state** in the performer state machine (item P7 / AI-06):
  `LISTENING → ANTICIPATING → PREPARING → EXECUTING → RIDING → RELEASING →
  LISTENING`, plus `BUILDING / DROPPING / RECOVERING`.
- **`active rides` is a field** of `PerformanceContext` (item AI-03), beside
  `active throws` and `active holds`.
- **The canonical dub phrase** is written out: `snare → echoThrow → short send
  gesture → feedback ride → release`. A ride is the fourth beat of a
  five-beat sentence the engine cannot currently speak.
- **Personas already differ stepped vs continuous** (item DSP-08, the character
  macro matrix): HPF is `stepped` for Tubby and `continuous` for Scientist,
  Perry and Mad Professor.

So this document is an implementation plan for a specified feature, not a
proposal. Its only job is to say what is built, what is not, and what the
smallest honest first step is.

## What exists today

| Piece | State |
|---|---|
| `PerformanceContext` | EXISTS — `row`, `ticksPerRow`, `bpm`, `position`, `upcoming`, `energy` |
| `activeRides` / `activeThrows` / `activeHolds` on it | **MISSING** — grep finds none of them |
| Performer state machine | **MISSING** — no `RIDING`, no `LISTENING`, nothing |
| `chooseMove` | EXISTS, pure, seeded |
| `AutoDubChoice` | `{ moveId, channelId, params, holdBars, wet }` — fires only |
| `AutoEQDriver` | EXISTS — a working continuous driver loop for the return EQ |
| `PersonaImprovConfig` | EXISTS — `{ driver, liveBands, depth, rate }` |
| DSP-08 stepped/continuous matrix | **ON PAPER ONLY** |
| `dub.channelSend.chN` as automatable param | EXISTS, and is recordable |
| `DUB_BUS_PARAMS` with min/max | EXISTS (added 2026-09-23) |
| Soft takeover | EXISTS (added 2026-09-23) |

The gap, stated precisely: **AutoDub can fire and hold, but it cannot move a
value over time.** Verified in source — `AutoDubChoice` carries no continuous
target, and `AutoDub.ts` reads `returnGain`/`echoWet`/`springWet`/
`echoIntensity` only to judge wet energy, never to write them. The single
continuous thing it drives is the return EQ.

## The smallest honest first step

NOT the whole state machine. That is item P7 and it restructures the performer.

The first step is the fourth beat of the canonical phrase — **the feedback
ride** — because it is the one the plan already names, it needs no state
machine, and it either sounds like dub or it does not, which is the only way to
find out whether the rest is worth building.

```ts
interface AutoDubRide {
  /** `dub.channelSend.ch3`, `dub.returnGain`, `dub.hpfCutoff`, … */
  param: string;
  /** Where to take it, normalised 0..1. */
  target: number;
  /** Over how long, in BARS. Musical, because everything else here is. */
  bars: number;
  /** The persona's hand shape. DSP-08 already calls this stepped vs continuous. */
  curve: 'step' | 'linear' | 'ease';
}
```

`chooseRide(ctx, rng)` sits beside `chooseMove(ctx, rng)`: same purity, same
seeding, same testability. It is a second question asked each tick, not a
change to the first.

### Personas — take the numbers from DSP-08, do not invent new ones

The character matrix already assigns each persona a curve for HPF. Extend that
same distinction to the ride, rather than writing a second personality table
that can disagree with the first:

| Persona | HPF per DSP-08 | ride curve | reaches for |
|---|---|---|---|
| tubby | `stepped` | `step` | hpfCutoff, channelSend |
| scientist | `continuous` | `ease` | returnGain, echoIntensity |
| perry | `continuous` | `ease`, short + frequent | channelSend, springWet |
| madProfessor | `continuous` | `ease`, long | returnGain, springWet |
| jammy | (not in matrix) | `ease`, sparse | channelSend |

Depth and cadence should come from what each persona already carries —
`variance`, `minBarsBetweenFires`, `phraseArcShape`, `densityBias` — rather
than a fresh set of tuning knobs. Perry's `variance: 0.35` and
`minBarsBetweenFires: 0.25` already say "erratic and frequent"; Jammy's `3.0`
already says "sparse". A ride config that restates those is a second source of
truth for the same fact.

## The hand on the control always wins

A ride must yield to the performer:

- A ride never moves a parameter the user is touching — a held fader
  (`isFaderTouched`) or a knob whose soft takeover is `engaged`.
- Grabbing a parameter mid-ride **abandons** the ride rather than pausing it.
  Resuming under a hand that has moved on is a fight.
- A ride releases its takeover claim when it ends, so the next physical touch
  does not jump.

## Safety — two failures this engine has already had

1. **A ride that never ends.** A hold fired from a curve that never released
   left `transportTapeStop` holding the transport in slow motion indefinitely
   (measured 2026-09-22 on jennipha.ahx), which is why
   `DUB_CURVE_HOLD_CEILING_MS` exists. A ride needs the same ceiling: bounded
   in bars AND in wall clock, because bars stop advancing when the transport
   does.
2. **A ride that runs the bus away.** Removing the return governor on
   2026-09-23 was right, but nothing downstream now catches a `returnGain`
   ridden to 1.0 against an already-saturating bus. Ride targets clamp against
   the same headroom the moves use, and the machine gets a LOWER ceiling than
   the performer's own hand — it should be more cautious than the human, not
   less.

## Test plan

Automated:

1. `chooseRide.test.ts` — pure and seeded, mirroring `AutoDub.rules.test.ts`.
   Cadence honoured; targets drawn from the persona's own list; depth respected.
2. **Personas differ in KIND, not just degree** — driving one context through
   all five yields different curves and targets, not five copies with different
   numbers. This is the test that fails if riding is built as one behaviour
   with a multiplier, which is the likeliest way to get it wrong.
3. **"does not fight a hand on the fader"** — no ride is emitted for a
   parameter whose fader is touched or whose takeover is engaged.
4. **Bounded** — every ride resolves to a duration under the wall-clock ceiling
   at 60 BPM and at 180, and survives the transport stopping mid-ride.
5. **Recordable** — a ride writes to the dub lane through the existing
   `channelSendRecording` path, so a take with rides replays with rides.

Manual (only the owner can confirm):

- `http://localhost:5174`, dub deck, Auto Dub on, each persona in turn.
- The channel faders must MOVE. That is the entire point.
- Tubby steps; Perry lurches; Scientist takes eight bars to arrive.
- Grab a fader mid-ride: the machine lets go at once and does not snatch back.

## Open

1. May a ride and a move fire target the same channel in the same bar?
   Forbidding it is simpler and duller; allowing it is what a real hand does —
   open the send, then throw it, which is literally the canonical phrase.
   Try allowing it; add the rule only if it sounds like two performers.
2. Does this want the full P7 state machine underneath it, or does the
   feedback ride stand alone? Build the ride first and find out. If rides and
   fires start contradicting each other, that IS the argument for P7, and a
   better one than the plan can make on paper.
