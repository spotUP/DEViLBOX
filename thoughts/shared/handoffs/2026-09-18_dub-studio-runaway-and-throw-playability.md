---
date: 2026-09-18
topic: Dub Studio — feedback runaway, AHX isolation, throw playability
tags: [dub, dubbus, autodub, ai-performer, handoff]
status: final
plan: thoughts/shared/plans/2026-09-17-dub-studio-revised-ai-performer-plan.md
ledger: thoughts/shared/plans/2026-09-17-dub-studio-progress.md
analysis: thoughts/shared/plans/2026-09-17-dub-studio-gap-reconciliation.md
---

# Session handoff — 2026-09-17/18

## The long game (read this first)

We are working slowly through an external music reviewer's **revised master
AI-performer plan**. That plan is authoritative and lives at
`thoughts/shared/plans/2026-09-17-dub-studio-revised-ai-performer-plan.md`.

Its shape:

```
GATE A  baseline lock            ✅ CLOSED
GATE B  musical clock            open  ← next real milestone
GATE C  musical event model      open
GATE D  performance context      open
GATE E  intention + REST         open
GATE F  gesture engine           open
GATE G  wet energy               open
GATE H  musical targeting        open
GATE I  arrangement              open
GATE J  consequence              open
GATE K  personas as behaviour    open
GATE L  musical returns          partly — skank timing done, riddim return not
GATE M  record / replay          open (see X5 + today's replay fix)
GATE N  long performance         open
GATE O  musical release          open
```

The goal is to move Auto Dub from `250 ms timer → roll probability → effect`
to `listen → understand → anticipate → decide → perform → hear consequence →
adapt`. The 43 moves are the hands; the AI needs to become the operator.

**A first revision of that plan was written against a stale 2026-04-20 doc I
mistakenly shipped in the review bundle** (27 moves, `gatedFlanger`). It is
superseded and marked as such. Do not use its G1–G16 gap list.

The **ledger** (`2026-09-17-dub-studio-progress.md`) is the durable todo list.
Re-read it before trusting any recollection, including this handoff.

## What this session was supposed to be

Verify one thing by ear: that `skankEchoThrow` now behaves as a capture (catch
one stab, throw it, get out) rather than a two-bar wash.

**That still has not happened.** The session was consumed by a pre-existing
feedback runaway that surfaced the moment the bus was driven in anger, plus a
chain of bugs underneath it.

## Recent changes — 15 commits, all on main

```
00bfd0a6b  skank throw: hold → capture; skankFloatThrow added; persona weights
63e6b3d97  whole-mix tap no longer shadows per-channel sends      [BROKE AHX #1]
eda2aed88  hpfResonance mirror; panic no longer zeroes bass mirror; drain wired
0666843d0  feedback-ring gain stages + window.__dubBus() dev handle
873c72c77  whole-mix tap silenced rather than frozen              [fixes #1, BROKE AHX #2]
16dcfe9ed  ROOT CAUSE: ext feedback loop off the plate + the return fader
4c572845e  ledger: runaway session
bb265eb5a  isolation-capable engines retry activation             [fixes #2]
a7f07647b  Skank strip button was still declared a hold; Float added
90b5cd6fa  ledger: fader rides not recorded
8d0e7a0d5  ledger: bus audition mode
2ab38cf6f  throws playable: grid snapping + echo-rate protection
035b392cb  whole-mix release no longer ratchets every fader to max
1e7616ada  recorded lane moves replay on their own channel
e38dda177  ledger: lane visuals + stale MCP metadata
```

## Learnings

### The expensive one: measure before fixing

Four commits landed on feedback rings that **were not running**. The live
snapshot showed `feedbackGain: 0` — the ring I kept compensating is the siren
tap and was idle throughout. The actual culprit was found in ten seconds by the
user running `__dubBus().setSettings({ extFeedbackGain: 0 })` mid-rumble.

`~/.claude/CLAUDE.md` already says one decisive measurement beats three
plausible patches. It was skipped in favour of reading source and inferring.
**For anything touching the audio graph, build the instrument first.**

### Shared state has consumers — grep before changing it

AHX was broken twice by me, both times the same way. The whole-mix tap is
simultaneously an audio path AND a flag other code reads (`hasWholeMixTap()`).
I changed the audio side twice without checking who read the flag. One grep
would have caught both; running it later immediately found a stale contract
test too.

### Test doubles rot silently

Six test files had bus doubles missing methods the router had started calling.
Worse, `AutomationPlayer.dubRouting.test.ts` mocked `parameterRouter` without
`DUB_MOVE_KINDS`, so every dub write threw inside a `try/catch` and vanished —
the test passed while the feature was dead. **A partial mock inside a catch
block is an invisible failure.**

