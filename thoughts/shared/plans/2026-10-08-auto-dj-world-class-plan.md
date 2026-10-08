---
date: 2026-10-08
topic: Auto DJ - world-class human DJ performance (owner-supplied plan)
tags: [dj, auto-dj, plan]
status: draft
---

# DEViLBOX AUTO DJ — WORLD-CLASS HUMAN DJ PERFORMANCE IMPLEMENTATION PLAN

## Objective

Transform DEViLBOX Auto DJ from a playlist sequencer with automated crossfades into a **world-class autonomous DJ performer**.

The target is not simply "better transitions."

The target is an Auto DJ that behaves like an experienced human DJ:

- understands what is playing
- knows where it is in the musical structure
- anticipates what is coming next
- chooses the right next track for the current set
- chooses the right moment to mix
- chooses an appropriate mix-in and mix-out point
- phrase-aligns tracks
- manages tempo and key intelligently
- manages bass and EQ like a DJ
- adapts transition length to the music
- varies its transition vocabulary
- understands energy and set progression
- remembers what it has already done
- avoids repetitive behavior
- takes controlled creative risks
- knows when *not* to transition
- handles uncertain analysis gracefully
- recovers safely from failures
- can run for hours without becoming predictable or musically incoherent

The result should sound like a skilled human DJ performing a deliberate set, not a timer executing crossfades.

---

# 1. Core Design Principle

Do **not** rebuild the existing deck and mixer engine.

DEViLBOX already has the low-level machinery required to execute a DJ performance:

- two-deck playback
- deck state
- preload
- crossfader
- filters
- EQ
- pitch/tempo control
- quantized effects
- transition execution
- failure handling
- analysis infrastructure

The intelligence should be built **above** those primitives.

The desired architecture is:

```text
                    DJAutoDJ
                        │
                        ▼
              DJSessionController
                        │
             ┌──────────┴──────────┐
             │                     │
             ▼                     ▼
       DJPerformanceContext   DJSessionMemory
             │
             ▼
        DJSetPlanner
             │
             ▼
      DJTransitionPlanner
             │
       ┌─────┼──────────────┐
       │     │              │
       ▼     ▼              ▼
   Tempo   Key/Energy   Structure
   Solver    Solver       Solver
       │     │              │
       └─────┼──────────────┘
             ▼
      DJTransitionPlan
             │
             ▼
     DJTransitionExecutor
             │
             ▼
       Existing deck/mixer
```

The important separation is:

```text
WHY?
DJSessionController / PerformanceContext

WHAT NEXT?
DJSetPlanner

WHEN?
DJTransitionPlanner

WHERE IN THE SONG?
Cue/Structure analysis

HOW?
DJTransitionExecutor

AUDIO EXECUTION
Existing deck/mixer infrastructure
```

Do not turn `DJAutoDJ.ts` into one giant rule engine.

---

# 2. Current-State Baseline

Before changing behavior, establish a deterministic baseline.

## Gate A — Baseline Lock

### Tasks

Record the behavior of the current Auto DJ implementation.

Capture:

- playlist order
- current Smart Sort behavior
- deck transitions
- preload behavior
- transition lengths
- crossfader behavior
- tempo matching
- pitch behavior
- key handling
- filter transitions
- bass swap
- echo-out
- failure recovery
- shuffle behavior
- auto pause
- transition timing
- current humanization
- current analysis values

Create a reproducible test playlist containing:

1. steady 4/4 electronic tracks
2. tracks with long intros
3. tracks with long outros
4. tracks with vocals
5. tracks with drops
6. tracks with breakdowns
7. tracks with large BPM differences
8. tracks with compatible keys
9. tracks with incompatible keys
10. tracks with uncertain key analysis
11. tracker/module material
12. unusual arrangements
13. very short tracks
14. tracks with silence
15. tracks with highly variable energy

### Completion Gate

Do not proceed until:

- existing behavior is documented
- regressions can be detected
- Auto DJ can run through the baseline corpus without hard crashes
- transition logs can be captured

---

# 3. Unified DJTrackAnalysis

The current analysis is too shallow for professional DJ behavior.

BPM, whole-track key, loudness-derived energy, danceability and genre are not enough.

Create a unified analysis representation.

## Proposed structure

```ts
interface DJTrackAnalysis {
    bpm: number
    bpmConfidence: number

    beatGrid: BeatGrid
    downbeats: DownbeatGrid

    meter: MeterAnalysis

    key: MusicalKey
    keyConfidence: number
    keyTimeline?: KeySegment[]

    tuning?: TuningAnalysis

    loudness: LoudnessAnalysis
    energy: EnergyAnalysis
    spectral: SpectralAnalysis
    rhythmic: RhythmicAnalysis
    bass: BassAnalysis

    danceability: number
    genre?: GenreAnalysis

    sections: DJSection[]
    phrases: DJPhrase[]

    cuePoints: DJCuePoints

    vocalActivity: ActivityTimeline
    drumActivity: ActivityTimeline
    bassActivity: ActivityTimeline
    harmonicActivity: ActivityTimeline

    analysisConfidence: AnalysisConfidence

    tracker?: TrackerMixAnalysis
}
```

