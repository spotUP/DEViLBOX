---
date: 2026-09-22
topic: When and how the dub personas should boost the bass
tags: [dub, personas, bass, autodub, planning]
status: draft
---

when should the dub personas boost the bass? how should they boost it? it's rare that they do it in our app

Yes — I think bass boosting should be rare, but much more intentional than it is now.

The important distinction is that a dub persona usually shouldn't think:

“Bass is quiet → boost bass.”

It should think:

“This is a bass-important moment, the arrangement has enough headroom, and I want the low end to become part of the gesture.”

When to boost bass

I’d give the AI roughly these opportunities:

After a drop
The classic case.
Kill/reduce other material first, then restore or emphasize the bass.
Especially strong after versionDrop, masterDrop, or a melodic mute.
The bass boost becomes the payoff of the drop rather than a random EQ correction.
At a phrase/section boundary
On the first beat of a new 4/8/16-bar phrase.
Particularly when the bass enters after being absent or reduced.
This should be a musical event, not something that happens on an arbitrary 250 ms AutoDub tick.
When bass is carrying the groove
If the current section is bass-heavy and the bass line has a recognizable/repeating figure, a persona can briefly make it more dominant.
Don't do this continuously; think of it as highlighting a bass phrase.
As a response to a previous effect
Example:
filter drop → silence → bass return
Or:
tape stop → bass re-entry
The bass boost is then a consequence of the preceding dub action.
When the arrangement has become sparse
If melody/harmony has been removed and bass + drums remain, the AI can push the bass because there is more spectral/arrangement space.
This is particularly compatible with the existing versionDrop/riddimSection concepts.
Occasionally as a persona signature
Some personas can have a higher probability of doing this, but it should still be gated by musical context.
It should never become “Tubby = periodically boost bass.”
How they should boost it

I would not make the primary mechanism a giant permanent low-shelf boost.

Instead, make a dedicated musical gesture, something like:

bassEmphasis

with several possible implementations.

Preferred sequence:

identify bass channel
        ↓
check bass is actually audible
        ↓
check low-end headroom / existing low-end energy
        ↓
optionally reduce competing low-mid material
        ↓
short bass emphasis
        ↓
return toward previous state

The actual processing could combine:

small low-shelf / low-frequency EQ lift
temporary bass-channel send increase
possibly a sub swell underneath the return
optionally a brief low-mid cleanup so the bass feels louder without enormous gain

For example, rather than:

bass EQ +12 dB for 8 seconds

something closer to:

bass emphasis
  +2–4 dB low shelf
  80–120 Hz focus depending on material
  1–2 bar duration
  eased attack/release

with the exact amount determined by the current energy budget.

Even better: make it a bass throw

Your existing move system already gives us a useful primitive: subSwell.

So I wouldn't treat all bass interventions as EQ.

You could have distinct gestures:

bassEmphasis
bassThrow
subSwell
bassDropReturn

They mean different things.

Bass emphasis

“Make the existing bass line hit harder.”

Bass throw

“Temporarily put the bass into the dub return / processing path.”

Sub swell

“Add a low-frequency event underneath the musical return.”

That gives the personas much more expressive vocabulary.

The key missing AI rule

I suspect the reason it rarely happens in your app is that the current AI has no sufficiently strong concept of “this is the moment for bass.”

It needs a bass-specific musical state:

bassState = {
  audible: true,
  channelIds: [...],
  energy: 0.0..1.0,
  density: 0.0..1.0,
  repetition: 0.0..1.0,
  currentlyExposed: boolean,
  recentlyReturned: boolean,
  phraseImportance: 0.0..1.0,
}

Then:

bass opportunity =
    bass is audible
    AND
    bass has musical importance
    AND
    arrangement has space
    AND
    no recent bass emphasis
    AND
    current moment is structurally significant

That's very different from your current spectral-improv idea of “find a quiet frequency and boost it.” Bass emphasis should be an intentional musical decision, not automatic tonal balancing.

Persona differences

I'd make the persona differences mostly about when and how often, rather than completely different DSP.

Tubby

Bass emphasis after a drop or sparse section.
Strong relationship with filter/delay/reverb gestures.
Short, emphatic low-end returns.
Darker, narrower treatment.

Scientist

Bass boost as part of a precise drop/return.
More likely to create a clear “before → after” contrast.
Less continuous bass enhancement.

