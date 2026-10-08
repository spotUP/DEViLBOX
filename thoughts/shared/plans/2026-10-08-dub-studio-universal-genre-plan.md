---
date: 2026-10-08
topic: Dub Studio - universal genre dub performance (owner-supplied plan)
tags: [dub, auto-dub, plan]
status: draft
---

# DEViLBOX DUB STUDIO — UNIVERSAL GENRE DUB PERFORMER IMPLEMENTATION PLAN

## Objective

Transform the existing DEViLBOX Dub Studio from a predominantly **dub-reggae-oriented performer** into a **genre-agnostic live dub performer** capable of musically dubbing essentially any source music.

The target is not to make every genre sound like reggae with different source material.

The target is:

> **The performer should understand the musical identity of the source and apply dub techniques that make musical sense for that identity.**

A techno track should be dubbed like techno.

A hip-hop track should be dubbed like hip-hop.

A drum & bass track should be dubbed like drum & bass.

A jazz track should be dubbed like jazz.

An ambient track should be dubbed like ambient.

A metal track should be dubbed like metal.

A pop song should be dubbed like pop.

A house track should be dubbed like house.

A reggae track should still be dubbed like reggae.

The Dub Studio therefore becomes a **musical interpretation engine**, not a reggae-effect machine.

---

# 1. Core Principle

The existing Dub Studio already has the important execution layer.

It has:

- DubRouter
- DubMove
- DubBus DSP
- per-channel routing
- MIDI
- keyboard/pads
- MCP
- DubRecorder
- DubLanePlayer
- tracker integration
- DJ Auto Dub
- approximately 43 existing Dub moves
- existing persona infrastructure
- existing safety governors
- existing wet/dry execution primitives

Do not replace this infrastructure.

Do not create:

- a second router
- a second transport
- a second move execution system
- a second lane player
- a generic new DSP engine

The existing moves are the **hands**.

The new system is the **musical brain**.

---

# 2. The Critical Architectural Change

Current conceptual model:

```text
persona
    ↓
dub move
    ↓
reggae-style performance
```

Target model:

```text
SOURCE MUSIC
    ↓
LISTEN
    ↓
ANALYZE
    ↓
UNDERSTAND MUSICAL IDENTITY
    ↓
UNDERSTAND CURRENT MOMENT
    ↓
UNDERSTAND WHAT IS IMPORTANT
    ↓
CHOOSE DUB INTENTION
    ↓
CHOOSE TARGET
    ↓
CHOOSE APPROPRIATE MOVE
    ↓
EXECUTE
    ↓
HEAR CONSEQUENCE
    ↓
ADAPT
```

The persona should no longer answer:

> "What reggae trick should I do?"

It should answer:

> "What would a great dub engineer/performance artist do to this particular music right now?"

---

# 3. Preserve the Existing Single Execution Path

All autonomous genre-aware behavior must ultimately execute through:

```text
DubRouter.fire()
```

The new system should produce intentions/plans that resolve to existing moves.

Example:

```text
Genre-aware intention:
    "Create a brief rhythmic vacuum before the next drum impact."

Target:
    drum bus

Move:
    filterDrop

Timing:
    next phrase boundary

Duration:
    1 bar

Wet budget:
    low

Risk:
    low
```

Then:

```text
DubRouter.fire(...)
```

Do not create a parallel:

```text
UniversalDubRouter
```

or:

```text
GenreDubEngine
```

that bypasses existing routing.

---

# 4. What "Genre-Aware Dub" Means

Genre awareness must exist across several independent dimensions.

At minimum:

```text
GENRE
SUBGENRE
TEMPO
METER
GROOVE
RHYTHMIC ROLE
INSTRUMENT FAMILY
MUSICAL FUNCTION
REGISTER
DENSITY
ENERGY
HARMONIC ACTIVITY
VOCAL ACTIVITY
BASS ACTIVITY
DRUM ACTIVITY
ARRANGEMENT STATE
PHRASE POSITION
TEXTURAL DENSITY
REPETITION
TRANSIENT DENSITY
SOURCE IMPORTANCE
```

Do not collapse all of this into one:

```ts
genre: "techno"
```

---

# 5. Genre Is a Prior, Not a Prison

The performer should never assume:

```text
genre = techno
therefore always use techno rules
```

Instead:

```text
genre prior
+
observed music
+
confidence
+
current section
+
current event
+
persona
=
performance decision
```

If metadata says:

```text
genre = techno
```

but the current section behaves like a sparse ambient breakdown, the performer should respond to the actual music.

---

# 6. Genre Classification

Create:

```ts
DubGenreProfile
```

and:

```ts
DubGenreInference
```

Example:

```ts
interface DubGenreInference {
    primaryGenre: DubGenre
    secondaryGenres: DubGenre[]
    confidence: number

    rhythmicProfile: RhythmicProfile
    harmonicProfile: HarmonicProfile
    textureProfile: TextureProfile
    arrangementProfile: ArrangementProfile

    evidence: GenreEvidence[]
}
```

The classifier should be probabilistic.

Example:

```text
Techno          0.72
Electro         0.14
House           0.08
Ambient         0.04
Other           0.02
```

Do not force a single absolute genre when evidence is weak.

---

# 7. Metadata + Structure + Audio

Genre inference should use three sources.

## A. Metadata

Use:

- user-selected genre
- file metadata
- tracker metadata
- playlist metadata
- known engine/style metadata

## B. Musical structure

Analyze:

- BPM
- meter
- swing
- kick pattern
- snare/backbeat
- bass rhythm
- syncopation
- phrase length
- section structure
- harmonic rhythm
- vocal density
- instrument families

## C. Rendered audio

Analyze:

- spectral balance
- transient density
- low-frequency behavior
- rhythmic periodicity
- harmonic density
- dynamic range
- texture
- noise
- stereo characteristics

Metadata should be authoritative when explicitly supplied by the user.

Automatic inference fills gaps.

---

# 8. Genre Profile Architecture

Create a data-driven profile.

```ts
interface DubGenreProfile {
    id: string
    family: string
    subgenre?: string

    tempoRange?: [number, number]
    meterPreferences: MeterPreference[]
    phrasePreferences: PhrasePreference[]

    rhythmicGrammar: RhythmicDubGrammar
    bassGrammar: DubBassGrammar
    harmonicGrammar: DubHarmonyGrammar
    textureGrammar: DubTextureGrammar
    arrangementGrammar: DubArrangementGrammar

    targetPreferences: DubTargetPreferences
    movePreferences: DubMovePreferences

    fxPreferences: DubFXPreferences
    restraintProfile: DubRestraintProfile

    riskProfile: DubRiskProfile

    forbiddenMoves?: ForbiddenDubBehavior[]
}
```

The important point:

**The profile describes musical behavior, not just effect presets.**

---

# 9. Do Not Make Genre Profiles Merely FX Presets

Bad:

```text
TECHNO:
delay = 0.7
reverb = 0.5
filter = 0.8
```

Good:

```text
TECHNO:
    favor repetitive loop-level interventions
    favor rhythmic delay synchronization
    preserve kick/sub continuity
    exploit phrase-end transitions
    use filter movement as structural articulation
    avoid destroying the mechanical pulse
    favor restrained interventions during long grooves
    allow larger interventions at arrangement boundaries
```

---

# 10. Universal Dub Vocabulary

The existing 43 moves should remain the primary vocabulary.

Create semantic categories over them.

For example:

```text
SPACE
    ghostReverb
    backwardReverb
    echoThrow
    skankEchoThrow
    skankFloatThrow

RHYTHMIC
    delayTimeThrow
    delayPreset
    springKick
    springSlam
    sonarPing

FILTER
    filterDrop
    hpfRise
    eqSweep
    combSweep
    tubbyScream

TEXTURE
    tapeWobble
    tapeStop
    voltageStarve
    crushBass

ARRANGEMENT
    versionDrop
    riddimSection
    masterDrop

LOW-END
    crushBass
    subSwell

SIGNATURE
    dubSiren
    toast

SOURCE / GENERATED
    oscBass
    etc.
```

The exact grouping should follow the actual current move implementations.

---

# 11. Separate "Move" From "Musical Purpose"

A single move can have different musical meanings.

For example:

```text
delayThrow
```

in reggae may mean:

> send a vocal phrase into a dub echo.

In techno:

> reinforce a repeating synth stab.

In hip-hop:

> throw the end of a vocal phrase or sample.

In ambient:

> extend a texture into the next harmonic space.

In drum & bass:

> create a rapid rhythmic tail around a break.

Therefore the AI should choose:

```text
INTENTION
```

first.

Then:

```text
MOVE
```

---

# 12. Universal Dub Intention Taxonomy

Create intentions such as:

```ts
type DubIntention =
    | "ACCENT"
    | "SPACE"
    | "EXTEND"
    | "REPEAT"
    | "ANSWER"
    | "TRANSITION"
    | "REMOVE"
    | "REINTRODUCE"
    | "THICKEN"
    | "THIN"
    | "DESTABILIZE"
    | "STABILIZE"
    | "BUILD"
    | "RELEASE"
    | "SUSPEND"
    | "RESOLVE"
    | "EMPHASIZE"
    | "CONTRAST"
    | "CALL_RESPONSE"
    | "PUNCTUATE"
    | "TRANSFORM"
    | "RESET"
```

This vocabulary is genre-neutral.

Genre profiles decide how these intentions are expressed.

---

# 13. Genre-Specific Expression

Example:

## SPACE

Reggae:

```text
spring/reverb/echo on skank or vocal
```

Techno:

```text
delay/reverb on stab or texture
```

Hip-hop:

```text
sample/vocal tail
```

D&B:

```text
short rhythmic delay / break accent
```

Ambient:

```text
long reverb / feedback extension
```

Metal:

```text
brief drum/texture space around a structural hit
```

Jazz:

```text
phrase-ending instrument throw
```

Same intention.

Different expression.

---

# 14. Gate A — Universal Musical Context

Build the context model before modifying persona behavior.

```ts
interface DubMusicalContext {
    genre: DubGenreInference

    clock: MusicalClock

    currentBar: number
    currentBeat: number
    currentPhrase: PhrasePosition

    section: MusicalSection

    energy: number
    density: number

    bassActivity: number
    drumActivity: number
    vocalActivity: number
    harmonicActivity: number

    transientDensity: number
    spectralDensity: number

    activeTargets: DubTarget[]
    importantEvents: MusicalEvent[]

    recentMoves: DubMoveHistory[]

    confidence: number
}
```

### Gate

The performer must be able to answer:

> What is happening musically right now?

without selecting a Dub move.

---

# 15. Gate B — Universal Event Detection

Create a genre-neutral event stream.

Examples:

```text
DOWNBEAT
BAR_START
PHRASE_START
PHRASE_END
SECTION_START
SECTION_END

KICK_HIT
SNARE_HIT
BASS_ENTRY
BASS_EXIT
VOCAL_ENTRY
VOCAL_EXIT

HARMONIC_CHANGE
DROP
BUILD
FILL
BREAK
ACCENT
SILENCE
DENSITY_INCREASE
DENSITY_DECREASE
```

The event stream becomes the foundation for all genre behavior.

---

# 16. Time-Varying Instrument Identity

Never assume:

```text
channel 3 = bass forever
```

A channel may change role.

Use:

```ts
ChannelSegment
```

with:

```text
time
instrument family
musical function
rhythmic role
register
importance
density
confidence
```

This is especially important for tracker music.

The broader music architecture already identifies dynamic channel assignment and `LOOPABLE FOUNDATION + NON-LOOPED VARIATION` as useful ways of understanding music rather than treating channels as permanently fixed.

---

# 17. Source Importance

Every target should have an importance score.

```ts
interface DubTargetImportance {
    musicalImportance: number
    rhythmicImportance: number
    harmonicImportance: number
    identityImportance: number
    currentAttention: number
}
```

The AI should not casually dub away the thing that defines the song.

For example:

- lead vocal = usually high identity
- kick = high rhythmic importance
- sub bass = high low-frequency importance
- background pad = potentially safe
- transient FX = often safe
- repetitive percussion = often safe

But this is context-dependent.

---

# 18. Genre Profiles — Initial Families

Implement genre families rather than 100 isolated profiles initially.

Required first-class families:

```text
REGGAE / DUB
HOUSE
TECHNO
ELECTRO
BREAKBEAT
DRUM & BASS
JUNGLE
HIP-HOP
TRIP-HOP
AMBIENT
IDM / EXPERIMENTAL
POP
ROCK
METAL
JAZZ / SOUL / FUNK
DISCO
GARAGE / UK GARAGE
DUBSTEP
TRANCE
INDUSTRIAL
CINEMATIC / SOUNDTRACK
```

Then support subgenre modifiers.

---

# 19. REGGAE / DUB Profile

This becomes the reference profile.

Prefer:

- skank
- bass
- percussion
- vocals
- spring
- tape
- echo
- space
- version drops
- riddim sections
- sirens
- call/response

High tolerance for:

- long echoes
- feedback
- filter movement
- wet throws
- arrangement subtraction

Keep current behavior strong.

Do not regress reggae.

---

# 20. HOUSE Profile

House typically depends strongly on:

- four-on-the-floor kick
- bass groove
- percussion
- hats
- chord/stab/vocal hooks
- phrase repetition

Dub behavior should emphasize:

```text
phrase punctuation
vocal throws
stab delays
percussion sends
filter sweeps
short-to-medium echoes
groove-preserving EQ
```

Avoid destroying the kick/sub relationship unnecessarily.

Long feedback should be reserved for appropriate moments.

---

# 21. TECHNO Profile

Techno should be treated as a **repetition + evolution** environment.

Prefer:

- subtle filter motion
- delay on repeated stabs
- feedback increases
- rhythmic echoes
- texture transformation
- gradual density changes
- phrase-level mutations

Important principle:

> Do not dub every interesting event.