This should become the canonical input to all higher-level DJ decisions.

---

# 4. Gate B — Analysis Correctness

Before adding sophisticated DJ behavior, make sure the existing analysis is trustworthy.

## BPM

Improve BPM confidence and detection.

Handle:

- half-time
- double-time
- ambiguous BPM
- tracker tempo
- tempo changes
- intro sections with weak rhythm
- breakdowns
- syncopation

Do not assume the first detected BPM is always correct.

Represent alternatives when confidence is low.

```ts
interface TempoHypothesis {
    bpm: number
    confidence: number
    relationship?: "normal" | "half" | "double"
}
```

## Key

Do not treat key as simply:

```text
known / unknown
```

Use:

```text
key
confidence
mode
possible alternatives
local key changes
```

Unknown should mean:

> "We don't know."

It should not automatically mean:

> "This track clashes."

## Loudness

Separate:

- integrated loudness
- short-term loudness
- peak
- true peak where available
- dynamic range
- crest factor

## Energy

Energy must stop being synonymous with RMS loudness.

Calculate or estimate:

- bass energy
- drum energy
- transient density
- spectral brightness
- harmonic density
- vocal presence
- rhythmic density
- arrangement density
- perceived intensity

---

# 5. Gate C — Real Beat Grid

Professional mixing requires phase accuracy.

Create a real beat grid:

```ts
interface BeatGrid {
    bpm: number
    firstBeat: number
    beats: Beat[]
    confidence: number
}
```

And:

```ts
interface DownbeatGrid {
    bars: Bar[]
    meter: Meter
    confidence: number
}
```

The system must distinguish:

- first detected transient
- first musical beat
- first downbeat
- first full bar
- first usable mixing point

Do not assume:

```text
first detected beat = bar 1
```

This is particularly important for:

- anacrusis
- pickups
- long intros
- syncopated material
- tracker compositions
- unusual arrangements

---

# 6. Gate D — Musical Structure

Build section and phrase detection.

## Sections

Identify likely:

- intro
- groove
- verse
- build
- pre-drop
- drop
- chorus
- breakdown
- bridge
- outro
- silence
- fill
- instrumental
- vocal-heavy section
- drum-only section
- bass-only section

The names can be probabilistic.

The important thing is that the planner understands **musical function**.

## Phrases

Detect:

- 4-bar phrases
- 8-bar phrases
- 16-bar phrases
- phrase boundaries
- repeated phrase patterns
- arrangement changes

Phrase length should not be hard-coded globally.

Use the song's detected structure.

---

# 7. Gate E — Semantic Cue Points

Stop starting every incoming track at `0:00`.

This is one of the most important improvements.

Create semantic cue points:

```ts
interface DJCuePoints {
    introStart?: number
    firstBeat?: number
    firstFullGroove?: number
    firstDrums?: number
    firstBass?: number
    firstVocal?: number
    firstHook?: number
    firstDrop?: number
    firstBreak?: number

    bestMixIn?: number
    bestMixOut?: number

    outroStart?: number
    outroGroove?: number
    finalBeat?: number
}
```

The incoming deck should normally begin at a musically useful position rather than blindly at the beginning.

Examples:

### Track A → Track B

If B has:

```text
0:00 atmospheric intro
0:24 drums
0:40 bass
1:12 vocal
1:44 first drop
```

the DJ should be able to decide:

```text
start B at 0:24
```

rather than:

```text
start B at 0:00
```

depending on the transition strategy.

---

# 8. Gate F — Multi-Track Set Planning

Replace the current greedy Smart Sort approach.

The current model effectively asks:

> Which track is closest to the current track?

A professional DJ asks:

> Which track makes the most sense as part of the next several moves in the set?

Implement:

```ts
DJSetPlanner
```

with a forward-looking search.

Use approximately:

```text
3–6 track lookahead
```

initially.

A beam-search or bounded search approach is preferable to exhaustive search.

---

# 9. Set Planning Score

Score candidate sequences using multiple dimensions.

Example:

```ts
score =
    harmonicCompatibility
  + tempoCompatibility
  + phraseCompatibility
  + energyArcFit
  + sectionCompatibility
  + introOutroCompatibility
  + drumCompatibility
  + bassCompatibility
  + vocalCompatibility
  + genreCompatibility
  + textureCompatibility
  + novelty
  + setNarrative
  - repetition
  - awkwardness
  - risk
```

Weights should be configurable and style-dependent.

Do not make one enormous opaque score.

Keep components observable.

---

# 10. Session Order Must Be Separate From User Playlist

Smart sorting should not destructively reorder the user's playlist.

Maintain:

```ts
userPlaylist
```

