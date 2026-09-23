---
date: 2026-09-23
topic: Dub deck channel section — strips and one shared op panel
tags: [dub, ui, mixer, x-touch, design-system]
status: draft
---

# Dub deck channel section — strips and one shared op panel

## The problem, stated in the domain's terms

A mixing desk has **one** set of effect controls and **N** channel strips. The
effects sit on aux sends, so a channel is in an effect because its SEND is
open — the routing is the fader, not a button.

The dub deck does the opposite: it stamps the whole effect rack onto every
channel. Each channel card carries all nine `CHANNEL_OPS` plus a HOLD button,
so an eight-channel song draws **72 op buttons**. Observed 2026-09-23: "we have
all these per channel buttons i have never seen a real mixing desk have that
like that."

Three consequences, all of which have already cost time this session:

1. **It does not read as a desk.** Nine buttons in a 3x3 grid above a fader is
   a rack, not a channel strip.
2. **The card cannot be narrow.** It is `w-56` (224 px) because three full-size
   op buttons have to fit across. That is why five cards overflow the fader
   zone of the controller layout and why the deck grew a horizontal scrollbar.
3. **It contradicts the hardware.** The X-Touch Compact has one button per
   channel in the row at the bottom — its mutes — and shared buttons above.
   The screen and the device disagree about what a channel is.

There is already a working precedent for the right shape INSIDE the deck: the
MASTER card carries exactly one copy of the nine ops and fires each one across
every channel. The proposal is to make that the only copy.

## Decisions

Two questions were open. The first one dissolved once the actual practice was
checked; both are decided here rather than left to the implementer.

### There is no channel SELECT. The send fader is the routing.

The first draft of this document asked whether selection should be exclusive
(one channel, like a desk) or multi (because dub throws two channels at once).
Asked on 2026-09-23 how King Tubby did it, and the honest answer removes the
question.

Dub effects lived on the console's **aux sends**. A channel was in the echo
because its send was open, and the work was riding the channel faders and the
send amounts live. Several channels in the echo at once was simply several
sends up. There was no select button to be exclusive or not; the routing was
continuous, not binary. (The famous high-pass was on the MASTER bus — one knob
over everything, which is where this deck already puts it.)

The deck already has per-channel dub sends. **Those are the selection**, and
they are better than a select button because they are continuous.

So: no select buttons, no selection mode, no new selection state.

### The per-channel gestures target the channel your hand is on

A few ops genuinely name one channel rather than acting on the bus:

- **Skank** and **Float** capture one stab from a source channel
- **Build** ramps THAT channel's send across two bars
- **Emph** works on the channel carrying the bass
- **Mute** is per-channel by definition

Tubby's answer for those was his hand: the channel he was touching. That is the
mechanism, not a workaround for missing buttons.

- On hardware: **touch the fader**. The X-Touch's faders are touch-sensitive
  and the descriptor already carries the address (`ControlMidiAddress.touchCc`,
  CC101-109 on Layer A, +10 on Layer B).
- On screen: the last channel strip whose fader was touched or dragged.
- Touched nothing yet: **all channels**, which is exactly what the master card
  does today. So current behaviour is the default and nothing is lost.

This is one value — "the channel my hand is on" — not a set, and it is a
transient focus rather than a mode you have to remember to leave.

### Mute stays on the strip

Mute is per-channel STATE, not a gesture, and every desk has one per channel.
It also already has a hardware home: the row at the bottom of the X-Touch,
which the descriptor calls `select` at `y: 13`, is mapped to
`dub.channelMute.ch0..7` — confirmed against the device on 2026-09-23, "there
are mute buttons at the bottom of my controler".

## The new shapes

### Channel strip (was: channel card)

Keeps what a desk channel has:

- name, role select, filter select
- Rvb and Swp sends
- fader, send readout — the fader IS the routing
- **Mute**

The strip shows when it is the current target (the last fader touched), but
that is a readout, not a control: there is nothing to press.

Removed: Throw, Echo, Skank, Float, Stab, Build, Emph, HOLD — eight buttons per
channel.

The strip loses its reason to be 224 px wide. It should end up near the width
of a fader plus its readout, which is what lets it sit in the controller
layout's fader zone at last.

### Op panel (was: master card)

One copy of the ops, acting on the current target:

- the eight `CHANNEL_OPS` gestures plus HOLD
- a readout of what it is acting on ("All channels" / "Ch 2")
- the master send fader stays here

## What this removes

On an eight-channel song: 8 x 9 = 72 op buttons become 9. The deck's height and
width both drop, which is the same budget problem that has been fought all
session from the other end.

## Hardware mapping after the change

| Device control | Acts on |
|---|---|
| Fader 1-8 | that channel's dub send |
| Fader touch 1-8 | makes that channel the target of the per-channel ops |
| Select row 1-8 | that channel's mute (unchanged) — the bottom row of the device |
| Button rows 1-3 | global moves (unchanged) |
| Encoder push | echo rate presets (unchanged) |

The per-channel op targets (`dub.echoThrow.ch3` and friends) stay valid in the
parameter router — they are how automation and AutoDub fire, and nothing about
those paths changes. Only the SCREEN stops drawing one button per channel per
op.

## Risks

- **A user who wants an op on one channel now needs two actions** (touch that
  fader, then fire) where they had one. This is what the desk asks of you and
  is the point of the change — but the target must be VISIBLE on the strip, or
  the second action is a guess.
- **A stale target is a wrong note.** The channel your hand was on ten minutes
  ago should not still be the target. Decide a timeout or clear it on transport
  stop; do not leave it unbounded.
- **AutoDub firing on a channel must still light the right thing.** Today
  `activeFires` keys `${moveId}:${channelId}` light that channel's button.
  With one shared button, the op panel lights and the STRIP of the channel
  being acted on should light too, or the performer loses sight of what the
  machine is doing. This must not be dropped.
- **The target is new state.** One number or null, in the dub store beside
  `heldChannels`, not in component state, or it resets on any remount.

## Test plan

Automated:

1. `dubTarget.test.ts` — pure: no target resolves to every visible channel; a
   target resolves to exactly that one; a target for a channel no longer in the
   pattern resolves back to all rather than to a missing channel.
2. Op panel fires across the resolved target — the regression test names the
   symptom: "fires on every channel when no fader has been touched".
3. Fader touch sets the target — router test that the touch CC sets it and the
   move CC on the same fader does not.
4. The contract test that counts buttons: a channel strip carries no op
   buttons. This is the one that fails before and passes after.

Manual (only the user can confirm):

- The deck at `http://localhost:5174`, PERFORM tab, both layouts.
- Touch nothing, hold Echo, hear all channels — unchanged from today.
- Touch channel 2's fader, hold Echo, hear channel 2.
- Touch a fader on the X-Touch, see that strip mark itself as the target.
- Open two sends, hold Echo with no target — both are in the echo, because the
  sends are the routing.

## Open

One thing to decide during implementation: how the target CLEARS. Candidates
are a timeout, clearing on transport stop, or clearing when the send that made
it interesting goes to zero. Whichever is chosen, it must be bounded — see
Risks.
