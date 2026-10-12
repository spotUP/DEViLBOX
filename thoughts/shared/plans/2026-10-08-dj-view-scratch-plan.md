---
date: 2026-10-08
topic: DJ view scratch / scratch DJ (owner-supplied plan, from the music-theory review)
tags: [dj, scratch, turntablism, plan]
status: draft
---

Yes. After reading the full comparison, I would change the direction of the scratch work substantially.
The biggest lesson from Up Rough is that the scratch generator is a musical performer, not merely a better collection of scratch patterns. Its gesture vocabulary, source/anchor metadata, density model, phrase planning, rest probability, style ladder, routines, validation, and 32-bar arc are the pieces worth bringing into DEViLBOX. 
DEViLBOX already has the hard real-time foundation: signed scratch rates, the 120-second ring buffer, interpolation, direction changes, fader automation, platter physics, pattern playback, and state restoration. 
So the following is the plan I would give the coding agent.


# DEViLBOX DJ VIEW — WORLD-CLASS AUTONOMOUS SCRATCH DJ

## Mission

Build an autonomous scratch DJ for the DEViLBOX DJ View that combines:

1. DEViLBOX's existing real-time scratch/deck engine
2. DEViLBOX's existing Auto DJ beat/phrase/section analysis
3. DEViLBOX's two-deck beat-juggling performer
4. the Up Rough Demo System's sophisticated scratch-generation brain
5. the existing DEViLBOX scratch sample crate
6. tracker-native musical information
7. a real DJ-style performance arc with rests, escalation, call/response, source selection and musical releases

The finished performer should not sound like:

```text
play scratch pattern #7
wait
play scratch pattern #3
wait
play scratch pattern #7
```

It should sound like:

```text
listen
  ↓
find a musical opportunity
  ↓
choose a scratch source
  ↓
choose the correct anchor
  ↓
choose a technique
  ↓
choose where it lands in the phrase
  ↓
perform
  ↓
leave space
  ↓
listen again
  ↓
answer / escalate / resolve
```

The ultimate goal is an Auto DJ that can make a listener think:

> "That sounded like an actual turntablist making a decision."

---

# 1. IMPORTANT ARCHITECTURAL DECISION

> **Owner decision O1 (2026-10-12) overturns this section:** the Up Rough turntable simulation IS ported, as a TypeScript function turning each gesture into a platter speed curve for the existing worklet. See `2026-10-11-scratch-dj-progress.md` "Port of the Up Rough Demo System scratch engine".


## Do not rebuild DEViLBOX's scratch engine.

The current DEViLBOX engine already provides:

- `DeckEngine.startScratch()`
- `DeckEngine.setScratchVelocity()`
- `DeckEngine.stopScratch()`
- pattern playback
- scratch state
- signed forward/reverse playback
- scratch ring buffers
- fader automation
- platter physics
- jog scratching
- phase alignment
- reverb behavior
- state restoration

The scratch engine uses a 120-second stereo ring buffer and signed-rate playback with interpolation and smoothing.

Extend these primitives only where the new performer genuinely needs capabilities they cannot currently express.

Do not create:

- a second transport
- a second beat clock
- a second deck engine
- a second Auto DJ
- a second scratch scheduler
- a parallel audio playback architecture

---

# 2. THE FUNDAMENTAL CHANGE

The existing scratch system is essentially:

```text
PATTERN
  ↓
VELOCITY CURVE
  ↓
DECK
```

The new system becomes:

```text
MUSICAL CONTEXT
       ↓
PERFORMANCE INTENTION
       ↓
SOURCE SELECTION
       ↓
ANCHOR SELECTION
       ↓
GESTURE SELECTION
       ↓
PLACEMENT
       ↓
DENSITY
       ↓
PHRASE / ROUTINE
       ↓
REAL-TIME SCRATCH EXECUTION
       ↓
LISTEN / EVALUATE
       ↓
REST / ANSWER / ESCALATE / RESOLVE
```

This is the central architectural change.

---

# 3. USE THE UP ROUGH GENERATOR AS THE REFERENCE IMPLEMENTATION

> **Owner decision O1 (2026-10-12) overturns this section:** the Up Rough turntable simulation IS ported, as a TypeScript function turning each gesture into a platter speed curve for the existing worklet. See `2026-10-11-scratch-dj-progress.md` "Port of the Up Rough Demo System scratch engine".


Do not copy the Python renderer into TypeScript.

Instead port the **musical abstractions**.

The important Up Rough modules are:

```text
scratch.py
scratch_dj.py
scratch_routine.py
scratch_bank.py
three_deck.py
beat_juggle.py
turntable.py
```

The documented generator already has:

- 22 gestures
- gesture activity ranking
- vocabulary selection
- density states
- phrase planning
- source selection
- phrase validation
- phrase repair
- style palettes
- difficulty levels
- named routines
- 32-bar performance arcs
- scratch permission / two-hands budgeting
- record metadata
- anchors
- safe forward/reverse ranges
- word slices
- humanization
- deterministic generation

Those are the pieces to port.

The offline rendering, NumPy processing and simulated turntable physics are **not** the architecture to copy.

---

# 4. NEW HIGH-LEVEL ARCHITECTURE

Add a scratch performance subsystem above the existing engine:

```text
DJAutoDJ
   │
   ├── DJSessionController
   │
   ├── DJPerformanceContext
   │
   ├── DJSetPlanner
   │
   ├── DJTransitionPlanner
   │
   ├── DJJuggleController
   │
   └── DJScratchDJ
            │
            ├── ScratchPerformanceContext
            ├── ScratchSourceSelector
            ├── ScratchAnchorSelector
            ├── ScratchGestureEngine
            ├── ScratchPlacementEngine
            ├── ScratchPhrasePlanner
            ├── ScratchRoutineEngine
            ├── ScratchPerformanceArc
            ├── ScratchBudget
            ├── ScratchSafety
            └── ScratchExecutor
                         │
                         ↓
                  existing DEViLBOX
                  DeckEngine /
                  ScratchPlayback /
                  DJActions /
                  mixer / FX
```

Do not make `DJAutoDJ.ts` the scratch brain.

---

# 5. SCRATCH PERFORMANCE CONTEXT

Create a dedicated context.

Conceptually:

```ts
interface ScratchPerformanceContext {
  masterBeat: number
  masterBar: number
  phrasePosition: number

  bpm: number
  meter: number
  beatConfidence: number
  phraseConfidence: number

  section: DJSection
  nextSection?: DJSection

  energy: number
  targetEnergy: number

  activeDeck: "A" | "B" | "BOTH"

  outgoingDeck?: "A" | "B"
  incomingDeck?: "A" | "B"

  vocalActivity: number
  drumActivity: number
  bassActivity: number
  melodicActivity: number

  transitionType?: DJTransitionStyle

  juggleIntensity: number
  transitionIntensity: number

  scratchPermission: number
  scratchIntensity: number

  recentGestures: string[]
  recentSources: string[]
  recentRoutines: string[]

  style: ScratchDJStyle
}
```