separately from:

```ts
sessionOrder
```

This allows Auto DJ to construct a performance sequence without changing the user's underlying collection.

The user should always be able to recover the original playlist order.

---

# 11. Gate G — Set Energy Arc

A professional set has a shape.

Model the session state:

```ts
type SetEnergyPhase =
    | "OPENING"
    | "BUILDING"
    | "CRUISING"
    | "PEAKING"
    | "PEAK"
    | "RELEASE"
    | "RECOVERY"
    | "CLOSING"
```

The planner should know:

- current energy
- recent energy trend
- desired energy
- peak history
- time since last peak
- recent releases
- upcoming opportunities

Avoid:

```text
track energy = set energy
```

A set can use a low-energy track immediately after a high-energy track deliberately.

---

# 12. Gate H — Tempo and Key Solver

Create:

```text
DJTempoKeySolver
```

Its job is to decide whether to:

- beatmatch
- use half-time relationship
- use double-time relationship
- pitch slightly
- use a tempo bridge
- avoid the transition
- use a creative tempo jump

Do not treat large pitch offsets as normal.

Recommended conceptual ranges:

```text
normal:     approximately ±4–8%
creative:   approximately ±8–12%
extreme:    only when musically justified
```

The exact limits should remain configurable.

---

# 13. Key Lock Strategy

Key matching should be confidence-aware.

Use:

```text
known + high confidence
known + low confidence
unknown
```

A high-confidence harmonic clash should matter much more than an uncertain key.

Consider:

- Camelot compatibility
- relative major/minor
- semitone relationships
- modal compatibility
- local key
- bass/harmonic density
- whether the transition is short enough for harmonic conflict to matter

Key lock should be a decision, not a permanent assumption.

---

# 14. Local Key Timeline

Whole-track key is insufficient.

Create optional:

```ts
interface KeySegment {
    start: number
    end: number
    key: MusicalKey
    confidence: number
}
```

This allows the planner to know that:

```text
Track B intro = neutral
Track B verse = Am
Track B chorus = C
```

rather than assuming the entire track is one key.

---

# 15. Gate I — Transition Planning

Create:

```ts
DJTransitionPlanner
```

The planner should produce a complete transition plan before execution.

Example:

```ts
interface DJTransitionPlan {
    outgoingDeck: DeckId
    incomingDeck: DeckId

    startBeat: number
    endBeat: number

    incomingPosition: number

    durationBars: number

    tempoPlan: TempoPlan
    keyPlan: KeyPlan

    crossfadePlan: CrossfadePlan
    eqPlan: EQPlan
    filterPlan: FilterPlan
    bassPlan: BassHandoverPlan

    effects: DJEffectEvent[]

    confidence: number
    risk: TransitionRisk
}
```

The executor should execute the plan.

It should not invent the plan while executing.

---

# 16. Adaptive Transition Length

Do not restrict every transition to a fixed set of lengths.

Current values such as:

```text
2 / 4 / 8 / 16 / 32 bars
```

can remain useful as candidate lengths.

But the planner should select length based on:

- phrase structure
- intro/outro length
- energy
- vocal density
- harmonic compatibility
- genre
- drum compatibility
- set phase
- transition style
- risk

Examples:

### Long blend

Use when:

- drums are compatible
- bass can be handed over cleanly
- harmonic content is compatible
- incoming intro is useful

### Short blend

Use when:

- outgoing track is approaching a drop
- incoming track has strong identity
- vocals conflict
- energy needs to change quickly

### Immediate transition

Use only when:

- musically justified
- deliberately selected
- safe

---

# 17. Gate J — DJ Transition Vocabulary

Build a real transition vocabulary.

Candidate transition styles:

```text
longBlend
shortBlend
bassSwap
EQSwap
filterBuild
filterRelease
echoOut
reverbOut
delayThrow
loopExit
breakdownMix
dropMix
drumIntroMix
vocalSwap
percussionSwap
hardCut
tempoBridge
doubleTimeJump
halfTimeJump
```

The planner should select transitions based on context.

Do not simply randomize transition types.

---

# 18. True Echo-Out

Verify and implement a genuine echo-out.

The desired behavior is:

```text
outgoing audio
      ↓
echo/feedback increases
      ↓
dry signal decreases
      ↓
echo tail remains
      ↓
incoming track enters
      ↓
echo tail decays
```

It should not merely:

```text
crossfade outgoing
then apply echo
```

The effect needs to be temporally integrated into the transition.

---

# 19. Continuous Filter Automation

Filter transitions should be continuous.

Avoid:

```text
filter = X
wait
filter = Y
```

Instead:

```text
start cutoff
    ↓
automation curve
    ↓
musical endpoint
```

Support:

- high-pass sweep
- low-pass sweep
- resonant build
- release
- filter + EQ combination

Automation should be phrase-aware.

---

# 20. Gate K — DJ EQ Intelligence

Current bass swapping is too simplistic.

