---
date: 2026-10-08
topic: Auto DJ beat juggling (owner-supplied plan, from the music-theory review)
tags: [dj, auto-dj, juggling, plan]
status: draft
---

Absolutely. The goal should be true beat juggling, not just alternating crossfades.
I’d structure the implementation around phrase/beat-level control of both decks, with the existing deck engine doing the actual playback/crossfader work. The key is that Auto DJ becomes capable of performing with two records simultaneously: cutting, trading phrases, looping, doubling, call-and-response, and building rhythmic tension.
I can turn this into a full copyable implementation plan with explicit phase gates, including the existing Auto DJ architecture and the tracker-specific channel/role intelligence.

he key is to make Auto DJ behave like a two-deck performance instrument, not merely a transition sequencer.
Below is the implementation plan I’d give directly to a coding agent.


# DEViLBOX AUTO DJ — WORLD-CLASS BEAT JUGGLING IMPLEMENTATION PLAN

## Objective

Transform Auto DJ from a system that primarily plays one track and transitions to the next into a **true two-deck autonomous DJ performer capable of beat juggling**.

The finished system should be capable of:

- trading phrases between Deck A and Deck B
- rapidly alternating beats between decks
- call-and-response performances
- drum/bass/lead trading
- same-track doubles
- offset doubles
- loop juggling
- fill/stutter performances
- transformer-style rhythmic cuts
- escalating 8-bar → 4-bar → 2-bar → 1-bar → beat-level patterns
- using tracker-native musical information to decide **what** to juggle
- choosing musically appropriate moments to juggle
- building tension and releasing it musically
- returning cleanly to normal mixing
- surviving uncertain analysis without producing silence or chaos

This must feel like a **human DJ manipulating two decks**, not an algorithm firing random crossfader commands.

---

# 1. CORE ARCHITECTURAL PRINCIPLE

## Do not build another DJ engine.

The existing DEViLBOX DJ architecture already owns:

- decks
- playback
- crossfader
- EQ
- filtering
- tempo control
- beat/tempo analysis
- preload
- transition execution
- FX
- failure handling

The beat-juggling system must sit **above** those primitives.

Target architecture:

```text
                    DJAutoDJ
                       │
              DJSessionController
                       │
              DJPerformanceContext
                       │
        ┌──────────────┴──────────────┐
        │                             │
 DJSetPlanner                 DJTransitionPlanner
        │                             │
        └──────────────┬──────────────┘
                       │
              DJJuggleController
                       │
              DJJugglePlanner
                       │
          DJJugglePerformanceContext
                       │
              DJJugglePattern
                       │
              DJJuggleAction[]
                       │
              DJJuggleExecutor
                       │
             existing deck/mixer
```

The new layer decides:

- **WHY** to juggle
- **WHEN** to juggle
- **WHICH** deck should speak
- **WHAT musical material** should be exposed
- **HOW LONG** the pattern should last
- **HOW INTENSE** it should become
- **WHEN TO STOP**

Existing playback/mixer infrastructure decides how the actual audio operation occurs.

---

# 2. CRITICAL RULE: ONE CLOCK

There must be exactly one musical timing authority.

Do not create:

- a second transport
- a second beat clock
- a second bar clock
- independent millisecond timers for each deck
- a separate juggle scheduler disconnected from DJ timing

Use the existing DJ timing/analysis infrastructure and extend it where necessary.

The juggle engine should operate in musical units:

```text
beat
half-beat
bar
2 bars
4 bars
8 bars
phrase
section
```

rather than arbitrary milliseconds.

Every juggle action should resolve to an absolute musical execution point.

Example:

```ts
{
  executeAtBeat: 128,
  quantization: "beat",
  deck: "A",
  action: "CUT_IN"
}
```

Not:

```ts
setTimeout(() => cutDeckA(), 173)
```

---

# 3. NEW DOMAIN MODEL

Create explicit types rather than embedding juggle state inside `DJAutoDJ.ts`.

Recommended files:

```text
src/engine/dj/
  DJJuggleController.ts
  DJJugglePlanner.ts
  DJJuggleExecutor.ts
  DJJuggleTypes.ts
  DJJugglePatterns.ts
  DJJugglePerformanceContext.ts
```

Exact filenames may follow existing project conventions.

---

# 4. `DJJugglePerformanceContext`

The performer needs a live understanding of both decks.

Conceptually:

```ts
interface DJJugglePerformanceContext {
  masterBeat: number
  masterBar: number
  phrasePosition: number

  deckA: DJDeckPerformanceState
  deckB: DJDeckPerformanceState

  activeDeck: "A" | "B" | "BOTH"
  performanceMode: DJPerformanceMode

  energy: number
  targetEnergy: number

  phraseConfidence: number
  beatConfidence: number

  currentSection?: DJSection
  nextSection?: DJSection

  lastJuggle?: DJJugglePerformance
  recentPatterns: DJJugglePatternHistory[]

  intensity: number
  tension: number

  fallbackAvailable: boolean
}
```

Each deck should expose enough state for the planner to understand:

```ts
interface DJDeckPerformanceState {
  trackId: string
  position: number

  beatPhase: number
  barPhase: number

  bpm: number
  key?: string

  section?: DJSection

  cuePosition?: number
  mixInPosition?: number
  mixOutPosition?: number

  energy: number

  drumsActive: boolean
  bassActive: boolean
  vocalsActive: boolean
  melodicActivity: number

  loop?: DJLoopState

  analysisConfidence: number
}
```

The exact fields should reuse existing `DJTrackAnalysis` / `DJPerformanceContext` structures where possible.

Do not duplicate existing analysis models unnecessarily.

---

# 5. DECK ROLES MUST BECOME DYNAMIC

The old model:

```text
playing deck
incoming deck
```

is insufficient for beat juggling.

During a juggle:

```text
Deck A = voice
Deck B = response
```

then:

```text
Deck B = voice
Deck A = response
```

then:

```text
A+B = layered
```

then:

```text
Deck A = foundation
Deck B = fills
```

Then:

```text
A = full groove
B = exit
```

Introduce conceptual roles:

```ts
type JuggleDeckRole =
  | "PRIMARY"
  | "SECONDARY"
  | "VOICE"
  | "RESPONSE"
  | "FOUNDATION"
  | "FILL"
  | "LAYER"
  | "SILENT"
```

Roles are temporary performance states, not permanent deck identities.

---

# 6. JUGGLE ACTION MODEL

Create a small vocabulary of executable actions.

For example:

```ts
type DJJuggleAction =
  | CutIn
  | CutOut
  | CrossfadeTo
  | CrossfadeFrom
  | TriggerCue
  | JumpToBeat
  | JumpToBar
  | StartLoop
  | ExitLoop
  | LoopResize
  | LoopRoll
  | HoldDeck
  | ReleaseDeck
  | FilterIn
  | FilterOut
  | EQCut
  | EQRestore
  | BassSwap
  | EchoThrow
  | ReverbThrow
  | ResetDeck
  | ResyncDeck
```

Each action should contain musical timing:

```ts
interface DJJuggleAction {
  type: DJJuggleActionType

  deck: "A" | "B" | "BOTH"

  executeAtBeat: number

  durationBeats?: number

  targetPosition?: number

  quantization?: "beat" | "halfBeat" | "bar" | "phrase"

  strength?: number

  reason?: string
}
```

The action vocabulary should remain relatively small.

The intelligence belongs in the planner.

---

# 7. JUGGLE PATTERN MODEL

A juggle is not a collection of unrelated actions.

It is a musical pattern.

```ts
interface DJJugglePattern {
  id: string

  type: DJJugglePatternType

  durationBars: number

  intensity: number

  actions: DJJuggleAction[]

  sourceDeck?: "A" | "B" | "BOTH"

  targetDeck?: "A" | "B" | "BOTH"

  energyProfile: "BUILD" | "FLAT" | "PEAK" | "RELEASE"

  confidence: number

  reason: string
}
```

Examples:

```text
A-B-A-B
A-A-B-B
A-B-A-B-A-B-A-B
A---B---A---B
A-fill-B-fill
A-drums-B-lead
A-bass-B-drums
A-loop-B-hit
A-full-B-stab
```

The system should reason in these patterns rather than isolated random cuts.

---

# 8. JUGGLE PERFORMANCE GRAMMAR

The most important design decision:

**Beat juggling needs musical grammar.**

Do not randomly alternate decks.

Use:

```text
SETUP
  ↓
ESTABLISH
  ↓
INTENSIFY
  ↓
PEAK
  ↓
PAYOFF
  ↓
RELEASE
```

Example:

### Setup

8 bars:

```text
A full groove
B mostly silent
```

### Establish

4 bars:

```text
A | A | B | A
```

### Intensify

2 bars:

```text
A | B | A | B
```

### Peak

1-bar trading:

```text
A | B | A | B
```

### Beat juggle

```text
A B A B A B A B
```

### Payoff

```text
A+B full groove
```

### Release

```text
A full groove
B exits
```

This is dramatically more musical than permanently running:

```text
A B A B A B A B
```

---

# 9. PHRASE TRADING

Implement phrase trading first.

This becomes the foundation for all more advanced juggling.

## Pattern

Start with:

```text
A = 8 bars
B = 8 bars
```

Then:

```text
A = 4 bars
B = 4 bars
```

Then:

```text
A = 2 bars
B = 2 bars
```

Then:

```text
A = 1 bar
B = 1 bar
```

Then optionally:

```text
A = 1/2 bar
B = 1/2 bar
```

Only tighten the pattern when musical confidence is high.

### Requirements

Phrase trading must respect:

- beat grid
- bar grid
- phrase boundaries
- section boundaries
- energy
- drum activity
- bass activity
- musical role

Do not switch halfway through a vocal phrase simply because a timer expired.

---

# 10. BEAT-LEVEL JUGGLING

Once phrase trading is reliable, add beat-level performance.

Examples:

```text
Beat 1 → A
Beat 2 → B
Beat 3 → A
Beat 4 → B
```

Or:

```text
A A B A
A B B A
A B A B
```

Or:

```text
A - B -
A - B -
```

Or:

```text
A B - B
A B - A
```

Patterns should be represented explicitly.

Example:

```ts
[
  "A",
  "B",
  "A",
  "B"
]
```

rather than four unrelated scheduled commands.

---

# 11. CALL AND RESPONSE

This is one of the most important features.

The engine should be able to recognize:

```text
Deck A asks
Deck B answers
```

Example:

```text
A drum fill
→
B bass/melodic response
→
A drum fill
→
B response
```

The planner should search both decks for musically compatible material.

Possible response targets:

- drum fill
- percussion hit
- bass phrase
- vocal phrase
- synth stab
- lead phrase
- chord hit
- rhythmic loop
- tracker pattern segment

---

# 12. TRACKER-NATIVE CALL/RESPONSE

For tracker material, exploit the structure that exists before rendering.

Do not treat every tracker channel as a permanent instrument.

A channel's musical identity is time-varying.

Use the existing/proposed performance timeline concepts:

```text
ChannelSegment
  instrumentFamily
  musicalFunction
  rhythmicRole
  register
  density
  importance
  audibility
  repetition
  start
  end
```

Therefore the planner can ask:

```text
What is Deck A doing here?
```

and discover:

```text
bar 42:
  channel 3 = drums

bar 46:
  channel 3 = melodic synth
```

rather than incorrectly assuming:

```text
channel 3 = drums forever
```

This is essential for tracker beat juggling.

---

# 13. MUSICAL MATERIAL SELECTION

Before selecting a juggle pattern, determine what each deck can contribute.

For each candidate window calculate:

```text
drum activity
bass activity
percussion density
melodic activity
vocal activity
harmonic activity
spectral density
energy
rhythmic density
importance
confidence
```

Then classify candidate moments:

```text
DRUM_FILL
BASS_HIT
VOCAL_HIT
LEAD_HIT
PERCUSSION_HIT
FULL_GROOVE
BREAK
DROP
BUILD
SILENCE
```

The juggle planner can then create:

```text
A: drum fill
B: bass response
```

instead of:

```text
random A
random B
```

---

# 14. DRUM / BASS TRADING

Create dedicated musical patterns for low-end material.

Example:

```text
A = drums
B = bass
```

Performance:

```text
A drums
B bass
A drums
B bass
```

Then:

```text
A+B
```

for the payoff.

Bass must not simply be slammed on top of another full bass line.

The planner must understand low-frequency ownership.

Use:

```text
bass ownership = A
```

or:

```text
bass ownership = B
```

at each moment.

When ownership changes:

- perform an intentional bass handover
- avoid low-end collision
- use EQ when necessary
- restore the outgoing deck cleanly

---

# 15. SAME-TRACK DOUBLES

Implement genuine doubles.

A double means:

```text
same track
loaded on Deck A
loaded on Deck B
```

with independent deck positions.

This enables:

```text
Deck A = original
Deck B = delayed/retriggered copy
```

Example:

```text
A: groove
B: same groove, offset 1 bar
```

Then:

```text
A
B
A
B
```

This is a classic beat-juggling building block.

---

# 16. DOUBLE ALIGNMENT

Same-track doubles require phase-aware handling.

When loading the same source onto both decks:

1. identify a reliable beat
2. align both decks to the same beat
3. establish bar phase
4. optionally offset one deck
5. verify phase
6. only then permit juggling

Supported offsets:

```text
1 beat
2 beats
1 bar
2 bars
4 bars
```

Do not allow arbitrary offsets when beat confidence is low.

---

# 17. DOUBLE PATTERNS

Implement:

### Straight double

```text
A = full
B = full
```

### Offset double

```text
A = beat 1
B = beat 2
```

### One-bar double

```text
A = bar 1
B = bar 2
```

### Fill double

```text
A = groove
B = fill
A = groove
B = fill
```

### Drop double

```text
A = groove
B = muted
A = groove
B = hit
```

### Escalating double

```text
8-bar offset
→
4-bar offset
→
2-bar
→
1-bar
→
beat
```

---

# 18. LOOP JUGGLING

Where the existing deck engine supports loops, expose them to the juggle layer.

Loop sizes:

```text
8 bars
4 bars
2 bars
1 bar
1/2 bar
1/4 bar
1/8 bar
```

Do not make the loop size progression arbitrary.

Example:

```text
4 bars
→
2 bars
→
1 bar
→
1/2
→
1/4
→
release
```

This creates controlled rhythmic tension.

---

# 19. STUTTER / FILL JUGGLING

Create patterns around detected fills and transient material.

Example:

```text
A full groove
A full groove
B fill
A full groove
B fill
B fill
A+B drop
```

The planner should prefer actual musical fills over blindly repeating arbitrary audio slices.

For tracker material, pattern/channel/event information can provide especially strong candidates.

---

# 20. TRANSFORMER-STYLE PERFORMANCE