This is the bridge between Auto DJ and the Up Rough scratch brain.

---

# 6. THE SCRATCH DJ MUST UNDERSTAND THE MUSIC

The scratch engine should consume the existing Auto DJ analysis instead of inventing another musical analysis system.

Auto DJ already has:

- beat grids
- downbeats
- bars
- phrases
- sections
- cue points
- activity timelines
- arrangement events
- tracker mix analysis

These are exactly the timing and musical inputs the current scratch patterns lack.

Therefore:

```text
DJTrackAnalysis
        ↓
ScratchPerformanceContext
```

not:

```text
ScratchDJ
   ↓
invent another BPM detector
```

---

# 7. SCRATCH SHOULD BE PHRASE-AWARE

The Up Rough generator works on a sixteenth grid, but its offline renderer assumes it owns the beat.

DEViLBOX must instead lock scratch events to the existing live beat/downbeat/phrase system.

The current DEViLBOX scratch pattern player starts from elapsed-time modulo cycle length rather than the detected beat grid.

That must change for Auto Scratch.

Use:

```text
beat
↓
bar
↓
phrase
↓
section
```

as the hierarchy.

---

# 8. SCRATCH GRID

Primary resolution:

```text
1/16 note
```

with support for:

```text
1/8
1/16
1/32
```

when the BPM and technique make that musically appropriate.

Never hard-code milliseconds.

Every generated event should look conceptually like:

```ts
{
  bar: 17,
  step: 14,
  beat: 68.875,
  gesture: "chirp",
  velocity: 0.82,
  source: "AH_STANDARD",
  anchor: "vowel",
  role: "response"
}
```

Then the real-time scheduler translates that into DEViLBOX engine operations.

---

# 9. PORT THE UP ROUGH GESTURE VOCABULARY

Create a TypeScript gesture catalogue derived from the proven Up Rough definitions.

Minimum vocabulary:

```text
baby
babySlow

forwardStab
backwardStab

chirp
chirpDouble

transformer4
transformer8

flare1
flare2

orbit

crab
scribble

hydroplane

tearForward
tearReverse

twiddle

drag

laser
phaser

tweak
vibrato
```

DEViLBOX already has 19 built-in patterns covering much of this vocabulary.

The task is therefore:

**upgrade the representation and performance logic, not throw away the existing catalogue.**

---

# 10. GESTURE DATA MODEL

Extend the existing scratch pattern representation so a gesture can express:

```ts
interface ScratchGesture {
  id: string

  durationSteps: number

  activity: number

  difficulty: 1 | 2 | 3 | 4

  styles: ScratchDJStyle[]

  roles: ScratchRole[]

  handPath?: ScratchHandPath[]

  velocityCurve: ScratchVelocityPoint[]

  faderWindows: ScratchFaderWindow[]

  cutLeadMs?: number

  trueReverse: boolean

  returnsToAnchor: boolean

  recommendedBpm?: {
    min?: number
    max?: number
  }

  intensity: number

  requiresReverse: boolean

  allowsSampleSource: boolean
}
```

The important addition is:

```text
returnsToAnchor
```

The current DEViLBOX Stab/Laser behavior does not truly re-cue to a fixed source point, so repeated stabs drift through the track.

A real autonomous scratch DJ needs a concept of a musical scratch "home."

---

# 11. ANCHOR-BASED SCRATCHING

This is one of the biggest improvements.

A scratch source should have:

```text
source
anchor
safe region
safe forward range
safe reverse range
```

For example:

```text
AH_STANDARD
  anchor = vowel center
  safeForward = ...
  safeReverse = ...
```

The Up Rough metadata already contains:

- anchor attack
- anchor vowel
- anchor tail
- safe range
- safe forward range
- safe reverse range
- word slices
- transient information
- voiced amount
- onset rate
- recommended gestures
- recommended roles
- recommended styles

This metadata is precisely what DEViLBOX currently lacks.

---

# 12. DO NOT JUST SCRATCH THE PLAYING SONG

The new scratch DJ should have three source classes.

## Source A — Scratch Crate

Dedicated scratch material:

```text
AH
YEAH
FRESH
COUNTS
PHRASES
HORNS
STABS
NOISE
etc.
```

## Source B — Extracted Song Material

When analysis permits:

```text
vocal hit
drum hit
bass hit
synth stab
fill
phrase fragment
```

from the playing track.

## Source C — Deck Scratch

Scratch the actual playing deck using the existing DEViLBOX scratch engine.

These sources should be selected according to context.

---

# 13. SOURCE SELECTION LOGIC

Implement:

```text
ScratchSourceSelector
```

with scoring.

Example:

```text
source score =
    musicalRoleFit
  + sectionFit
  + styleFit
  + gestureCompatibility
  + anchorQuality
  + energyFit
  + novelty
  + phraseFit
  - vocalCollision
  - bassConflict
  - repetition
  - confidenceRisk
```

Examples:

### Breakdown

Prefer:

```text
voice
phrase
AH
YEAH
FRESH
```

### Drum break

Prefer:

```text
COUNT
snare
kick
percussion
```

### High-energy drop

Prefer:

```text
stab
chirp
transformer
flare
```

### Low-energy transition

Prefer:

```text
baby
drag
slow chirp
```

---

# 14. LOAD THE SCRATCH CRATE AS A CATALOGUE

DEViLBOX already contains most of the physical scratch sample files, but currently treats them primarily as numbered FX samples.

The research found that 50 of the Up Rough records are already byte-identical to DEViLBOX files, and the major missing ingredient is **metadata rather than audio**.

Create a catalogue mapping:

```text
canonicalName
→
DEViLBOX filename
→
category
→
roles
→
styles
→
gestures
→
anchor
→
safe range
→
word slices
```

Do not duplicate the audio unnecessarily.

---

# 15. LICENSING CHECK

Before shipping any additional scratch audio:

- verify provenance
- verify redistribution rights
- do not blindly copy the missing phrase sample
- do not assume "already in the demo system" means publicly redistributable

The research specifically found that provenance/licensing for the scratch recordings is not documented and that the public DEViLBOX repository makes this a real deployment concern.

This is a release gate, not a coding detail.

---

# 16. SAMPLE SCRATCH VOICE

Do not load a scratch sample as the active DJ deck merely to scratch it.

That would interfere with the deck's actual musical role.

Instead implement a dedicated scratch-record voice that reuses the existing scratch playback principles.

Preferred architecture:

```text
ScratchRecordVoice
       ↓
existing signed-rate scratch reader primitive
       ↓
scratch bus
       ↓
DJ mixer
```

It must support:

```text
anchor position
safe forward range
safe reverse range
signed playback
velocity curve
fader windows
cue/reset
```

This is an extension of the scratch engine, not a second transport.

The existing ring-buffer reader already provides signed-rate stereo playback and interpolation.

---

# 17. POSITION-DRIVEN GESTURES

The Up Rough gestures describe a hand movement in terms of source position.

DEViLBOX currently primarily receives:

```text
signed rate
```

rather than:

```text
move record from position A to B over T
```

as an explicit primitive.

Therefore introduce an internal conversion layer:

```text
ScratchGesturePositionCurve
        ↓
ScratchRateCurve
        ↓
setScratchVelocity()
```

or extend the scratch engine with a position-driven operation if that is cleaner at the engine layer.

Do not expose this complexity to the Auto DJ planner.

The planner thinks in:

```text
anchor
stroke
direction
duration
velocity
```

The engine handles rate conversion.

---

# 18. TRUE RE-CUE

For:

```text
stab
forwardStab
backwardStab
laser
chirp
```

the performer should be able to say:

```text
start at anchor
stroke
return to anchor
stroke again
```

instead of:

```text
continue drifting through the track
```

This is essential to making a repeated scratch phrase sound like an intentional DJ performance.

---

# 19. FADER MODEL

The Up Rough system's fader model contains richer cut windows and velocity-dependent ramps.

DEViLBOX currently uses fixed short ramps and deck channel gain for many scratch patterns.

Extend the pattern representation to support:

```text
open windows
cut windows
cut lead
ramp duration
battle-style response
```

Keep the current DEViLBOX implementation as the execution layer.

---

# 20. REAL CROSSFADER VS DECK FADER

Distinguish:

```text
deck scratch fader
```

from:

```text
mixer crossfader
```

The existing scratch patterns primarily operate the deck's channel gain rather than the DJ mixer's crossfader.

Use:

### Deck fader

For:

- transformer
- crab
- flare
- chirp
- scratch articulation

### Crossfader

For:

- deck trading
- beat juggling
- A/B cuts
- transformer-style deck switching
- actual two-deck turntablist performances

Never silently substitute one for the other.

---

# 21. SCRATCH PLACEMENT ENGINE

Port the Up Rough placement concepts:

```text
DENSITY_RATE
SECTION_DENSITY
_STEPS
gesture_activity
vocabulary
plan_phrase
validate_phrase
repair_phrase
```

These are pure decision functions and are therefore ideal for a deterministic TypeScript implementation.

The new version should take:

```text
style
section
energy
phrase
BPM
gesture level
source availability
vocal activity
drum activity
bass activity
juggle intensity
transition type
seed
```

and return:

```text
ScratchEvent[]
```

---

# 22. DENSITY MUST BE MUSICAL

Never interpret:

```text
more energy = more scratches every bar
```

Instead:

```text
more energy
→
higher maximum density
→
more complex gesture vocabulary
→
shorter rests
→
larger gesture vocabulary
```

while still allowing silence.

The Up Rough generator deliberately uses density states and rest probability rather than filling every available subdivision.

---

# 23. RESTS ARE PART OF THE PERFORMANCE

The scratch DJ must deliberately choose:

```text
PLAY
REST
PLAY
REST
BUILD
REST
BURST
REST
PAYOFF
```

not:

```text
SCRATCH SCRATCH SCRATCH SCRATCH
```

Use role-sensitive rest probabilities.

For example:

```text
feature:
  low rest

answer:
  medium rest

intro:
  high rest

transition:
  adaptive rest

peak:
  lower rest
```

But preserve enough silence for the scratches to remain meaningful.

---

# 24. VOCAL AWARENESS

If the underlying song contains a strong vocal phrase:

```text
scratch density ↓
```

unless the scratch is intentionally responding to the vocal.

Examples:

```text
VOCAL:
"check this out"

SCRATCH:
"check"
"check"
"check-this"
```

or:

```text
VOCAL PHRASE
      ↓
scratch response
      ↓
vocal continues
```

Never blindly place a dense scratch routine over the most important vocal phrase.

---

# 25. CALL AND RESPONSE

Make call/response a first-class scratch concept.

Roles:

```text
THEME
ANSWER
ACCENT
FILL
FEATURE
INTRO
OUTRO
TRANSITION
```

Example:

```text
bar 1:
AH

bar 2:
YEAH

bar 3:
AH

bar 4:
FRESH
```

Or:

```text
Deck A vocal
↓
scratch "yeah"
↓
Deck B drum fill
↓
scratch "fresh"
```

This should connect directly to the beat-juggling system.

---

# 26. SCRATCH + BEAT JUGGLE

The previously designed beat-juggling engine and scratch engine should become coordinated performers.

Conceptually:

```text
             PERFORMANCE BRAIN
                    │
        ┌───────────┴───────────┐
        │                       │
   BEAT JUGGLE              SCRATCH
        │                       │
      Deck A/B               Record/Deck
        │                       │
        └───────────┬───────────┘
                    │
                TWO HANDS
```

The Up Rough three-deck system already models a two-hands budget in which harder juggling reduces available scratch complexity.

Bring this idea into DEViLBOX.

---

# 27. PERFORMANCE HANDS BUDGET

Create a global performance budget.

Example:

```text
budget = 6
```

Cost examples:

```text
normal blend          0
EQ movement            1
filter movement        1
short scratch          1
complex scratch        2
phrase juggling        2
beat juggling          3
aggressive juggling    4
```

Then:

```text
availableScratch =
  budget
  - juggleCost
  - transitionCost
  - FXCost
```

This prevents:

```text
beat juggling
+
crab
+
transformer
+
filter sweep
+
echo throw
+
bass swap
```

from all happening simultaneously.

---

# 28. PRIORITY ORDER

When too many performance ideas compete:

```text
1. timing / musical stability
2. deck synchronization
3. transition integrity
4. bass ownership
5. vocal clarity
6. beat juggling
7. scratch feature
8. secondary FX
9. humanization
```

Never sacrifice timing for a scratch trick.

---

# 29. 32-BAR SCRATCH ARC

Port the Up Rough `scratch_dj` philosophy.

Create a configurable performance arc such as:

```text
0–4:
ESTABLISH

4–8:
BUILD

8–12:
DEVELOP

12–16:
CALL / RESPONSE

16–20:
INTENSIFY

20–24:
FEATURE

24–28:
PEAK

28–31:
BURST

31–32:
RESOLUTION
```

Do not require every scratch performance to use exactly 32 bars.

The 32-bar arc is a **performance template**, not a hard transport structure.

---

# 30. ARC SHOULD FOLLOW DJ SET STRUCTURE

