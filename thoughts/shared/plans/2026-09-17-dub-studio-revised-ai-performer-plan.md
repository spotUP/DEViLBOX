---
date: 2026-09-17
topic: DEViLBOX Dub Studio — revised master AI-performer & musical review plan
tags: [dub, autodub, personas, ai-performer, musical-review, authoritative]
status: final
supersedes: thoughts/shared/plans/2026-09-17-dub-studio-master-implementation-plan.md
ledger: thoughts/shared/plans/2026-09-17-dub-studio-progress.md
source: external music-theory reviewer, revision 2, delivered 2026-09-17
baseline: DUB_SYSTEM.md / repo snapshot 2026-09-17 (43 moves, jammy persona)
note: |
  AUTHORITATIVE. Written against the correct current baseline after the first
  revision was found to be anchored on the stale 2026-04-20 planning doc.
  Contains the reviewer's rulings on all eight open musical questions
  (sections 2-9) plus the AI-performer architecture (sections 10-44).
---

# DEViLBOX DUB STUDIO — REVISED MASTER AI-PERFORMER & MUSICAL REVIEW PLAN

**Status:** Supersedes the previous implementation plan.

**Authoritative baseline:** `DUB_SYSTEM.md`, repository snapshot **2026-09-17**.

**Historical material:** `research/2026-04-20-tracker-dub-bus-world-class.md` is historical implementation planning. Do not use its G1–G16 gap list, 27-move count, gatedFlanger character, A1/A2 labels, or historical DSP completion lists as current work items.

---

# 0. CURRENT STATE

DEViLBOX already has a substantial dub system:

```text
43 dub moves
single DubRouter execution path
DubBus DSP
per-channel dub routing
character presets
MIDI
keyboard
pads
MCP
DubRecorder
DubLanePlayer
tracker integration
DJ/Stream Auto Dub
automation
pattern-cell support
```

The canonical architecture is:

```text
HUMAN / MIDI / KEYBOARD / PAD / MCP / LANE / AI
                         ↓
                    DubRouter
                         ↓
                      DubMove
                         ↓
                DubBus / Mixer / Channel FX
```

Do not create parallel AI implementations of any of these systems.

The current `DUB_SYSTEM.md` describes 43 moves and explicitly identifies the five personas as King Tubby, Scientist, Lee "Scratch" Perry, Mad Professor and Prince Jammy.

The current Auto Dub is the part that needs the major conceptual upgrade:

```text
CURRENT

250 ms tick
   ↓
bar position
   ↓
roles
   ↓
transients
   ↓
rule table
   ↓
probability
   ↓
move
```

The desired system is:

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
CHOOSE TARGET
  ↓
CHOOSE MOVE
  ↓
PERFORM GESTURE
  ↓
HEAR CONSEQUENCE
  ↓
ADAPT
  ↓
REST / CONTINUE
```

This is the primary roadmap.

---

# 1. CURRENT MUSICAL REVIEW FINDINGS

The current system already contains sensible safeguards: cooldowns, a move budget, look-ahead, startup suppression, sparse-song suppression and a one-wet-move-per-bar rule.

Those should **not simply be deleted**.

However, several of them are currently compensating for a missing musical model.

The central diagnosis is:

> The current system has many useful "hands", but lacks the musical brain deciding when, why, where, how hard, and for how long those hands should operate.

The active development therefore starts with:

```text
MUSICAL CLOCK
+
MUSICAL EVENTS
+
ARRANGEMENT MODEL
+
PERFORMANCE CONTEXT
+
INTENTION
+
GESTURES
+
WET ENERGY
+
CONSEQUENCES
+
PERSONALITY
```

---

# 2. MUSICAL QUESTION #1 — SKANK ECHO TIMING

Current `skankEchoThrow` sets:

```text
1.5 × beat
```

which is a dotted quarter.

The system already defines:

```text
1/8D = 0.75 × beat
```

as its dotted-eighth sync value and explicitly describes that as the classic reggae/dub skank delay.

## Musical judgement

For a move explicitly called:

```text
skankEchoThrow
```

the **0.75-beat dotted eighth should be the default interpretation**.

The current 1.5-beat value is not meaningless: it creates a genuine 3:2 relationship against a quarter-note pulse, and the code explicitly describes that as the reason for its choice.

But that makes it a particular polyrhythmic treatment rather than the most natural default for the named skank gesture.

## Recommendation

Change the semantic default to:

```text
skankEchoThrow
    ↓
echoSyncDivision = '1/8D'
```

and preserve the existing 1.5-beat behavior as an explicit alternative:

```text
3:2 / dotted-quarter / floating echo
```

Do **not** silently discard it.

This gives the performer two distinct ideas:

```text
SKANK THROW
    = dotted eighth