Add rhythmic crossfader patterns.

Example:

```text
A B A B A B
```

with controlled fades.

Potential patterns:

```text
open / close
open / close / close
A-A-B-B
A-B-B-A
A-B-A-A
```

These should be musical pattern objects, not raw timer loops.

The execution layer handles the actual crossfader movement.

---

# 21. QUANTIZED EXECUTION

Every performance pattern must be scheduled ahead of time.

Recommended lookahead:

```text
at least 1–2 beats
```

where possible.

For complex patterns:

```text
1 bar or more
```

The planner should generate a short future action queue.

Example:

```text
current beat: 128

129 → A
130 → B
131 → A
132 → B
```

The executor should execute these actions against the shared DJ clock.

---

# 22. NEVER USE RAW TIMER RHYTHM AS THE MUSICAL SOURCE

Avoid:

```ts
setInterval(...)
setTimeout(...)
```

as the primary musical timing mechanism.

Timers may be used internally for safety/cleanup where necessary, but musical actions must originate from:

```text
beat
bar
phrase
section
```

This is especially important at different BPMs.

---

# 23. JUGGLE INTENSITY

Introduce a continuous intensity value:

```ts
0.0 → 1.0
```

Example:

```text
0.0
normal DJ mix

0.25
phrase trading

0.5
2-bar trading

0.7
1-bar trading

0.85
beat juggling

1.0
peak performance
```

Intensity should influence:

- pattern density
- cut frequency
- loop size
- FX density
- deck alternation
- phrase length
- musical risk

It must not simply mean “more random actions.”

---

# 24. JUGGLE BUDGET

Beat juggling should be special.

Do not run it constantly.

Create a performance budget based on:

- set position
- energy
- recent performance
- track compatibility
- transition quality
- audience-energy proxy
- confidence
- previous juggle duration

Example:

```text
normal mix
→
short juggle
→
normal mix
→
larger juggle
→
normal mix
```

Avoid:

```text
juggle
juggle
juggle
juggle
juggle
```

throughout the entire set.

That sounds like a demo, not a DJ.

**Owner decision 2026-10-12 (JUGGLE-FOLLOWUPS a): the budget decides.** How often a juggle happens is set by
this budget alone (the set phase, cooldown and juggled fraction of section 28, scaled by the Auto Juggle mode
of section 44). When the budget allows a juggle and a trading ladder fits both tracks, the juggle transition
outranks the blends in every DJ style; the transition planner's style score is not a second frequency gate.
The safety gates are unchanged (tempo band, key clash, vocals, drums, phase and grid confidence, meter).
Before: Classic (risk 0.35) at MUSICAL outside PEAK scored 0.605 against 0.70 for a bass swap, and a live
37-minute set juggled 3 times.

---

# 25. WHEN TO JUGGLE

The system should consider juggling when:

### Good conditions

- both decks have strong beat confidence
- phrase alignment is strong
- sections are compatible
- energy is appropriate
- one or both tracks contain rhythmic material
- a breakdown/build/drop creates a performance opportunity
- a transition is approaching
- a musical fill exists
- a repeated phrase can be manipulated
- the set needs controlled energy
- a transition would benefit from performance

### Bad conditions

- analysis confidence is low
- tempo sync is unstable
- keys are strongly incompatible
- both tracks have dense conflicting vocals
- bass ownership is unclear
- timing is drifting
- the current section is already extremely dense
- the system just performed a similar juggle
- the incoming track has not been sufficiently analyzed/prepared

---

# 26. JUGGLE AS PART OF TRANSITIONS

Beat juggling must integrate with the existing transition planner.

A transition should be able to become:

```text
NORMAL_BLEND
```

or:

```text
JUGGLE_TRANSITION
```

or:

```text
PERFORMANCE_TRANSITION
```

Example:

```text
Track A outro
        ↓
4-bar phrase trade
        ↓
2-bar trade
        ↓
1-bar trade
        ↓
incoming Track B drop
        ↓
release into B
```

This is much more musical than:

```text
crossfade 16 bars
```

---

# 27. JUGGLE INSIDE A SINGLE TRACK

Do not limit juggling to track changes.

If the same track is loaded on both decks:

```text
Track A
Deck A = current groove
Deck B = same track
```

the performer can create an internal performance.

Example:

```text
normal groove
→
double
→
1-bar offset
→
beat trading
→
filter buildup
→
full release
```

This allows Auto DJ to perform even when no transition is happening.

---

# 28. SET-LEVEL PERFORMANCE ARC

The set planner should decide when performance intensity is appropriate.

Example:

```text
OPENING
  normal mixing

BUILDING
  occasional phrase trades

CRUISING
  short performance moments

PEAKING
  aggressive juggling

PEAK
  high-energy doubles / beat juggling

RELEASE
  fewer cuts

RECOVERY
  normal mixing

CLOSING
  controlled performance
```

The set should therefore have an evolving performance vocabulary.

---

# 29. PERFORMANCE MEMORY

Record recent patterns.

Example:

```ts
interface DJJuggleHistory {
  patternType: string
  durationBars: number
  intensity: number
  sourceTracks: string[]
  successScore: number
  timestamp: number
}
```

Use this to prevent repetitive behavior.

If the last several performances were:

```text
A-B-A-B
```

do not immediately repeat:

```text
A-B-A-B
```

Instead choose:

```text
A-A-B-B
```

or:

```text
A-fill-B-fill
```

or return to normal mixing.

---

# 30. HUMANIZATION

Humanization must preserve tight musical timing.

Do not intentionally make beat juggling sloppy.

Allowed:

- tiny timing variation
- pattern variation
- variable phrase length
- variable intensity
- different action ordering
- different response material

Not allowed:

- audible random off-beat errors
- drifting phase
- inconsistent bar boundaries
- arbitrary delayed cuts

Humanization should feel like **human choice**, not bad synchronization.

---

# 31. CONFIDENCE-AWARE PERFORMANCE

Every major decision should have confidence.

Example:

```text
beatConfidence
phraseConfidence
sectionConfidence
deckSyncConfidence
materialConfidence
```

If confidence is high:

```text
beat juggling allowed
```

If moderate:

```text
phrase trading only
```

If low:

```text
normal transition
```

This prevents the system from attempting complex juggling on poorly analyzed material.

---

# 32. SAFETY GOVERNOR

Create a hard safety layer independent of the creative planner.

The governor must prevent:

- both decks becoming silent unintentionally
- uncontrolled crossfader oscillation
- excessive cut frequency
- contradictory actions
- conflicting loop states
- runaway FX
- extreme tempo jumps
- phase drift
- stuck deck states
- infinite juggle patterns

The creative engine can request something ambitious.

The governor decides whether it is safe to execute.

---

# 33. EMERGENCY FALLBACK

At any moment the system must be able to collapse back into a normal DJ state.

Emergency sequence:

```text
1. Cancel pending creative actions
2. Identify strongest deck
3. Restore stable crossfader state
4. Restore essential EQ
5. Exit unsafe loop
6. Resync if necessary
7. Continue normal playback
8. Resume planning only after confidence recovers
```

Never allow a failed juggle to kill the set.

---

# 34. NO-SILENCE INVARIANT

Unless silence is an intentional musical action, the system should maintain:

```text
at least one audible deck
```

If both decks are about to disappear:

```text
BLOCK ACTION
```

or:

```text
FORCE SAFE DECK
```

This should be an automated invariant tested continuously.

---

# 35. BASS SAFETY

Beat juggling can destroy low-end clarity very quickly.

Track:

```text
current bass owner
next bass owner
bass overlap
bass energy
low-frequency conflict
```

Do not blindly layer two bass-heavy decks.

Possible strategy:

```text
A bass
B drums
```

then:

```text
A bass
B bass
```

only when the material is compatible.

Otherwise:

```text
cut A bass
bring B bass
```

as an intentional handover.

---

# 36. VOCAL SAFETY

Avoid:

```text
vocal A
+
vocal B
```

unless explicitly desired.

Prefer:

```text
A instrumental
B vocal
```

or:

```text
A vocal
B drums
```

or:

```text
A vocal phrase
B response hit
```

This should influence material selection.

---

# 37. TRACKER-SPECIFIC PERFORMANCE

For tracker modules, preserve access to:

- orders
- patterns
- channels
- instruments
- samples
- note events
- effect events
- pattern boundaries
- repeated patterns
- channel activity
- instrument changes

Even if the DJ deck ultimately plays rendered audio, the AI should retain tracker intelligence.

This allows decisions such as:

```text
This pattern introduces the bass.
```

```text
This channel contains the main drum fill.
```

```text
The next order contains a breakdown.
```

```text
This section has no lead.
```

That information should influence juggle selection.

---

# 38. CHANNEL IDENTITY MUST BE TIME-VARYING

Never implement:

```text
channel 5 = bass
```

as a permanent assumption.

Instead:

```text
channel 5
  bars 0–32 = percussion
  bars 32–64 = bass
  bars 64–80 = melodic
```

Use the channel timeline / segment model.

This is especially important for call-and-response.

---

# 39. JUGGLE PATTERN LIBRARY

Implement a curated vocabulary.

Minimum patterns:

### `phraseTrade`

```text
A 4 bars
B 4 bars
```

### `tightPhraseTrade`

```text
A 2
B 2
A 2
B 2
```

### `barTrade`

```text
A 1
B 1
```

### `beatTrade`

```text
A B A B
```

### `doubleBeat`

```text
A A B B
```

### `callResponse`

```text
A phrase
B answer
```

### `drumBassTrade`

```text
A drums
B bass
```

### `fillTrade`

```text
A groove
B fill
A groove
B fill
```

### `loopTighten`

```text
4 bars
2 bars
1 bar
1/2
release
```

### `double`

```text
A full
B offset
```

### `transformer`

```text
A-B-A-B-A-B
```

### `dropAndReturn`

```text
A full
B hit
A full
B hit
A+B
```

### `escalatingJuggle`