Perry

Bass can become part of an accumulated effect chain.
More willing to combine bass emphasis with spring/phaser/tape/lo-fi coloration.
But still needs musical justification.

Mad Professor

Bass emphasis can be more spatial/processed.
Could combine with delay/filter movement rather than simply making the dry bass louder.

Jammy

Bass emphasis fits especially well with sparse structural moments and dance-oriented transitions.
Can be very direct: remove stuff → bass comes forward → groove resumes.

Those are product-design interpretations, not claims that these artists always behaved that way historically.

One particularly important rule

I would add:

Never boost bass merely because the bass is currently quiet.

Quiet bass can be intentional.

Instead:

quiet bass
    ↓
is this a bass-feature moment?
    ↓
YES → consider emphasis
NO  → leave it alone

And I would make phrase boundaries, drops, bass re-entries, and sparse arrangement states the main triggers.

That fits the architecture we're already moving toward: the persona chooses an intention, then a target, then a move, rather than AutoDub randomly selecting DSP every 250 ms.

If we implement this, I'd put bassEmphasis into the MusicalTargeting / GestureEngine part of the plan rather than treating it as another generic DSP move.

the dub move where they drop everything but the drums and bass should boost the bass and play with filters etc to get that liquid swampy drum sound right?

Yes. That should be treated as a complete musical gesture, not merely a “mute the melody” move.

The idea is essentially:

Strip the arrangement down to drums + bass, then make that remaining rhythm section feel huge, wet, low, and alive.

So the move should have a coordinated sequence rather than simply doing what versionDrop/riddimSection currently do.

The musical sequence
FULL ARRANGEMENT
      ↓
DROP HARMONY / MELODY / TEXTURE
      ↓
DRUMS + BASS REMAIN
      ↓
BASS COMES FORWARD
      ↓
LOW/MID FILTER MOVEMENT
      ↓
DUB RETURN / SPRING / ECHO
      ↓
LIQUID "SWAMP" GROOVE
      ↓
RESTORE THE ARRANGEMENT

The important part is that drums and bass become the subject of the dub, rather than merely being the things that weren't muted.

I'd make this a dedicated compound move

Something like:

riddimSection → swampRiddim / bassAndDrums

It could orchestrate existing primitives:

Identify the foundation
drums/percussion
bass
respect user channel overrides
Reduce everything else
harmony
melody
pads
hooks
textures
etc.
Boost bass modestly
temporary channel emphasis and/or low shelf
not a huge static EQ boost
Shape the drums
perhaps slightly darker/rounder
HPF/LPF movement rather than simply making them brighter
Create the swamp
low-pass/filter movement
spring/reverb
short/dotted echo throws
subtle tape wobble/comb movement where appropriate
possibly subSwell at a structural accent
Interact with the groove
don't just turn everything on simultaneously
throw the snare/kick/bass selectively
let effects decay
leave little pockets of dry rhythm
Return
restore the arrangement at a phrase boundary
potentially throw one last bass/drum echo immediately before restoration
And this is where the bass boost makes sense

This is precisely the sort of situation I was describing in the previous answer.

The AI doesn't say:

“Bass is quiet, therefore +3 dB.”

It says:

“I've deliberately removed the harmonic material. Bass is now one of the two remaining pillars of the arrangement, so I can temporarily make it dominant.”

That's a musical reason for the bass boost.

The filter behavior matters too

I wouldn't make “swampy” equal simply “low-pass everything.”

You want movement:

bass + drums
    ↓
dark filter
    ↓
open slightly
    ↓
echo/snare throw
    ↓
close again
    ↓
bass emphasis
    ↓
spring/reverb wash
    ↓
open toward return

That gives the section a sense of breathing.

And because your existing moves already include things like eqSweep, hpfRise, delayTimeThrow, springSlam, tapeWobble, subSwell, and the echo throws, this should probably be a composition/orchestration layer over those moves, rather than another giant bespoke DSP implementation.

One important change I'd make to the current riddimSection: its existing “return the skank at 60% of hold duration” logic is too mechanical for this. The AI should decide when to reintroduce material using the MusicalClock and phrase/section boundaries.

So yes: the drums+bass drop should become one of the showcase moments where the persona actively “plays the desk” — bass emphasis + filter + spatial effects + selective throws — rather than just muting channels.