POLYRHYTHMIC FLOAT
    = dotted quarter / 1.5 beat
```

### Acceptance

A skank hit at:

```text
beat 1
```

with the default move should produce its principal repeat around:

```text
beat 1 + 0.75
```

rather than:

```text
beat 1 + 1.5
```

unless the performer explicitly selects the 3:2 variant.

---

# 3. MUSICAL QUESTION #2 — ONE WET MOVE PER BAR

The current one-wet-move cap was introduced for a real reason: unrestricted combinations produced:

```text
echoThrow
+
springSlam
+
echoBuildUp
+
reverseEcho
...
```

and became a reverb/wet mush. The current system therefore permits only one wet move per bar, plus decay protection.

## Musical judgement

The **one-per-bar rule is too crude as the final model**.

Real dub performance absolutely can contain:

```text
echo throw
+
spring crash
```

or:

```text
short echo
+
filter
+
spring response
```

provided the total return energy remains controlled.

Therefore replace:

```text
ONE WET MOVE
```

with:

```text
WET-ENERGY BUDGET
```

but retain a hard emergency safety layer.

## Proposed model

Each move receives approximate metadata:

```ts
{
    wetCost,
    duration,
    feedbackCost,
    spectralDensity,
    lowFrequencyRisk
}
```

The runtime tracks:

```text
wetEnergy
feedbackEnergy
spectralDensity
lowFrequencyEnergy
```

Then:

```text
echoThrow
+
small spring slam
```

can coexist if:

```text
currentEnergy + cost <= availableEnergy
```

while:

```text
long high-feedback echo
+
long spring
+
reverse reverb
```

will be rejected or shortened.

## Crucial distinction

The system should have:

```text
MUSICAL GOVERNOR
```

and:

```text
HARD SAFETY GOVERNOR
```

The musical governor says:

> "That's already a dense return; choose something smaller."

The safety governor says:

> "Feedback is actually running away; reduce it now."

The latter must remain independent of persona.

---

# 4. MUSICAL QUESTION #3 — CHANNEL TAXONOMY

The current role system genuinely conflates different dimensions.

The source itself identifies the problem: `skank` is a rhythmic function while `pad`, `lead`, and `bass` can encode timbral/register information, making something like a piano offbeat chord ambiguous.

Do not solve this by creating a giant enum.

Use orthogonal axes.

## Recommended model

```ts
interface MusicalChannelProfile {
    instrumentFamily:
        | 'drums'
        | 'bass'
        | 'piano'
        | 'organ'
        | 'guitar'
        | 'keys'
        | 'synth'
        | 'horn'
        | 'vocal'
        | 'strings'
        | 'percussion'
        | 'fx'
        | 'unknown';

    musicalFunction:
        | 'foundation'
        | 'groove'
        | 'harmony'
        | 'melody'
        | 'hook'
        | 'texture'
        | 'transition'
        | 'voice'
        | 'unknown';

    rhythmicRole:
        | 'downbeat'
        | 'backbeat'
        | 'offbeat'
        | 'syncopated'
        | 'sustained'
        | 'free';

    register:
        | 'sub'
        | 'low'
        | 'lowMid'
        | 'mid'
        | 'highMid'
        | 'high';