Techno often becomes interesting because small changes accumulate over time.

Use low-intensity interventions frequently and high-intensity interventions rarely.

---

# 22. ELECTRO Profile

Electro should recognize:

- syncopated bass
- machine rhythms
- claps/snare
- percussion
- melodic sequences
- electro stabs
- robotic/vocoder material

Prefer:

- rhythmic delay
- short throws
- filter punctuation
- drum-space effects
- occasional vocal/vocoder treatment

Avoid turning precise machine rhythm into continuous washed-out ambience.

The wider music-system source explicitly identifies electro's identity as depending on rhythmic grammar, swing, variation and vocabulary rather than merely changing sound presets.

---

# 23. HIP-HOP Profile

Hip-hop dubbing should understand:

- breakbeats
- swing
- samples
- vocal phrases
- bass
- scratches
- chops
- silence
- loop repetition

Prefer:

```text
vocal throw
sample throw
scratch accent
delay tail
beat cut
filter on sample
short reverb punctuation
```

Do not constantly wash the entire beat.

The existing music work specifically calls for breakbeat vocabulary, swing, ghost notes, velocity structure, chopped loops, bass/drum interlocking and genre-specific drum grammar rather than generic kick/snare programming.

The Dub performer should respond to those same musical properties.

---

# 24. TRIP-HOP Profile

Trip-hop should permit:

- long atmospheric tails
- sparse rhythmic interventions
- dark textures
- vocal throws
- sampled texture manipulation
- cinematic reverb
- turntable-oriented punctuation

But preserve space.

The existing trip-hop system explicitly emphasizes:

- slow beats
- sparse drums
- warm bass
- wet processing
- dark samples
- cinematic textures
- imperfect timing
- restrained arrangement
- turntablism.

Therefore:

```text
dub = create atmosphere
```

not:

```text
dub = constantly add effects
```

---

# 25. DRUM & BASS / JUNGLE Profile

This requires special handling.

At high tempo:

- feedback can become dangerous quickly
- delay repeats accumulate rapidly
- dense drums can become mush
- long filter sweeps may destroy groove
- tiny timing errors become obvious

Prefer:

```text
short rhythmic throws
one-shot delay
break accents
snare throws
filter punctuation
brief dropouts
texture manipulation
```

Use much shorter feedback windows than reggae.

---

# 26. DUBSTEP Profile

Dubstep is especially compatible with Dub Studio concepts but must not automatically become reggae.

Focus on:

- sub bass
- wobble/growl
- drops
- half-time phrasing
- snare impacts
- bass movement
- negative space

Dub moves should often target:

```text
bass
mid-bass
snare
vocal
FX
```

and timing should follow drop architecture.

The broader music system already identifies a major defect when multiple dubstep subgenres share essentially identical bass grammar.

The Dub performer must therefore inspect the **actual bass behavior**, not assume all dubstep bass is interchangeable.

---

# 27. AMBIENT Profile

Ambient requires a radically different Dub philosophy.

Prefer:

- long reverb
- long delay
- feedback evolution
- spectral filtering
- slow movement
- texture layering
- harmonic preservation

Avoid:

- constant rhythmic triggering
- unnecessary bass swaps
- aggressive cuts
- rapid FX changes

The performer may spend minutes in one broad transformation.

---

# 28. ROCK Profile

Rock requires awareness of:

- kick/snare
- guitars
- bass
- vocals
- fills
- riffs
- chorus sections
- breakdowns

Good Dub targets:

```text
vocal tail
guitar stab
drum fill
snare
transition into chorus
breakdown
```

Avoid drowning the core guitar/bass groove.

---

# 29. METAL Profile

Metal should be treated conservatively.

Useful interventions:

- phrase-ending reverb
- drum fill throws
- vocal tail
- brief filter transition
- texture reduction
- breakdown punctuation

Avoid:

- excessive long delay over dense riffs
- large feedback during high-density passages
- unnecessary tempo disruption
- destroying double-kick clarity

A metal dub performer should understand **density as a hard constraint**.

---

# 30. JAZZ / SOUL / FUNK Profile

These styles need instrument-aware targeting.

Targets may include:

- horn phrase
- guitar lick
- piano stab
- organ phrase
- vocal
- bass phrase
- percussion

The performer should understand:

```text
call → response
```

and use dub effects to answer rather than merely decorate.

Example:

```text
horn phrase
    ↓
delay throw
    ↓
silence
    ↓
horn response
```

---

# 31. POP Profile

Pop requires restraint.

Important targets:

- vocal hook
- vocal phrase ending
- pre-chorus
- chorus
- transition
- percussion accent

The lead vocal usually has extremely high identity importance.

Therefore:

```text
dub the vocal tail
```

rather than:

```text
destroy the vocal
```

Long feedback should usually be controlled.

---

# 32. DISCO Profile

Prioritize:

- rhythm guitar
- strings
- percussion
- bass
- vocal hooks
- claps
- drums

Good effects:

- rhythmic delay
- short echo
- filter movement
- vocal throws
- percussion throws

Preserve groove continuity.

---

# 33. GARAGE / UK GARAGE Profile

Recognize:

- swing
- syncopated bass
- skippy drums
- vocal chops
- space
- shuffled percussion

Dub behavior should follow the rhythmic holes.

The existing music system explicitly defines speed garage around syncopated bass, swing, skippy drums, vocal chops and garage percussion rather than treating it as generic house.

Therefore the Dub performer should use:

```text
rhythmic throws
vocal chop echoes
bass-space interventions
short feedback
```

rather than generic four-on-the-floor logic.

---

# 34. INDUSTRIAL Profile

Industrial can tolerate:

- distortion
- filtering
- feedback
- noise
- metallic textures
- aggressive transitions

But distinguish:

```text
industrial density
```

from:

```text
random destruction
```

Use arrangement boundaries for high-impact interventions.

---

# 35. CINEMATIC / SOUNDTRACK Profile

Think in terms of:

```text
scene
tension
release
space
impact
transition
```

Long-form effects are appropriate.

Target:

- orchestral hits
- risers
- impacts
- drones
- melodic fragments
- vocal phrases

Do not impose dance-music assumptions.

---

# 36. Gate C — Genre Grammar

Every genre profile must define:

```text
RHYTHM
BASS
HARMONY
MELODY
ARRANGEMENT
TEXTURE
VOCAL
FX
SPACE
VARIATION
RESTRAINT
```

This follows the existing project's broader genre-generation doctrine, which explicitly calls for separate bass, drum, melody, harmony, FX, vocal, arrangement, loop and variation grammars.

---

# 37. Move Affinity Matrix

Create:

```ts
GenreMoveAffinity
```

Example:

```text
genre          move                 affinity
------------------------------------------------
reggae         echoThrow             1.00
reggae         springSlam            0.95
techno         delayThrow             0.90
techno         springSlam             0.20
ambient        ghostReverb            1.00
ambient        tapeStop               0.10
hiphop         echoThrow              0.85
hiphop         scratch-oriented       0.90
metal          ghostReverb            0.35
metal          tapeStop               0.20
```