### Root cause of the runaway

The external feedback loop (Messian Dread's "loop the return through a mixer
channel") was tapped at `return_`, which put inside the loop:

- the **dattorro plate**, whose own docs call its tail *"infinite"* — an
  unbounded tail inside a feedback path is unbounded by construction
- the ring mod and lo-fi stages
- **`returnGain`** — the user's return fader, so raising it pushed the loop
  over unity (hence "I can repro it with the master fader")

Loop gain = `extFeedbackGain × chain gain`. Perry is the only preset with a
non-zero loop (0.035); the chain behind `return_` runs near 30. Just over
unity is exactly a slow crawl rather than an instant howl.

Now taps `stereoMerge` (core wet chain only) behind a persona-independent tanh
ceiling no setting can disable.

## Critical references

| What | Where |
|---|---|
| Live diagnostics | `__dubBus().getDiagnosticSnapshot()` — dev builds only, `DubBus.ts` |
| Feedback ring | `DubBus.ts` — `shouldFallBackToWholeMix`, `beginRateOverride`, `_silenceWholeMixTaps` |
| Grid snapping | `src/engine/dub/dubGrid.ts` — `getCurrentRow`, `msToNextGridBoundary` |
| Isolation gate | `ChannelRoutedEffects.ts:378,395` — `hasUsableWholeMixFallback()` |
| Lane replay | `AutomationPlayer.ts` — dub branch appends `.chN` from `channelIndex` |
| Move reshape | `src/engine/dub/moves/skankEchoThrow.ts` — `makeSkankThrow(id, division)` |
| Guard tests | `feedbackLoopGain.test.ts`, `wholeMixFallback.test.ts`, `dubGrid.test.ts` |

**Verified live over MCP:** amanda.ahx `registeredChannelTaps` `0` → `[1]`;
a 4-beat skank capture raised bus RMS 0.0094 → 0.0650 (6.9×).

**Transport on amanda.ahx:** 125 BPM, speed 6 → 4 rows/beat, so `ROWS_PER_BEAT`
is right for it. Dotted eighth = 360 ms there.

## Next steps, in order

1. **X2 — hear the skank.** Still the original task. amanda.ahx cannot really
   show it: AHX is monophonic per channel, so there is no chord stab, and at
   4 channels the arrangement is sparse. Get the modland tune ("jah cometh in
   dub") — MOD runs in `classic` with per-channel taps that already work.
   Test with **Tubby or Custom, not Perry**: Perry's `chainOrder: 'springEcho'`
   means the echo echoes a reverb cloud ("a room repeated"), so it structurally
   cannot bounce. Send at **0**, quantize on, then Skank vs Float on one stab.
2. **X7 — lane visuals.** Static despite `masterDubLaneRef.current.style.top`
   being written at `PatternEditorCanvas.tsx:2686,2813`, and curves showing on
   every pattern. Prime suspect for the second: `DubRecorder` reads
   `tracker.currentPatternIndex`, which is known not to update on WASM-driven
   engines — AutoDub carries the same workaround with a comment. Verify the id
   actually written before changing anything. **Debug live, not by reading.**
3. **X5 — fader rides are not recorded.** Riding the send is arguably the
   primary dub gesture, and it has no capture path at all. Blocks Gate M and
   AI-08.
4. **GATE B — MusicalClock.** The next real plan milestone. `beatsPerBar` +
   `beatUnit` (7/8 vs 7/4), `rowsPerBeat`, `phraseBars` defaulting to 16, all
   user-set, **no accent inference**. `dubGrid.ts` is the seed — it already
   resolves row position across every engine and owns `ROWS_PER_BEAT`.
5. X6 audition mode, X3 ext-feedback EQ mirror, X8 stale MCP metadata.

## Other notes

- **Pushed to main, so this deploys.** CI → Hetzner. The skank capture has
  never been verified by ear; everything shipping is test-and-measurement
  verified only.
- `throwQuantize` defaults to `'off'`, so grid snapping changes nothing until
  engaged. Perry ships `'offbeat'`.
- Do not use **KILL** to stop a runaway on old builds — panic used to zero the
  bass compensation and arm the next one. Fixed in `eda2aed88`; reload is still
  the safest reset.
- The reviewer has never seen the source, only `DUB_SYSTEM.md`. Their musical
  rulings stand on their own; every implementation claim needs checking against
  the tree first. Two for two so far on finding things invisible from prose.