    importance: number;       // 0..1
    density: number;          // 0..1
    audibility: number;       // 0..1
    repetition: number;       // 0..1
}
```

A piano channel can therefore be:

```text
instrumentFamily = piano
musicalFunction = harmony
rhythmicRole = offbeat
register = mid
```

without forcing it into `skank`.

Another piano channel can simultaneously be:

```text
instrumentFamily = piano
musicalFunction = groove
rhythmicRole = offbeat
```

The classifier should produce **evidence plus confidence**, not pretend it knows an absolute semantic role.

User overrides remain authoritative.

---

# 5. MUSICAL QUESTION #4 — VERSION DROP CATEGORIES

The current `versionDrop` implementation mutes channels classified as:

```text
lead
chord
arpeggio
pad
skank
```

leaving percussion and bass. The source explicitly identifies the failure case where a bassline classified as `lead` disappears.

Do not make the new version drop another role whitelist.

## Recommended arrangement dimensions

Use:

```text
FOUNDATION
GROOVE
HARMONY
MELODY
HOOK / VOICE
TEXTURE
TRANSITION
SACRIFICIAL
USER-PROTECTED
```

But importantly, these should represent **arrangement importance**, not instrument identity.

For each channel calculate:

```text
arrangementImportance
```

and:

```text
dropBehavior
```

such as:

```text
keep
reduce
mute
throwThenMute
throwThenReduce
```

A version drop can then become:

```text
KICK       KEEP
BASS       KEEP
SNARE      KEEP
SKANK      REDUCE
PAD        MUTE
HORN       THROW → MUTE
VOCAL      THROW → MUTE
TEXTURE    MUTE
```

while a different arrangement might legitimately do:

```text
BASS       REDUCE
HORN       KEEP
SKANK      KEEP
VOCAL      THROW → MUTE
```

This is the correct level of abstraction.

---

# 6. MUSICAL QUESTION #5 — TUBBY RETURN EQ

The current Tubby preset deliberately ships with return EQ disabled because a parked resonant peak around 700 Hz produced a constant beep. The intended behavior is for that resonance to be swept manually through `eqSweep`.

## Musical judgement

Keep it **manual-first**.

Do not make:

```text
Tubby preset
=
automatic 700 Hz resonance constantly moving
```

That would turn one of the most expressive dub gestures into background wallpaper.

Instead:

```text
TUBBY CHARACTER
+
AVAILABLE RESONANT RETURN EQ
+
PERFORMANCE GESTURE
```

The AI may later choose:

```text
ACCENT
→
Tubby resonant sweep
→
target recent snare/vocal/horn
→
sweep through spectral region
→
release
```

But it should not continuously sweep merely because Tubby is selected.

### Better AI behavior

```text
listen
 ↓
interesting transient / phrase event
 ↓
Tubby intention = ACCENT / SPACE
 ↓
activate resonance
 ↓
sweep
 ↓
release
 ↓
REST
```

That makes the EQ an instrument.

---

# 7. MUSICAL QUESTION #6 — SPECTRAL IMPROV EQ

The current spectral driver continuously examines the return and cuts a band if its peak is above baseline, otherwise boosts it. The source itself describes this as a **crude automatic tonal-balance corrector** rather than a musical gesture.

## Musical judgement

It should **not be the default behavior of a dub performer**.

Continuous:

```text
hear loud frequency
 ↓
cut it

hear quiet frequency
 ↓
boost it
```

is closer to an automatic corrective EQ than a dub engineer.

Dub manipulation is generally more meaningful when it has:

```text
target
intention
timing
direction
gesture
release
```

## Recommendation

Retain the spectral system as an **optional assistive utility**, but remove it from the core musical brain.

Rename the conceptual distinction:

```text
AUTO EQ
=
technical assistance
```

versus:

```text
DUB EQ GESTURE
=
musical performance
```

The performer should primarily use:

```text
eqSweep
hpfRise
resonant sweep
return filter
```

as intentional gestures.

---

# 8. MUSICAL QUESTION #7 — PERSONA ATTRIBUTIONS

This is the most important historical-method correction.

The current documentation itself states that the persona parameter mappings are **stylistic reconstructions**. The historical evidence supports equipment, techniques and broad working practices; it does not directly prove numerical mappings such as:

```text
+9 dB @ 60 Hz
width 0.45
feedback LPF 5.5 kHz
```

The document explicitly labels that mapping as interpretation.

Therefore the implementation should use three evidence levels:

```text
LEVEL 1 — DOCUMENTED FACT
```

Example:

```text
Tubby used an Altec stepped HPF.
```

```text
LEVEL 2 — STRONG TECHNICAL INFERENCE
```

Example:

```text
A stepped HPF is therefore an appropriate Tubby character control.
```

```text
LEVEL 3 — CREATIVE PARAMETERIZATION
```

Example:

```text
Set Tubby bass shelf to +9 dB around 60 Hz.
```

Level 3 is valid product design, but must not be represented as historical fact.

## Specific corrections

### Tubby

Strong:

```text
stepped HPF
tape echo
spring
filter performance
dark/narrow character
```

Reasonable interpretation:

```text
deep low-end shelf
narrow stereo
dark feedback
```

But exact gain/frequency/width values are product tuning, not historical evidence.

### Scientist

Strong:

```text
precision
filtering
drops
plate-oriented spatial character
absence of glue compression
```

The current documentation's explicit **ZERO bus compression** is a meaningful character distinction.

The exact:

```text
-10 dB @ 700 Hz
```

should be treated as tuning, not biography.

### Perry

Strong:

```text
tape experimentation
spring manipulation
phasing
lo-fi accumulation
unusual feedback/texture
```

The current 8-stage phaser is already documented as a deliberate deviation from the historically cited 6-stage Bi-Phase behavior.

Keep it if it sounds better for the product, but describe it as:

```text
Perry-inspired product interpretation
```

not:

```text
historically exact Perry configuration
```

### Mad Professor

Strong:

```text
digital effects
wide stereo
longer spatial development
ping-pong/digital delay
```

Again, exact width, shelf and feedback numbers are tuning.

### Jammy

Treat him distinctly rather than as a variant of the other four:

```text
digital dancehall
BBD echo
gated spring
sparse structural intervention
```

The current system already has a dedicated `reTapeEcho` BBD character for Jammy.

---

# 9. MUSICAL QUESTION #8 — METRE AND PHRASE LENGTH

This is a genuine architectural limitation.

The current Auto Dub assumes:

```text
16 rows / bar
4 rows / beat
4/4
16-bar phrase
```

and uses:

```text
bar % 4
bar % 8
bar % 16
```

throughout its phrase logic. `DUB_SYSTEM.md` explicitly flags this as an open musical question.

## Recommendation

Do not immediately build a gigantic generalized music-theory engine.

Introduce a small abstraction:

```ts
MusicalClock
```

with:

```ts
beatsPerBar
rowsPerBeat
phraseBars
currentBeat
currentBar
phrasePosition
nextBeat
nextBar
nextPhraseBoundary
```

Default:

```text
4/4
4 rows/beat
16-bar phrase
```

so existing behavior is preserved.

Then allow the arrangement/transport to override:

```text
3/4
6/8
5/4
7/8
8-bar phrase
12-bar phrase
32-bar phrase
```

where the underlying tracker actually supports that information.

The important change is:

```text
RULES SHOULD ASK:
"Where am I musically?"