```text
8 bars
→ 4
→ 2
→ 1
→ beat
→ payoff
```

---

# 40. PATTERN SELECTION

Do not select patterns randomly.

Score candidates against:

```text
energy fit
phrase fit
section fit
rhythmic compatibility
bass compatibility
vocal compatibility
material availability
confidence
recent repetition
set position
performance budget
transition opportunity
```

Conceptually:

```ts
score =
    energyFit
  + phraseFit
  + sectionFit
  + rhythmicFit
  + bassFit
  + vocalFit
  + materialFit
  + confidence
  + novelty
  - repetitionPenalty
  - risk
```

---

# 41. JUGGLE PLANNER SHOULD THINK AHEAD

Do not decide one action at a time.

Plan a short performance phrase.

For example:

```text
Current:
A full groove

Next 8 bars:
A 4 bars
B 4 bars

Next 4:
A 2
B 2

Next 4:
A 1
B 1
A 1
B 1

Next:
beat juggle

Then:
A+B payoff
```

The planner can revise the future if conditions change.

---

# 42. ADAPTIVE ABORT

A planned juggle must be cancellable.

Abort if:

- beat confidence drops
- deck drifts
- incoming material changes unexpectedly
- vocals collide
- bass collision becomes excessive
- analysis changes
- a deck fails
- user takes manual control
- safety governor intervenes

When aborted:

```text
resolve gracefully
```

not:

```text
stop immediately
```

---

# 43. MANUAL USER OVERRIDE

Auto DJ must never fight the user.

If the user:

- moves crossfader
- changes deck state
- triggers a cue
- changes FX
- changes tempo
- disables Auto DJ

the juggle engine must recognize manual intervention and yield.

The system should cancel or replan affected actions.

---

# 44. AUTO JUGGLE MODES

Provide user-facing performance styles.

Suggested:

```text
OFF
SAFE
MUSICAL
PERFORMER
AGGRESSIVE
CHAOS
```

### SAFE

Mostly:

```text
8/4 bar trading
```

### MUSICAL

Adds:

```text
call-response
fills
doubles
```

### PERFORMER

Adds:

```text
beat juggling
loops
transformer patterns
```

### AGGRESSIVE

Allows:

```text
shorter cuts
higher density
more doubles
```

### CHAOS

Still obeys:

- timing
- safety
- no-silence
- musical boundaries

Chaos must not mean broken audio.

---

# 45. DEBUG / TELEMETRY

Create a developer-visible state representation.

Show:

```text
JUGGLE
Pattern: escalatingJuggle
Phase: INTENSIFY
Intensity: 0.74

Deck A:
  drums
  bass
  confidence .96

Deck B:
  percussion
  lead
  confidence .91

Next:
  A @ beat 128
  B @ beat 129
  A @ beat 130
  B @ beat 131

Reason:
  peak section / strong rhythmic compatibility
```

This will be extremely important when tuning the system.

---

# 46. EVENT LOGGING

Record:

```text
juggleStarted
jugglePatternSelected
juggleActionScheduled
juggleActionExecuted
juggleActionBlocked
juggleAborted
juggleCompleted
juggleFallback
```

Include reasons.

Example:

```text
Juggle blocked:
both decks contain active vocals
```

or:

```text
Juggle selected:
high rhythmic compatibility
strong phrase alignment
peak energy
low repetition risk
```

---

# 47. OFFLINE TEST HARNESS

Do not rely exclusively on listening tests.

Create deterministic tests for:

### Timing

```text
all actions land on intended beats
```

### Phrase alignment

```text
no phrase trade begins off-grid
```

### No silence

```text
at least one deck remains active
```

### Crossfader

```text
no invalid values
```

### Deck synchronization

```text
double alignment remains within tolerance
```

### Pattern validity

```text
all actions occur in pattern order
```

### Abort

```text
unsafe conditions cancel safely
```

### Repetition

```text
recent pattern history affects selection
```

---

# 48. GOLDEN TEST SCENARIOS

Build deterministic scenarios for at least:

## Scenario 1 — Standard 4/4

```text
120 BPM
strong drums
strong bass
```

Expected:

```text
phrase trading
bar trading
beat trading
```

## Scenario 2 — Sparse track

Expected:

```text
less aggressive juggling
```

## Scenario 3 — Vocal-heavy tracks

Expected:

```text
vocal collision avoidance
```

## Scenario 4 — Bass-heavy tracks

Expected:

```text
bass ownership management
```

## Scenario 5 — Same-track double

Expected:

```text
phase-aligned doubles
```

## Scenario 6 — Low confidence

Expected:

```text
normal DJ transition
```

## Scenario 7 — Tracker song

Expected:

```text
tracker structure influences material selection
```

## Scenario 8 — User intervention

Expected:

```text
juggle yields immediately
```

## Scenario 9 — Deck failure

Expected:

```text
safe continuation on remaining deck
```

## Scenario 10 — Long set

Expected:

```text
no runaway juggling
no pattern repetition
no state corruption
```

---

# 49. LONG-SET TEST