For a normal Auto DJ set:

```text
INTRO
  ↓
short / sparse scratch

BUILD
  ↓
more gestures

DROP
  ↓
short feature

GROOVE
  ↓
occasional accents

BREAKDOWN
  ↓
space / vocal scratches

BUILD
  ↓
escalation

DROP
  ↓
peak scratch burst

OUTRO
  ↓
resolution
```

This combines the Up Rough arc with Auto DJ's existing section analysis.

---

# 31. SCRATCH LEVELS

Port the Up Rough difficulty ladder.

Suggested:

## Level 1 — Foundation

```text
baby
babySlow
drag
forwardStab
```

## Level 2 — Musical

```text
chirp
chirpDouble
transformer4
tear
```

## Level 3 — Advanced

```text
flare
transformer8
scribble
tearReverse
```

## Level 4 — Battle

```text
orbit
crab
hydroplane
3-click flare
8-finger crab
```

The Up Rough system already uses a four-level vocabulary and style-specific maximum levels.

---

# 32. STYLE PALETTES

Implement style profiles.

### Old School

Prefer:

```text
baby
stab
drag
chirp
```

Low density.

### Boom Bap

Prefer:

```text
stab
baby
chirp
tear
```

Medium density.

### Electro

Prefer:

```text
transformer
flare
chirp
```

Higher rhythmic precision.

### Battle

Allow:

```text
flare
orbit
crab
scribble
hydroplane
```

High complexity.

### Lo-Fi

Prefer:

```text
drag
babySlow
slow chirp
```

Low density and restrained FX.

These palettes should be configurable rather than hard-coded into Auto DJ.

---

# 33. GENRE ADAPTATION

Add optional DJ genre/style hints:

```text
hipHop
breakbeat
electro
house
techno
drumAndBass
jungle
downtempo
experimental
```

The genre should influence:

- gesture vocabulary
- density
- timing placement
- scratch duration
- FX amount
- allowed difficulty
- phrase length
- rest probability

It should not completely dictate the result.

---

# 34. BPM-AWARE TECHNIQUE SELECTION

Do not blindly use the same technique at every BPM.

For example:

```text
very high BPM:
  fewer long gestures
  less dense slow scratches
  carefully controlled crab/scribble

moderate BPM:
  broad vocabulary

slow BPM:
  baby
  drag
  chirp
  longer phrases
```

The system should use technique suitability rather than hard prohibitions wherever possible.

---

# 35. HUMANIZATION

Port the Up Rough humanization concept, but make it subordinate to DEViLBOX's live clock.

Use tiny timing variation:

```text
approximately -8ms to +10ms
```

as an initial tuning range, derived from the proven generator.

But:

- never move outside the musical window
- never allow humanization to break phase
- do not apply the same offset to every event
- do not make fast battle techniques sloppy

The existing Up Rough generator uses small event-level timing variation rather than gross timing errors.

---

# 36. DETERMINISTIC PERFORMANCE GENERATION

Port the deterministic seeded generation.

Given:

```text
track
section
bar
style
energy
seed
```

the same planner should produce the same candidate performance.

Use a deterministic PRNG.

This gives:

- reproducible tests
- predictable debugging
- stable performances
- easy A/B comparison
- no inexplicable behavior

Then allow a new seed when a new performance is desired.

---

# 37. SCRATCH ROUTINES

Port the Up Rough named routines as reusable phrase grammar.

Examples:

```text
intro
call
response
accent
fill
showcase
break
resolution
```

A routine should contain semantic events:

```ts
{
  role: "CALL",
  gesture: "chirp",
  sourceRole: "VOCAL",
  step: 4
}
```

rather than only:

```ts
playPattern("chirp")
```

---

# 38. SOURCE + GESTURE COMPATIBILITY

Every source should have recommended techniques.

For example:

```text
AH_STANDARD
  baby
  chirp
  flare
  orbit
  tear
  scribble

COUNT
  forwardStab
  transformer8

YEAH_RESPONSE
  baby
  chirp
  drag
```

The source selector should prefer compatible combinations.

The Up Rough catalogue already contains recommended gestures, roles and styles.

---

# 39. CLEAN SOURCE VS PRE-SCRATCHED SOURCE

The catalogue must distinguish:

```text
clean
```

from:

```text
pre-scratched
```

Pre-scratched audio should generally be treated as:

```text
FX
accent
transition
one-shot
```

not fed into the scratch engine as if it were clean vinyl.

---

# 40. WORD-SLICE INTELLIGENCE

If a source contains multiple words:

```text
IF
YOU
REALLY
LIKE
TO
ROCK
THE
FUNKY
BEAT
```

the performer should be able to choose:

```text
whole phrase
specific word
last word
anchor vowel
```

and create patterns such as:

```text
WHOLE
↓
LAST WORD
↓
LAST WORD
↓
WHOLE
```

This is one of the strongest musical ideas in the Up Rough routine system.

---

# 41. "THROW THEN SCRATCH"

A scratch should often begin with a clean throw.

Example:

```text
CLEAN:
"FRESH!"

then:

scratch:
FRESH
FRESH
FRESH
```

rather than immediately launching into an opaque scratch.

This gives the listener a recognizable source before manipulation.

The Up Rough routines explicitly use clean phrase/word throws before chopping the selected word.

---

# 42. SCRATCH BUS

Create a dedicated scratch treatment path if the existing mixer architecture allows it without duplication.

Target character from the Up Rough system:

```text
HPF
presence
light saturation
short tape delay
room/plate reverb
LPF
headroom
```

The documented reference chain is approximately:

```text
HP 160 Hz
presence 1.5–3 kHz
tanh drive .09
delay .20 s
feedback .32
mix .14
reverb .28
LP 5 kHz
```



However:

**reuse DEViLBOX's existing mixer/FX primitives.**

Do not create an independent DSP framework.

---

# 43. SCRATCH REVERB / DELAY

Use ambience intelligently.

A scratch can benefit from:

```text
short reverb
delay throw
```

but not every scratch should be wet.

Recommended:

```text
ordinary scratch:
  dry / lightly wet

feature:
  moderate ambience

final scratch:
  optional echo/reverb tail
```

Do not overlap an echo-out and a scratch throw on the same source unless deliberately planned.

---

# 44. DUB INTEGRATION

Scratch and Dub should cooperate rather than fight.

Possible modes:

### Dry battle

```text
scratch
↓
dry
```

### Dubbed scratch

```text
scratch
↓
echo/reverb
```

### Transition scratch

```text
scratch
↓
delay
↓
incoming track
```

The scratch performer should declare an FX request rather than directly manipulating the Dub engine.

---

# 45. SCRATCH + TRANSITION COMPATIBILITY

Add scratch compatibility to `DJTransitionPlan`.

Good combinations:

```text
longBlend + sparse scratch
shortBlend + chirp
breakdownMix + vocal scratch
dropMix + transformer
hardCut + stab
drumIntroMix + drum scratch
```

Risky combinations:

```text
echoOut + heavy scratch
vocalSwap + vocal scratch
dense bassSwap + bass scratch
filterBuild + dense scratch
```

The planner should understand these conflicts.

---

# 46. SCRATCH AS A TRANSITION

Sometimes the scratch is the transition.

Example:

```text
A full groove
↓
A 4-bar scratch feature
↓
transformer cuts
↓
B enters
↓
release
```

Other times the scratch is merely decoration:

```text
A + B normal blend
        +
small scratch accents
```

The planner must distinguish:

```text
scratchAccent
scratchFeature
scratchTransition
scratchBattle
```

---

# 47. SCRATCH AS AN OUTGOING-DECK PERFORMANCE

A particularly useful DJ behavior:

```text
incoming track ready
outgoing track reaches phrase end
↓
scratch outgoing material
↓
reduce outgoing deck
↓
incoming track drops
```

This gives Auto DJ a very human transition vocabulary.

---

# 48. SCRATCH AS A VOCAL RESPONSE

If incoming track has a strong vocal:

```text
outgoing:
drum groove

incoming:
"HEY!"

scratch:
"YEAH!"
```

Then:

```text
incoming full groove
```

This should be treated as a call/response performance, not an FX event.

---

# 49. SCRATCH + BEAT JUGGLE PERFORMANCE

At peak moments:

```text
A drum loop
B drum loop
+
scratch vocal
```

Then:

```text
A/B phrase trade
+
scratch response
```

Then:

```text
A+B payoff
```

This is the highest-performance mode.

The hands budget must control it.

---

# 50. SCRATCH PERFORMANCE STATES

Create explicit states:

```text
IDLE
LISTENING
SETUP
THROW
SCRATCHING
CALL
RESPONSE
ESCALATING
FEATURE
RESOLVING
REST
ABORTING
```

This makes the system a performer rather than a timer.

---

# 51. STATE MACHINE EXAMPLE

```text
IDLE
 ↓
LISTENING
 ↓
OPPORTUNITY_FOUND
 ↓
SOURCE_SELECTED
 ↓
ANCHOR_SELECTED
 ↓
GESTURE_SELECTED
 ↓
SETUP
 ↓
THROW
 ↓
SCRATCH
 ↓
REST
 ↓
EVALUATE
 ├── REST
 ├── ANSWER
 ├── ESCALATE
 └── RESOLVE
```

---

# 52. EVALUATION AFTER EACH PHRASE

After every scratch phrase evaluate:

```text
Did it fit?
Did the energy improve?
Did it collide with vocals?
Did bass clarity remain?
Did the timing remain stable?
Did it repeat a recent idea?
Is the audience-energy proxy rising?
```

Then choose:

```text
continue
answer
escalate
rest
resolve
```

This is the key difference between a generator and a performer.

---

# 53. PERFORMANCE MEMORY

Remember:

```text
recent gestures
recent sources
recent routines
recent intensities
recent transition types
successful pairings
```

Do not immediately repeat:

```text
AH + chirp
```

after just using:

```text
AH + chirp
```

Instead vary:

```text
YEAH + baby
COUNT + transformer
FRESH + flare
```

or rest.

---

# 54. SCRATCH COOLDOWNS

Add cooldowns by:

```text
source
gesture
routine
intensity
performance type
```

Example:

```text
crab:
  long cooldown

scribble:
  medium cooldown

baby:
  short cooldown

AH_STANDARD:
  medium cooldown
```

This prevents the performer from discovering one impressive trick and abusing it forever.

---

# 55. PERFORMANCE BUDGET

Track:

```text
scratch energy
juggle energy
FX energy
transition energy
```

Total creative activity should have a budget.

For example:

```text
0–25:
normal DJ

25–50:
occasional scratch

50–75:
performance mode

75–100:
feature/battle
```

Then return toward zero after a feature.

---

# 56. PEAK PERFORMANCE MODE

At a true set peak allow:

```text
advanced gestures
shorter phrase subdivisions
beat juggling
doubles
call-response
sample throws
transformer
flare
crab
```

But still enforce:

- beat alignment
- bass safety
- vocal safety
- no-silence
- action conflicts
- maximum cut rate
- emergency fallback

---

# 57. RELEASE IS CRITICAL

A world-class scratch DJ knows when to stop.

Do not simply:

```text
stopPattern()
```

and hope for the best.

Plan a musical ending:

```text
final gesture
↓
final word / stab
↓
fader close
↓
scratch tail
↓
grid re-entry
```

The current engine already has scratch decay and phase-alignment mechanisms; reuse them.

---

# 58. GRID RE-ENTRY

At the end of a scratch feature:

1. determine target deck
2. determine target beat/bar
3. end scratch gesture before that boundary
4. restore source state
5. phase-align if required
6. restore fader
7. allow normal playback to resume

The scratch should never leave the DJ in an ambiguous timing state.

---

# 59. SAFETY GOVERNOR

Creative planning and safety must be separate.

The governor blocks:

```text
both decks silent
invalid deck
invalid source
unsafe sample range
conflicting scratch actions
excessive rate
excessive cut density
vocal collision
bass collision
stuck scratch state
```

The creative planner may ask for something ambitious.

The safety layer gets final authority.

---

# 60. STATE RESTORATION

Every scratch operation must restore everything it changes.

The existing DEViLBOX code already learned this lesson with scratch state restoration: rate, gain, capture state and note suppression must be restored to their **previous values**, not blindly set to assumed defaults.

Apply this rule universally.

---

# 61. USER CONTROL

Add Auto Scratch controls to the DJ View.

Suggested:

```text
AUTO SCRATCH
  OFF
  SAFE
  MUSICAL
  PERFORMER
  BATTLE
```

Then:

```text
Intensity
Style
Source
Scratch Level
```

Optional:

```text
Sample Scratch
Deck Scratch
Both
```

Avoid exposing dozens of implementation knobs.

The UI should express musical intent.

---

# 62. AUTO SCRATCH MODES

## SAFE

```text
baby
stab
chirp
sparse
```

## MUSICAL

```text
chirp
transformer
tear
call/response
sample throws
```

## PERFORMER

```text
flare
orbit
scribble
juggle
doubles
```

## BATTLE

```text
full vocabulary
high density
advanced routines
complex deck interaction
```

Even BATTLE mode must obey safety.

---

# 63. MANUAL USER OVERRIDE

If the user touches:

- platter
- crossfader
- deck gain
- scratch control
- cue
- transport

the Auto Scratch performer must immediately yield affected controls.

Do not have the AI fight the user's hand.

After the manual intervention:

```text
re-evaluate
```

rather than blindly resuming the previous routine.

---

# 64. DEBUG VIEW

Expose developer telemetry:

```text
SCRATCH DJ
───────────────
State: FEATURE
Style: BOOMBAP
Level: 3
Energy: 0.81

Source:
AH_STANDARD

Anchor:
VOWEL

Gesture:
CHIRP_DOUBLE

Role:
RESPONSE

Bar:
48
Step:
13

Next:
FLARE2

Reason:
vocal response / peak section

Confidence:
0.94

Scratch budget:
3 / 6

Juggle budget:
2 / 6
```

This will be essential for tuning.

---

# 65. DECISION LOG

Every autonomous scratch should be explainable.

Example:

```text
SCRATCH_SELECTED

reason:
  breakdown approaching
  vocal activity low
  outgoing deck has strong rhythmic material
  scratch budget available
  recent gesture diversity high

source:
  AH_STANDARD

gesture:
  CHIRP

placement:
  beat 128.75

duration:
  1/4 beat
```

---

# 66. DETERMINISTIC UNIT TESTING

The placement brain should be pure wherever possible.

Test:

```text
same seed
same context
=
same events
```

Test:

```text
different seed
=
valid but different events
```

Test:

```text
high energy
=
higher allowed complexity
```

Test:

```text
vocal heavy
=
scratch density reduced
```

Test:

```text
low confidence
=
safe/simple gestures
```

---

# 67. PATTERN DATA TESTS

Continue existing tests for:

- names
- frame ordering
- fader ranges
- true reverse
- duration

Then add:

```text
anchor validity
safe range validity
gesture/style compatibility
gesture/difficulty validity
fader window validity
cut lead validity
```

The existing test suite currently validates structural scratch data but does not test complete end-to-end sound behavior, so add real reachability tests.

---

# 68. END-TO-END TEST

At least one test must drive:

```text
Auto DJ
 ↓
Scratch DJ
 ↓
source selection
 ↓
gesture selection
 ↓
scheduler
 ↓
real DeckEngine
 ↓
scratch engine
```

and prove that the scratch actually executes.

This is especially important because current scratch tests largely validate individual engine/action behavior rather than complete pattern-to-deck performance.

---

# 69. GOLDEN PERFORMANCE TESTS

Create deterministic golden scenarios.

## Test 1 — Boom Bap

```text
92 BPM
4/4
medium energy
```

Expected:

```text
baby
stab
chirp
call/response
```

---

## Test 2 — Peak Battle

```text
100 BPM
high energy
```

Expected:

```text
flare
orbit
transformer
crab
```

with rests.

---

## Test 3 — House

Expected:

```text
sparse
rhythmic
transformer accents
```

rather than constant vocal scratching.

---

## Test 4 — Drum & Bass

Expected:

```text
short precise gestures
high rhythmic alignment
limited long drag gestures
```

---

## Test 5 — Vocal Track

Expected:

```text
scratch density reduction
or
intentional vocal response
```

---

## Test 6 — Breakdown

Expected:

```text
sample throw
baby
chirp
rest
```

---

## Test 7 — Drop

Expected:

```text
escalation
short high-impact feature
release
```

---

## Test 8 — Low Confidence

Expected:

```text
no battle-level scratch
normal DJ behavior
```

---

# 70. SAMPLE CATALOGUE TESTS

Verify every catalogue record:

```text
filename exists
metadata exists
anchor valid
safe range valid
forward range valid
reverse range valid
recommended gestures valid
```

No scratch source may enter the performer without validated metadata.

---

# 71. SAMPLE AUDIO TESTS

For each source category test:

```text
forward scratch
reverse scratch
anchor return
rapid repeat
stop
release
```

Verify:

- no click explosion
- no runaway position
- no invalid reverse range
- no accidental silence
- no DC/level problem
- no stuck voice

---

# 72. REAL-TIME PERFORMANCE TESTS

Test:

```text
BPM changes
tempo sync changes
deck changes
manual intervention
transition cancellation
Auto DJ stop
deck load
deck unload
```

while a scratch is active.

The scratch must gracefully abort or replan.

---

# 73. LONG-SET TEST

Run an extended Auto DJ session.

Verify:

```text
no stale scratch events
no memory leaks
no stuck sample voices
no stuck fader
no stuck deck scratch
no increasing timer count
no repeated source abuse
no repeated routine abuse
no phase drift
```

---

# 74. PERFORMANCE ARC TEST

Verify a complete:

```text
32-bar scratch feature
```

such as:

```text
bars 1–4
establish

5–8
build

9–12
call

13–16
response

17–20
develop

21–24
feature

25–28
peak

29–31
burst

32
resolution
```

The output must contain genuine rests.

---

# 75. SCRATCH + JUGGLE TEST

Run:

```text
Deck A
Deck B
beat juggling
+
scratch sample
```

and verify:

- no timing conflict
- no silence
- no crossfader fight
- bass ownership remains valid
- scratch remains audible
- final release returns to the beat grid

---

# 76. SCRATCH + TRANSITION TEST

Test:

```text
longBlend + scratch
shortBlend + scratch
dropMix + scratch
breakdownMix + scratch
hardCut + scratch
echoOut + scratch
```

The planner should reject or adapt conflicting combinations.

---

# 77. DO NOT OVER-SCRATCH

The most important artistic rule:

> A scratch is valuable because it is not happening all the time.

The system should spend much of the set doing nothing.

A good performance may look like:

```text
normal mix
normal mix
small scratch
normal mix
normal mix
call/response
normal mix
long rest
feature
normal mix
```

This is much more convincing than nonstop turntablism.

---

# 78. DO NOT MAKE THE SCRATCH DJ RANDOM

Randomness is only used for variation.

The core system must be deterministic and contextual.

Bad:

```text
random gesture
random source
random timing
random density
```

Good:

```text
musical context
→
candidate gestures
→
candidate sources
→
weighted choice
→
validated phrase
→
performance
```

---

# 79. DO NOT PORT THE OFFLINE PHYSICS LITERALLY

> **Owner decision O1 (2026-10-12) overturns this section:** the Up Rough turntable simulation IS ported, as a TypeScript function turning each gesture into a platter speed curve for the existing worklet. See `2026-10-11-scratch-dj-progress.md` "Port of the Up Rough Demo System scratch engine".


The Up Rough turntable simulator is useful reference material, but DEViLBOX already has real-time platter physics and signed-rate playback.

The documented porting warning is explicit: the offline Python renderer cannot simply be transplanted because DEViLBOX's live scheduler, deck position, tempo and worklet architecture are different.

Port:

```text
gesture mathematics
```

not:

```text
offline audio renderer
```

---

# 80. DO NOT CREATE A GIANT GENERATOR CLASS