not:

"Is bar % 4 == 3?"
```

---

# 10. AI-01 — MUSICAL CLOCK

Build the smallest useful musical-clock abstraction.

It must provide:

```text
current bar
current beat
position within beat
position within bar
position within phrase
next beat boundary
next subdivision
next bar boundary
next phrase boundary
```

Do not duplicate transport timing.

It is a **view of transport**, not a second transport.

---

# 11. AI-02 — MUSICAL EVENT PROVIDER

Create a common abstraction consumed by Auto Dub.

Tracker and DJ contexts should provide:

```text
note onset
transient
channel activity
event strength
instrument family
musical function
register
duration
repetition
```

The existing DJ Auto Dub already uses deck beat-grid/stem information while tracker Auto Dub has pattern information; the abstraction should unify their **semantic output**, not their underlying data sources.

---

# 12. AI-03 — LOOK-AHEAD

The existing Auto Dub already performs short pattern look-ahead for role-targeted rules.

Promote this into the new performer.

The performer should be able to ask:

```text
What happens in the next:
1/16
1/8
1/4
beat
bar
phrase?
```

Example:

```text
+80 ms   kick
+310 ms  snare
+470 ms  skank
+920 ms  vocal
```

This allows:

```text
PREPARE
→
CAPTURE
→
RELEASE
```

rather than reacting after the event.

---

# 13. AI-04 — PERFORMANCE CONTEXT

Create one lightweight runtime object:

```ts
PerformanceContext
```

containing:

```text
MusicalClock
upcomingEvents
recentEvents

channelProfiles
arrangementState

recentMoves
activeGestures

wetEnergy
feedbackEnergy
spectralDensity

currentIntention
currentTarget

timeSinceLastAction
phraseHistory
```

The context is the performer's memory.

---

# 14. AI-05 — INTENTION LAYER

The AI must choose **what it wants musically** before choosing the effect.

Intentions:

```text
REST
ACCENT
ANSWER
SPACE
BUILD
DROP
TEXTURE
TRANSITION
RESET
```

Decision chain:

```text
MUSIC
 ↓
CONDITION
 ↓
INTENTION
 ↓
TARGET
 ↓
MOVE
 ↓
GESTURE
```

Example:

```text
snare approaching
 ↓
ACCENT
 ↓
snare
 ↓
echoThrow
 ↓
short capture
 ↓
feedback ride
 ↓
release
```

---

# 15. AI-06 — REST

REST is not a failed random roll.

It is an explicit action.

The performer must be able to decide:

```text
LISTEN
WAIT
DO NOTHING
```

for multiple bars.

This is one of the highest-priority changes because dub performance depends on contrast.

---

# 16. AI-07 — PERFORMANCE STATE MACHINE

Use:

```text
LISTEN
 ↓
ANTICIPATE
 ↓
PREPARE
 ↓
ACT
 ↓
RIDE
 ↓
RELEASE
 ↓
