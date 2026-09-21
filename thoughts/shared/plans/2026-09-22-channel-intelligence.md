---
date: 2026-09-22
topic: Channel Intelligence — classifying what each tracker channel plays, over time
tags: [dub, autodub, classification, channel-intelligence, personas, analysis]
status: draft
---

how can we get better at detecting what the instruments are and what's playing in the tracker channels? we need to be awesome at classifying each channel to improve the dubs, this includes all the sampled instruments and the synths 

Yes. I think this is one of the highest-value upgrades left for the dub system.

You already have a surprisingly sophisticated role pipeline: offline pattern/instrument/sample-FFT analysis, runtime per-channel spectral analysis, CED instrument classification, CED timelines, SID voice classification, a pre-play audio scrub, and user overrides.

But it is still fundamentally trying to answer:

“What role is this channel?”

We need to answer something much richer:

“What instrument is this, what is it actually playing, how is it being played, what musical function does it have right now, and what parts of it are good dub targets?”

That distinction could make the personas dramatically better.

1. Don't replace the current classifier — turn it into an ensemble

I would build a Channel Intelligence system above the existing classifiers.

Current:

offline classifier
runtime spectral classifier
CED timeline
live CED/SID
user override
        ↓
one ChannelRole

New:

                 ┌─ tracker/note evidence
                 ├─ sample metadata
                 ├─ sample audio analysis
                 ├─ synth metadata
                 ├─ synth parameter analysis
                 ├─ pattern/playback analysis
                 ├─ live audio analysis
                 ├─ CED instrument classifier
                 └─ SID/register analysis
                          ↓
                  Channel Intelligence
                          ↓
              instrument + technique + role
                          ↓
                    confidence model
                          ↓
                   DubTargetProfile

The existing system already has the right ingredients to start this: classifySongRoles uses note statistics, instrument metadata and sample FFT; runtime classification uses live channel audio; CED provides position-aware instrument recognition; and user dubRole overrides everything.

The improvement is to stop throwing all that evidence away and collapsing it to bass/chord/lead/....

2. Every channel needs a rich identity

I'd introduce something like:

interface ChannelIntelligence {
  channelId: number

  // What is producing the sound?
  sourceType:
    | 'sample'
    | 'synth'
    | 'hybrid'
    | 'sid'
    | 'external'
    | 'unknown'

  instrumentFamily:
    | 'kick'
    | 'snare'
    | 'hihat'
    | 'cymbal'
    | 'percussion'
    | 'bass'
    | 'piano'
    | 'organ'
    | 'guitar'
    | 'strings'
    | 'brass'
    | 'woodwind'
    | 'vocal'
    | 'synthBass'
    | 'synthLead'
    | 'synthPad'
    | 'synthPluck'
    | 'synthKeys'
    | 'fx'
    | 'noise'
    | 'unknown'

  instrumentSubtype?: string

  // What is it doing?
  musicalFunction:
    | 'foundation'
    | 'bass'
    | 'drums'
    | 'harmony'
    | 'melody'
    | 'countermelody'
    | 'hook'
    | 'texture'
    | 'fx'
    | 'transition'
    | 'unknown'

  rhythmicRole:
    | 'kick'
    | 'backbeat'
    | 'hat'
    | 'offbeat'
    | 'straight'
    | 'syncopated'
    | 'arpeggiated'
    | 'sustained'
    | 'free'
    | 'unknown'

  register:
    | 'sub'
    | 'low'
    | 'lowMid'
    | 'mid'
    | 'highMid'
    | 'high'

  // How it sounds
  timbre: {
    brightness: number
    noisiness: number
    harmonicity: number
    inharmonicity: number
    attack: number
    sustain: number
    decay: number
    stereoWidth: number
  }

  // How it is being played
  performance: {
    noteDensity: number
    velocityRange: number
    repetition: number
    averageNoteLength: number
    polyphony: number
    pitchRange: number
    articulation: ...
  }

  confidence: {
    instrument: number
    function: number
    rhythm: number
    register: number
  }
}

And keep the raw evidence behind those values.

3. Samples need to be classified before the tracker even plays

This is particularly important for DEViLBOX because a sample can tell us an enormous amount without listening to the finished channel.

For every sample/instrument used by a channel, build a cached:

SampleProfile

containing:

Basic sample facts
sample name
instrument name
filename
sample rate
length
channels
loop mode
loop length
root note
finetune
volume
Audio features
fundamental frequency
spectral centroid
spectral rolloff
spectral flatness
zero crossing rate
RMS
peak
crest factor
attack time
decay time
sustain estimate
spectral flux
harmonicity
noise ratio
low-frequency energy
mid energy
high energy
stereo width
Instrument hypotheses
kick:       0.91
tom:        0.06
bass:       0.03

or

electricPiano: 0.78
organ:        0.15
synthKeys:    0.07

That profile gets cached.

Don't FFT the sample every AutoDub tick.

Do it when the sample/instrument is loaded or changed, then reuse it.

4. But sample identity isn't enough

This is crucial.

Suppose sample 17 is:

“piano.wav”

That doesn't mean the channel is playing piano functionally.

It might be:

piano sample
+ low register
+ offbeat repeated chords
+ short notes
        ↓
SKANK / RHYTHMIC HARMONY

Or:

piano sample
+ sustained high notes
+ long releases
        ↓
PAD / TEXTURE

Or:

piano sample
+ single-note melodic phrase
        ↓
LEAD

So we need instrument identity and musical behavior separately.

This directly addresses a known weakness in the current system: an offbeat piano channel can currently land in chord, skank, or pad.

5. Analyze the tracker itself extremely deeply

This is where DEViLBOX has an advantage over an ordinary DAW.

You don't have to infer everything from audio.

You have the actual notes.

For every channel, scan the entire song and construct a musical fingerprint.

For each pattern/order occurrence:

notes
instrument changes
sample changes
volume
pan
effects
note lengths
pitch
octave
repetition
spacing
velocity

Then derive:

Pitch behavior
lowest note
highest note
median note
pitch center
pitch range
interval distribution
semitone movement
octave distribution
Rhythm
notes/bar
notes/beat
onbeat ratio
offbeat ratio
syncopation
triplet usage
repetition
inter-onset interval
accent pattern
Harmony
monophonic/polyphonic
chord size
chord types
repeated voicings
root movement
Phrase behavior
loop length
motif repetition
phrase boundaries
entry points
exit points
density changes

Now the classifier can recognize things like:

Sample = piano
Register = mid
Polyphony = 3–5
Onset = mostly offbeats
Pattern repetition = high

→ piano offbeat skank/harmony

That's much more useful to a dub persona than merely:

role = chord
6. Synth channels need an entirely different information source

This is where I think you can get really good.

For DEViLBOX's native synths, don't make the audio classifier guess what the synth is.

The synth already knows what it is.

If a channel is:

TB-303-style synth

or:

FM synth

or:

SID

or:

wavetable

or:

subtractive synth

or a specific preset:

"Juno Pad"

give the classifier that metadata directly.

Then combine it with tracker behavior.

For example:

Synth metadata:
  family = subtractive
  oscillator = saw
  filter = LP
  resonance = 0.7
  envelope = short

Tracker:
  monophonic
  low register
  repeated 16th notes

        ↓

synthBass / acidBass

Whereas:

Synth:
  2 oscillators
  saw + square
  slow attack
  long release
  chorus

Tracker:
  sustained chords
  high polyphony

        ↓

synthPad

This is much more reliable than trying to infer the identity from a noisy live FFT.

7. Track instrument changes over time

This is another big one.

A channel isn't necessarily one instrument forever.

Imagine:

Channel 5

bars 0–31:
  piano chords

bars 32–47:
  vocal sample

bars 48–63:
  horn stab

The current CED timeline is already designed to track position-dependent instrument changes.

We should generalize that concept:

ChannelTimelineSegment {
  startRow
  endRow

  instrument
  function
  register
  density
  confidence
}

Then AutoDub asks:

“What is Channel 5 right now?”

not:

“What was Channel 5 generally?”

8. We should classify musical events, not just channels

This is even better.

A channel might contain:

bass line
+
occasional bass fill
+
sub drop

So:

MusicalEvent {
  channelId
  startRow
  duration
  pitch
  velocity

  instrument
  function
  articulation

  accent
  phrasePosition
}

Then the dub AI can target:

“the next bass fill”

instead of:

“bass channel.”

That is how you eventually get really sophisticated throws.

9. Add articulation detection

For samples especially, we should distinguish:

kick
snare
rim
hat
tom
crash
shaker
clave
conga
bongo
tambourine

But also:

piano stab
organ stab
horn stab
guitar chop
vocal hit
brass swell
string stab
synth stab

Because dub doesn't necessarily care only about instrument family.

It cares about what can be thrown.

I'd explicitly calculate:

DubTargetability

For example:

snare:
  transient = high
  repetition = high
  isolated = high
  echoTarget = 0.96

pad:
  transient = low
  sustain = high
  echoTarget = 0.35
  ghostReverbTarget = 0.94

bass:
  foundation = high
  lowRisk = high
  echoTarget = 0.62
  bassEmphasis = 0.95

Now the persona knows what each channel is good for.

10. Build a “DubTargetProfile”

This is the piece I'd put directly between classification and AutoDub.

interface DubTargetProfile {
  channelId: number

  identity: ChannelIntelligence

  targets: {
    echoThrow: number
    springKick: number
    springSlam: number
    filterDrop: number
    hpfRise: number
    ghostReverb: number
    tapeWobble: number
    bassEmphasis: number
    versionDropKeep: number
  }

  risks: {
    lowEndRisk: number
    maskingRisk: number
    arrangementImportance: number
    destructiveRisk: number
  }

  musicalAvailability: {
    playingNow: boolean
    nextHitRow?: number
    nextPhraseRow?: number
    nextAccentRow?: number
  }
}

Then the AI doesn't have to reason from raw classifier output.

It gets:

CHANNEL 7

Instrument:
  electric piano 94%

Function:
  offbeat harmony 91%

Register:
  mid 87%

Pattern:
  repetitive 88%
  syncopated 82%

Next important hit:
  row 244

Dub suitability:
  echo 0.91
  spring 0.76
  filter 0.84
  bass emphasis 0.04

Arrangement:
  harmony 0.93
  safe to drop 0.89

That's an incredibly useful object for the persona.

11. Confidence must be multidimensional

Don't have:

confidence = 0.82

Have:

instrument confidence = 0.96
function confidence = 0.91
register confidence = 0.99
rhythm confidence = 0.87

Because:

"I know it's a piano"

doesn't imply:

"I know whether it's functioning as a pad."

And:

"I know it's bass"

doesn't imply:

"I know it is safe to echo right now."
12. Evidence should be weighted differently

I'd use a source hierarchy.

Native tracker metadata

For instrument identity:

very high confidence

native synth preset
instrument definition
sample assignment
SID voice
Tracker note data

For musical behavior:

very high confidence

pitch
rhythm
polyphony
pattern repetition
instrument changes
Sample analysis

For timbre:

high confidence

FFT
envelope
harmonicity
spectral features
Live audio

For what is actually sounding:

very high confidence for current activity

energy
transient
current spectral character
CED

Useful as an independent semantic opinion:

"this sounds like guitar"

but it shouldn't automatically override known tracker metadata.

The current architecture gives CED high priority in the final automatic classification; I would change that relationship so CED becomes evidence, rather than the unquestioned authority. The current pipeline explicitly lets live CED/SID override earlier analysis, while user override remains final.

13. Native synth metadata should beat CED

This is particularly important.

If DEViLBOX knows:

instrument = "SuperSaw Lead"
synth = "PolySynth"
preset = "Juno Pad"

and CED says:

acoustic guitar 0.31

we should not have a philosophical debate.

The native metadata wins.

CED can still say:

“The actual output currently resembles a guitar.”

That could be useful if the preset is badly named or heavily processed, but it shouldn't change the identity without strong evidence.

14. Samples can get really sophisticated

We can also classify samples by source character.

For example:

acoustic / electronic
pitched / unpitched
tonal / noisy
percussive / sustained
harmonic / inharmonic
mono / stereo
dry / reverberant
clean / distorted
short / long

This helps distinguish:

kick drum

from:

low synth bass

even if both have lots of energy around 60–100 Hz.

15. The tracker gives us a secret weapon: instrument consistency

If a channel repeatedly uses:

instrument 4
notes C2–G2
monophonic
short repeated notes

we have extremely strong evidence that it is a bass instrument.

If another channel uses:

instrument 12
three-note simultaneous events
offbeat
mid-register
repeated every half beat

we have extremely strong evidence for rhythmic harmony/skank.

We don't need a neural network to solve all of this.

A deterministic tracker analysis can probably get a surprisingly large portion right.

Then ML/audio analysis handles the ambiguous cases.

16. I would also classify “dub function”

This is the most important layer for the personas.

Not:

instrument = piano

but:

dubFunction = {
  echoable: .94
  springable: .76
  throwable: .91
  dropCandidate: .92
  foundation: .08
  bassFeature: .01
  textureWash: .67
}

For a snare:

echoable .98
springable .94
throwable .99

For a pad:

echoable .45
springable .83
throwable .30
ghostReverb .98