A professional bass swap is not simply:

```text
cut outgoing lows by 12 dB at midpoint
```

Implement frequency-aware handover.

Conceptually:

```text
outgoing bass
████████████████

incoming bass
        ████████████████
```

The transition should determine:

- which track owns the low end
- when ownership changes
- whether both basses can coexist
- whether one track is bass-heavy
- whether the incoming kick is stronger
- whether the outgoing bass is still musically necessary

---

# 21. Bass Ownership

Create explicit state:

```ts
type BassOwner =
    | "OUTGOING"
    | "INCOMING"
    | "SHARED"
    | "NEUTRAL"
```

Then plan the handover.

Example:

```text
bar 1–4:
OUTGOING

bar 5:
SHARED

bar 6:
INCOMING
```

The exact curve should be continuous.

---

# 22. Gain Staging

Prevent loudness pumping.

Normalize and control:

- deck gain
- master gain
- transition gain
- EQ boosts
- FX returns

A transition should not sound louder merely because two tracks overlap.

Monitor:

```text
integrated loudness
short-term loudness
true peak
low-frequency accumulation
```

---

# 23. Gate L — Creative Transition Planning

Creative transitions should be deliberate.

Examples:

### Drop Mix

Bring incoming track in exactly around a structural drop.

### Breakdown Mix

Use an outgoing breakdown as the transition window.

### Drum Intro Mix

Mix incoming drums underneath an outgoing melodic section.

### Vocal Swap

Avoid simultaneous competing vocals.

### Bass Swap

Transfer low-frequency ownership at a phrase boundary.

### Echo Out

Use a phrase-ending vocal or stab as the echo source.

### Filter Build

Use a controlled filter rise into the incoming section.

### Tempo Bridge

Use a deliberately chosen intermediate track to move BPM.

---

# 24. Deliberate Cuts

Hard cuts should exist, but they must be exceptional.

Create:

```ts
interface CutCandidate {
    beat: number
    reason:
        | "drop"
        | "silence"
        | "phraseBoundary"
        | "impact"
        | "emergency"
    confidence: number
}
```

A hard cut should generally require:

- strong structural justification
- sufficient confidence
- compatible musical moment

Never use hard cuts as a fallback for poor analysis unless explicitly classified as emergency behavior.

---

# 25. Gate M — Tracker-Native Intelligence

This is particularly important for DEViLBOX.

The DJ engine currently renders tracker material to audio for playback.

Do not throw away the tracker structure.

Maintain a separate:

```ts
TrackerMixAnalysis
```

alongside the rendered audio analysis.

It should expose things such as:

- order positions
- pattern boundaries
- channel activity
- instrument changes
- sample usage
- note density
- bass channel activity
- drum channel activity
- melody activity
- pattern changes
- fills
- breaks
- instrument entrances
- instrument exits
- repeating phrases
- silence
- structural transitions

---

# 26. Tracker Channel Awareness

The DJ should understand things such as:

```text
channels 1–2 = drums
channel 3 = bass
channel 4 = melody
```

when the tracker structure supports that conclusion.

But do not assume channel identity is permanent.

Channels may change character throughout a song.

Use time-varying classification:

```ts
interface TrackerChannelSegment {
    channel: number

    start: number
    end: number

    instrumentFamily?: InstrumentFamily
    musicalFunction?: MusicalFunction
    rhythmicRole?: RhythmicRole
    register?: Register

    importance: number
    density: number
    confidence: number
}
```

This lets the DJ understand:

```text
channel 4:
0:00–1:00 percussion
1:00–1:32 bass
1:32–2:00 lead
```

instead of treating channel 4 as permanently "lead."

---

# 27. Tracker Mix Events

Generate semantic events such as:

```text
DRUM_ENTRY
BASS_ENTRY
BASS_EXIT
MELODY_ENTRY
INSTRUMENT_ENTRY
INSTRUMENT_EXIT
PATTERN_CHANGE
FILL
BREAK
DROP
DENSITY_INCREASE
DENSITY_DECREASE
SILENCE
REPEATED_PHRASE
```

These events become available to the transition planner.

This is especially useful for tracker material where conventional audio analysis can be ambiguous.

---

# 28. Gate N — Performance Memory

A human DJ remembers what happened recently.

Create:

```ts
DJSessionMemory
```

Track:

- recent tracks
- recent artists
- recent keys
- recent BPMs
- recent transition types
- recent FX
- recent energy
- recent cuts
- recent bass swaps
- recent vocals
- recent transition lengths
- recent peaks
- repeated tracks
- repeated transition patterns

---

# 29. Repetition Avoidance

Avoid:

```text
bass swap
bass swap
bass swap
bass swap
```

and:

```text
echo out
echo out
echo out
```

and:

```text
8-bar blend
8-bar blend
8-bar blend
```

unless the style deliberately calls for repetition.

The DJ should develop a recognizable but varied performance vocabulary.

