---
date: 2026-09-29
topic: Master FX frequency-response audit - every effect, end to end
tags: [master-fx, effects, dsp, audit]
status: draft
---

# Master FX response audit (2026-09-29)

Tool: `tools/master-fx-response-audit.ts` (resumable; results in
`tools/master-fx-response-audit.json`). Each Master FX browser effect at its
defaults, wet 100 %, a -18 dBFS sine at 60 / 250 / 1k / 4k / 10k Hz through the
running app, gain vs no FX. 188 effects measured, 70 flagged (silent, boost
> 6 dB, or tilt > 6 dB).

Owner ask: "double check all master fx that no others have the same or
similar issues" - after the Modern presets sounded thin (multiband crossover
notches, an Exciter adding its driven band, a self-keyed sidechain).

## Already fixed this session (measured before the fix - re-measure)
Tape Saturation (e2a2e11ec), Tape Degradation (4b294cf98), Cabinet Simulator
(123fa0646), Exciter (fab71974a), multiband crossovers (47a60a337), ceiling
devices (469fd3657).

## Invalid measurements
- Every neural (GuitarML) amp: MCP set_master_effects dropped neuralModelIndex,
  so they ran with no model (fixed 93935b4dd). Re-measure.

## Silent (15) - owner priority
Graue SoftSat, CyanPhase Notch, FSM Philta, Jeskola Delay / CrossDelay /
Freeverb, FSM PanzerDelay, FSM Chorus / Chorus2, WhiteNoise WhiteChorus,
Bigyo FrequencyShifter, Geonik Compressor, Ld SLimit, Oomek Exciter,
DedaCode StereoGain. Buzz machines; memory note: WASMs never built.

## Level defects at defaults (likely real)
Dragonfly Hall +8..17, Plate +3..19, Room -4..+20; Q Zfilter +13..18 flat;
Driva +6..10; Overdrive +3..8; Satma +6..7; Swedish Chainsaw +7..11;
Tape Delay +6..7 flat; Shimmer Reverb -16..-23 flat; Auto Gain Control +7..8
(by design? it rides to a -12 target; the tone was -18).
Systemic: effectGainCompensation.ts was calibrated with a 440 Hz sine at
wet 50 %, so the dry half masked half of every error.

## Probably by design - owner's call
Moog Filter (default low cutoff: -81 dB at 10 kHz), Auto Wah, Auto Filter,
Filter, Sidechain Gate (closes above 1 kHz at defaults), Phono Filter (RIAA).

## Inherent
Haas Stereo Enhancer -93 dB at 250 Hz: the meter sums to mono and a Haas
delay combs in mono. Matters for near-mono gig playback.

## Needs a broadband pass (steady sines comb through delays/modulation)
Reverb, JC Reverb, Ping Pong / Space Echo / Spacey / RE Tape / RE-201 /
Another / Ambient / Artistic / Reverse / Slapback / Tape Delay, Bi-Phase,
Calf / Stone Phaser, Juno-60 / Multi Chorus, MVerb, Mad Professor, Dattorro,
Spring, Early Reflections.

## WAM (third-party): compensation only
Graphic EQ +6 flat, QuadraFuzz +4..10, Vox Amp 30 +2..16, Disto Machine,
Faust Delay +6..7, Big Muff, TS-9, Stone Phaser, Pitch Shifter -16 at 60 Hz.
