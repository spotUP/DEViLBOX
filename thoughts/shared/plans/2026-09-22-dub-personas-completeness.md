---
date: 2026-09-22
topic: What is missing in the dub bus and personas to make it complete
tags: [dub, personas, autodub, moves, planning]
status: draft
---

## MEASURED 2026-09-22 — why no persona has ever dropped a song to drums and bass

The owner: "i still havent heard a dub persona drop a song down to just drums
and bass". That gesture is already built. It is not an architecture gap, and
none of the layers proposed below would produce it.

`riddimSection` (`src/engine/dub/moves/riddimSection.ts`) mutes every channel
whose role is in `MELODIC_ROLES` — lead, chord, arpeggio, pad, skank — holds,
and brings the skank back on a musical boundary soaked in echo. Every persona
carries `riddimConfig`. The move works. It is being handed the wrong targets.

Measured on `Cannabusiness` (4-channel MOD), through `get_channel_roles`:

    roles: ["pad", "bass", "bass", "bass"]

Three basses and NO drums. `riddimSection` therefore mutes exactly one channel
of four, leaves three, and exposes no drums — inaudible as a gesture. With
`muted.length === 0` it fires as a documented no-op, which is the AHX case the
move's own comments already record.

Why the roles are wrong, in order:

1. In a tracker module, DRUMS ARE SAMPLES PLAYED AT PITCHES. `get_channel_evidence`
   for channel 3 reads pitch 32-34, four onsets in 64 rows, monophonic,
   on-beat. A kick drum has that exact signature, and so does a bass note.
   Note statistics cannot separate them, ever.
2. The instrument names are Amiga message text — "[skope/uprough](C)2k1",
   "a.k.a   jr. francisco" — so `ChannelNaming`'s name regex is useless here by
   design. See [[reference_sample_names_are_messages]].
3. The CED classifier returns the catch-all: `cedType: "synthesizer"` at
   confidence **0.035** and 0.515, and the third instrument was never
   classified at all. This is the `AudioSetInstrumentMap` collapse the todos
   ledger already flags as "the gap that matters most".
4. So `classifyInstrument` falls through its whole chain to note statistics,
   and note statistics say bass.

**The evidence that would settle it is the sample itself.** A kick is short,
unlooped and broadband; a bass note is longer and pitched. `classifyInstrument`
step 4 already calls `analyzeSampleForClassification` on the PCM, gated at
`confidence >= 0.5` — so the next move is to find out what that returns for
these instruments and why it does not clear the gate, NOT to add a new
mechanism beside it.

One thing found while measuring: `analyze_instrument_spectrum` on instrument 2
did not return within 120 seconds. Whatever else is true, that path is too slow
to be answering during a live performance.

**Order of work implied by this:** channel identity first (the todos ledger
already queues it that way, and this is the evidence for why), then the
persona architecture below. Building MusicalClock on roles that say a drum
machine is three basses would just make the wrong target selection more
punctual.

what is missing in our dub bus and personas to make it complete and how should it be implemented?

Yes. After reviewing the current DUB_SYSTEM.md against the move implementations we've been going through, I think the Dub Bus itself is already very capable. The bigger missing piece is the layer above it: the personas currently have the vocabulary of a dub engineer, but not yet the full musical decision-making system of a dub engineer.

The current system already has 43 moves, a shared router, per-channel sends/FX, tempo-synced echo, spring/tape/filter/EQ machinery, role detection, transient detection, look-ahead, phrase arcs, five personas, recording/replay, and DJ support.

What is missing is mostly this:

The target architecture
SONG
 ↓
MUSICAL CLOCK
 ↓
MUSICAL UNDERSTANDING
 ↓
ARRANGEMENT STATE
 ↓
PERSONA INTENTION
 ↓
TARGET SELECTION
 ↓
GESTURE / MOVE SELECTION
 ↓
EXECUTE THROUGH DubRouter
 ↓
LISTEN TO CONSEQUENCE
 ↓
ADAPT
 ↓
REST
 ↓
NEXT MUSICAL EVENT

Right now it is closer to:

250ms tick
 ↓
roles + density + transient + phrase position
 ↓
rule weights
 ↓
chooseMove()
 ↓
DubRouter.fire()

That difference is enormous.

1. MusicalClock

This is the first thing I'd build.

The current Auto Dub hardcodes 16 rows = one bar and 4 rows = one beat, and the entire phrase system assumes 4/4 and 16-bar phrases. riddimSection also returns material at 60% of its hold duration rather than at a musical boundary.

We need:

interface MusicalClock {
  bpm: number
  beatsPerBar: number
  beatUnit: number

  currentBeat: number
  currentBar: number
  beatPhase: number
  barPhase: number

  phraseBars: number
  phrasePosition: number

  nextBeat: number
  nextBar: number
  nextPhraseBoundary: number