Keep the architecture modular.

Recommended conceptual files:

```text
src/engine/dj/scratch/
    DJScratchDJ.ts
    ScratchPerformanceContext.ts
    ScratchGestureCatalog.ts
    ScratchPlacementEngine.ts
    ScratchSourceSelector.ts
    ScratchAnchorSelector.ts
    ScratchPhrasePlanner.ts
    ScratchRoutineEngine.ts
    ScratchPerformanceArc.ts
    ScratchBudget.ts
    ScratchSafety.ts
    ScratchExecutor.ts
    ScratchRecordVoice.ts
    scratchCatalogue.ts
```

Exact names may follow existing repository conventions.

---

# 81. INTEGRATE WITH EXISTING DJ ACTION INFRASTRUCTURE

The current code has an existing DJ FX action path supporting Auto DJ-originated actions, while scratch currently has its own action type/path.

Before creating another dispatch mechanism, determine whether scratch actions should:

```text
join the existing DJ action registry
```

or:

```text
generalize the action registry
```

The preferred outcome is one coherent execution path.

Do not create:

```text
Auto DJ action system
+
Scratch DJ action system
+
Juggle action system
```

that independently manipulate the same mixer.

---

# 82. SCRATCH ACTION TYPES

Conceptually:

```text
ScratchThrow
ScratchGesture
ScratchCut
ScratchCue
ScratchAnchor
ScratchLoop
ScratchDeckScratch
ScratchSampleScratch
ScratchRelease
```

These should be executable by the existing DJ action infrastructure where appropriate.

---

# 83. SCRATCH EVENT MODEL

A final planned event should look conceptually like:

```ts
interface ScratchEvent {
  executeAtBeat: number

  durationBeats: number

  role:
    | "INTRO"
    | "THEME"
    | "ANSWER"
    | "ACCENT"
    | "FILL"
    | "FEATURE"
    | "TRANSITION"
    | "OUTRO"

  source: ScratchSource

  anchor: ScratchAnchor

  gesture: ScratchGestureId

  velocity: number

  humanizeMs: number

  intensity: number

  deck?: "A" | "B"

  returnToAnchor: boolean
}
```

The planner owns this.

The executor owns turning it into audio.

---

# 84. SCRATCH SOURCE MODEL

```ts
type ScratchSource =
  | {
      type: "CRATE"
      recordId: string
      anchor: ScratchAnchor
    }
  | {
      type: "DECK"
      deck: "A" | "B"
      anchor: DeckScratchAnchor
    }
  | {
      type: "TRACKER_CHANNEL"
      deck: "A" | "B"
      channelId: number
      segmentId: string
      anchor: number
    }
  | {
      type: "TRACKER_SAMPLE"
      deck: "A" | "B"
      sampleId: string
      anchor: number
    }
```

This is where tracker-native DEViLBOX intelligence becomes extremely powerful.

---

# 85. TRACKER-NATIVE SCRATCHING

For tracker decks, the scratch DJ should be able to identify:

```text
drum hit
bass hit
lead stab
vocal-like sample
fill
pattern change
instrument change
phrase boundary
```

and potentially select those as scratch material.

The Auto DJ analysis already has tracker-specific mix information.

Do not permanently classify a tracker channel.

Use time-varying channel segments.

---

# 86. TRACKER CHANNEL SEGMENTS

For example:

```text
Channel 4

bars 0–16:
percussion

bars 16–32:
bass

bars 32–48:
lead

bars 48–64:
percussion
```

The scratch DJ should ask:

```text
What is this channel doing RIGHT NOW?
```

not:

```text
What is channel 4?
```

---

# 87. EXTRACTED TRACK MATERIAL

Where practical, identify scratchable events from tracker/audio analysis:

```text
vocal onset
snare
kick
stab
sample
fill
phrase hit
```

Then create temporary scratch anchors.

This gives DEViLBOX a powerful ability:

```text
scratch the song itself
```

without needing to preload an external scratch sample.

---

# 88. THREE SOURCE STRATEGY

The final source selector should choose among:

```text
1. dedicated scratch crate
2. extracted song material
3. live deck scratch
```

Example:

### Hip-hop breakdown

```text
crate vocal
```

### Tracker demo

```text
tracker sample
```

### House transition

```text
live deck scratch
```

### Vocal call/response

```text
song vocal hit
```

This is the beginning of a genuinely intelligent scratch DJ.

---

# 89. SCRATCH QUALITY SCORE

After each performance phrase calculate:

```text
timing
musical fit
source quality
gesture quality
phrase coherence
energy fit
vocal clarity
bass clarity
novelty
transition quality
```

Then:

```text
ScratchQualityScore
```

Store it in session memory.

---

# 90. PERFORMANCE MEMORY SHOULD INFORM FUTURE CHOICES

If:

```text
AH + chirp
```

was successful at:

```text
breakdown → drop
```

that combination can receive a small preference later.

If:

```text
crab + dense vocal
```

was poor:

```text
penalize similar future situations
```

Keep the first implementation deterministic and transparent.

Do not introduce opaque machine learning just for this.

---

# 91. REACHABILITY REQUIREMENT

Every major phase must be reachable through the real DJ View.

Do not consider a feature complete because:

```text
the planner returns an event
```

It is complete only when:

```text
DJ View
→ Auto DJ
→ scratch performer
→ real executor
→ real audio
```

works.

The project already treats reachability as the definition of done.

---

# 92. IMPLEMENTATION GATES

## GATE A — BASELINE LOCK

Verify existing scratch behavior.

Verify:

- manual scratch
- existing patterns
- platter
- crossfader
- stop
- release
- phase alignment
- tracker scratch
- audio scratch

### Completion

Existing scratch regression tests pass.

---

# GATE B — GESTURE CATALOGUE

Port the Up Rough gesture definitions into the DEViLBOX representation.

### Completion

Every gesture has:

- duration
- velocity
- fader windows
- difficulty
- style
- activity
- reverse requirement
- anchor behavior

and passes structural tests.

---

# GATE C — SCRATCH RECORD CATALOGUE

Add metadata for the existing DEViLBOX scratch crate.

### Completion

The planner can ask:

```text
give me a vocal source suitable for chirp at level 2
```

and receive a valid record.

---

# GATE D — ANCHOR / RE-CUE ENGINE

Implement stable scratch anchors.

### Completion

A stab can repeatedly hit the same source point instead of drifting.

---

# GATE E — MUSICAL CLOCK INTEGRATION

Connect scratch scheduling to:

- beat
- downbeat
- bar
- phrase
- section

### Completion

Scratch events land on the same musical grid as Auto DJ.

---

# GATE F — PLACEMENT BRAIN

Port:

```text
gesture_activity
vocabulary
density
rest probability
plan_phrase
validation
repair
```

