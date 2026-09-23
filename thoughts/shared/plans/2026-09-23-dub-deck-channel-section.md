---
date: 2026-09-23
topic: Dub deck channel section — strips and one shared op panel
tags: [dub, ui, mixer, x-touch, design-system]
status: draft
---

# Dub deck channel section — strips and one shared op panel

## The problem, stated in the domain's terms

A mixing desk has **one** set of effect controls and **N** channel strips. You
choose the channel by touching its fader or pressing its select button, and the
shared controls act on what you chose.

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
   channel in its select row and shared buttons above. The screen and the
   device disagree about what a channel is.

There is already a working precedent for the right shape INSIDE the deck: the
MASTER card carries exactly one copy of the nine ops and fires each one across
every channel. The proposal is to make that the only copy.

## Decisions

Two questions were open. Both are decided here rather than left to the
implementer.

### Selection is MULTI, not exclusive

A desk selects one channel at a time. Dub does not: throwing two channels into
the echo at once is a normal gesture, and the deck already supports it —
`heldChannels` is a `Set<number>` and holds run on several channels
simultaneously. Exclusive selection would be a regression in what the deck can
already play.

- Zero selected = **all channels**, which is precisely what the master card
  does today. So the current behaviour is the default and nothing is lost.
- One or more selected = the ops act on exactly those.

### Mute stays on the strip; Select is the fader touch

Mute is per-channel STATE, not a gesture, and every desk has one per channel.
It also already has a hardware home: the X-Touch select row is mapped to
`dub.channelMute.ch0..7`, verified from the preset on 2026-09-23.

That leaves selection without a hardware button — and the correct answer is
the one a desk gives: **touch the fader**. The X-Touch's faders are
touch-sensitive and the descriptor already carries the address
(`ControlMidiAddress.touchCc`, CC101-109 on Layer A, +10 on Layer B). Touching
a fader selects its channel; that is literally "pick the channel by putting
your hand on it".

On screen, clicking the strip's name selects it.

## The new shapes

### Channel strip (was: channel card)

Keeps what a desk channel has:

- name, role select, filter select
- Rvb and Swp sends
- fader, send readout
- **Mute**
- **Select** (the name is the target; selected state is visible)

Removed: Throw, Echo, Skank, Float, Stab, Build, Emph, HOLD — eight buttons per
channel.

The strip loses its reason to be 224 px wide. It should end up near the width
of a fader plus its readout, which is what lets it sit in the controller
layout's fader zone at last.

### Op panel (was: master card)

One copy of the ops, acting on the selection:

- the eight `CHANNEL_OPS` gestures plus HOLD
- a readout of what it is acting on ("All channels" / "Ch 2, 5")
- the master send fader stays here

## What this removes

On an eight-channel song: 8 x 9 = 72 op buttons become 9. The deck's height and
width both drop, which is the same budget problem that has been fought all
session from the other end.

## Hardware mapping after the change

| Device control | Acts on |
|---|---|
| Fader 1-8 | that channel's dub send |
| Fader touch 1-8 | **selects** that channel |
| Select row 1-8 | that channel's mute (unchanged) |
| Button rows 1-3 | global moves (unchanged) |
| Encoder push | echo rate presets (unchanged) |

The per-channel op targets (`dub.echoThrow.ch3` and friends) stay valid in the
parameter router — they are how automation and AutoDub fire, and nothing about
those paths changes. Only the SCREEN stops drawing one button per channel per
op.

## Risks

- **A user who wants an op on one channel now needs two actions** (select, then
  fire) where they had one. Mitigated by multi-select persisting: you select
  the channels you are working with and then play. This is how a desk works and
  is the point of the change.
- **AutoDub firing on a channel must still light the right thing.** Today
  `activeFires` keys `${moveId}:${channelId}` light that channel's button.
  With one shared button, the op panel lights and the STRIP of the channel
  being acted on should light too, or the performer loses sight of what the
  machine is doing. This must not be dropped.
- **Selection is new state.** It belongs in the dub store beside `heldChannels`,
  not in component state, or it resets on any remount.

## Test plan

Automated:

1. `selection.test.ts` — pure: zero selected resolves to every visible channel;
   one or more resolves to exactly those; a channel removed from the pattern
   drops out of the selection.
2. Op panel fires across the resolved selection — the regression test names the
   symptom: "fires on every channel when nothing is selected".
3. Fader touch selects — router test that the touch CC reaches selection and
   the move CC does not.
4. The contract test that counts buttons: a channel strip carries no op
   buttons. This is the one that fails before and passes after.

Manual (only the user can confirm):

- The deck at `http://localhost:5174`, PERFORM tab, both layouts.
- Select two channels, hold Echo, hear both.
- Select none, hold Echo, hear all — unchanged from today.
- Touch a fader on the X-Touch, see that channel select.

## Open

Nothing. Both design questions are decided above.