Do not hard-code this inside individual move implementations.

---

# 38. Move Compatibility Is Not Binary

Use:

```text
0.0 = inappropriate
0.5 = situational
1.0 = highly appropriate
```

Then multiply by:

```text
current musical context
+
persona preference
+
target compatibility
+
recent-use penalty
+
risk
```

---

# 39. Move Cost

Every move should expose an approximate cost.

```ts
interface DubMoveCost {
    wetEnergy: number
    attention: number
    densityImpact: number
    lowEndRisk: number
    harmonicRisk: number
    rhythmicRisk: number
    recoveryTime: number
}
```

This is more useful than simply:

```text
move = wet/dry
```

---

# 40. Genre-Specific Wet Budgets

Different genres should have different acceptable wet density.

For example:

```text
reggae:
high

ambient:
high but slow

techno:
medium

house:
medium

hip-hop:
medium-low

pop:
low-medium

metal:
low

D&B:
low-medium but fast

jazz:
medium-low
```

These are starting points, not permanent constants.

---

# 41. Continuous Wet-Energy Budget

Do not rely primarily on:

```text
one wet move per bar
```

Instead maintain:

```ts
WetEnergyBudget
```

with:

```text
current
capacity
recovery
burst allowance
genre multiplier
persona multiplier
section multiplier
```

The existing hard safety governor remains.

The new system uses the budget as the musical control layer.

---

# 42. Genre-Specific Recovery

A big echo in reggae may be normal.

The same wet burst in metal may require a long recovery.

Therefore:

```text
move cost
+
genre recovery profile
```

determines when the next major effect is allowed.

---

# 43. Density-Aware Dubbing

Create:

```ts
musicalDensity
```

as a first-class signal.

When density is high:

```text
simpler effects
shorter tails
less simultaneous processing
target isolated events
```

When density is low:

```text
longer tails
larger transformations
more space
more feedback
```

This one rule will prevent a huge amount of genre damage.

---

# 44. Rhythmic Resolution Awareness

At 70 BPM:

```text
1/8 note
```

is relatively long.

At 180 BPM:

```text
1/8 note
```

is short.

The performer must reason in musical time.

Use:

```text
beats
bars
phrases
```

rather than milliseconds alone.

---

# 45. Tempo-Aware Echo

Every delay/echo decision should understand:

```text
BPM
meter
phrase length
subdivision
```

Possible rhythmic values:

```text
1/32
1/16
1/8
1/8T
1/4
1/4T
1/2
1 bar
2 bars
```

The performer chooses based on genre and context.

---

# 46. Phrase-Aware FX

Never choose an effect solely because:

```text
random event occurred
```

Prefer:

```text
phrase ending
+
target event
+
appropriate genre
+
appropriate move
```

Example:

```text
vocal phrase ends
        ↓
1/4-beat silence
        ↓
echoThrow
        ↓
incoming phrase
```

---

# 47. Call-and-Response Engine

Create a universal:

```ts
DubResponsePlanner
```

It detects:

```text
musical statement
```

and decides whether to answer it.

Possible responses:

```text
echo
reverb
filter
delay
texture
bass response
silence
```

This is especially powerful for:

- reggae
- jazz
- funk
- hip-hop
- house vocals
- techno stabs
- melodic electronic music

---

# 48. Event Identity

An event should have:

```ts
interface MusicalEvent {
    type: MusicalEventType

    start: number
    duration: number

    target: DubTarget

    importance: number

    register?: Register
    role?: MusicalFunction

    repetition?: number
    novelty?: number

    harmonicContext?: HarmonicContext
    rhythmicContext?: RhythmicContext

    confidence: number
}
```

This allows:

```text
"throw the third vocal phrase"
```

rather than:

```text
"throw channel 4"
```

---

# 49. Source-Aware Targeting

Targets should be semantic.

Examples:

```text
lead vocal
bass
kick
snare
hihat
percussion
melodic stab
pad
lead synth
guitar
piano
organ
sample
FX
drum bus
music bus
master
```

Where possible.

The system should fall back to channels when semantic classification is unavailable.

---

# 50. Master-Bus Moves Must Be Rare

Master effects are powerful.

Use them for:

- structural transitions
- major releases
- version drops
- controlled breakdowns
- emergency recovery

Do not let the performer solve every musical problem by processing the entire mix.

---

# 51. Bass-Specific Intelligence

Bass is especially important.

The performer must distinguish:

```text
sub bass
bass guitar
synth bass
808
melodic bass
bass drone
bass texture
```

Do not apply the same treatment to all bass.

---

# 52. Bass Grammar Profiles

Example:

## Reggae

Long, foundational, melodic bass.

Prefer:

```text
space
echo
filter
occasional sub emphasis
```

## House

Groove/interlock bass.

Prefer:

```text
rhythmic accents
short throws
controlled EQ
```

## D&B

Fast bass movement.

Prefer:

```text
short intervention
rhythmic delay
avoid feedback buildup
```

## 808 hip-hop

Long decay.

Prefer:

```text
careful low-end shaping
short texture effects
avoid feedback stacking
```

## Ambient

Bass may be drone-like.

Prefer:

```text
long transformation
filtering
reverb
```

---

# 53. Drum-Specific Intelligence

Drums should not all be treated as:

```text
percussion
```

Classify:

```text
kick
snare
clap
hat
ride
tom
break
fill
percussion
impact
```

Then choose effects appropriately.

---

# 54. Kick Protection

By default:

```text
protect kick phase
protect kick low end
```

unless the current genre/profile explicitly permits manipulation.

Especially protect:

- techno
- house
- D&B
- trance
- electro

---

# 55. Snare / Backbeat Throws

Backbeat-oriented music provides excellent dub targets.

Potential:

```text
snare → delay
snare → reverb
snare → spring
snare → filter
```

But the timing must be phrase-aware.

---

# 56. Vocal Intelligence

Vocals should become first-class Dub targets.

Detect:

```text
vocal phrase
vocal onset
vocal ending
vocal pause
hook
spoken phrase
rap phrase
vocal chop
```

Then:

```text
throw phrase ending
```

rather than:

```text
randomly process vocal channel
```

---

# 57. Vocal Importance

A lead vocal usually has:

```text
identityImportance = high
```

Therefore:

- avoid masking it
- avoid excessive feedback
- use effects at phrase boundaries
- allow tails into gaps

Background vocals can receive more aggressive processing.

---

# 58. Melody-Aware Dubbing

For melodic music, identify:

```text
motif
hook
answer
repetition
resolution
cadence
```

The Dub performer can then:

```text
repeat a hook
throw the ending
remove the source
return the source
```

This turns Dub Studio into an arranger rather than merely an FX processor.

---

# 59. Harmonic Awareness

Effects should respect harmony where appropriate.

Examples:

Long feedback:

```text
harmonic content accumulates
```

Therefore avoid long resonant feedback when:

```text
harmonic conflict is high
```

unless the genre intentionally wants dissonance.

---

# 60. Key-Aware Generated Bass / Tonal Moves