---

# 30. DJ Style Profiles

Support high-level DJ personalities.

Examples:

```text
Smooth
Club
Aggressive
Dub
Progressive
Classic
Experimental
Minimal
Festival
Radio
```

A style should affect:

- transition length
- risk tolerance
- energy movement
- FX usage
- bass behavior
- key strictness
- tempo tolerance
- cut frequency
- repetition tolerance
- phrase strictness

Do not implement these as completely separate engines.

They should modify planner weights.

---

# 31. Humanization

Humanization should be subtle.

Current late-only timing variation should remain small.

Do not introduce random timing errors that damage beat alignment.

Humanization should affect things like:

- tiny transition timing variation
- subtle FX timing variation
- occasional transition-length variation
- controlled choice variation

It should never override:

- phrase alignment
- beat alignment
- bass handover
- hard safety constraints

---

# 32. Gate O — Anticipatory Planning

The DJ should prepare the next transition before it happens.

While Track A is playing:

```text
analyze current position
        ↓
evaluate next tracks
        ↓
select likely next track
        ↓
preload
        ↓
analyze incoming structure
        ↓
select mix-in point
        ↓
select transition
        ↓
wait for execution window
```

Do not wait until the exact transition moment to make every decision.

---

# 33. Smart Preload

Use more intelligent preload timing than a fixed lead time alone.

Preload should consider:

- track size
- analysis availability
- decoding time
- device performance
- transition confidence
- distance to mix point

Maintain enough safety margin to prevent late loading.

---

# 34. Gate P — Performance Context

Create a centralized context object.

```ts
interface DJPerformanceContext {
    currentDeck: DeckState
    incomingDeck?: DeckState

    currentTrack: DJTrackAnalysis
    incomingTrack?: DJTrackAnalysis

    currentPosition: number
    currentBeat: number
    currentBar: number
    currentPhrase?: DJPhrase

    setEnergy: number
    targetEnergy: number
    setPhase: SetEnergyPhase

    recentHistory: DJSessionMemory

    candidateTracks: DJTrackCandidate[]

    transition?: DJTransitionPlan

    confidence: number
}
```

This prevents every subsystem from independently reconstructing the current state.

---

# 35. Gate Q — Confidence-Aware DJing

Every important analysis should have confidence.

Examples:

```text
BPM confidence
beat-grid confidence
downbeat confidence
key confidence
section confidence
cue confidence
vocal confidence
bass confidence
tracker confidence
```

Decision policy:

```text
high confidence
    → sophisticated behavior allowed

medium confidence
    → conservative behavior

low confidence
    → robust fallback
```

Do not attempt clever transitions when the system does not know where the beat is.

---

# 36. Transition Risk

Represent risk explicitly.

```ts
interface TransitionRisk {
    harmonic: number
    tempo: number
    phrase: number
    bass: number
    vocal: number
    loudness: number
    technical: number

    overall: number
}
```

Risk should influence:

- whether a transition is chosen
- how long it is
- how much FX are used
- whether a fallback is prepared

---

# 37. Reversible Transition Planning

Before executing a complex transition, maintain a safe fallback.

Example:

```text
preferred:
    breakdownMix

fallback:
    longBlend

emergency:
    clean crossfade
```

If analysis or execution becomes unreliable:

```text
preferred
    ↓
fallback
    ↓
safe transition
```

Never allow creative logic to compromise continuity.

---

# 38. Gate R — Failure Resilience

The system must survive:

- preload failure
- decode failure
- analysis failure
- missing key
- missing beat grid
- malformed tracker data
- unavailable cue point
- deck failure
- effect failure
- unexpected track length
- extremely short tracks
- silence
- transition timeout

Fallback hierarchy:

```text
ideal transition
        ↓
safe phrase transition
        ↓
safe crossfade
        ↓
emergency continuity action
```

Avoid hard cuts caused by software failure.

---

# 39. Gate S — Long-Set Intelligence

World-class performance must survive hours, not merely individual transitions.

Test:

```text
30 minutes
1 hour
2 hours
4 hours
```

Measure:

- transition quality
- energy coherence
- repetition
- key conflicts
- tempo drift
- loudness drift
- transition variety
- track diversity
- CPU stability
- memory usage
- preload failures
- analysis failures

---

# 40. Long-Set Narrative

The planner should understand the set as a sequence.

Track:

```text
where have we been?
where are we now?
where should we go?
```

Use:

- recent history
- medium-term trajectory
- long-term trajectory

Do not let every transition optimize only for the next track.

---

# 41. Gate T — Transition Quality Scoring

Create an offline evaluator.

Every transition can receive:

```ts
interface TransitionQuality {
    beatAlignment: number
    phraseAlignment: number
    harmonicCompatibility: number
    tempoStability: number
    bassHandover: number
    loudnessConsistency: number
    structuralFit: number
    creativity: number
    smoothness: number
    surprise: number
    overall: number
}
```