  patternBoundary?: number
  sectionBoundary?: number
}

Default:

4/4
16 bars
4 rows/beat

But those are defaults, not assumptions.

This immediately fixes a huge amount of the current rule-table ugliness.

2. MusicalEventModel

The personas need to know what is musically happening, not merely what role a channel has.

Current roles are:

percussion
bass
chord
pad
lead
arpeggio
skank
empty

That is useful, but insufficient. The documentation explicitly identifies the problem: skank is a rhythmic function while bass/pad/lead are timbral/registral categories, so a piano offbeat chord can get classified inconsistently.

I'd separate:

instrumentFamily
musicalFunction
rhythmicRole
register
importance
density
repetition
audibility

So:

Piano
  family = piano
  function = harmony
  rhythm = offbeat
  register = mid
  importance = high

and:

Bass synth
  family = synth
  function = bass
  rhythm = groove
  register = low
  importance = foundational

That is what makes the later “drop everything but drums and bass” gesture reliable.

3. Arrangement intelligence

This is probably the single biggest musical gap.

The current versionDrop literally decides what to mute from channel roles. The documentation already identifies the failure mode: if the bass happens to be classified as lead, the version drop can remove the bass.

Instead the AI should maintain:

ArrangementState {
  foundation
  groove
  harmony
  melody
  hook
  texture
  transition
  sacrificial
  userProtected
}

Then every channel gets:

arrangementImportance
dropBehavior

For example:

drums       FOUNDATION   keep
bass        FOUNDATION   keep + emphasize
piano       HARMONY      mute
horn        MELODY       mute
pad         TEXTURE      mute
vocal       HOOK         mute/release

Now the persona can say:

“Take the song down to the foundation.”

rather than:

“Mute channels whose classifier says chord/lead/pad/skank.”

That's a major qualitative improvement.

4. Intention

This is the biggest conceptual change.

The persona shouldn't immediately choose a move.

It should first choose an intention.

Something like:

type DubIntention =
  | 'accent'
  | 'punctuate'
  | 'createSpace'
  | 'remove'
  | 'isolateFoundation'
  | 'emphasizeBass'
  | 'throwEcho'
  | 'wash'
  | 'buildTension'
  | 'releaseTension'
  | 'answer'
  | 'transformTexture'
  | 'reintroduce'
  | 'surprise'
  | 'rest'

So the reasoning becomes:

phrase approaching boundary
+
harmony has been dense
+
bass/drums are strong
+
we haven't created space recently
        ↓
INTENTION = isolateFoundation
        ↓
TARGET = drums + bass
        ↓
GESTURE = version/riddim/swamp treatment

That's much more musical than another weighted random rule.

5. The “swamp riddim” gesture

This is exactly the missing behavior we were just discussing.

Current versionDrop leaves percussion and bass. Current riddimSection adds a timed skank return.

Neither really says:

Now that I've stripped the arrangement down, I'm going to work the drums and bass.

I'd add a compound performance concept:

foundationDrop

or:

swampRiddim

It would:

1. identify foundation channels
2. mute/reduce non-foundation channels
3. emphasize bass
4. darken/shape drums
5. introduce return filtering
6. apply appropriate wet energy
7. throw selected drum/bass events
8. possibly sub-swell
9. let the groove breathe
10. restore material at a musical boundary

Crucially, this can be implemented above existing moves.

It doesn't need another giant DSP system.

It can orchestrate:

channelMute
echoThrow
filterDrop
eqSweep
combSweep
subSwell
springKick
springSlam
delayTimeThrow
hpfRise
...

through DubRouter.

6. Bass needs to become a first-class musical target

This is another important gap.

The current rule table actually has:

channelMute on bass

but bass is not sufficiently represented as something the persona can deliberately feature.

Add:

BassState {
  channels
  audible
  energy
  density
  repetition
  register
  importance
  recentlyEmphasized
  recentlyReturned
  availableHeadroom
}

Then intentions can include:

emphasizeBass
bassReturn
bassAccent
bassAndDrums

The boost should normally be subtle and temporary rather than a permanent giant EQ lift.

This is particularly important inside foundationDrop:

remove harmony
        ↓
bass becomes structurally important
        ↓
bass emphasis
        ↓
filter / spring / echo interaction

That gives the persona an actual reason to boost bass.

7. Wet energy needs to replace the one-wet-move-per-bar rule

The current wet cap is understandable — it was introduced because unrestricted layering produced “reverb mush.” But it also prevents combinations that are musically natural: the documentation explicitly notes that the current cap means an echo throw can't layer with a spring slam, for example.

Instead of:

wetMoveThisBar = true

use:

wetEnergyBudget

Every move gets an approximate cost:

echoThrow:
  wetCost: 0.25
  duration: 0.5
  feedbackCost: 0.3