Generated tonal moves such as:

- oscBass
- subSwell
- resonant filter tones

must know:

```text
current key
current chord
current bass note
```

unless the move is deliberately atonal.

Never randomly inject a tonal bass note simply because a move is available.

---

# 61. Genre-Specific Generated Source Rules

Generated source moves require a:

```ts
GeneratedSourceProfile
```

Example:

```text
techno:
short tonal pulse

house:
subtle bass reinforcement

dub:
sub swell / siren

hip-hop:
808-like accent where appropriate

ambient:
drone texture

metal:
generally avoid
```

---

# 62. Instrument-Aware Dubbing

A filter sweep on:

```text
pad
```

is different from a filter sweep on:

```text
kick
```

and different again on:

```text
vocal
```

Therefore:

```ts
MoveTargetCompatibility
```

should consider instrument family.

---

# 63. Persona Architecture

The existing personas should become:

```text
PERSONA
+
GENRE
+
CURRENT CONTEXT
```

rather than:

```text
PERSONA
=
GENRE
```

This allows the same persona to dub different styles.

---

# 64. Persona Traits

Define personas through abstract traits.

Example:

```ts
interface DubPersonaTraits {
    aggression: number
    restraint: number
    space: number
    repetition: number
    experimentation: number
    rhythmicFocus: number
    harmonicSensitivity: number
    textureFocus: number
    lowEndFocus: number
    vocalFocus: number
    feedbackTolerance: number
    transitionBoldness: number
}
```

The persona should not hard-code genre.

---

# 65. Persona + Genre Matrix

The final decision becomes:

```text
persona traits
        ×
genre grammar
        ×
musical context
        ×
current intention
        ×
move compatibility
        ×
wet budget
```

This produces the action.

---

# 66. Example: Jammy on Techno

Do not make Jammy simply:

```text
reggae persona
+
techno audio
```

Instead:

```text
Jammy traits:
    restrained
    groove-focused
    space-oriented

Techno grammar:
    repetitive
    pulse-focused
    phrase-evolution

Result:
    small rhythmic delays
    subtle filter changes
    phrase-ending throws
    gradual feedback
    very little large-scale wash
```

The persona survives.

The musical language changes.

---

# 67. Example: Tubby on Ambient

Tubby's traits can express themselves through:

```text
long feedback
resonance
space
spectral transformation
```

without requiring:

```text
skank
reggae bass
four-on-the-floor
```

---

# 68. Example: Perry on Hip-Hop

Perry-like experimentalism could become:

```text
sample destruction
unexpected delay
texture mutation
reverse/reverb
short dropout
call-response
```

rather than:

```text
echo every skank
```

---

# 69. Persona Signature Must Be Semantic

Do not define:

```text
signatureMove = echoThrow
```

as the whole identity.

Instead:

```text
signatureIntentions = [
    "EXTEND",
    "DESTABILIZE",
    "CALL_RESPONSE"
]
```

Then the appropriate move is selected for the genre.

This prevents personas from becoming trapped in reggae technique.

---

# 70. Genre Translation Layer

Create:

```ts
DubTechniqueTranslator
```

Its job:

```text
persona intention
        ↓
genre expression
        ↓
available move
```

Example:

```text
PERSONA:
"make this phrase echo"

HOUSE:
vocal delayThrow

TECHNO:
stab delayTimeThrow

HIP-HOP:
sample echoThrow

AMBIENT:
ghostReverb + long delay

D&B:
short rhythmic delay

METAL:
snare reverb throw
```

---

# 71. Gate D — Persona Translation

Every persona must pass the following test:

> Can this persona produce a recognizably different performance on at least five radically different genres without pretending every song is reggae?

If not, the persona implementation is incomplete.

---

# 72. Rest Is a Musical Action

The universal performer must be able to decide:

```text
DO NOTHING
```

for multiple bars.

This is critical.

A professional dub engineer does not process every phrase.

Add:

```ts
RestState
```

with:

```text
duration
reason
next intention
confidence
```

---

# 73. Genre-Specific Rest

Examples:

```text
reggae:
moderate rest

techno:
long subtle-rest periods

ambient:
very long rest

hip-hop:
event-driven rest

metal:
high restraint

D&B:
short event windows
```

Rest behavior should be part of the genre profile.

---

# 74. Event-Driven vs Continuous Dubbing

Different genres favor different temporal behavior.

## Event-driven

```text
hip-hop
pop
jazz
funk
rock
```

Effects happen around identifiable musical events.

## Continuous evolution

```text
ambient
techno
dub techno
```

Effects evolve slowly.

## Hybrid

```text
reggae
house
D&B
dubstep
```

Support both.

---

# 75. Genre Density Model

Create:

```ts
DubDensityProfile
```

with:

```text
eventDensity
wetDensity
feedbackDensity
targetDensity
restDensity
variationDensity
```

This becomes one of the strongest genre controls.

---

# 76. Move Sequencing

The AI should understand combinations.

Example:

```text
filterDrop
    ↓
rest
    ↓
echoThrow
    ↓
release
```

rather than independently selecting every move.

Create:

```ts
DubGesture
```

representing a short musical action.

---

# 77. Gesture Vocabulary

Examples:

```text
accent
throw
swell
drop
wash
answer
build
release
freeze
repeat
reverse
puncture
disappear
reappear
```

Each gesture may contain multiple existing moves.

---

# 78. Example Gesture

```ts
DubGesture {
    intention: "ANSWER"

    target: vocal

    events: [
        echoThrow,
        shortRest,
        dryReturn
    ]

    duration: 2 bars
}
```

The existing DubRouter still executes the individual moves.

---

# 79. Genre-Specific Gesture Design

Techno:

```text
stab
→ short delay
→ dry return
```

Hip-hop:

```text
sample phrase
→ echo
→ beat gap
→ sample return
```

Ambient:

```text
texture
→ reverb swell
→ filter
→ long decay
```

Reggae:

```text
vocal/skank
→ spring/echo
→ feedback
→ version return
```

---

# 80. Gate E — Gesture Engine

The AI must be able to plan a short sequence rather than only one isolated move.

---

# 81. Consequence Listening

After executing a gesture:

measure:

```text
wetness
energy
density
spectral balance
low-end accumulation
feedback accumulation
musical continuity
```

Then adapt.

Example:

```text
echo too dense
→ reduce next feedback

texture became too wet
→ rest

bass lost clarity
→ release filter / reduce FX
```

---

# 82. Self-Correction

Do not wait until the song sounds broken.

Use:

```text
predicted consequence
+
observed consequence
```

to update the next decision.

---

# 83. Genre-Specific Failure Modes

Create explicit detection.

## Reggae

Failure:

```text
too dry
```

## Ambient

Failure:

```text
too static / insufficient transformation
```

## Techno

Failure:

```text
groove disrupted
```

## Hip-hop

Failure:

```text
beat/sample identity obscured
```

## D&B

Failure:

```text
break clarity destroyed
```

## Pop

Failure:

```text
vocal obscured
```

## Metal

Failure:

```text
riff/transient density destroyed
```