This enables objective regression testing.

---

# 42. Golden Transition Corpus

Create a collection of known-good transitions.

Include examples of:

- long blend
- bass swap
- breakdown mix
- drop mix
- drum intro
- vocal swap
- echo out
- filter build
- filter release
- tempo bridge
- deliberate cut

Use them as regression tests.

---

# 43. Automated Invariants

Examples:

### Beat invariant

Incoming track must not drift audibly against outgoing track during beatmatched mixing.

### Phrase invariant

Transitions should normally begin/end at valid musical boundaries.

### Bass invariant

Do not leave both bass-heavy tracks fully exposed unnecessarily.

### Loudness invariant

Do not create major accidental loudness spikes.

### Failure invariant

A failed creative transition must not stop playback.

### Playlist invariant

Smart sorting must not destructively reorder the user's playlist.

### Confidence invariant

Low-confidence analysis must not trigger high-risk behavior.

---

# 44. Debug / Telemetry View

Create an Auto DJ debug view showing:

```text
CURRENT TRACK
BPM
KEY
KEY CONFIDENCE
ENERGY
SET PHASE
CURRENT BAR
CURRENT PHRASE

NEXT TRACK
BPM
KEY
ENERGY
MIX-IN POINT
MIX-OUT POINT

TRANSITION
TYPE
LENGTH
TEMPO PLAN
KEY PLAN
BASS PLAN
EQ PLAN
FILTER PLAN

CONFIDENCE
RISK

WHY THIS TRACK?
WHY THIS TRANSITION?
```

The most important feature is explainability.

Example:

```text
Next track selected because:

+ compatible key
+ +3 BPM
+ energy rise matches set trajectory
+ strong 16-bar drum intro
+ outgoing vocal ends at phrase boundary
+ bass handover confidence 0.91
- moderate repetition risk
```

---

# 45. "Why Did You Do That?" Logging

Every autonomous decision should be explainable in structured logs.

Example:

```ts
{
    decision: "SELECT_NEXT_TRACK",

    selectedTrack: "track-b",

    reasons: [
        "harmonicCompatibility",
        "phraseCompatibility",
        "energyArcFit",
        "strongMixIn"
    ],

    rejectedAlternatives: [
        {
            track: "track-c",
            reason: "highVocalConflict"
        }
    ]
}
```

This will dramatically improve tuning.

---

# 46. Gate U — Musical Mix-Point Intelligence

The system should distinguish between:

```text
technically possible
```

and:

```text
musically appropriate
```

A track may be technically mixable from 0:00 but musically terrible.

Prefer mix points where:

- phrase begins
- drums enter
- bass enters
- outgoing phrase ends
- vocals are absent
- harmonic density is compatible
- arrangement is stable

---

# 47. Vocal Conflict Avoidance

When vocal detection is available:

Avoid:

```text
vocal A
+
vocal B
```

unless deliberately chosen.

Prefer:

```text
vocal A
↓
instrumental transition
↓
vocal B
```

This should strongly influence transition timing.

---

# 48. Drum Compatibility

Determine whether drum patterns can coexist.

Examples:

```text
four-on-floor + four-on-floor
```

usually works.

But:

```text
complex breakbeat
+
dense four-on-floor
```

may require:

- shorter overlap
- EQ reduction
- percussion swap
- breakdown transition

---

# 49. Bass Compatibility

Bass should be analyzed independently from overall energy.

Two tracks can both be:

```text
medium energy
```

but both have:

```text
huge sub bass
```

which makes a direct overlap dangerous.

Use low-frequency spectral analysis and bass activity timelines.

---

# 50. Spectral Compatibility

Use spectral information to detect:

- brightness mismatch
- muddy overlap
- excessive high-frequency density
- excessive low-frequency density
- conflicting midrange

But keep this subordinate to musical reasoning.

Spectral similarity alone should never decide the transition.

---

# 51. Loop Intelligence

Later-stage capability:

Create intelligent temporary loops.

Potential uses:

- extend an intro
- extend an outro
- wait for a better phrase
- hold a breakdown
- bridge BPM
- create a transition window

Looping should be structure-aware.

Do not loop arbitrary audio blindly.

---

# 52. Cue-Jump Intelligence

Later-stage capability:

Allow the DJ to jump to:

- drop
- breakdown
- hook
- outro
- drum section

only when musically justified.

Cue jumps should be treated as high-risk actions.

---

# 53. Energy-Driven FX

Effects should support the musical goal.

Do not randomly add effects.

Examples:

```text
build
→ filter rise

phrase ending
→ delay throw

vocal ending
→ echo out

breakdown
→ reverb expansion

drop
→ clean release
```

FX are punctuation, not decoration.

---

# 54. Creative Risk Budget

Add a session-level risk budget.

For example:

```ts
creativeRisk = 0..1
```

Higher risk permits:

- shorter transitions
- larger tempo changes
- more FX
- deliberate cuts
- unusual harmonic moves
- stronger energy jumps

Lower risk favors:

- long blends
- safe keys
- conservative BPM
- minimal FX

Risk should be style-dependent.

---

# 55. Avoid "AI Randomness"

Never solve unpredictability by adding randomness everywhere.

Bad:

```ts
if (Math.random() < 0.3) {
    echoOut()
}
```

Good:

```text
phrase ending
+
vocal exit
+
echo-friendly material
+
style permits FX
+
recent FX history says not overused
+
transition risk acceptable
=
echo out is appropriate
```

Variation should emerge from musical context.

---

# 56. Existing Auto DJ State Machine

Preserve the useful state-machine concepts:

```text
playing
preloading
transition pending
transitioning
failure
```

But move high-level intelligence out of the state machine.

The state machine should answer:

```text
what execution state are we in?
```

The planner should answer:

```text
what should we do?
```

---

# 57. DJSessionController

Introduce a coordinator responsible for:

- current performance state
- planning cadence
- candidate evaluation
- preload scheduling
- transition scheduling
- session memory
- failure fallback
- long-term set state

It should not contain all musical heuristics itself.

---

# 58. DJSetPlanner

Responsibilities:

```text
candidate generation
sequence planning
energy trajectory
track diversity
harmonic trajectory
tempo trajectory
repetition avoidance
set narrative
```

It should not directly manipulate deck audio.

---

# 59. DJTransitionPlanner

Responsibilities:

```text
mix point
phrase alignment
transition type
transition length
tempo
key
EQ
filter
bass
FX
risk
fallback
```

---

# 60. DJTransitionExecutor

Responsibilities:

```text
load deck
seek
start
tempo
pitch
crossfade
EQ
filter
effects
bass handover
stop old deck
recover failure
```

It should execute plans generated elsewhere.

---

# 61. Separation of Analysis and Execution

Never make audio execution responsible for discovering musical structure.

Bad:

```text
executor sees current position
executor guesses transition
executor modifies EQ
executor guesses bass
```

Good:

```text
analysis
    ↓
performance context
    ↓
planner
    ↓
transition plan
    ↓
executor
```

---

# 62. Gate V — Full Autonomous Performance

Run the system without human intervention.

Test:

```text
10 tracks
25 tracks
50 tracks
100 tracks
```

Evaluate:

- musical continuity
- transition variety
- energy trajectory
- harmonic quality
- tempo stability
- bass quality
- vocal handling
- structural timing
- repetition
- failure handling

---

# 63. Human-Listener Evaluation

Technical metrics are not enough.

Have experienced listeners evaluate:

1. Would you believe a human DJ made this mix?
2. Are transitions musically timed?
3. Is the set coherent?
4. Does it become repetitive?
5. Does the energy arc feel intentional?
6. Are FX tasteful?
7. Does bass remain controlled?
8. Do vocals clash?
9. Are there moments of surprise?
10. Does the DJ appear to "listen" to the music?

---

# 64. World-Class Acceptance Criteria

Auto DJ is not complete because every technical test passes.

It is complete when listeners consistently report that:

- transitions feel intentional
- tracks enter at appropriate musical moments
- phrase alignment feels natural
- bass changes sound like a real DJ
- energy rises and falls naturally
- vocals rarely collide
- FX appear purposeful
- transitions are varied
- the set has a narrative
- the DJ occasionally surprises them
- the system knows when to wait
- the system recovers gracefully
- the set remains coherent over long durations

---

# 65. Implementation Order

Do not attempt every feature simultaneously.

Recommended sequence:

```text
1. Baseline / regression harness

2. Unified DJTrackAnalysis

3. Beat/downbeat correctness

4. Phrase and section detection

5. Semantic cue points

6. Incoming deck position / mix-in intelligence

7. Tempo and key solver

8. DJPerformanceContext

9. DJSetPlanner

10. Multi-track lookahead

11. DJTransitionPlanner

12. Adaptive transition lengths

13. EQ / bass ownership

14. Continuous filter automation

15. True echo/reverb/delay transitions

16. Vocal / drum / bass compatibility

17. TrackerMixAnalysis

18. Session memory

19. Set energy arc

20. Transition risk

21. Failure fallback hierarchy

22. Long-set optimization

23. Creative transitions

24. Loop intelligence

25. Cue-jump intelligence

26. Evaluation corpus

27. Human listening evaluation
```

---

# 66. Phase Gates

## Gate A — Baseline

Must have:

- deterministic test corpus
- transition logs
- regression playback

---

## Gate B — Analysis

Must have:

- reliable BPM
- confidence
- key confidence
- loudness
- spectral data
- rhythmic data
- bass data

---

## Gate C — Beat Grid

Must have:

- beat positions
- downbeats
- meter
- confidence
- phrase synchronization

---

## Gate D — Structure

Must have:

- sections
- phrases
- arrangement events

---