springSlam:
  wetCost: 0.30
  duration: 0.4

ghostReverb:
  wetCost: 0.45
  duration: 2.0

Then:

echoThrow + springSlam

can happen if the combined energy fits.

But:

ghostReverb + long feedback echo + another spring wash

may be rejected.

That's much closer to a real desk operator.

8. GestureEngine

This should bridge intention → existing move.

For example:

intention:
  emphasizeBass

candidate gestures:
  bass channel send +3 dB
  low shelf
  subSwell
  bass echoThrow

Or:

intention:
  createSpace

candidate gestures:
  versionDrop
  riddimSection
  masterDrop
  channelMute

Or:

intention:
  throwAccent

candidate gestures:
  echoThrow
  springKick
  springSlam
  delayTimeThrow

The persona then chooses based on its character.

Do not create a second move execution path.

Everything still ends up at:

DubRouter.fire()

That's important because the existing architecture already deliberately funnels UI, MIDI, lanes, cells and Auto Dub through the same dispatch path.

9. Consequence awareness

This is probably the largest thing missing after intention.

The AI currently fires a move and continues.

A real dub performer hears:

“That throw worked.”

or:

“That echo is still ringing.”

or:

“The bass disappeared.”

The new system should maintain:

PerformanceMemory {
  lastMove
  lastTarget
  lastIntention

  activeGestures
  wetEnergy
  recentThrows
  recentDrops
  recentBassEvents

  arrangementState
  tension
  space
  surprise

  successfulGestures
  failedGestures
}

Not necessarily AI/ML.

Just state.

Then:

echoThrow
 ↓
wetEnergy rises
 ↓
don't immediately throw another echo
 ↓
wait
 ↓
perhaps filter the tail
 ↓
then release

That gives the performance continuity.

10. Real rest

The current minBarsBetweenFires gives breathing room, but that isn't the same as choosing to rest.

The personas need:

Intention = 'rest'

with a duration:

restBars: 2
restBars: 4
restBars: 8
...

During rest:

no discretionary moves

but the performer continues listening.

This is especially important because a dub performance is defined as much by what isn't touched as by what is touched.

And this gives each persona another dimension:

Tubby:
 deliberate pauses

Scientist:
 precise pauses around edits

Perry:
 unpredictable activity followed by surprising silence

Mad Professor:
 long spacious periods

Jammy:
 sparse structural interventions

Those are product-tuning interpretations, not claims about exact historical behavior.

11. Persona identity needs to become behavioral, not just numerical

Today a persona contains:

default intensity
move weights
variance
density bias
phrase arc
minimum spacing
signature move
EQ configuration
riddim configuration.

That's useful, but still basically a parameter table.

I'd add:

PersonaBehavior {
  preferredIntentions
  avoidedIntentions

  preferredTargets
  preferredTransitions

  restProfile

  wetEnergyProfile
  bassBehavior
  dropBehavior

  tensionProfile
  surpriseProfile

  repetitionTolerance
  consequenceSensitivity

  preferredGestureCombinations
}

Then personas actually behave differently.

12. Move combinations

This is very important.

Real dub performance isn't:

MOVE
wait
MOVE
wait
MOVE

It is often:

drop
→ bass + drums
→ filter
→ snare throw
→ spring
→ silence
→ reintroduce

The current DubMoveChain exists, but Auto Dub doesn't appear to reason in terms of musical gesture sequences.

We need small compositional chains:

DubGesture {
  intention
  target
  steps[]
  duration
  exitCondition
}

Example:

FOUNDATION_SWAMP

Step 1
  arrangementDrop

Step 2
  bassEmphasis

Step 3
  filterDown

Step 4
  drumEchoThrow

Step 5
  springKick

Step 6
  filterOpen

Step 7
  restoreArrangement

Each step can still use existing moves.

13. Targeted channel selection needs to become much smarter

Currently there is already look-ahead: role-targeted moves avoid channels that won't actually play during the next 16 rows.

That's good.

But we need:

Which channel is musically important?
Which one just played?
Which one repeats?
Which one is about to play?
Which one is exposed?
Which one has already been thrown?
Which one is safe to sacrifice?

That turns channel selection from:

pick a bass channel

into:

pick the bass phrase that is about to become interesting
14. Phrase and section awareness

The current phrase arc is good as a first approximation. It already gives each persona a different 16-bar probability envelope.

But the AI needs two separate concepts:

Musical phrase
4 / 8 / 16 / 32 bars
Arrangement section
intro
verse
chorus
break
drop
outro
pattern change
instrument entry
instrument exit

A pattern boundary isn't automatically a phrase boundary.

That distinction will dramatically improve the drops.

15. Anticipation

A dub engineer doesn't only react to what just happened.

The AI should look ahead:

next bass phrase
next chord change
next snare accent
next vocal/hook
next pattern transition
next section