---

# 84. Wet Energy Should Be Frequency-Aware

A low-frequency effect is more dangerous than a high-frequency echo in many contexts.

Track:

```text
lowWet
midWet
highWet
```

This matters especially for:

- bass-heavy music
- D&B
- dubstep
- hip-hop
- techno

---

# 85. Spectral Conflict Detection

Before a major gesture, estimate:

```text
incoming effect spectrum
+
existing source spectrum
```

Avoid:

```text
dense low-mid music
+
huge resonant low-mid feedback
```

unless intentionally chosen.

---

# 86. Feedback Intelligence

Feedback must be treated as a resource.

Maintain:

```ts
feedbackState
```

with:

```text
currentLevel
accumulation
decay
spectralRisk
genreTolerance
```

Do not independently add feedback without considering what is already circulating.

---

# 87. Echo Density

Count active repeats.

Example:

```text
echoDensity = activeEchoEnergy / sourceEnergy
```

If high:

```text
avoid another long throw
```

This prevents feedback snowballing.

---

# 88. Genre-Specific Feedback

Reggae:

```text
high
```

Dub techno:

```text
medium-high
```

Ambient:

```text
high but slow
```

Techno:

```text
medium
```

House:

```text
medium
```

Hip-hop:

```text
medium-low
```

Pop:

```text
low-medium
```

Metal:

```text
low
```

D&B:

```text
low-medium
```

These are starting profile values.

---

# 89. Harmonic Feedback Control

For tonal delay/reverb:

```text
key
+
chord
+
target note
```

should influence feedback.

If the source changes harmony rapidly:

```text
shorter feedback
```

If the harmony is static:

```text
longer feedback
```

---

# 90. Arrangement Awareness

The performer must understand:

```text
INTRO
MAIN
BUILD
DROP
BREAK
RETURN
OUTRO
```

but must not assume every genre uses those exact labels.

Use abstract structural roles:

```text
LOW_DENSITY
GROOVE
DEVELOPMENT
PEAK
RELEASE
TRANSITION
```

---

# 91. Versioning for Any Genre

The reggae concept of:

```text
version
```

should become universal.

A version means:

> The same musical material is transformed by changing what is allowed to remain audible.

Examples:

Techno:

```text
remove melody
keep kick + percussion
```

Hip-hop:

```text
remove drums
leave sample + vocal
```

House:

```text
remove bass
leave percussion + vocal
```

Ambient:

```text
remove rhythm
leave texture
```

Metal:

```text
remove guitars
leave drums + vocal
```

This is extremely powerful.

---

# 92. Universal Version-Drop Planner

Create:

```ts
VersionDropPlan
```

with:

```text
preserveTargets
removeTargets
duration
reintroductionOrder
energyChange
genreConfidence
```

Do not implement it as:

```text
drop everything except drums and bass
```

That is a reggae-specific rule.

---

# 93. Genre-Aware Reintroduction

Reintroduce elements according to musical importance.

Example:

## House

```text
kick
→ bass
→ percussion
→ vocal
```

## Techno

```text
kick
→ hat
→ sequence
→ texture
```

## Hip-hop

```text
sample
→ kick
→ snare
→ bass
→ vocal
```

## Ambient

```text
drone
→ harmonic texture
→ high texture
```

---

# 94. Gate F — Universal Versioning

The performer must be able to create a meaningful "version" of at least:

- reggae
- house
- techno
- hip-hop
- D&B
- ambient

without using the same target-removal recipe.

---

# 95. Tubby / Resonant EQ

Keep resonant EQ behavior manual-first.

Do not let generic automatic spectral balancing replace musical EQ gestures.

The system should distinguish:

```text
MUSICAL EQ GESTURE
```

from:

```text
SPECTRAL CORRECTION
```

A genre profile decides whether resonant EQ is appropriate.

---

# 96. Spectral Assist

Automatic spectral analysis can suggest:

```text
too much low-mid
too much high end
bass masking
```

but should remain assistive.

Do not allow it to override musical intent automatically.

---

# 97. Generated Sources Must Be Genre-Aware

Existing generated-source moves such as:

```text
oscBass
subSwell
dubSiren
```

must not appear everywhere.

A siren is:

```text
highly appropriate
```

in certain dub contexts.

It may be:

```text
inappropriate
```

in:

- classical
- intimate jazz
- acoustic singer-songwriter
- certain metal
- orchestral music

The system should know this.

---

# 98. Genre-Specific Signature Effects

Create optional signature vocabularies.

Examples:

```text
reggae:
spring
siren
tape
echo

techno:
delay
comb
filter
feedback

hip-hop:
sample echo
scratch
vinyl-space
filter

ambient:
reverb
granular
long delay

metal:
short room
impact
filter
reverse

house:
vocal echo
filter
percussion delay
```

These should be preferences, not hard restrictions.

---

# 99. Existing Personas

Retain the current personas.

Do not replace them.

Instead change their implementation from:

```text
persona → fixed reggae behavior
```

to:

```text
persona → abstract traits
```

plus:

```text
genre translator
```

plus:

```text
musical context
```

This preserves their identities while making them portable.

---

# 100. Persona Distinction Test

After implementation, each persona should remain audibly distinct when dubbing:

```text
reggae
techno
house
hip-hop
ambient
D&B
```

If every persona converges on the same behavior, the translation layer is wrong.

---

# 101. Gate G — Persona Portability

For each persona:

1. Select six genres.
2. Run identical source material categories.
3. Compare performance.
4. Verify persona identity remains.
5. Verify genre identity remains.
6. Verify the two identities do not collapse into one.

---

# 102. Genre Confidence

If genre confidence is low:

```text
fall back toward universal musical behavior
```

Universal safe behaviors include:

- phrase-aware echo
- restrained reverb
- subtle filter
- controlled delay
- target-aware space
- rest

Avoid highly genre-specific gestures when uncertain.

---

# 103. Genre Blending

Real music may be hybrid.

Support:

```ts
GenreBlend {
    genreA
    genreB
    weights
}
```

Examples:

```text
techno + dub
house + garage
hip-hop + soul
ambient + techno
metal + industrial
jazz + electronic
```

Do not force one genre.

---

# 104. Hybrid Grammar

Blend at the grammar level.

Example:

```text
Techno:
repetition = 0.9

Dub:
feedback = 0.8

Result:
repetitive techno groove
+
slowly evolving dub delay
```

This is much better than:

```text
techno preset
+
dub preset
```

---

# 105. Gate H — Hybrid Genres

Test:

```text
dub techno
dubstep
trip-hop
electro dub
ambient dub
dub house
dub hip-hop
industrial dub
```

The system should produce plausible hybrids.

---

# 106. Musical Memory

Remember:

```text
what was recently emphasized
what was recently removed
what was recently echoed
what target has been overused
what genre expression was used
```

This prevents:

```text
same vocal echo every 8 bars
```

---

# 107. Target Repetition Control

Track:

```ts
targetHistory
```

Penalize repeatedly choosing:

```text
same channel
same instrument
same phrase
same effect
```