Run at least a multi-hour simulated set.

Verify:

- no memory leak
- no accumulating timers
- no stale actions
- no stuck deck roles
- no stuck loops
- no increasing latency
- no repeated exact juggle patterns
- no gradual timing drift
- no increasing silence events
- no corrupted deck state

---

# 50. PERFORMANCE MEMORY

The system should learn from the current set.

Remember:

```text
successful pattern
track pairing
energy context
section type
pattern duration
juggle intensity
```

For example:

```text
Track A + Track B
call-response
peak
success = high
```

can become a preferred pattern in future encounters.

But do not turn this into opaque ML infrastructure unless the existing architecture calls for it.

A deterministic scoring/history system is sufficient initially.

---

# 51. DO NOT OVERUSE JUGGLING

A world-class DJ does not perform tricks constantly.

The best Auto DJ behavior should often be:

```text
normal mixing
```

with occasional:

```text
"holy shit, that was good"
```

moments.

The system should therefore optimize for:

```text
musical impact
```

not:

```text
number of juggle actions
```

---

# 52. JUGGLE QUALITY SCORE

After each performance calculate:

```text
JuggleQualityScore
```

Potential dimensions:

```text
timing
musical compatibility
energy fit
material quality
bass clarity
vocal clarity
pattern coherence
novelty
listener-impact proxy
safety
```

This score feeds performance memory and future selection.

---

# 53. INTEGRATION WITH EXISTING AUTO DJ

Do not rewrite `DJAutoDJ` into a giant controller.

Keep its responsibility at the session level.

Conceptually:

```text
DJAutoDJ
    ↓
DJSessionController
    ↓
DJSetPlanner
    ↓
DJPerformanceContext
    ↓
DJJuggleController
    ↓
DJJugglePlanner
    ↓
DJJuggleExecutor
    ↓
existing decks / mixer / FX
```

The existing transition executor remains responsible for ordinary transitions.

The juggle executor handles short performance actions.

They share the same underlying deck/mixer state.

---

# 54. PHASED IMPLEMENTATION

## GATE A — BASELINE LOCK

Before modifying anything:

- verify existing Auto DJ behavior
- verify two-deck state
- verify tempo sync
- verify beat grid
- verify crossfader
- verify cue/playhead control
- verify existing transition executor
- identify exactly which low-level operations already exist

### Completion gate

Do not proceed until:

```text
existing Auto DJ passes baseline regression tests
```

---

# GATE B — DUAL-DECK PERFORMANCE STATE

Implement:

```text
DJJugglePerformanceContext
DJDeckPerformanceState
```

Integrate with existing DJ context.

### Completion gate

Both decks can be represented simultaneously with:

- position
- beat phase
- bar phase
- energy
- section
- musical activity
- confidence

without creating a second transport.

---

# GATE C — QUANTIZED ACTION SCHEDULER

Implement:

```text
DJJuggleAction
DJJuggleExecutor
```

Actions must schedule against the existing musical clock.

### Completion gate

A deterministic test can produce:

```text
A
B
A
B
```

on exact musical beats.

---

# GATE D — PHRASE TRADING

Implement:

```text
8-bar trade
4-bar trade
2-bar trade
1-bar trade
```

### Completion gate

Auto DJ can perform a complete:

```text
8 → 4 → 2 → 1
```

sequence and resolve back into normal mixing.

---

# GATE E — BEAT JUGGLING

Implement beat-level patterns.

Minimum:

```text
ABAB
AABB
ABBA
A-A-B-A
```

### Completion gate

Beat-level patterns remain phase-locked and never produce unintended silence.

---

# GATE F — MUSICAL CALL/RESPONSE

Implement:

- drum response
- bass response
- percussion response
- lead response
- vocal-safe response

Use analysis to choose material.

### Completion gate

The system can explain why it chose the response material and avoids obvious incompatible overlaps.

---

# GATE G — DOUBLES

Implement:

- same-track double
- offset double
- bar double
- beat double
- fill double

### Completion gate

Two copies of the same source can be phase-aligned and manipulated independently without audible drift or destructive timing errors.

---

# GATE H — LOOPS / FILLS / TRANSFORMER PATTERNS

Implement:

- loop tightening
- fill juggling
- rhythmic crossfader patterns
- drop/release patterns

### Completion gate

At least one complete performance can move:

```text
normal
→ loop
→ tighten
→ juggle
→ release
```

without state corruption.

---

# GATE I — ADAPTIVE JUGGLE ENGINE

Implement the pattern scoring system.

The engine now chooses:

```text
whether to juggle
which pattern
which material
which duration
which intensity
```

### Completion gate

No hard-coded “always juggle every N bars” behavior remains.

---

# GATE J — SET INTEGRATION

Integrate with:

- set energy
- transition planner
- phrase/section analysis
- performance memory
- cooldowns
- set position

### Completion gate

A long set contains varied, intentional performance moments rather than constant juggling.

---

# GATE K — SAFETY / FALLBACK

Implement:

- no-silence invariant
- bass safety
- vocal safety
- action conflict prevention
- emergency fallback
- abort/replan

### Completion gate

Every unsafe juggle test returns cleanly to stable DJ playback.

---

# GATE L — HUMANIZATION / MEMORY

Implement:

- pattern novelty
- performance history
- controlled variation
- successful-pattern memory
- tiny timing humanization only where safe

### Completion gate

Repeated long-set simulations do not sound mechanically identical.

---

# GATE M — DEBUG / TELEMETRY / UX

Expose:

- current juggle mode
- pattern
- intensity
- active deck
- next actions
- reason
- confidence
- safety state

Add user controls:

```text
Auto Juggle
Mode
Intensity
```

### Completion gate

A developer can understand why every major juggle happened.

---

# GATE N — WORLD-CLASS ACCEPTANCE

The system passes only if it can demonstrate all of the following:

### Two-deck behavior

```text
A ↔ B
```

is a real performance relationship.

### Phrase trading

```text
8 → 4 → 2 → 1 bars
```

works musically.

### Beat juggling

```text
A B A B
```

is tight and stable.

### Call and response

One deck can answer meaningful material from the other.

### Doubles

Same-track doubles work cleanly.

### Tracker intelligence

Tracker structure influences what is selected.

### Musical awareness

Vocals, bass, drums and melodic material are treated differently.

### Escalation

Performances can build intensity.

### Release

The system knows when to stop.

### Variety

Different tracks produce different performances.

### Safety

No accidental silence or runaway state.

### Human quality

The result sounds like a DJ making decisions, not a timer executing commands.

---

# 55. DEFINITION OF DONE

Beat Juggling is complete when Auto DJ can perform a convincing autonomous two-deck set in which it can:

1. recognize when both decks are musically usable
2. synchronize them to the same musical clock
3. select useful musical material from each
4. trade phrases
5. trade bars
6. trade beats
7. perform call-and-response
8. perform drum/bass exchanges
9. perform doubles
10. perform offset doubles
11. manipulate loops
12. use fills
13. perform rhythmic crossfader patterns
14. escalate performance intensity
15. resolve into a musical payoff
16. return to normal mixing
17. avoid vocal collisions
18. manage bass ownership
19. exploit tracker-native structure
20. respect time-varying channel identity
21. avoid repeating the same trick
22. yield to the user
23. survive low-confidence analysis
24. recover from failures
25. maintain stable playback for long sessions

Most importantly:

> **The system must understand that beat juggling is a musical performance, not a sequence of rapid crossfader movements.**

---

# 56. EXPLICIT "DO NOT" LIST

Do **not**:

- create a second transport
- create a second musical clock
- create a second deck system
- bypass the existing mixer/deck execution primitives
- put the entire implementation into `DJAutoDJ.ts`
- use arbitrary millisecond timers for musical timing
- permanently assign tracker channels to roles
- assume every song is 4/4 without consulting musical-clock metadata
- assume every phrase has identical length
- always start incoming material at 0:00
- always use the same juggle pattern
- juggle constantly
- randomly cut between decks
- layer two bass-heavy decks without ownership logic
- layer two active vocals without an intentional reason
- allow both decks to disappear accidentally
- let creative performance override safety
- treat low analysis confidence as permission to improvise aggressively
- rebuild existing analysis/deck infrastructure unnecessarily

---

# FINAL ARCHITECTURAL GOAL

The finished Auto DJ should no longer conceptually be:

```text
PLAY A
   ↓
CROSSFADE
   ↓
PLAY B
   ↓
CROSSFADE
   ↓
PLAY C
```

It should become:

```text
                 DJ SET
                   │
          ┌────────┴────────┐
          │                 │
       DECK A             DECK B
          │                 │
          └───────┬─────────┘
                  │
           MUSICAL LISTENING
                  │
          PERFORMANCE INTENT
                  │
          ┌───────┴────────┐
          │                │
       MATERIAL         PATTERN
       SELECTION         SELECTION
          │                │
          └───────┬────────┘
                  │
            JUGGLE PLAN
                  │
        ┌─────────┼─────────┐
        │         │         │
      PHRASE     BEAT      LOOP
      TRADE     TRADE     JUGGLE
        │         │         │
        └─────────┼─────────┘
                  │
              PAYOFF
                  │
               RELEASE
                  │
             NORMAL MIX
```

The ultimate target is a DJ that can hear the musical relationship between two decks and decide:

> **“This is a good moment to trade these two bars.”**

Then:

> **“That worked. Tighten it to one bar.”**

Then:

> **“Now answer that drum fill with the bass hit from the other deck.”**

Then:

> **“The crowd energy is at the peak. Double the track, juggle the beat, and build tension.”**

Then:

> **“Enough. Bring the full groove back.”**

That is the behavior that will make DEViLBOX Auto DJ feel like an **actual beat-juggling DJ performer**, rather than an automated crossfader.

This should be implemented on top of the existing Auto DJ master plan, with the juggle layer becoming the performance subsystem rather than replacing the set planner, transition planner, or deck engine.