## Gate E — Cue Points

Must have:

- semantic mix-in
- semantic mix-out
- first groove
- first bass
- first drums
- first vocal
- drop
- breakdown
- outro

---

## Gate F — Set Planner

Must have:

- multi-track lookahead
- energy arc
- harmonic planning
- tempo planning
- repetition control

---

## Gate G — Transition Planner

Must have:

- complete transition plans
- adaptive lengths
- transition vocabulary
- risk/confidence

---

## Gate H — DJ EQ

Must have:

- bass ownership
- bass handover
- gain staging
- continuous EQ automation

---

## Gate I — Creative Mixing

Must have:

- real echo out
- filter builds
- breakdown transitions
- drop transitions
- drum intros
- vocal swaps

---

## Gate J — Tracker Intelligence

Must have:

- tracker structure retained
- pattern/order awareness
- channel analysis
- instrument activity
- semantic tracker events

---

## Gate K — Memory

Must have:

- transition history
- FX history
- energy history
- repetition control
- style behavior

---

## Gate L — Long Performance

Must pass:

- 1-hour
- 2-hour
- 4-hour sessions

without degradation.

---

## Gate M — Resilience

Must survive:

- preload failure
- analysis failure
- missing key
- missing beat grid
- malformed content
- deck failure
- effect failure

without stopping playback.

---

## Gate N — World-Class Acceptance

Must pass:

- automated evaluation
- golden transition corpus
- human listening tests
- long-set evaluation

The final question is:

> Does this sound like a professional DJ making decisions about music, or like software executing a transition timer?

Only the former passes.

---

# 67. Important Architectural Constraints

Do not:

- create a second deck system
- create a second mixer
- create a second transport
- duplicate existing playback infrastructure
- duplicate preload infrastructure
- duplicate FX infrastructure
- destroy the user's playlist order
- treat every track as a single global BPM/key/energy value
- treat every tracker channel as a permanent instrument
- use randomness as a substitute for musical reasoning
- allow low-confidence analysis to trigger high-risk behavior
- make `DJAutoDJ.ts` into a giant heuristic file

Reuse existing execution primitives.

Add intelligence above them.

---

# 68. Final Target Architecture

```text
                         ┌─────────────────────┐
                         │       DJAutoDJ      │
                         └──────────┬──────────┘
                                    │
                                    ▼
                       ┌────────────────────────┐
                       │  DJSessionController   │
                       └───────────┬────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
       DJPerformanceContext   DJSessionMemory     DJTrackAnalysis
              │                                         │
              │                                         ├── Beat Grid
              │                                         ├── Sections
              │                                         ├── Phrases
              │                                         ├── Cue Points
              │                                         ├── Energy
              │                                         ├── Bass
              │                                         ├── Vocals
              │                                         ├── Key Timeline
              │                                         └── Tracker Analysis
              │
              ▼
        ┌───────────────┐
        │ DJSetPlanner  │
        └───────┬───────┘
                │
                ▼
     ┌──────────────────────┐
     │ DJTransitionPlanner  │
     └──────────┬───────────┘
                │
       ┌────────┼────────┐
       │        │        │
       ▼        ▼        ▼
     Tempo     Key      Structure
     Solver    Solver    Solver
       │        │        │
       └────────┼────────┘
                │
                ▼
       DJTransitionPlan
                │
                ▼
      DJTransitionExecutor
                │
                ▼
       Existing Deck/Mixer
```

---

# 69. Core Philosophy

The ultimate architecture should follow:

```text
MUSIC
  ↓
LISTEN
  ↓
UNDERSTAND
  ↓
ANTICIPATE
  ↓
FORM INTENTION
  ↓
CHOOSE TRACK
  ↓
CHOOSE MIX POINT
  ↓
CHOOSE TRANSITION
  ↓
EXECUTE
  ↓
HEAR CONSEQUENCE
  ↓
ADAPT
  ↓
CONTINUE OR REST
```

Not:

```text
timer
  ↓
next track
  ↓
crossfade
  ↓
repeat
```

---

# 70. Definition of Done

The Auto DJ implementation is complete when it can:

- analyze tracks deeply
- understand beat and phrase position
- understand musical sections
- identify useful mix points
- start incoming tracks at musically appropriate positions
- maintain phase alignment
- match tempo intelligently
- make confidence-aware key decisions
- manage bass ownership
- avoid vocal conflicts
- control loudness
- select tracks several steps ahead
- shape a coherent energy arc
- vary transitions naturally
- use FX as musical punctuation
- understand tracker structure
- remember recent behavior
- avoid repetitive patterns
- take controlled creative risks
- know when to wait
- recover safely
- run for hours
- explain its decisions
- pass automated transition tests
- pass human listening tests

The final standard is not:

> "Does Auto DJ transition automatically?"

The final standard is:

> **"If I heard this mix without seeing DEViLBOX, would I believe a skilled human DJ was performing it?"**

That is the target.