LISTEN
```

with structural states:

```text
BUILD
DROP
RECOVER
```

The state machine should be shared by all personas.

Personas modify:

```text
how often
how long
how aggressively
which targets
which moves
how much risk
how much silence
```

---

# 17. AI-08 — GESTURE ENGINE

The AI must not teleport parameters.

Implement:

```ts
beginGesture()
updateGesture()
endGesture()
cancelGesture()
```

with:

```text
attack
hold
release
ramp
sweep
rebound
quantized start
quantized release
```

This is particularly important for:

```text
send
filter
feedback
delay time
spring
EQ
master drop
```

The existing DubRouter/move infrastructure remains the execution layer.

---

# 18. AI-09 — WET-ENERGY MODEL

Replace the final conceptual dependence on:

```text
one wet move per bar
```

with:

```text
continuous wet-energy accounting
```

Each effect has:

```text
initial cost
ongoing cost
decay
feedback risk
spectral occupancy
```

The performer can therefore layer effects when there is room.

Example:

```text
snare echo
 ↓
small spring hit
 ↓
return remains controlled
```

is allowed.

But:

```text
long echo
+
high feedback
+
long spring
+
reverse reverb
```

should trigger restraint.

Retain the existing hard safety protections as a final backstop.

---

# 19. AI-10 — SEPARATE PERFORMANCE DIMENSIONS

Replace the current overloaded `intensity` concept with:

```text
activity
depth
risk
restraint
```

Meaning:

```text
activity  = how often I act
depth     = how strongly I act
risk      = how unusual/dangerous my action is
restraint = how much I prefer silence
```

This allows:

```text
high depth + low activity
```

which is very dub-like.

It also allows:

```text
high activity + low depth
```

for subtle textural performers.

---

# 20. AI-11 — CONSEQUENCE MODEL

After each significant intervention, estimate:

```text
targetAudibility
contrast
masking
wetEnergyChange
feedbackChange
structuralImpact
```

Then update future decisions.

Example:

```text
echo throw
 ↓
return becomes dense
 ↓
performer recognizes masking
 ↓
no second long throw
 ↓
filter return
 ↓
REST
```

This is the key transition from:

```text
automation
```

to:

```text
performance
```

---

# 21. AI-12 — REPETITION / NOVELTY

Track:

```text
same move
same target
same timing
same intensity
same phrase location
```

The performer should distinguish:

```text
intentional repetition
```

from:

```text
algorithmic repetition
```

A successful gesture can be repeated deliberately.

A stale gesture should eventually be varied or abandoned.

---

# 22. AI-13 — CALL / RESPONSE

Build relationships between gestures.

Example:

```text
snare → echo
```

followed by:

```text
vocal → spring
```

or:

```text
echo
 ↓
silence
 ↓
filter answer
```

This should operate over musical time, not just adjacent ticks.

---

# 23. AI-14 — ARRANGEMENT INTELLIGENCE

Version drops become arrangement decisions.

Before a drop:

```text
identify foundation
identify groove
identify harmony
identify hook/voice
identify texture
identify sacrificial material
```

Then choose:

```text
keep
reduce
mute
throw-then-mute
throw-then-reduce
```

This replaces classifier-driven blanket muting.

---

# 24. AI-15 — PHRASE INTELLIGENCE

The current 16-bar phrase curves should become normalized:

```text
phrasePosition = 0..1
```

with actual boundaries supplied by `MusicalClock`.

Personas can still have different phrase arcs.

For example:

```text
Tubby:
early accents + phrase-end interventions

Scientist:
long structural development

Perry:
irregular texture

Mad Professor:
slow spatial development

Jammy:
sparse structural punctuation
```

But none should depend on hardcoded:

```text
bar % 16
```

once the musical clock is available.

---

# 25. AI-16 — MUSICAL RETURN QUANTIZATION

Replace arbitrary percentage-based returns such as:

```text
60% of hold duration
```

with musical choices:

```text
next beat
next eighth
next bar
phrase boundary
next relevant event
```

The current `riddimSection` behavior is explicitly identified as returning the skank at 60% of the hold rather than a musical boundary.

The new performer should choose the return according to intention.

Example:

```text
DROP
 ↓
4-bar hold
 ↓
next phrase boundary
 ↓
restore skank
```

rather than:

```text
4 bars × 0.6
=
arbitrary return point
```

---

# 26. AI-17 — DANGEROUS GENERATORS REMAIN MANUAL-FIRST

The current system deliberately excludes:

```text
oscBass
crushBass
```

from Auto Dub because they are self-oscillating generators that can stomp on the mix.

Keep that policy.

Likewise, any future AI access to:

```text
tubbyScream
oscBass
crushBass
```

must require:

```text
explicit risk permission
short maximum duration
gain ceiling
feedback ceiling
context gate
```

The default should remain:

```text
manual performance
```

---

# 27. AI-18 — PERSONA MODEL

Personas should stop being primarily:

```text
move weights
```

and become:

```text
behavioral profiles
```

Each profile controls:

```text
activity
depth
risk
restraint
anticipation
patience