Then:

anticipation = high
        ↓
prepare effect
        ↓
fire exactly when musical event arrives

This is how you get:

filter rises
...
...
...
DOWNBEAT
→ release

instead of:

250ms tick happened
→ filter rise
16. EQ needs two separate brains

The current spectral improv driver is explicitly described as a tonal-balance corrector, not a musical gesture.

Keep it, but don't let it become the persona.

We need:

Auto EQ

“Is the return tonally balanced?”

Dub EQ gestures

“I want that echo tail to scream through this frequency right now.”

The second one belongs to the GestureEngine.

Tubby's resonant return EQ is particularly suited to this because the standing preset intentionally leaves the resonant return EQ disabled; the sweep is intended to be performed as a gesture.

17. Separate “how often” from “how hard”

This is an explicit current limitation.

One intensity scalar currently controls:

budget
probability
parameter depth.

Split it:

performanceDensity
gestureIntensity
wetness
risk

So I can have:

low density
high intensity

meaning:

“Do almost nothing, but when I touch the desk, make it count.”

That's extremely important for dub.

18. Bass/drum foundation should be a first-class concept

This follows directly from your last question.

I'd explicitly add:

FoundationState {
  bassChannels
  percussionChannels

  bassEnergy
  drumEnergy

  grooveStrength
  foundationDensity

  bassIsExposed
  foundationIsExposed

  safeToDropMelody
}

Then:

intention = isolateFoundation

can choose:

versionDrop

or:

swampRiddim

depending on persona and context.

And swampRiddim can deliberately:

drop harmony/melody
↓
boost bass
↓
darken/shape drums
↓
comb/filter
↓
echo selected drum/bass hits
↓
spring
↓
leave space
↓
restore

This is one of the clearest missing musical capabilities.

19. Don't add more random moves yet

I actually wouldn't make adding another 20 dub effects the priority.

You already have a remarkably broad vocabulary:

echo
spring
tape
filter
EQ
comb/flanger
drops
mutes
generated bass/sub
sirens
reverse
delay throws
stereo/ping-pong
lo-fi
arrangement operations

The documentation lists 43 moves and substantial supporting DSP already.

The missing capability is:

knowing why to use an existing move, what to aim it at, what to combine it with, and when to stop.

That's where the next 80% of quality lies.

20. The completed performer

Ultimately I would want Auto Dub to look conceptually like this:

                    ┌──────────────────────┐
                    │      SONG INPUT      │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │    MUSICAL CLOCK     │
                    │ beat/bar/phrase/     │
                    │ section/boundaries   │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │ MUSICAL UNDERSTANDING│
                    │ events / roles /     │
                    │ groove / bass /      │
                    │ arrangement / energy │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │   PERSONA STATE      │
                    │ taste / habits /     │
                    │ rest / risk / wet    │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │     INTENTION        │
                    │ drop / throw / wash  │
                    │ bass / space / etc.  │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │    TARGET SELECTOR   │
                    │ channel / group /    │
                    │ foundation / return  │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │    GESTURE ENGINE    │
                    │ move / combination / │
                    │ parameters / timing  │
                    └──────────┬───────────┘
                               ↓
                         DubRouter.fire()
                               ↓
                    ┌──────────────────────┐
                    │       DUB BUS        │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │     CONSEQUENCE      │
                    │ wet energy / audio / │
                    │ arrangement changes  │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │ PERFORMANCE MEMORY   │
                    └──────────┬───────────┘
                               │
                               └──────→ next decision
What I would actually implement, in order
Phase	Capability	Why
A	MusicalClock	Removes hardcoded musical assumptions
B	MusicalEventModel	Understands actual musical function
C	Arrangement/Foundation model	Makes drops musically safe
D	PerformanceContext	Gives AI a coherent world-state
E	Intention + deliberate Rest	Gives personas reasons and silence
F	GestureEngine	Turns intentions into existing moves
G	WetEnergy budget	Allows intelligent effect combinations
H	MusicalTargeting	Picks meaningful channels/events
I	Compound gestures	Enables swamp riddim, drops, builds, releases
J	Consequence/Memory	Makes the performer respond to what it just did
K	Persona behavioral profiles	Makes five personas genuinely different
L	Musical Returns	Better re-entry after drops and effects
M	Record/replay integration	Preserve the new performance model
N	Long-performance testing	Prevents repetitive/random behavior
O	Final musical tuning	Persona-specific probability/depth/rest tuning

This is essentially the completion path I would use rather than rebuilding the Dub Bus.

And importantly, it respects what you've already built: the 43 moves remain the hands, DubBus remains the instrument, DubRouter.fire() remains the single execution path, and Auto Dub becomes the musician operating the desk. The current system already has the hardware and vocabulary; these layers supply the musical intelligence that is missing.