### Completion

The system generates complete musical scratch phrases rather than isolated pattern calls.

---

# GATE G — SOURCE SELECTION

Implement:

```text
crate
deck
tracker
```

source classes.

### Completion

Source selection changes according to musical context.

---

# GATE H — 32-BAR PERFORMANCE ARC

Implement:

```text
establish
build
call
response
develop
feature
peak
burst
resolution
```

### Completion

A complete deterministic scratch feature can be generated and performed.

---

# GATE I — AUTO DJ INTEGRATION

Integrate scratch into:

- transitions
- sections
- energy arc
- performance memory
- juggle budget

### Completion

Auto DJ can autonomously decide **whether** to scratch.

---

# GATE J — BEAT JUGGLE INTEGRATION

Coordinate:

```text
scratch
+
deck A/B juggling
```

using the shared hands budget.

### Completion

A peak performance can combine both without conflicts.

---

# GATE K — TRACKER-NATIVE SOURCES

Enable scratchable tracker material.

### Completion

Tracker arrangement/channel/instrument information changes source selection.

---

# GATE L — SAFETY / FALLBACK

Implement:

- no-silence invariant
- state restoration
- source range safety
- conflict prevention
- user override
- emergency release

### Completion

Every unsafe scenario returns to normal DJ operation.

---

# GATE M — HUMANIZATION / MEMORY

Implement:

- deterministic seed
- timing variation
- source variation
- gesture variation
- recent-pattern memory
- cooldowns

### Completion

Repeated performances sound related but not identical.

---

# GATE N — DJ VIEW UX

Expose:

```text
Auto Scratch
Style
Intensity
Level
```

and developer diagnostics.

### Completion

The feature is controllable from the actual DJ View.

---

# GATE O — REAL AUDIO ACCEPTANCE

Perform actual listening tests through the real DEViLBOX engine.

Test:

```text
baby
chirp
stab
transformer
flare
orbit
crab
scribble
sample scratch
deck scratch
call/response
scratch + juggle
scratch transition
```

### Completion

The scratch DJ sounds musically convincing.

---

# GATE P — WORLD-CLASS ACCEPTANCE

The system must demonstrate:

### Source intelligence

It knows what to scratch.

### Anchor intelligence

It knows where to scratch.

### Technique intelligence

It knows how to scratch it.

### Timing intelligence

It knows when to scratch.

### Density intelligence

It knows how much to scratch.

### Phrase intelligence

It knows how to construct a phrase.

### Performance intelligence

It knows when to rest.

### Interaction intelligence

It knows when to answer the music.

### Set intelligence

It knows when to perform.

### Restraint

It knows when to stop.

---

# 93. FINAL PERFORMANCE EXAMPLE

A successful autonomous performance should be able to behave approximately like this:

```text
TRACK A:
groove

TRACK B:
incoming

SCRATCH DJ:
listening...

B vocal activity low
A percussion activity high
energy rising
phrase boundary approaching

→ choose COUNT source
→ anchor = "3"
→ gesture = forwardStab
→ sparse placement

"3"

rest

TRACK A:
fill

SCRATCH:
"3"
chirp

rest

TRACK B:
drop approaching

SCRATCH:
YEAH

transformer

A/B:
phrase trade

scratch:
chirp
chirp
flare

beat juggle:
A B A B

scratch:
FRESH
FRESH
FRESH

peak

A+B:
full groove

scratch:
final stab

fader closes

re-entry

normal DJ mixing
```

That is the target.

Not:

```text
pattern 7
pattern 7
pattern 3
pattern 7
pattern 3
```

---

# 94. THE MOST IMPORTANT DESIGN RULE

The Up Rough system demonstrates that the magic is not the individual scratch techniques.

DEViLBOX already has many of those techniques.

The magic is:

```text
SOURCE
+
ANCHOR
+
GESTURE
+
PLACEMENT
+
DENSITY
+
REST
+
PHRASE
+
ARC
+
CONTEXT
```

The current DEViLBOX scratch engine supplies the **hands**.

The Up Rough generator supplies much of the **turntablist thinking**.

Auto DJ supplies the **musical context**.

The new system must combine all three.

---

# 95. FINAL ARCHITECTURE

The finished system should conceptually look like:

```text
                       AUTO DJ
                          │
                  DJ PERFORMANCE
                      CONTEXT
                          │
             ┌────────────┼────────────┐
             │            │            │
          MIXING       JUGGLING      SCRATCH
             │            │            │
             │            │     ┌──────┴───────┐
             │            │     │              │
             │            │   SOURCE         GESTURE
             │            │     │              │
             │            │   ANCHOR        PLACEMENT
             │            │     │              │
             │            │     └──────┬───────┘
             │            │            │
             │            │        PHRASE
             │            │            │
             │            │          ARC
             │            │            │
             └────────────┼────────────┤
                          │
                   HANDS / ENERGY
                       BUDGET
                          │
                    PERFORMANCE
                          │
                EXISTING DEViLBOX
                 AUDIO ENGINE
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
   DeckEngine       ScratchBuffer       Mixer / FX
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
                       AUDIO
```

---

# DEFINITION OF DONE

The feature is complete only when Auto DJ can autonomously perform a convincing scratch routine in the actual DEViLBOX DJ View where it can:

1. identify a musical opportunity
2. choose an appropriate scratch source
3. select a meaningful anchor
4. choose a technique appropriate to style and energy
5. place it precisely on the musical grid
6. vary scratch density
7. deliberately rest
8. perform call/response
9. throw a clean word before scratching it
10. repeat a chosen anchor intentionally
11. perform real re-cued stabs
12. use the existing deck scratch engine
13. use dedicated scratch samples without hijacking a deck
14. scratch live deck material when appropriate
15. use tracker-native material when available
16. perform phrase-level routines
17. build a 32-bar performance arc
18. escalate intelligently
19. combine with beat juggling
20. respect the shared hands budget
21. avoid vocal and bass conflicts
22. integrate with Auto DJ transitions
23. interact safely with Dub/FX systems
24. remember recent performances
25. avoid repetitive tricks
26. yield immediately to the user
27. restore every changed state
28. recover from failures
29. return cleanly to the beat grid
30. know when to stop

The final result should not feel like **Auto DJ with a scratch button**.

It should feel like:

> **Auto DJ has acquired a turntablist.**

And that turntablist should have **taste, timing, vocabulary, restraint, memory, and the ability to build a performance.**

The particularly important architectural choice here is that we should not replace the current DEViLBOX scratch engine. The current engine already handles the difficult real-time work—signed-rate deck scratching, reverse playback, ring buffering, fader automation and release/phase restoration. 
What we're missing is the brain above it: the Up Rough source/anchor/gesture/placement/phrase system. That is where I would spend the engineering effort.


