---
date: 2026-09-22
topic: Bass as a first-class musical target, and the swamp riddim gesture
tags: [dub, personas, bass, autodub, planning]
status: draft
---

# What is actually still missing

The two plans from 2026-09-22 were written against an older tree. Most of the
personas-completeness plan has since been built. Verified by inventory rather
than assumed:

| Plan phase | Module |
|---|---|
| A MusicalClock | `src/lib/dub/musicalClock.ts` |
| B MusicalEventModel | `src/lib/dub/musicalEvents.ts` |
| C Arrangement / foundation | `arrangementIntelligence.ts`, `arrangementFloor.ts` |
| D PerformanceContext | `performanceContext.ts` |
| E Intention + rest | `intention.ts`, `moveIntentions.ts` |
| F GestureEngine | `engine/dub/GestureEngine.ts` |
| G Wet-energy budget | `moveEnergy.ts` |
| H MusicalTargeting | `musicalTargeting.ts` |
| I Compound gestures | `engine/dub/DubMoveChain.ts` |
| J Consequence / memory | `consequence.ts`, `performanceJournal.ts` |
| K Persona behaviour | `personaBehaviour.ts` |
| L Musical returns | `musicalReturn.ts` |
| M Record / replay | `DubRecorder.ts`, `journalReplay.ts` |
| N Long-run testing | `simulator.ts` |

The plan's specific criticism of `riddimSection` — "returns the skank at 60% of
the hold duration" — has also already been fixed; it returns on a musical
boundary (`riddimSection.ts:81`, "Gate L1").

So this document covers only what is genuinely absent.

## Absent, confirmed by grep across `src/`

1. **No bass state model.** Nothing answers "is this a bass-feature moment".
   `bassState` does not exist.
2. **No `bassEmphasis` move.** The name exists only as a target score on the
   `DubTargetProfile` I added today; no move consumes it.
3. **No `bassThrow`, `bassDropReturn`.**
4. **No `swampRiddim`.** `riddimSection` mutes non-foundation channels and
   returns them musically, but does not make the remaining drums and bass the
   SUBJECT of the dub — no bass emphasis, no filter movement, no selective
   throws.

## The rule that matters most

> Never boost bass merely because the bass is currently quiet.

Quiet bass can be intentional. The trigger is structural, not spectral. This is
the opposite of a tonal-balance corrector and must not degrade into one.

## Phase 1 — `bassState`

A pure function over what already exists, in the shape of
`dubTargetProfile.ts`: no measuring of its own.

```ts
interface BassState {
  channelIds: number[];      // from DubTargetProfile.targets.bassEmphasis
  audible: boolean;          // programmeLevel + channel audibility
  energy: number;            // 0..1 low-band share of the programme
  repetition: number;        // musicalChannelProfile.repetition
  currentlyExposed: boolean; // is the arrangement already stripped back?
  recentlyEmphasised: boolean; // performanceJournal, to prevent repetition
  phraseImportance: number;  // musicalClock phrase position
}
```

And the opportunity test, which must be able to answer NO:

```
bassOpportunity =
      audible
  AND phraseImportance high (drop, phrase boundary, re-entry, sparse section)
  AND arrangement has space
  AND NOT recentlyEmphasised
```

Tests assert the negative cases hardest: quiet bass alone is not an
opportunity; a busy arrangement is not an opportunity; twice in a row is not an
opportunity.

## Phase 2 — the `bassEmphasis` move

Not a big static shelf. Per the plan: +2–4 dB low shelf, 80–120 Hz depending on
material, 1–2 bars, eased attack and release, amount set by the energy budget
(`moveEnergy.ts`).

Distinct gestures, because they mean different things:

- `bassEmphasis` — make the existing bass line hit harder.
- `bassThrow` — put the bass into the dub return path temporarily.
- `subSwell` — already exists; a low event underneath a return.

## Phase 3 — `swampRiddim`

A compound gesture over existing primitives (`DubMoveChain`), not new DSP:

```
identify foundation (drums + bass, respecting user overrides)
  reduce everything else
  bass comes forward            <- bassEmphasis
  low/mid filter movement       <- eqSweep, hpfRise, filterDrop
  dub return                    <- spring, echo throws
  selective throws, pockets of dry rhythm
  restore at a phrase boundary  <- musicalReturn
```

The filter must MOVE — dark, open slightly, throw, close, emphasise, wash, open
toward the return — rather than sitting low-passed. "Swampy" is movement, not a
static LPF.

## Phase 4 — persona differences

When and how often, not different DSP. Tubby after a drop; Scientist as a
precise before/after; Perry accumulated with colour; Mad Professor spatial;
Jammy at structural transitions. Gated by musical context in every case —
never "Tubby periodically boosts bass".

## Order

1 → 2 → 3 → 4. Phase 1 is useless alone but everything else is unsafe without
it, and it is the part that can be tested without ears.