preferred targets
preferred intentions

gesture length
release style

feedback appetite
filter appetite
drop appetite

timing variance
novelty preference
repetition preference
```

---

# 28. TUBBY PERSONA

Behavioral target:

```text
decisive
percussive
filter-oriented
short throws
strong contrast
dark return
high respect for silence
```

Typical targets:

```text
snare
drums
horn hits
vocal accents
```

The resonant return EQ is a **performance instrument**, not a permanently active effect.

---

# 29. SCIENTIST PERSONA

Behavioral target:

```text
precise
structural
patient
drop-oriented
midrange-conscious
clean
```

Favor:

```text
builds
phrase transitions
drops
controlled echo
return filtering
```

Preserve the defining bus behavior:

```text
glue compressor bypass
```

---

# 30. PERRY PERSONA

Behavioral target:

```text
high variance
experimental
textural
spring-oriented
tape-oriented
phaser/flanger-oriented
```

But:

```text
variance != randomness
```

Perry should make surprising decisions **because the musical situation allows them**.

---

# 31. MAD PROFESSOR PERSONA

Behavioral target:

```text
patient
wide
lush
digital
long-form
spatial
```

He should be comfortable allowing:

```text
echo tail
+
space
+
silence
```

to develop rather than constantly adding gestures.

---

# 32. JAMMY PERSONA

Jammy must be a genuine fifth behavioral profile.

Target:

```text
sparse
structural
digital dancehall
precise
economical
```

Prefer:

```text
drops
cuts
short digital echoes
BBD coloration
gated spring
```

Avoid:

```text
ornamental effect stacking
constant texture
random experimental gestures
```

The current system already gives Jammy a distinct BBD/reTapeEcho character and keeps automatic `riddimSection` disabled for him.

---

# 33. BUS CHARACTER ≠ PERFORMER PERSONA

These must remain independent.

Examples:

```text
Scientist performer
+
Perry bus character
```

or:

```text
Jammy performer
+
Tubby bus character
```

The performer decides:

```text
what to do
```

The bus character decides:

```text
what the desk sounds like
```

This separation is essential.

---

# 34. AUTO EQ POLICY

Separate the current EQ systems into:

```text
TECHNICAL AUTO EQ
```

and:

```text
MUSICAL DUB EQ
```

Technical Auto EQ:

```text
optional
assistive
not part of persona identity
```

Musical EQ:

```text
intentional
event-driven
gesture-based
recordable
persona-aware
```

Default AI behavior should favor the latter.

---

# 35. PERFORMANCE RECORDING

Extend the existing DubRecorder metadata where useful.

A recorded AI performance should eventually be able to express:

```text
BAR 12
INTENTION: ACCENT
TARGET: SNARE
MOVE: ECHO THROW
GESTURE: SHORT
 ↓
FEEDBACK RIDE
 ↓
FILTER CLOSE
```

rather than merely:

```text
echoThrow
```

Do not break the existing lane/event format.

The current lane model already supports event IDs, move IDs, target channels, timing/duration and source quantization.

---

# 36. PERFORMANCE UI

The Auto Dub UI should show the performer's current state.

Example:

```text
PERSONA
TUBBY

STATE
PREPARING

INTENTION
ACCENT

TARGET
SNARE

PHRASE
0.72

WET ENERGY
████░░░░

LAST MOVE
SPRING SLAM

NEXT EVENT
SNARE +180ms
```

Optional:

```text
WHY?
```

should expose concise decision factors, not hidden chain-of-thought.

Example:

```text
Strong snare predicted.
Return energy is low.
Phrase is approaching a transition.
Tubby favors short percussion accents.
```

---

# 37. DETERMINISTIC PERFORMANCE SIMULATOR

Create an offline simulator.

Inputs:

```text
project
BPM
metre
phrase length
persona
seed
duration
```

Output:

```text
BAR 1
REST

BAR 3
SNARE → ECHO

BAR 4
FILTER RIDE

BAR 8
DROP

BAR 12
HORN → SPRING