For bass:

echoable .55
springable .35
bassFeature .99
foundation .99
dropKeep .99

That's where classification finally becomes useful for dub performance.

17. Then the persona can reason musically

Instead of:

rule:
echoThrow if role === percussion

we get:

intention = punctuate

candidate channels:

snare
  echoability 0.98
  nextHit = beat 3&
  importance = 0.71

kick
  echoability 0.42
  nextHit = beat 1
  foundation = 0.99

piano
  echoability 0.91
  nextHit = offbeat
  arrangementImportance = 0.44

Scientist might choose:

snare

Tubby might choose:

snare on the &

Perry might choose:

piano stab

Mad Professor might choose:

piano + spatial treatment

Jammy might choose:

snare + short digital throw

Same song. Same channels. Different performers.

18. And this fixes your bass problem too

Once we know:

Channel 3
instrument = synth bass
function = foundation
register = sub/low
pattern = repetitive
energy = strong
next important event = phrase downbeat

the persona can deliberately say:

intention = emphasizeBass

rather than hoping the generic role classifier happens to select bass.

And during:

foundationDrop

it becomes:

KEEP:
  kick
  snare
  bass

EMPHASIZE:
  bass

OPTIONALLY THROW:
  snare
  kick
  bass accent

REMOVE:
  piano
  pad
  horn
  lead

That's exactly the sort of information the dub performer needs.

19. The UI should expose this eventually

I wouldn't expose all 200 features to users.

But when they open the channel's dub information, they should eventually be able to see something like:

CHANNEL 5

🎹 Electric Piano
94% confidence

FUNCTION
Offbeat Harmony / Skank
91%

REGISTER
Mid

PATTERN
████████░░ 78% repetitive

DUB TARGETS
Echo       █████████░ 91%
Spring     ███████░░░ 72%
Filter     █████████░ 88%
Ghost      ██████░░░░ 61%

ARRANGEMENT
Harmony    █████████░ 89%
Foundation ░░░░░░░░░░  4%

NEXT HIT
Beat 3&

And importantly:

user override remains authoritative.

The current mixer already has dubRole, and the documented pipeline gives user override final priority.

I'd preserve that, but eventually allow overrides like:

"Treat as bass"
"Treat as skank"
"Protect from drops"
"Good echo target"
"Never target"
20. Implementation order

I wouldn't start by training a new neural model.

I'd do this:

Phase 1 — Evidence extraction

Build:

ChannelEvidence
SampleProfile
SynthProfile
PatternFingerprint

using information DEViLBOX already has.

Phase 2 — Instrument identity

Produce:

instrumentFamily
instrumentSubtype
sourceType
register

with confidence.

Phase 3 — Musical behavior

Produce:

rhythmicRole
musicalFunction
noteDensity
polyphony
pitchRange
repetition
syncopation
phrase behavior
Phase 4 — Temporal timeline

Turn those into:

ChannelTimelineSegment[]

so classification can change during the song.

Phase 5 — DubTargetProfile

Calculate:

echoability
springability
throwability
dropImportance
bassImportance
foundationImportance
textureValue
lowEndRisk
Phase 6 — Persona integration

Replace:

channelRole === 'percussion'

with:

targetProfile.echoability
targetProfile.rhythmicRole
targetProfile.arrangementImportance
targetProfile.nextAccent
...
Phase 7 — Validation

Create a classification test corpus from real DEViLBOX songs.

For every channel, store expected:

instrument
function
rhythm
register
foundation status
dub targets

Then run the classifier offline and measure each dimension separately.

The really important architectural change

I would not call the result ChannelRole anymore.

Keep ChannelRole for compatibility with the existing system.

Add:

ChannelIntelligence
        ↓
ChannelTimeline
        ↓
DubTargetProfile

So the old system can still ask:

getRole(channel) // bass

while the new AutoDub can ask:

getChannelIntelligence(channel)
getCurrentMusicalFunction(channel)
getNextMusicalEvent(channel)
getDubTargetProfile(channel)

That gives us backward compatibility while giving the new performer vastly more information.

The current documentation explicitly identifies src/bridge/analysis/ChannelNaming.ts, ChannelAudioClassifier.ts, SongRoleTimeline.ts, and MusicAnalysis.ts as the analysis layer on which Dub depends. I would improve those systems rather than put classification logic inside AutoDub.ts.