unless that repetition is stylistically intentional.

---

# 108. Gesture Repetition Control

Likewise:

```text
echo
echo
echo
echo
```

should be discouraged.

But:

```text
echo
short variation
echo
longer variation
```

may be musically meaningful.

---

# 109. Motif Memory

When a musical motif repeats, the performer can intentionally repeat the same Dub gesture.

Example:

```text
stab A
→ echo

stab A returns
→ echo variation

stab A returns
→ no effect

stab A returns
→ larger echo
```

This creates musical development.

---

# 110. Gate I — Musical Memory

The performer must demonstrate:

```text
repetition
+
variation
+
rest
```

rather than either:

```text
randomness
```

or:

```text
identical looped behavior
```

---

# 111. Humanization

Do not randomize everything.

Human variation should be:

```text
phrase-correlated
event-aware
style-aware
```

not:

```text
random timing
random effects
random target
```

The broader music work explicitly makes the same distinction: humanity should use microtiming, velocity/phrase variation and correlated imperfections rather than random timing.

---

# 112. Performance Styles

Add high-level performance modes:

```text
CONSERVATIVE
SMOOTH
GROOVE
EXPERIMENTAL
PSYCHEDELIC
AGGRESSIVE
ATMOSPHERIC
MINIMAL
MAXIMAL
```

These modify persona traits.

---

# 113. User Controls

The user should eventually be able to control:

```text
Dub Intensity
Genre Influence
Persona Influence
FX Density
Feedback
Risk
Restraint
Target Bias
```

Example:

```text
GENRE AWARENESS
0% ←────────→ 100%

PERSONA
0% ←────────→ 100%

FX DENSITY
0% ←────────→ 100%

RISK
0% ←────────→ 100%
```

---

# 114. Do Not Expose Hundreds of Knobs

The internal model can be complex.

The UI should remain simple.

The performer should handle:

```text
genre
persona
intensity
risk
```

while internal profiles handle the rest.

---

# 115. Genre Override

Allow:

```text
Auto
Reggae/Dub
Techno
House
Hip-Hop
Ambient
...
```

If the user explicitly selects a genre:

```text
genre confidence = 1.0
```

but actual musical analysis can still modify sub-decisions.

---

# 116. Manual Override

User actions remain authoritative.

If the user manually targets:

```text
channel 4
```

Auto Dub must respect that.

Existing user overrides should remain intact.

---

# 117. Safety Layer

Keep the current safety system.

Add:

```text
genre risk
+
musical density risk
+
feedback risk
+
low-end risk
```

but never remove hard technical limits.

---

# 118. No Genre Should Bypass Safety

Even if a genre profile wants:

```text
huge feedback
```

the hard system limit still wins.

Architecture:

```text
musical desire
    ↓
genre/persona limits
    ↓
wet budget
    ↓
technical safety governor
    ↓
DubRouter.fire()
```

---

# 119. Gate J — Safety

Test every genre with:

- maximum feedback
- maximum wet density
- dense source material
- low-end-heavy source
- silence
- very fast BPM
- very slow BPM

No runaway DSP.

---

# 120. Genre-Aware Clock

All timing must use:

```text
MusicalClock
```

rather than assuming:

```text
4/4
```

or:

```text
16 bars
```

The wider Dub redesign already established this direction.

Use:

```text
meter
tempo
beat
bar
phrase
section
```

as the universal time model.

---

# 121. Unusual Meter

Support:

```text
3/4
5/4
6/8
7/8
9/8
12/8
```

where analysis permits.

Dub gestures should adapt.

Example:

```text
5/4:
phrase = 5 beats

3/4:
three-beat delay structure

6/8:
compound pulse
```

Do not force everything into four beats.

---

# 122. Genre-Specific Phrase Length

Do not assume every genre uses 16-bar phrases.

Detect:

```text
4
8
12
16
32
```

or irregular structural units.

Use song evidence.

---

# 123. Gate K — Timing

Test the performer on:

- 4/4
- 3/4
- 6/8
- irregular tracker arrangements
- sparse ambient material
- fast D&B
- slow trip-hop

No phrase-level timing failures.

---

# 124. Genre-Aware Auto Dub

Existing Auto Dub behavior should become one consumer of the new planner.

Current logic such as:

```text
250 ms tick
one wet move per bar
cooldowns
move budget
wet cap
startup suppression
sparse-song suppression
pattern lookahead
```

should remain as safety/operational infrastructure.

The new planner decides:

```text
why
when
where
what
```

The existing governor decides:

```text
is it safe?
```

---

# 125. Replace the Old Primary Selection Model

Do not make the primary algorithm:

```text
random move
```

or:

```text
one move per bar
```

Use:

```text
musical event
→ intention
→ target
→ candidate moves
→ score
→ budget
→ execute
```

---

# 126. Candidate Move Scoring

Conceptually:

```ts
score =
    genreAffinity
  + personaAffinity
  + intentionFit
  + targetImportance
  + phraseFit
  + eventFit
  + harmonicFit
  + rhythmicFit
  + textureFit
  + novelty
  - wetCost
  - repetitionCost
  - risk
  - densityConflict
```

The score should be inspectable.

---

# 127. Explainability

Every autonomous move should be able to report:

```text
INTENTION:
PUNCTUATE

TARGET:
lead vocal

WHY:
phrase ending + high importance + genre supports vocal throws

MOVE:
echoThrow

WHY THIS MOVE:
high genre affinity + low density risk

WHY NOW:
next bar boundary

CONFIDENCE:
0.87
```

This is essential for tuning.

---

# 128. Gate L — Explainability

The developer/debug view should show:

```text
Current genre
Genre confidence
Current section
Current phrase
Current intention
Target
Candidate moves
Selected move
Rejected moves
Wet budget
Risk
Reason
```

---

# 129. Evaluation Corpus

Create a genre-spanning test set.

Minimum:

```text
5 reggae/dub
5 house
5 techno
5 hip-hop
5 D&B
5 ambient
5 rock
5 metal
5 jazz/soul/funk
5 pop
5 trip-hop
5 dubstep
```

Ideally more.

---

# 130. Golden Performances

For each genre define examples of:

```text
good
too dry
too wet
too repetitive
too destructive
too reggae
too random
too conservative
```

This becomes the training/evaluation corpus for tuning.

---

# 131. Critical Acceptance Test: "Too Reggae"

Every genre must pass this question:

> Does the performance sound like it belongs to the source genre, or did the system simply put reggae dub effects over it?

Examples of failure:

```text
techno → reggae echo wash
metal → reggae spring everywhere
pop → constant siren
jazz → random filter sweeps
ambient → rhythmic reggae throws
```

These are failures even if the effects sound good individually.

---

# 132. Critical Acceptance Test: "Too Dry"

The opposite failure:

```text
genre correctness
+
no recognizable Dub Studio personality
```

The performer must still sound like Dub Studio.

The goal is:

```text
SOURCE GENRE
+
DUB PERSONALITY
```

not:

```text
SOURCE GENRE
```

and not:

```text
REGGAE DUB
```

---

# 133. The Universal Dub Identity

The invariant across all genres should be:

```text
space
repetition
feedback
transformation
call/response
subtraction
reintroduction
texture
timing
musical consequence
```

Not:

```text
spring reverb
reggae bass
siren
skank
```

Those are genre-specific expressions.

---

# 134. Gate M — Dub Identity

Run identical source material through:

```text
persona A
persona B
persona C
persona D
persona E
```

and verify:

- each sounds different
- all remain musically appropriate
- none are simply reggae emulations

---

# 135. Implementation Order

Do not implement every genre first.

Build the abstraction first.

Recommended order:

```text
1. MusicalClock

2. Universal MusicalEvent model

3. DubMusicalContext

4. semantic target model

5. genre inference

6. DubGenreProfile

7. intention model

8. move affinity model

9. wet-energy budget

10. density model

11. gesture model

12. persona trait model

13. persona × genre translator

14. target importance

15. consequence monitoring

16. universal rest state

17. version/drop planner

18. first genre profiles

19. evaluation harness

20. remaining genre profiles
```

---

# 136. First Genre Implementation Set

Implement and tune these first:

```text
REGGAE/DUB
TECHNO
HOUSE
HIP-HOP
D&B/JUNGLE
AMBIENT
```

These six provide radically different musical requirements.

If the architecture works for all six, it is likely genuinely genre-agnostic.

---

# 137. Second Wave

Then:

```text
DUBSTEP
ELECTRO
TRIP-HOP
GARAGE
DISCO
FUNK/SOUL
POP
ROCK
```

---

# 138. Third Wave

Then:

```text
METAL
JAZZ
INDUSTRIAL
TRANCE
CINEMATIC
IDM
EXPERIMENTAL
```

---

# 139. Do Not Create a Separate Engine Per Genre

Bad:

```text
DubTechnoEngine
HipHopDubEngine
AmbientDubEngine
MetalDubEngine
```

Good:

```text
UniversalDubPerformer
    +
GenreProfile
    +
Persona
    +
MusicalContext
```

This is critical for maintainability.

---

# 140. Data-Driven Profiles

Genre profiles should be data-driven wherever possible.

For example:

```ts
const technoDubProfile = {
    feedbackTolerance: 0.55,
    rhythmicFocus: 0.85,
    space: 0.70,
    eventDensity: 0.35,
    longTailTolerance: 0.45,
    targetWeights: {...},
    moveAffinity: {...}
}
```

The actual profile should be richer than this example.

---

# 141. Avoid Profile Explosion

Do not create hundreds of manually tuned parameters.

Group them into semantic traits:

```text
rhythmic
harmonic
textural
spatial
dynamic
aggressive
restrained
```

Derive lower-level values where possible.

---

# 142. Genre Doctrine Validation

Every genre profile should have explicit validation rules.

Examples:

## Techno

Reject if:

```text
FX density destroys pulse
```

## Hip-hop

Reject if:

```text
sample identity obscured
```

## D&B

Reject if:

```text
break loses transient clarity
```

## Ambient

Reject if:

```text
effect rate becomes too rhythmically busy
```

## Pop

Reject if:

```text
lead vocal is repeatedly masked
```

---

# 143. Do Not Judge Only Individual Moves

A move can sound good alone but terrible in context.

Evaluation must test:

```text
move sequence
```

and:

```text
full performance
```

---

# 144. Musical Consequence Metrics

Measure:

```text
wetness
density
spectral change
low-end change
transient change
energy change
target audibility
```

Before and after every major gesture.

---

# 145. Performance Arc

A good performance should have:

```text
introduction
development
accumulation
peak
release
rest
return
```

The AI should not spend the entire song at maximum intensity.

---

# 146. Long-Form Performance

Test:

```text
5 minutes
15 minutes
30 minutes
60 minutes
```

The performer must not become:

```text
echo every 8 bars
```

or:

```text
completely inactive
```

after the first few minutes.

---

# 147. Long-Term Novelty

Maintain:

```text
recent move history
recent target history
recent gesture history
recent genre-expression history
```

Use novelty as a soft preference.

---

# 148. Persona Evolution

A persona can change behavior over a long performance.

Example:

```text
opening:
restrained

middle:
more adventurous

peak:
aggressive

release:
spacious
```

The underlying personality remains intact.

---

# 149. Genre Evolution

Likewise:

```text
techno opening:
subtle delay

techno build:
filter + feedback

techno peak:
larger rhythmic gestures

techno release:
long tail
```

---

# 150. Gate N — Long-Form Performance

A one-hour session must demonstrate:

- controlled repetition
- recognizable persona
- recognizable genre
- meaningful development
- rest
- peaks
- recovery

---

# 151. Backward Compatibility

Existing Dub Studio behavior must remain available.

Especially:

- current reggae/dub persona behavior
- manual moves
- MIDI
- keyboard/pads
- MCP
- recorder
- tracker integration
- existing Auto Dub
- user overrides

The universal performer is an additional intelligence layer.

---

# 152. Regression Requirements

Before enabling genre-aware behavior globally:

run the existing Dub test suite.

Then run:

```text
manual move tests
router tests
DSP tests
Auto Dub tests
persona tests
record/replay tests
```

No existing manual functionality should regress.

---

# 153. Debug Modes

Add:

```text
DUB DEBUG
```

with:

```text
genre
confidence
context
intention
target
move
gesture
wet budget
risk
reason
```

Also support:

```text
"why no move?"
```

Example:

```text
No move selected.

Reason:
current section has high density,
wet budget is recovering,
target confidence is low,
next phrase boundary is 1.5 bars away.
```

This is extremely useful.

---

# 154. Final Architecture

```text
                         SOURCE MUSIC
                              │
                              ▼
                    ┌───────────────────┐
                    │ Musical Analysis  │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ DubMusicalContext │
                    └─────────┬─────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
      Genre Inference    Event Detection   Target Analysis
            │                 │                 │
            └─────────────────┼─────────────────┘
                              ▼
                     DubIntentionEngine
                              │
                              ▼
                    Persona + Genre Layer
                              │
                              ▼
                     Gesture / Move Planner
                              │
                 ┌────────────┼────────────┐
                 │            │            │
                 ▼            ▼            ▼
             Wet Budget    Risk Model   History
                 │            │            │
                 └────────────┼────────────┘
                              ▼
                      DubMove Candidate
                              │
                              ▼
                     Safety Governor
                              │
                              ▼
                       DubRouter.fire()
                              │
                              ▼
                         Existing DSP
                              │
                              ▼
                      Hear Consequence
                              │
                              └──────────────►
                                  Adapt
```

---

# 155. Definition of Done

The Universal Dub Performer is complete when:

### Reggae/Dub

still sounds authentically dub-oriented.

### Techno

sounds like techno being transformed by a dub performer, not reggae techno.

### House

preserves the groove while using intelligent vocal, percussion and stab dubbing.

### Hip-hop

understands samples, breaks, vocals and space.

### D&B/Jungle

uses short, rhythm