BAR 16
REST
```

This becomes the primary environment for tuning the musical brain.

---

# 38. AI PERFORMANCE TESTS

Tests should measure behavior rather than merely function calls.

## REST TEST

Verify the performer can produce long inactive periods.

## TARGET TEST

Verify it does not target silent channels.

## PREDICTION TEST

Verify a predicted event can schedule a gesture before the event.

## WET-ENERGY TEST

Verify:

```text
two compatible wet gestures
```

can coexist when energy permits.

Verify dense combinations are rejected/reduced.

## CONSEQUENCE TEST

Create a dense return and verify subsequent wet activity decreases.

## DROP TEST

Verify foundation survives while sacrificial/optional material is removed.

## SEEK TEST

Verify prediction and active gestures reset safely on transport seek.

## PERSONA TEST

Run identical input and seed through each persona and verify behavioral differences.

The objective is not to rank them.

---

# 39. MUSICAL REGRESSION SUITE

Create deterministic reference scenes:

```text
SCENE A — sparse roots riddim
SCENE B — dense digital dancehall
SCENE C — vocal + horn arrangement
SCENE D — four-channel tracker
SCENE E — long-form dub
SCENE F — unusual metre
SCENE G — sparse arrangement
```

Every AI revision should run against these scenes.

Capture:

```text
move count
rest duration
target distribution
wet-energy curve
feedback curve
drop timing
gesture timing
```

and, where practical:

```text
audio render
```

---

# 40. HUMAN LISTENING REVIEW

The final metric is not:

```text
number of moves
```

or:

```text
AI activity
```

Evaluate:

```text
Does it leave space?

Does it recognize the important event?

Does it grab the right thing?

Does the throw arrive musically?

Does the return have room?

Does it know when to stop?

Does it create contrast?

Does a drop feel intentional?

Does the next intervention feel related to the previous one?

Does the performance develop over several phrases?
```

---

# 41. PHASE COMPLETION GATES — REVISED

The previous 15 engineering gates are discarded.

Use these gates instead.

## GATE A — BASELINE LOCK

```text
[ ] DUB_SYSTEM.md verified as current source
[ ] 43 moves accounted for
[ ] five current personas accounted for
[ ] existing control/routing infrastructure verified
[ ] historical April gap list excluded
```

**Must close before implementation.**

---

## GATE B — MUSICAL CLOCK

```text
[ ] transport timing represented correctly
[ ] default 4/4 behavior unchanged
[ ] phrase length no longer intrinsically hardcoded
[ ] no second transport authority
[ ] existing rules can consume musical positions
```

---

## GATE C — MUSICAL EVENT MODEL

```text
[ ] tracker events available
[ ] DJ events available
[ ] channel profile available
[ ] upcoming events queryable
[ ] confidence represented
[ ] seek resets prediction state
```

---

## GATE D — PERFORMANCE CONTEXT

```text
[ ] recent events remembered
[ ] recent moves remembered
[ ] active gestures represented
[ ] wet energy represented
[ ] arrangement state represented
[ ] current intention represented
```

---

## GATE E — INTENTION + REST

```text
[ ] REST is explicit
[ ] ACCENT exists
[ ] SPACE exists
[ ] BUILD exists
[ ] DROP exists
[ ] ANSWER exists
[ ] TEXTURE exists
[ ] TRANSITION exists
[ ] RESET exists
[ ] intention precedes move selection
```

---

## GATE F — GESTURE ENGINE

```text
[ ] beginGesture works
[ ] updateGesture works
[ ] endGesture works
[ ] cancelGesture works
[ ] quantized starts work
[ ] quantized releases work
[ ] transport stop cancels gestures
[ ] seek cancels stale gestures
```

---

## GATE G — WET ENERGY

```text
[ ] one-wet-per-bar is no longer the primary musical constraint
[ ] wet cost exists
[ ] feedback cost exists
[ ] decay exists
[ ] compatible wet gestures can layer
[ ] dense combinations are restrained
[ ] hard safety governor remains
```

---

## GATE H — MUSICAL TARGETING

```text
[ ] instrument family separated from function
[ ] rhythmic role separated from timbre
[ ] register represented
[ ] importance represented
[ ] density represented
[ ] user override remains authoritative
```

---

## GATE I — ARRANGEMENT

```text
[ ] versionDrop no longer depends on crude role whitelist
[ ] foundation can be protected
[ ] sacrificial material can be identified
[ ] throw-then-mute supported
[ ] arrangement-aware restoration works
```

---

## GATE J — CONSEQUENCE

```text
[ ] performer observes result
[ ] wet density affects next decisions
[ ] masking affects next decisions
[ ] feedback affects next decisions
[ ] successful gestures can be repeated
[ ] stale gestures can be abandoned
```

---

## GATE K — PERSONAS

```text
[ ] Tubby behavioral profile
[ ] Scientist behavioral profile
[ ] Perry behavioral profile
[ ] Mad Professor behavioral profile
[ ] Jammy behavioral profile
[ ] persona ≠ bus character
[ ] differences observable over time
```

---

## GATE L — MUSICAL RETURNS

```text
[ ] riddim returns can quantize musically
[ ] skankEchoThrow defaults to 1/8D behavior
[ ] 1.5-beat 3:2 behavior remains available explicitly
[ ] phrase-boundary restoration works
```

---

## GATE M — RECORD / REPLAY

```text
[ ] AI performance records
[ ] gestures record
[ ] intention metadata can be stored where appropriate
[ ] save/load remains compatible
[ ] replay reproduces the performance
```

---

## GATE N — LONG PERFORMANCE

Run:

```text
30+ minute deterministic performance
```

Verify:

```text
[ ] no move spam
[ ] no stuck gestures
[ ] no runaway feedback
[ ] no energy accumulation bug
[ ] no stale event predictions
[ ] no memory growth attributable to performer
[ ] no transport drift
```

---

## GATE O — MUSICAL RELEASE

All of the following must be true:

```text
[ ] AI can REST
[ ] AI anticipates events
[ ] AI chooses targets musically
[ ] AI can layer wet effects intelligently
[ ] AI understands phrase boundaries
[ ] AI can perform drops
[ ] AI responds to consequences
[ ] AI creates call/response
[ ] AI varies repetition intentionally
[ ] personas have behavioral identities
[ ] human and AI use the same DubRouter
[ ] dangerous generators remain controlled
[ ] DSP character remains independent from persona
```

Only then is the AI performer considered ready for serious musical evaluation.

---

# 42. IMPLEMENTATION ORDER

The revised implementation order is:

```text
1. BASELINE LOCK
       ↓