And I think this should happen before we do the final persona implementation: if the performer doesn't reliably know “this is the snare, this is the bass, this is an offbeat piano skank, this is a sustained pad, this is a vocal hook, and this is a synth lead”, all the intention/gesture intelligence we've been designing will be operating on shaky targets.

one thing that makes it trickier in tracker music it's common that channels change character and moves around during the song

Exactly. And I think this changes the architecture in an important way.

In tracker music, the channel is not the instrument. The channel is more like a lane in which different instruments, roles, and musical ideas can appear over time.

So we should never build a system whose fundamental assumption is:

Channel 5 = piano

It needs to be:

Channel 5
  ├── bars 0–15: bass
  ├── bars 16–31: bass fill / percussion
  ├── bars 32–47: vocal sample
  ├── bars 48–63: synth stab
  └── bars 64–79: empty

And potentially even more granularly:

Channel 5
  bar 20:
    bass notes

  bar 21:
    bass notes

  bar 22:
    bass notes + fill

  bar 23:
    bass notes

  bar 24:
    drum hit

That means time has to be a first-class dimension of classification.

The right mental model

I'd change our previous architecture from:

Channel
  ↓
ChannelIntelligence

to:

Channel
  ↓
ChannelIdentityHistory
  ↓
time-indexed musical segments
  ↓
current ChannelState

Something like:

interface ChannelTimeline {
  channelId: number

  segments: ChannelSegment[]
}

with:

interface ChannelSegment {
  startRow: number
  endRow: number

  instrument: InstrumentIdentity
  musicalFunction: MusicalFunction
  rhythmicRole: RhythmicRole
  register: Register

  patternId?: number
  instrumentIds: number[]

  confidence: ClassificationConfidence

  dubTargets: DubTargetProfile
}

Then the performer asks:

getChannelState(songRow)

rather than:

getChannelRole(channelId)
But there's an even more important distinction

We shouldn't only segment when the instrument changes.

We should segment when the musical behavior changes.

For example:

Channel 4
──────────────────────────────────────────────

Piano
  offbeat chords
  bars 0–15

Piano
  single-note melody
  bars 16–23

Piano
  sustained chord
  bars 24–31

Piano
  offbeat chords
  bars 32–47

The instrument never changed.

But its dub function absolutely did.

The persona needs to know:

bars 0–15
  skank / rhythmic harmony

bars 16–23
  melody / echo target

bars 24–31
  pad / texture

bars 32–47
  skank again

That is much more useful than instrument = piano.

Tracker patterns make this particularly powerful

We have an advantage that an audio-only system doesn't have:

we know exactly what pattern/instrument/event is coming next.

Suppose:

Order:
A A B B C C

and channel 3 does:

Pattern A → bass
Pattern B → bass
Pattern C → vocal sample

The classifier can know before playback:

bars 32–47:
channel 3 will become vocal

So the dub performer can prepare:

don't throw bass at bar 32
       ↓
vocal is about to enter
       ↓
create space
       ↓
vocal enters
       ↓
throw vocal

That's anticipatory dub performance.

I would actually make three levels of identity

This is probably the cleanest architecture.

Level 1 — Channel identity

Stable facts:

channel 5
volume
pan
routing
user overrides
Level 2 — Segment identity

What this channel is doing during a region:

bars 32–47
  instrument = piano
  function = harmony
  rhythmicRole = skank
Level 3 — Event identity

What an individual musical event is:

row 548
  piano
  C4 + Eb4 + G4
  offbeat
  accent
  next phrase boundary

So:

CHANNEL
   ↓
SEGMENT
   ↓
EVENT

The dub performer can target whichever level makes sense.

This also solves channel reuse

A tracker might deliberately do something like:

Channel 1:
  kick
  kick
  kick
  kick

later:

Channel 1:
  vocal chop
  vocal chop
  vocal chop

If our system has a permanent:

channel 1 = percussion

classification, it's doomed.

Instead:

Channel 1
  ├── Segment A → kick / foundation
  └── Segment B → vocal chop / hook

The AutoDub sees the current segment.

Pattern identity should be part of the evidence

I'd give each channel segment a provenance trail:

interface SegmentEvidence {
  patternId?: number
  orderIndex?: number

  instrumentIds: number[]
  sampleIds: number[]
  noteRange: [number, number]

  eventCount: number
  polyphony: number
  repetition: number

  audioEvidence?: AudioClassification
  synthEvidence?: SynthClassification
}

This lets us distinguish:

same channel
same sample
different pattern
different function

from:

same channel
different sample
different instrument
And don't make segmentation too twitchy

This is important.

If we classify every few notes independently, the AI will see:

bass
bass
unknown
bass
bass
lead
bass

and behave erratically.

We need temporal smoothing and hysteresis.

For example:

new classification confidence > old classification + threshold
AND
persists for N events / meaningful boundary

before creating a new segment.

But structural tracker information should be allowed to cause immediate transitions:

new pattern
new instrument
explicit section boundary

So there are two kinds of changes:

Hard transition
instrument changes
pattern changes dramatically
order changes
explicit user metadata

→ segment immediately.

Soft transition
bass starts playing higher
rhythm gets denser
piano becomes more melodic

→ accumulate evidence and transition smoothly.

This becomes incredibly useful for dub drops

Consider:

bars 0–15

bass → foundation
drums → foundation
piano → skank
horn → hook
vocal → hook

At bar 16:

piano disappears
horn disappears
vocal disappears
bass + drums continue

The AI doesn't have to guess that this is a drop.

It can see:

arrangement state changed
↓
foundation now exposed
↓
bass importance increases
↓
bass is now a prime target

Then it can perform:

foundation drop
→ bass emphasis
→ drum/bass filter movement
→ snare throw
→ spring
→ silence
→ reintroduction

That's the swamp riddim behavior we were discussing.

And channel movement itself can become a musical signal

This is another thing I'd explicitly model.

If a channel changes character repeatedly:

bass
→ percussion
→ vocal
→ bass

that tells us something about the composition.

We can calculate:

channelMobility

and:

roleTransitions

For example:

Channel 5

mobility: 0.82
transition frequency: high

bass → vocal → percussion → bass

versus:

Channel 2

mobility: 0.03

kick → kick → kick → kick

The first is a highly dynamic tracker lane and the second is a stable foundation.

That could influence dub targeting.

We should also distinguish channel reuse from pattern reuse

This matters enormously in trackers.

You might have:

Pattern 12:
  channel 3 = piano

Pattern 12 reused later:
  channel 3 = piano

That's probably the same musical identity.

But:

Pattern 12:
  channel 3 = piano

Pattern 27:
  channel 3 = bass

means the channel has changed role.

So the timeline should be generated from the order/pattern playback graph, not simply from absolute tracker row numbers.

Conceptually:

Order position
   ↓
Pattern instance
   ↓
channel pattern data
   ↓
instrument/event analysis
   ↓
absolute song timeline

This is much more reliable.

The really powerful part: the AI can know the future

Once we have this timeline, the persona gets:

currentState
nextState
nextImportantEvent
nextTransition

So it can reason:

NOW:
  piano skank

IN 2 bars:
  piano disappears

IN 2 bars:
  vocal enters

IN 4 bars:
  bass pattern changes

Then the dub performer can decide:

“Don't waste an echo on the piano now. I'm going to create space and catch the vocal entrance.”

That's the level of anticipation I think will make the system feel dramatically more like a real performer.

One thing I'd change from my previous recommendation

I previously suggested:

ChannelIntelligence

as the central object.

I'd now make the central object:

SongPerformanceTimeline

containing:

SongPerformanceTimeline
│
├── MusicalClock
│
├── ChannelTimeline[0]
│   ├── Segment
│   ├── Segment
│   └── Segment
│
├── ChannelTimeline[1]
│   └── ...
│
├── SectionTimeline
│
├── EventTimeline
│
└── ArrangementTimeline

Then ChannelIntelligence becomes the classification evidence attached to each segment.

That architecture is much better suited to tracker music.

The final hierarchy I'd aim for
SONG
│
├── ORDER / PATTERN STRUCTURE
│
├── MUSICAL CLOCK
│
├── ARRANGEMENT TIMELINE
│
└── CHANNELS
      │
      ├── Channel 1
      │     ├── Segment 0
      │     │     ├── instrument
      │     │     ├── function
      │     │     ├── rhythm
      │     │     ├── register
      │     │     └── dub targets
      │     │
      │     ├── Segment 1
      │     └── Segment 2
      │
      ├── Channel 2
      │     └── ...
      │
      └── Channel N
            └── ...

And underneath each segment:

instrument evidence
+ tracker evidence
+ sample evidence
+ synth metadata
+ audio evidence
+ CED evidence
+ temporal context
        ↓
classification confidence
        ↓
DubTargetProfile

Then the persona operates on the current segment and upcoming segments, not on a permanent channel label.

That, to me, is the right foundation for making DEViLBOX's dub AI genuinely tracker-native rather than a DAW-style AI that happens to receive tracker channels.