2. MUSICAL CLOCK
       ↓
3. MUSICAL EVENT PROVIDER
       ↓
4. CHANNEL PROFILE / ARRANGEMENT MODEL
       ↓
5. EVENT LOOK-AHEAD
       ↓
6. PERFORMANCE CONTEXT
       ↓
7. INTENTION LAYER
       ↓
8. REST / STATE MACHINE
       ↓
9. GESTURE ENGINE
       ↓
10. WET-ENERGY MODEL
       ↓
11. CONSEQUENCE MODEL
       ↓
12. MUSICAL RETURN QUANTIZATION
       ↓
13. PERSONA BEHAVIOR
       ↓
14. CALL / RESPONSE
       ↓
15. REPETITION / NOVELTY
       ↓
16. VERSION-DROP INTELLIGENCE
       ↓
17. PERFORMANCE RECORDING
       ↓
18. PERFORMANCE UI
       ↓
19. DETERMINISTIC SIMULATOR
       ↓
20. LONG-RUN AUDIO REVIEW
```

---

# 43. WHAT NOT TO DO

Do not:

```text
rebuild the DubBus
```

Do not:

```text
create an AI DubRouter
```

Do not:

```text
create another move registry
```

Do not:

```text
reimplement the 43 moves
```

Do not:

```text
bring back Pixi
```

Do not:

```text
create another Full-Screen Dub Mode
```

Do not:

```text
replace the existing lane system
```

Do not:

```text
remove safety caps simply because real engineers layer effects
```

Do not:

```text
replace one crude rule table with a larger random rule table
```

Do not:

```text
make spectral correction the definition of musical EQ
```

Do not:

```text
make Tubby's resonant EQ continuously sweep
```

Do not:

```text
treat numerical preset values as historical facts
```

Do not:

```text
assume 4/4 and 16-bar phrases forever
```

Do not:

```text
equate more activity with better dubbing
```

---

# 44. CORE DESIGN PRINCIPLE

The existing 43 moves are the **hands**.

The AI performer needs to become the **operator**.

The operator must answer:

```text
WHEN?
WHY?
WHAT?
WHERE?
HOW HARD?
HOW LONG?
WHEN DO I RELEASE?
WHAT DID THAT DO?
WHAT SHOULD I DO NEXT?
```

That is the actual remaining problem.

The goal is not an AI that can execute every effect.

The goal is an AI that can sit at the DEViLBOX desk, hear a riddim developing, wait through several bars, recognize the snare or vocal that deserves a throw, prepare before the hit, grab it, let the echo speak, maybe kick the spring underneath it when the return has enough room, close the send, listen to the consequence, and then decide whether the next musical statement should be another gesture or silence.

That is the transition from:

```text
AUTO EFFECTS
```

to:

```text
LIVE DUB PERFORMANCE
```
