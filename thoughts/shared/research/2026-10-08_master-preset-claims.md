---
date: 2026-10-08
topic: master FX presets - what each description promises, as numbers
tags: [fx, presets, calibration, FX5]
status: final
---

# Master FX preset claims

Every claim in a preset description (src/constants/fxPresets.ts) is a metric with a bound. The table is the test (src/constants/__tests__/masterPresetClaims.test.ts) and was written before the presets were retuned; presets whose chain missed a bound were retuned (reusing the chain's own effects) until it measured. "Offline" is the real effect nodes rendered by src/test/audio/masterChainRig.ts (WASM effects through their real worklets); "live" is measure_master_effect on a playing MOD in Chrome (tools/master-fx-claims-live.ts).

Metrics: tilt = gain of a third-octave noise band minus the 1 kHz band (a Web Audio compressor adds automatic make-up, so absolute gains move with its threshold); thd = harmonics 2-6 of a -12 dBFS sine under the fundamental; gr = a -40 dBFS to -10 dBFS step minus the output rise; crest/bvr on a drum loop; tail/echo/shimmer on noise bursts; am/fm swing of a 1 kHz sine; width on half-correlated stereo noise; noise from silence; ceil = hot drum loop peak.

## Amiga

### Amiga Bass Cannon

> Thunderous 8-bit bass — sub enhancement, saturation, heavy compression

| Claim | Metric | Target | Offline |
|---|---|---|---|
| sub enhancement: 40 Hz over 1 kHz | tilt 40 Hz vs 1000 Hz | >= 6 | 6.6 |
| sub enhancement: 60 Hz over 1 kHz | tilt 60 Hz vs 1000 Hz | >= 6 | 9.2 |
| saturation: harmonics of a 60 Hz sine | harmonics of a 60 Hz sine | >= -25 | -22.5 |
| heavy compression: gain reduction at -10 dBFS | gain reduction, 1000 Hz sine to -10 dBFS | >= 6 | 6 |
| thunderous: bass over the rest | bvr | >= 4 | 4.2 |
| heavy compression keeps the kicks (crest) | crest | >= -3.2 | -2.8 |

### Amiga Multiband

> Multiband control — tighten lows, scoop mids, open highs

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tighten lows: the low band compressed (100 Hz sine) | gain reduction, 100 Hz sine to -10 dBFS | >= 3 | 5.2 |
| scoop mids: 1 kHz under 100 Hz | tilt 1000 Hz vs 100 Hz | <= -3 | -5 |
| scoop mids: 1 kHz under 8 kHz | tilt 1000 Hz vs 8000 Hz | <= -3 | -6.2 |
| open highs: 8 kHz over 1 kHz | tilt 8000 Hz vs 1000 Hz | >= 3 | 6.2 |

### Amiga Tape Warmth

> Vintage club warmth — tape sim, gentle compression, soft rolloff

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape sim: harmonics of a 60 Hz sine | harmonics of a 60 Hz sine | >= -45 | -38.4 |
| warmth: 250 Hz over 1 kHz | tilt 250 Hz vs 1000 Hz | >= 1 | 1.7 |
| gentle compression: gain reduction at -10 dBFS | gain reduction, 1000 Hz sine to -10 dBFS | >= 1 and <= 3.5 | 1.1 |
| soft rolloff: 10 kHz under 1 kHz (not more than 9 dB) | tilt 10000 Hz vs 1000 Hz | >= -9 and <= -3 | -7.4 |

### Chipgold

> Fat bass + harmonic sparkle — clean chip enhancement with sub weight

| Claim | Metric | Target | Offline |
|---|---|---|---|
| fat bass: 100 Hz over 1 kHz | tilt 100 Hz vs 1000 Hz | >= 3 | 5.5 |
| sub weight: 50 Hz-ish (60 Hz) over 1 kHz | tilt 60 Hz vs 1000 Hz | >= 2.5 | 4.9 |
| harmonic sparkle: harmonics of a 5 kHz sine | harmonics of a 5000 Hz sine | >= -35 | -30 |
| clean: a 1 kHz sine stays clean | harmonics of a 1000 Hz sine | <= -50 | -81.3 |
| clean: only gentle compression | gain reduction, 1000 Hz sine to -10 dBFS | <= 3 | 0.5 |

### Exotic Shimmer

> Fat bottom + ethereal ascending reverb — TFMX/FC/Hippel ambient

| Claim | Metric | Target | Offline |
|---|---|---|---|
| fat bottom: 100 Hz over 1 kHz | tilt 100 Hz vs 1000 Hz | >= 3 | 3.8 |
| fat bottom: 60 Hz over 1 kHz | tilt 60 Hz vs 1000 Hz | >= 1.5 | 1.7 |
| ethereal reverb: tail of at least 1 s | tail | >= 1000 | 1180 |
| ascending reverb: the octave above the source rings louder than the source | shimmer | >= 0 | 11.2 |

### Paula Dub Sirens

> Amiga dub — space echo, spring tank, heavy subs

| Claim | Metric | Target | Offline |
|---|---|---|---|
| space echo: a repeat within 15 dB of the burst | echo | >= -15 | -8.6 |
| spring tank: tail of at least 1.5 s | tail | >= 1500 | 3750 |
| heavy subs: 40 Hz over 1 kHz | tilt 40 Hz vs 1000 Hz | >= 6 | 12.8 |
| heavy subs: 60 Hz over 1 kHz | tilt 60 Hz vs 1000 Hz | >= 6 | 11.5 |
| heavy subs: bass over the rest | bvr | >= 4 | 7.7 |

### Paula Punchline

> Ultimate Amiga club preset — bass lift, tape warmth, punchy glue

| Claim | Metric | Target | Offline |
|---|---|---|---|
| bass lift | bvr | >= 3 | 3.3 |
| tape warmth: harmonics of a 60 Hz sine | harmonics of a 60 Hz sine | >= -40 | -31 |
| punchy glue: gain reduction at -10 dBFS | gain reduction, 1000 Hz sine to -10 dBFS | >= 1.5 and <= 5 | 3.1 |
| punchy: kicks not swallowed (crest) | crest | >= -1.5 | -1.1 |

### Paula's Revenge

> Maximum energy — exciter, bass boost, hard limiting, tape grit

| Claim | Metric | Target | Offline |
|---|---|---|---|
| exciter: harmonics of a 5 kHz sine | harmonics of a 5000 Hz sine | >= -35 | -32 |
| bass boost | bvr | >= 3 | 3 |
| hard limiting: gain reduction at -3 dBFS | gain reduction, 1000 Hz sine to -3 dBFS | >= 6 | 8.7 |
| hard limiting: crest factor falls | crest | <= -3 | -6.1 |
| tape grit: harmonics of a 1 kHz sine | harmonics of a 1000 Hz sine | >= -38 | -36.7 |

### Tracker Dance Floor

> ProTracker rave — aggressive compression, bass, hihat sizzle

| Claim | Metric | Target | Offline |
|---|---|---|---|
| aggressive compression: gain reduction at -10 dBFS | gain reduction, 1000 Hz sine to -10 dBFS | >= 6 | 9 |
| bass | bvr | >= 2.5 | 2.6 |
| hihat sizzle: harmonics of a 5 kHz sine | harmonics of a 5000 Hz sine | >= -35 | -31.3 |
| aggressive but the kick stays (crest) | crest | >= -1.5 | -1.1 |

### Paula Sings

> 8-bit made gorgeous — fat low end, air restoration, tape warmth, space

| Claim | Metric | Target | Offline |
|---|---|---|---|
| fat low end: 100 Hz over 1 kHz | tilt 100 Hz vs 1000 Hz | >= 2 | 3.8 |
| air restoration: 10 kHz over 1 kHz | tilt 10000 Hz vs 1000 Hz | >= 1 | 2.1 |
| tape warmth: harmonics of a 1 kHz sine | harmonics of a 1000 Hz sine | >= -45 | -39.9 |
| space: a reverb tail of at least 400 ms | tail | >= 400 | 510 |

### Retro Arcade

> Bass-heavy punchy chip — transient snap, mid-presence, energetic

| Claim | Metric | Target | Offline |
|---|---|---|---|
| bass-heavy: 60 Hz over 1 kHz | tilt 60 Hz vs 1000 Hz | >= 2.5 | 5.7 |
| bass-heavy: 100 Hz over 1 kHz | tilt 100 Hz vs 1000 Hz | >= 2.5 | 9.9 |
| transient snap: crest factor rises | crest | >= 2 | 10.1 |
| mid-presence: 4 kHz over 1 kHz | tilt 4000 Hz vs 1000 Hz | >= 1 | 1.4 |

## Clean, Warm, Loud

### Clean Master

> Gentle glue compression + tonal balance — transparent finishing

| Claim | Metric | Target | Offline |
|---|---|---|---|
| gentle glue compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 0.3 and <= 4 | 0.6 |
| tonal balance: a lift at 250 Hz | tilt 250 Hz vs 1000 Hz | >= 0.3 | 0.5 |
| transparent: a 1 kHz sine stays clean | harmonics of a 1000 Hz sine | <= -60 | -94.9 |

### Transparent

> Barely-there bus compression — preserves full dynamics

| Claim | Metric | Target | Offline |
|---|---|---|---|
| barely-there bus compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 0.3 and <= 1.5 | 0.7 |
| preserves full dynamics (crest) | crest | >= -0.5 | -0.1 |

### Balanced

> EQ sculpting + light compression + widening

| Claim | Metric | Target | Offline |
|---|---|---|---|
| EQ sculpting: 250 Hz over 1 kHz | tilt 250 Hz vs 1000 Hz | >= 1 | 1.2 |
| light compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 0.2 and <= 2 | 0.3 |
| widening | width | >= 1 | 1.7 |

### Analog Warmth

> Tape saturation + compression — warm analog mix bus

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape saturation: harmonics of a 1 kHz sine | harmonics of a 1000 Hz sine | >= -40 | -31.4 |
| compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 0.5 and <= 4 | 1.3 |
| warm: 250 Hz over 1 kHz | tilt 250 Hz vs 1000 Hz | >= 0.5 | 1.2 |

### Tape Machine

> Tape simulator for subtle wow, saturation, head-bump warmth

| Claim | Metric | Target | Offline |
|---|---|---|---|
| saturation: harmonics of a 1 kHz sine | harmonics of a 1000 Hz sine | >= -45 | -40.9 |
| head-bump warmth: 100 Hz over 1 kHz | tilt 100 Hz vs 1000 Hz | >= 1 | 1.6 |
| subtle wow: the pitch moves | fm | >= 0.5 | 2.1 |

### Tube Console

> Chebyshev harmonics + EQ — tube mixing desk vibe

| Claim | Metric | Target | Offline |
|---|---|---|---|
| Chebyshev harmonics: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -40 | -27.5 |
| EQ: 250 Hz over 1 kHz | tilt 250 Hz vs 1000 Hz | >= 1 | 1.3 |

### Warm Bass

> Tape saturation + gentle compression for bass

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape saturation: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -40 | -22.3 |
| gentle compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 0.5 and <= 4 | 3.4 |

### Warm Overdrive

> Tape saturation + filter — warm crunch without harshness

| Claim | Metric | Target | Offline |
|---|---|---|---|
| warm crunch: harmonics of a 1 kHz sine | harmonics of a 1000 Hz sine | >= -30 | -20 |
| filter: 14 kHz under 1 kHz | tilt 14000 Hz vs 1000 Hz | <= -6 | -17.5 |
| without harshness: 4 kHz not above 1 kHz | tilt 4000 Hz vs 1000 Hz | <= 2 | 0.8 |

### Rotary Warmth

> Leslie + tape saturation — organic analog warmth

| Claim | Metric | Target | Offline |
|---|---|---|---|
| Leslie: the level swings | am | >= 1 | 4 |
| tape saturation: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -45 | -34.9 |

### Club Ready

> Punchy compression with sub boost — dancefloor-ready

| Claim | Metric | Target | Offline |
|---|---|---|---|
| punchy compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 2 | 6.6 |
| sub boost: 40 Hz over 1 kHz | tilt 40 Hz vs 1000 Hz | >= 3 | 3.8 |
| sub boost: 60 Hz over 1 kHz | tilt 60 Hz vs 1000 Hz | >= 3 | 5.5 |

### Brick Wall

> Hard limiting for maximum loudness

| Claim | Metric | Target | Offline |
|---|---|---|---|
| hard limiting: gain reduction at -10 dBFS | gain reduction, 1000 Hz sine to -10 dBFS | >= 8 | 13.4 |
| hard limiting: a hot signal stays under the ceiling | ceil | <= 0 | -2.8 |

### Pumping

> Aggressive sidechain-style compression — obvious pump for EDM

| Claim | Metric | Target | Offline |
|---|---|---|---|
| aggressive compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 5 | 11.3 |
| obvious pump: the crest falls | crest | <= -1.5 | -4.4 |

### Swedish Chainsaw

> HM-2 into a JCM800 with everything on max - the Gothenburg tone

| Claim | Metric | Target | Offline |
|---|---|---|---|
| HM-2 everything on max: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -10 | -4.3 |
| the Gothenburg tone: 8 kHz well under 1 kHz | tilt 8000 Hz vs 1000 Hz | <= -8 | -11.5 |
| JCM800 wall: compressed | gain reduction, 1000 Hz sine to -10 dBFS | >= 10 | 30 |

### Chip Metal

> Makes chip songs metal: HM-2 everything-max wall on every channel but the drums, tight lows, scooped mids, kick punching through

| Claim | Metric | Target | Offline |
|---|---|---|---|
| HM-2 wall: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -15 | -7.8 |
| scooped mids: 1 kHz under 100 Hz | tilt 1000 Hz vs 100 Hz | <= -3 | -3.3 |
| scooped mids: 1 kHz under 4 kHz | tilt 1000 Hz vs 4000 Hz | <= -2 | -2.3 |
| tight lows: 40 Hz under 100 Hz | tilt 40 Hz vs 100 Hz | <= -3 | -4.9 |
| kick punching through: crest rises | crest | >= 1.5 | 2.4 |

## Modern

### Modern Precision

> Surgical EQ, resonance control, drum-keyed ducking, multiband glue, mono lows, true-peak ceiling — clean modern master

| Claim | Metric | Target | Offline |
|---|---|---|---|
| multiband glue | gain reduction, 1000 Hz sine to -10 dBFS | >= 2 and <= 6 | 3.6 |
| true-peak ceiling | ceil | <= -0.1 | -5.7 |
| clean: a 1 kHz sine | harmonics of a 1000 Hz sine | <= -35 | -44.7 |

### Modern Club Pump

> Kick-keyed pump, weighty sub, dense multiband, soft clip into the ceiling — loud modern club master

| Claim | Metric | Target | Offline |
|---|---|---|---|
| dense multiband | gain reduction, 1000 Hz sine to -10 dBFS | >= 5 | 5.9 |
| weighty sub: 40 Hz over 1 kHz | tilt 40 Hz vs 1000 Hz | >= 2 | 2.1 |
| soft clip into the ceiling | ceil | <= -0.1 | -7.7 |

### Modern Glue & Air

> Gentle multiband glue, light drum-keyed breathing, silky top, mono lows — open, polished master

| Claim | Metric | Target | Offline |
|---|---|---|---|
| gentle multiband glue | gain reduction, 1000 Hz sine to -10 dBFS | >= 1.5 and <= 4 | 2.5 |
| silky top: 10 kHz over 1 kHz | tilt 10000 Hz vs 1000 Hz | >= 1.5 | 1.9 |

### Modern Amiga Master

> For Paula output: fuller lows, 8-bit harshness and aliasing tamed, hard-panned mids pulled toward mono, drum-keyed ducking

| Claim | Metric | Target | Offline |
|---|---|---|---|
| fuller lows: 60 Hz over 1 kHz | tilt 60 Hz vs 1000 Hz | >= 1.5 | 1.7 |
| 8-bit harshness tamed: 8 kHz under 1 kHz | tilt 8000 Hz vs 1000 Hz | <= -1 | -4.5 |
| ceiling | ceil | <= -0.1 | -7.2 |

## Wide, Space, Ambient

### Stereo Wide

> Subtle stereo widening + glue compression

| Claim | Metric | Target | Offline |
|---|---|---|---|
| subtle stereo widening | width | >= 1 | 7.4 |
| glue compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 0.3 | 0.9 |

### Room Glue

> Short plate reverb to glue the mix in a shared space

| Claim | Metric | Target | Offline |
|---|---|---|---|
| short plate: a tail of 200 - 700 ms | tail | >= 200 and <= 700 | 460 |
| a plate that is audible: still ringing 200 ms on | tailLevel | >= -35 | -31.7 |

### Immersive

> Plate reverb + widener + chorus — large immersive soundstage

| Claim | Metric | Target | Offline |
|---|---|---|---|
| plate reverb | tail | >= 500 | 600 |
| widener: large soundstage | width | >= 2 | 3.9 |
| chorus: the level moves | am | >= 1 | 3 |

### Leslie Cabinet

> Rotary speaker — classic organ cabinet swirl

| Claim | Metric | Target | Offline |
|---|---|---|---|
| rotary swirl: the level swings | am | >= 3 | 16.8 |

### Hall Reverb

> Large hall convolution reverb — lush ambient tail

| Claim | Metric | Target | Offline |
|---|---|---|---|
| large hall: a tail of at least 1.2 s | tail | >= 1200 | 1290 |
| lush: still loud 200 ms on | tailLevel | >= -20 | -15.7 |

### Small Room

> Tight early reflections — drums, percussion

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tight early reflections: 150 - 600 ms | tail | >= 150 and <= 600 | 380 |

### Plate Shimmer

> Lush plate reverb — pads and vocals

| Claim | Metric | Target | Offline |
|---|---|---|---|
| lush plate: a tail of at least 800 ms | tail | >= 800 | 1830 |
| lush: wider than the source | width | >= 1 | 1.8 |

### Cathedral

> Massive reverb — epic, cavernous sound

| Claim | Metric | Target | Offline |
|---|---|---|---|
| massive, cavernous: a tail of at least 2.5 s | tail | >= 2500 | 3390 |

### Shimmer Wash

> Ethereal ascending reverb — *wave, ambient

| Claim | Metric | Target | Offline |
|---|---|---|---|
| ethereal reverb: at least 1 s | tail | >= 1000 | 1100 |
| ascending: the octave above rings louder than the source | shimmer | >= 0 | 17.4 |

### Dark Plate

> Dense, dark plate reverb — darkwave

| Claim | Metric | Target | Offline |
|---|---|---|---|
| dense plate: a tail of at least 1.2 s | tail | >= 1200 | 1970 |
| dark: 8 kHz under 1 kHz | tilt 8000 Hz vs 1000 Hz | <= -3 | -3.7 |

### Tight Room

> Short natural room — drums, percussion

| Claim | Metric | Target | Offline |
|---|---|---|---|
| short natural room: 150 - 700 ms | tail | >= 150 and <= 700 | 490 |

### Spacey Delay

> SpaceyDelayer multi-tap shimmer — celestial trails

| Claim | Metric | Target | Offline |
|---|---|---|---|
| multi-tap: a repeat within 10 dB of the blip | echo | >= -10 | -7.8 |
| celestial trails: at least 3 s | tail | >= 3000 | 4540 |

### Ping Pong Hall

> Stereo bouncing delay + reverb — big stereo

| Claim | Metric | Target | Offline |
|---|---|---|---|
| bouncing delay: a repeat within 12 dB | echo | >= -12 | -8.1 |
| hall: at least 1.5 s | tail | >= 1500 | 1940 |
| big stereo | width | >= 2 | 3.8 |

### Ambient

> Spacious plate + gentle compression — ethereal

| Claim | Metric | Target | Offline |
|---|---|---|---|
| spacious plate: at least 800 ms | tail | >= 800 | 1070 |
| gentle compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 0.4 and <= 4 | 0.6 |
| spacious: wider than the source | width | >= 2 | 3.7 |

### Ambient Space

> Long reverb + ping-pong — infinite soundscape

| Claim | Metric | Target | Offline |
|---|---|---|---|
| long reverb: at least 2.5 s | tail | >= 2500 | 2940 |
| ping-pong: a repeat within 10 dB | echo | >= -10 | -7.8 |

### Dreamy Haze

> Chorus + reverb + LP filter — soft and floaty

| Claim | Metric | Target | Offline |
|---|---|---|---|
| reverb: at least 1.2 s | tail | >= 1200 | 1830 |
| soft: 8 kHz under 1 kHz | tilt 8000 Hz vs 1000 Hz | <= -6 | -9 |

### Underwater

> Deep LP filter + chorus + reverb — submerged

| Claim | Metric | Target | Offline |
|---|---|---|---|
| deep LP filter: 4 kHz under 1 kHz | tilt 4000 Hz vs 1000 Hz | <= -12 | -22.9 |
| reverb: at least 1 s | tail | >= 1000 | 1350 |

### Frozen

> Plate + pitch shift + delay — glacial, crystalline

| Claim | Metric | Target | Offline |
|---|---|---|---|
| glacial: a tail of at least 2.5 s | tail | >= 2500 | 3220 |
| delay: a repeat within 15 dB | echo | >= -15 | -10.7 |
| crystalline: upper octave present (within 12 dB of the source) | shimmer | >= -12 | -11.3 |

### *Wave Landscape

> Shimmer + ambient delay — complete *wave bus

| Claim | Metric | Target | Offline |
|---|---|---|---|
| shimmer: upper octave within 6 dB of the source | shimmer | >= -6 | -3.4 |
| ambient delay: a repeat within 15 dB | echo | >= -15 | -4.2 |
| a tail of at least 1.5 s | tail | >= 1500 | 2140 |

### Cosmic

> Frequency shifter + delay + reverb — alien

| Claim | Metric | Target | Offline |
|---|---|---|---|
| delay: a repeat within 10 dB | echo | >= -10 | -6.2 |
| reverb: at least 1.5 s | tail | >= 1500 | 2240 |

### Haunted

> Pitch shift down + spring + distortion — horror

| Claim | Metric | Target | Offline |
|---|---|---|---|
| spring: at least 400 ms | tail | >= 400 | 690 |
| distortion: a 5 kHz sine | harmonics of a 5000 Hz sine | >= -45 | -39.9 |

## Lo-Fi, Vinyl, Texture

### Vinyl Press

> ToneArm vinyl simulation — RIAA EQ, rolloff, crackle

| Claim | Metric | Target | Offline |
|---|---|---|---|
| crackle: the chain makes noise from silence | noise | >= -75 | -51.3 |
| RIAA EQ and rolloff: 10 kHz under 1 kHz | tilt 10000 Hz vs 1000 Hz | <= -0.7 | -1 |

### Dusty Grooves

> Vinyl noise + tape warmth — crate-digger character

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape warmth: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -45 | -35.9 |

### Lo-Fi Master

> Tape sim + vinyl + rolloff — nostalgic warmth

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape sim: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -45 | -43.2 |
| rolloff: 8 kHz under 1 kHz | tilt 8000 Hz vs 1000 Hz | <= -3 | -3.3 |
| vinyl: noise from silence | noise | >= -75 | -65.4 |

### Cassette Dub

> Tape sim + delay — dubbed-to-tape degradation

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape sim: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -45 | -37.7 |
| delay: a repeat within 25 dB | echo | >= -25 | -12.8 |
| degradation: 8 kHz under 1 kHz | tilt 8000 Hz vs 1000 Hz | <= -3 | -5.2 |

### Lo-Fi Tape

> Worn cassette degradation on the bus

| Claim | Metric | Target | Offline |
|---|---|---|---|
| worn cassette: 8 kHz under 1 kHz | tilt 8000 Hz vs 1000 Hz | <= -3 | -5 |
| wow and flutter: the pitch moves | fm | >= 5 | 156.1 |

### Turntable

> ToneArm vinyl playback — wow, flutter, cartridge

| Claim | Metric | Target | Offline |
|---|---|---|---|
| wow and flutter: the pitch moves | fm | >= 5 | 41.3 |
| cartridge: noise from silence | noise | >= -70 | -55.8 |

### Tape Delay Machine

> Full tape delay with saturation, wow, flutter

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape delay: a repeat within 20 dB | echo | >= -20 | -16.3 |
| wow and flutter: the pitch moves | fm | >= 1 | 6.8 |

### Parallel Crush

> Heavy parallel compression — drums, full mix

| Claim | Metric | Target | Offline |
|---|---|---|---|
| heavy compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 5 | 5.9 |
| heavy: the crest falls | crest | <= -2 | -3.4 |

### Glue Bus

> Gentle bus compression — cohesion

| Claim | Metric | Target | Offline |
|---|---|---|---|
| gentle bus compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 0.4 and <= 4 | 0.7 |

### Industrial

> Harsh distortion + hard compression

| Claim | Metric | Target | Offline |
|---|---|---|---|
| harsh distortion: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -20 | -16.4 |
| hard compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 6 | 10.5 |

### Fuzz Box

> Thick fuzzy saturation — gritty warmth with bite

| Claim | Metric | Target | Offline |
|---|---|---|---|
| thick fuzzy saturation: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -25 | -20.9 |
| bite: 4 kHz over 1 kHz | tilt 4000 Hz vs 1000 Hz | >= 0.5 | 1.5 |

### Dark Pad

> Low-pass filter + tape degradation

| Claim | Metric | Target | Offline |
|---|---|---|---|
| low-pass: 8 kHz under 1 kHz | tilt 8000 Hz vs 1000 Hz | <= -12 | -19.4 |

### Crystal Castles Void

> Shimmer + tape degradation — noisy, ethereal

| Claim | Metric | Target | Offline |
|---|---|---|---|
| shimmer: a tail of at least 4 s | tail | >= 4000 | 8990 |
| ethereal: upper octave present | shimmer | >= 0 | 2 |

## Genre, DJ

### Techno

> Hard-hitting sub boost + compression + grit

| Claim | Metric | Target | Offline |
|---|---|---|---|
| hard-hitting sub boost: 40 Hz over 1 kHz | tilt 40 Hz vs 1000 Hz | >= 3 | 3.9 |
| compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 3 | 6.7 |
| grit: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -40 | -36.6 |

### House

> Warm low-end + smooth tops + glue comp

| Claim | Metric | Target | Offline |
|---|---|---|---|
| warm low-end: 100 Hz over 1 kHz | tilt 100 Hz vs 1000 Hz | >= 2 | 6 |
| smooth tops: 10 kHz under 1 kHz | tilt 10000 Hz vs 1000 Hz | <= -2 | -2.6 |
| glue compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 0.4 and <= 4 | 0.3 |

### Drum & Bass

> Tight transients + sub weight + air

| Claim | Metric | Target | Offline |
|---|---|---|---|
| sub weight: 40 Hz over 1 kHz | tilt 40 Hz vs 1000 Hz | >= 3 | 4.3 |
| air: 10 kHz over 1 kHz | tilt 10000 Hz vs 1000 Hz | >= 1.5 | 2.6 |
| tight transients: the crest holds | crest | >= -1 | -0.8 |

### Hip Hop

> Fat low-end + warm saturation + controlled dynamics

| Claim | Metric | Target | Offline |
|---|---|---|---|
| fat low-end: 100 Hz over 1 kHz | tilt 100 Hz vs 1000 Hz | >= 2 | 5.2 |
| warm saturation: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -45 | -35.1 |
| controlled dynamics | gain reduction, 1000 Hz sine to -10 dBFS | >= 1 | 1 |

### Dub / Reggae

> Heavy subs + warm mids + spring tank

| Claim | Metric | Target | Offline |
|---|---|---|---|
| heavy subs: 40 Hz over 1 kHz | tilt 40 Hz vs 1000 Hz | >= 6 | 8.9 |
| warm mids: 250 Hz over 1 kHz | tilt 250 Hz vs 1000 Hz | >= 1 | 2.5 |
| spring tank: at least 300 ms | tail | >= 300 | 300 |

### Hardstyle

> Maximum sub + hard limiting + grit

| Claim | Metric | Target | Offline |
|---|---|---|---|
| maximum sub: 40 Hz over 1 kHz | tilt 40 Hz vs 1000 Hz | >= 6 | 6 |
| hard limiting | gain reduction, 1000 Hz sine to -10 dBFS | >= 6 | 7.4 |
| grit: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -40 | -32.7 |

### Psychedelic

> Leslie + phaser + reverb — 60s psychedelia

| Claim | Metric | Target | Offline |
|---|---|---|---|
| Leslie and phaser: the level swings | am | >= 3 | 16.4 |
| reverb: at least 500 ms | tail | >= 500 | 920 |

### Synthwave

> Chorus + delay + compression — 80s retro

| Claim | Metric | Target | Offline |
|---|---|---|---|
| chorus: the level moves | am | >= 1 | 9.7 |
| delay: a repeat within 20 dB | echo | >= -20 | -10.8 |
| compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 0.5 | 0.8 |

### Shoegaze

> Chorus + saturation + massive reverb — wall of sound

| Claim | Metric | Target | Offline |
|---|---|---|---|
| saturation: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -40 | -32.3 |
| massive reverb: at least 1.5 s | tail | >= 1500 | 1860 |
| wall of sound: wide | width | >= 3 | 7.3 |

### Acid House

> Auto-filter + distortion — 303-inspired

| Claim | Metric | Target | Offline |
|---|---|---|---|
| auto-filter: the level swings | am | >= 3 | 12.2 |
| distortion: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -30 | -27.1 |

### Garage / 2-Step

> Tight compression + delay — punchy UK garage

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tight compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 3 | 7.9 |
| delay: a repeat within 20 dB | echo | >= -20 | -16.3 |
| punchy | crest | >= -3 | -2.7 |

### DJ Booth

> Club-standard bus compression + EQ + tape warmth

| Claim | Metric | Target | Offline |
|---|---|---|---|
| club-standard bus compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 1 and <= 5 | 3.5 |
| tape warmth: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -45 | -38.3 |
| EQ: a lift at 100 Hz | tilt 100 Hz vs 1000 Hz | >= 1 | 3.4 |

### Big Room

> Plate reverb + wide stereo + comp — festival main stage

| Claim | Metric | Target | Offline |
|---|---|---|---|
| plate reverb: at least 800 ms | tail | >= 800 | 1370 |
| wide stereo | width | >= 2 | 4.1 |
| compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 1 | 4.5 |

### Vinyl DJ

> ToneArm + warmth — vinyl turntable character

| Claim | Metric | Target | Offline |
|---|---|---|---|
| warmth: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -45 | -38.1 |
| vinyl character: noise from silence | noise | >= -70 | -58.4 |

### Echo Out

> BPM-synced tape echo for transitions

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape echo: a repeat within 15 dB | echo | >= -15 | -13.7 |
| a distinct repeat, not a wash | clarity | >= 4 | 72.8 |

### Warehouse Rave

> Gritty tape + hard compression — raw warehouse

| Claim | Metric | Target | Offline |
|---|---|---|---|
| gritty tape: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -40 | -38.5 |
| hard compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 5 | 9.3 |

### Dub Echo

> Ping-pong delay + reverb — classic dub bounce

| Claim | Metric | Target | Offline |
|---|---|---|---|
| ping-pong delay: a repeat within 15 dB | echo | >= -15 | -6.8 |
| reverb: at least 1.5 s | tail | >= 1500 | 2390 |

### Filter Sweep

> Auto-filter LFO — DJ build/breakdown tool

| Claim | Metric | Target | Offline |
|---|---|---|---|
| auto-filter LFO: the level swings | am | >= 3 | 19.4 |

### Phaser Wash

> Deep phaser sweep — psychedelic movement

| Claim | Metric | Target | Offline |
|---|---|---|---|
| deep phaser sweep: the level swings | am | >= 3 | 34.6 |

### Auto-Pan

> LFO panning — adds motion to static mixes

| Claim | Metric | Target | Offline |
|---|---|---|---|
| LFO panning: the image moves | pan | >= 3 | 14.5 |

### Vibrato Wobble

> Pitch wobble — tape warble / underwater

| Claim | Metric | Target | Offline |
|---|---|---|---|
| pitch wobble | fm | >= 5 | 415.9 |

### Frequency Shift

> Subtle frequency shifting — metallic detuning

| Claim | Metric | Target | Offline |
|---|---|---|---|
| frequency shift: the shifted partial beats against the source | am | >= 3 | 10 |

### Feedback Loop

> Self-oscillating delay — chaotic dub siren

| Claim | Metric | Target | Offline |
|---|---|---|---|
| self-oscillating delay: at least 2.5 s | tail | >= 2500 | 2890 |
| a repeat within 12 dB | echo | >= -12 | -6.7 |

## Dub, Delay

### Spring Tank

> Classic dub spring reverb — metallic drip

| Claim | Metric | Target | Offline |
|---|---|---|---|
| classic spring reverb: at least 400 ms | tail | >= 400 | 460 |

### Dub Siren Echo

> Space Echo + spring — classic dub siren

| Claim | Metric | Target | Offline |
|---|---|---|---|
| Space Echo: a repeat within 10 dB | echo | >= -10 | -4.8 |
| spring: at least 3 s | tail | >= 3000 | 8800 |

### King Tubby Filter

> Resonant dub filter + echo — dramatic sweeps

| Claim | Metric | Target | Offline |
|---|---|---|---|
| echo: a repeat within 15 dB | echo | >= -15 | -11.8 |
| dramatic sweeps: the level swings | am | >= 2 | 2.8 |

### Phaser Dub

> Bi-Phase swirl + tape echo — spacey modulation

| Claim | Metric | Target | Offline |
|---|---|---|---|
| Bi-Phase swirl: the level swings | am | >= 3 | 15.9 |
| tape echo: a repeat within 15 dB | echo | >= -15 | -8.7 |

### Tape Echo Wash

> RE Tape Echo with wow/flutter — degraded repeats

| Claim | Metric | Target | Offline |
|---|---|---|---|
| degraded repeats: within 20 dB | echo | >= -20 | -17.8 |

### Dub Chamber

> Spring reverb + tape echo — classic dub send

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape echo: a repeat within 15 dB | echo | >= -15 | -4.3 |
| spring reverb: at least 2 s | tail | >= 2000 | 2580 |

### Aelapse Dub

> Tape delay + spring reverb combo — the Aelapse dub machine

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape delay: a repeat within 25 dB | echo | >= -25 | -20.7 |
| spring: at least 2 s | tail | >= 2000 | 2410 |

### Mad Professor Studio

> Classic PCM-70 dub plate — long dark tail, bass stays dry

| Claim | Metric | Target | Offline |
|---|---|---|---|
| long dark tail: at least 1.5 s | tail | >= 1500 | 1670 |
| dark: 8 kHz under 1 kHz | tilt 8000 Hz vs 1000 Hz | <= -3 | -4.7 |
| bass stays dry: 100 Hz under 1 kHz | tilt 100 Hz vs 1000 Hz | <= -3 | -5 |

### Mad Professor Cathedral

> Gigantic dub cathedral — 7-second tail, warm shimmer-free top

| Claim | Metric | Target | Offline |
|---|---|---|---|
| 7-second tail (RT60): at least 4 s down to -40 dB, about 6.5 s to -60 | tail | >= 4000 | 4350 |
| warm top: 8 kHz under 1 kHz | tilt 8000 Hz vs 1000 Hz | <= -3 | -6.9 |
| shimmer-free | shimmer | <= -10 | -24.5 |

### Mad Professor + Tape

> Dub plate fed by tape echo — full Scientist wash

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape echo: a repeat within 20 dB | echo | >= -20 | -14.7 |
| Scientist wash: at least 1.2 s | tail | >= 1200 | 1400 |

### Dattorro Tubby

> Short bright plate — tight dub stabs, King Tubby-style

| Claim | Metric | Target | Offline |
|---|---|---|---|
| short bright plate: 300 - 1200 ms | tail | >= 300 and <= 1200 | 890 |
| bright: 8 kHz not under -1.5 dB | tilt 8000 Hz vs 1000 Hz | >= -1.5 | -0.9 |

### Dattorro Infinite

> Near-infinite tail — drone / pad sustainer

| Claim | Metric | Target | Offline |
|---|---|---|---|
| near-infinite tail: at least 8 s | tail | >= 8000 | 8990 |

### Dattorro Steel

> Metallic resonant plate — Scientist 70s signature

| Claim | Metric | Target | Offline |
|---|---|---|---|
| resonant plate: at least 1.5 s | tail | >= 1500 | 1960 |

### Dattorro + King Tubby

> Dub filter screaming into metallic plate — live-dub throw

| Claim | Metric | Target | Offline |
|---|---|---|---|
| filter screaming: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -30 | -21.9 |
| metallic plate: at least 1.5 s | tail | >= 1500 | 2740 |

### Dattorro + Tape Wash

> Tape echo feeding the Dattorro tank — full dub throw

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape echo: a repeat within 15 dB | echo | >= -15 | -10.6 |
| full dub throw: at least 3 s | tail | >= 3000 | 4940 |

### Ambient Echo

> Filtered darkening delay — ambient, *wave

| Claim | Metric | Target | Offline |
|---|---|---|---|
| delay: a repeat within 10 dB | echo | >= -10 | -1.5 |
| darkening: 14 kHz under 1 kHz | tilt 14000 Hz vs 1000 Hz | <= -2 | -2.1 |

### Tape Echo

> Warm tape delay with wow/flutter — dub, lo-fi

| Claim | Metric | Target | Offline |
|---|---|---|---|
| warm tape delay: a repeat within 20 dB | echo | >= -20 | -15.2 |

### Stereo Ping Pong

> Bouncing L/R delay — wide stereo

| Claim | Metric | Target | Offline |
|---|---|---|---|
| bouncing delay: a repeat within 8 dB | echo | >= -8 | 0.5 |
| wide stereo | width | >= 1 | 6.6 |

### Space Echo

> Roland RE-201 multi-head — psychedelic, dub

| Claim | Metric | Target | Offline |
|---|---|---|---|
| multi-head echo: a repeat within 10 dB | echo | >= -10 | 0.4 |
| psychedelic: at least 3 s | tail | >= 3000 | 6440 |

### RE-201 King Tubby

> Full RE-201 model — warm tape + spring, all 3 heads

| Claim | Metric | Target | Offline |
|---|---|---|---|
| three heads: a repeat within 12 dB | echo | >= -12 | -11.4 |
| tape and spring: at least 3 s | tail | >= 3000 | 4950 |

### RE-201 Spring Only

> RE-201 spring reverb tank — no delay, pure metal splash

| Claim | Metric | Target | Offline |
|---|---|---|---|
| spring reverb tank: at least 800 ms | tail | >= 800 | 1640 |

### RE-201 Runaway

> RE-201 near-runaway feedback — Lee Perry madness

| Claim | Metric | Target | Offline |
|---|---|---|---|
| near-runaway feedback: at least 8 s | tail | >= 8000 | 8150 |
| a repeat within 12 dB | echo | >= -12 | -10.1 |

### Dub Plate Special

> Tape delay with saturation — warm wobbling echoes

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape delay: a repeat within 20 dB | echo | >= -20 | -17.1 |
| wobbling echoes: the pitch moves | fm | >= 0.3 | 3.1 |

### Midnight Dub Delay

> Dark tape delay — deep filtering, heavy reverb wash

| Claim | Metric | Target | Offline |
|---|---|---|---|
| dark: 8 kHz under 1 kHz | tilt 8000 Hz vs 1000 Hz | <= -2 | -2.2 |
| tape delay: a repeat within 20 dB | echo | >= -20 | -19.8 |
| heavy reverb wash: at least 3 s | tail | >= 3000 | 8530 |

### RE-201 + Dattorro

> RE-201 tape echo into metallic plate — massive dub wash

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape echo: a repeat within 15 dB | echo | >= -15 | -12.8 |
| massive wash: at least 2.5 s | tail | >= 2500 | 2670 |

## Instrument, Modulation

### Acid Bass

> Filter + distortion for TB-303

| Claim | Metric | Target | Offline |
|---|---|---|---|
| distortion: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -25 | -17.2 |
| filter: 4 kHz far under 1 kHz | tilt 4000 Hz vs 1000 Hz | <= -20 | -39.2 |

### Sub Bass

> Low-pass filter + compressor for clean sub

| Claim | Metric | Target | Offline |
|---|---|---|---|
| low-pass: 4 kHz far under 1 kHz | tilt 4000 Hz vs 1000 Hz | <= -20 | -33.4 |
| clean sub: a 60 Hz sine | harmonics of a 60 Hz sine | <= -40 | -69 |

### Moog Acid

> Moog ladder filter + Leslie — squelchy and swirling

| Claim | Metric | Target | Offline |
|---|---|---|---|
| Moog ladder: 4 kHz far under 1 kHz | tilt 4000 Hz vs 1000 Hz | <= -20 | -34.5 |
| squelchy: resonance drives a 1 kHz sine | harmonics of a 1000 Hz sine | >= -45 | -40.6 |
| Leslie: the level swings | am | >= 1 | 4 |

### Acid Screamer

> Moog filter + distortion — resonant acid squelch

| Claim | Metric | Target | Offline |
|---|---|---|---|
| distortion: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -25 | -23.6 |
| resonant filter: 4 kHz under 1 kHz | tilt 4000 Hz vs 1000 Hz | <= -15 | -24.8 |

### Punchy Drums

> Compression + EQ boost for attack

| Claim | Metric | Target | Offline |
|---|---|---|---|
| compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 2 | 2.5 |
| EQ boost for attack: 4 kHz over 1 kHz | tilt 4000 Hz vs 1000 Hz | >= 1.5 | 1.8 |
| attack kept (crest) | crest | >= -2.5 | -2.1 |

### Gated Snare

> 80s gated reverb snare

| Claim | Metric | Target | Offline |
|---|---|---|---|
| 80s gate: a tail of 300 - 900 ms | tail | >= 300 and <= 900 | 650 |
| gated and compressed | gain reduction, 1000 Hz sine to -10 dBFS | >= 4 | 6.2 |

### Chorus Lead

> Stereo chorus + width

| Claim | Metric | Target | Offline |
|---|---|---|---|
| chorus: the level moves | am | >= 1 | 37.4 |
| width | width | >= 5 | 12.4 |

### Phaser Lead

> Classic phaser sweep

| Claim | Metric | Target | Offline |
|---|---|---|---|
| classic phaser sweep: the level swings | am | >= 3 | 24.5 |

### Shimmer Pad

> Tape warmth + chorus for ethereal pads

| Claim | Metric | Target | Offline |
|---|---|---|---|
| tape warmth: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -40 | -30.5 |
| chorus: the level moves | am | >= 1 | 15.8 |

### Clean Vocal

> Compression + EQ for clean vocal chain

| Claim | Metric | Target | Offline |
|---|---|---|---|
| compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 0.4 and <= 4 | 0.6 |
| clean: a 1 kHz sine | harmonics of a 1000 Hz sine | <= -60 | -95 |
| EQ: low cut, 100 Hz under 1 kHz | tilt 100 Hz vs 1000 Hz | <= -1 | -1.6 |

### Thick Chorus

> Deep chorus + widener — lush thickening

| Claim | Metric | Target | Offline |
|---|---|---|---|
| deep chorus: the level moves | am | >= 3 | 31.6 |
| widener: lush thickening | width | >= 3 | 7.9 |

### Phaser Jet

> Deep bi-phase sweep — classic jet phaser

| Claim | Metric | Target | Offline |
|---|---|---|---|
| deep bi-phase sweep: the level swings | am | >= 3 | 11.2 |

### Tremolo Gate

> Fast tremolo + auto-panner — rhythmic gating

| Claim | Metric | Target | Offline |
|---|---|---|---|
| fast tremolo: rhythmic gating | am | >= 6 | 9.5 |

### Wah Sweep

> Auto-wah + phaser — funky envelope filter

| Claim | Metric | Target | Offline |
|---|---|---|---|
| auto-wah: the level swings | am | >= 3 | 5.8 |

## C64

### SID Stadium

> Epic SID — massive plate reverb, wide stereo, arena compression

| Claim | Metric | Target | Offline |
|---|---|---|---|
| massive plate reverb: at least 800 ms | tail | >= 800 | 960 |
| wide stereo | width | >= 2 | 5.6 |
| arena compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 1 | 7.5 |

### SID Bass Machine

> SID bass made to pound — sub enhancement, saturation, tight compression

| Claim | Metric | Target | Offline |
|---|---|---|---|
| sub enhancement: 40 Hz over 1 kHz | tilt 40 Hz vs 1000 Hz | >= 3 | 5.9 |
| saturation: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -35 | -27.5 |
| tight compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 3 | 6.8 |

### SID Acid Trip

> Psychedelic SID — phaser swirl, tape echo, plate reverb

| Claim | Metric | Target | Offline |
|---|---|---|---|
| phaser swirl: the level swings | am | >= 3 | 9.9 |
| tape echo: a repeat within 12 dB | echo | >= -12 | -8.6 |
| plate reverb: at least 1 s | tail | >= 1000 | 8540 |

### SID Raw Power

> Minimal SID authority — bass boost, hard compression, no frills

| Claim | Metric | Target | Offline |
|---|---|---|---|
| bass boost | bvr | >= 2 | 2.3 |
| hard compression | gain reduction, 1000 Hz sine to -10 dBFS | >= 5 | 8.7 |

### SID Neon Nights

> Synthwave SID — chorus thickening, tube warmth, delay, wide stereo

| Claim | Metric | Target | Offline |
|---|---|---|---|
| chorus thickening: the level moves | am | >= 1 | 7 |
| tube warmth: a 1 kHz sine | harmonics of a 1000 Hz sine | >= -40 | -31.1 |
| delay: a repeat within 15 dB | echo | >= -15 | -12.7 |
| wide stereo | width | >= 1 | 5.3 |

## Live only (the offline rig cannot build the chain)

### Tube Screamer Glow

> TS-9 style — warm mid-push without harshness

Why live only: WAM plugin: runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|
| warm mid-push: 1 kHz over 125 Hz | tilt 1000 Hz vs 125 Hz | >= 1 |  |
| without harshness: 4 kHz under 1 kHz | tilt 4000 Hz vs 1000 Hz | <= 0 |  |

### Big Muff Wall

> Big Muff Pi fuzz — thick wall of sustain

Why live only: WAM plugin: runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Dusty Grooves

> Vinyl noise + tape warmth — crate-digger character

Why live only: noise layer: gated by the engine playing flag, silent offline

| Claim | Metric | Target | Live |
|---|---|---|---|

### VHS Tape

> Wobbly vibrato + bit reduction + rolloff — old VHS audio

Why live only: bit crusher: Tone.Distortion assigns its WaveShaper curve twice, which node-web-audio-api refuses (the browser allows it)

| Claim | Metric | Target | Live |
|---|---|---|---|
| rolloff: 16 kHz far under 1 kHz | tilt 16000 Hz vs 1000 Hz | <= -10 |  |

### Vinyl Record

> Full vinyl simulation — crackle, dust, RIAA EQ

Why live only: noise layer: gated by the engine playing flag, silent offline

| Claim | Metric | Target | Live |
|---|---|---|---|

### Broken Sampler

> Heavy bit-crush + distortion — 8-bit destruction

Why live only: bit crusher: Tone.Distortion assigns its WaveShaper curve twice, which node-web-audio-api refuses (the browser allows it)

| Claim | Metric | Target | Live |
|---|---|---|---|
| filter: 8 kHz under 1 kHz | tilt 8000 Hz vs 1000 Hz | <= -3 |  |
| filter: 16 kHz far under 1 kHz | tilt 16000 Hz vs 1000 Hz | <= -10 |  |

### Cassette Deck

> BitCrush + vibrato + saturation — worn cassette tape

Why live only: bit crusher: Tone.Distortion assigns its WaveShaper curve twice, which node-web-audio-api refuses (the browser allows it)

| Claim | Metric | Target | Live |
|---|---|---|---|
| bit crush and saturation: the crest falls | crest | <= -2 |  |

### Lo-Fi Radio

> Bit crusher + tremolo — old radio transmission

Why live only: bit crusher: Tone.Distortion assigns its WaveShaper curve twice, which node-web-audio-api refuses (the browser allows it)

| Claim | Metric | Target | Live |
|---|---|---|---|

### Lo-Fi Drums

> BitCrusher + tape for crunchy beats

Why live only: bit crusher: Tone.Distortion assigns its WaveShaper curve twice, which node-web-audio-api refuses (the browser allows it)

| Claim | Metric | Target | Live |
|---|---|---|---|

### Stone Phaser

> WAM Stone — deep analog-modeled phase shifting

Why live only: WAM plugin: runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Vox Amp Crunch

> Vox amplifier — British crunch for mix character

Why live only: WAM plugin: runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Crystal Castles Vocal

> BitCrush + tape — destroyed vocal

Why live only: bit crusher: Tone.Distortion assigns its WaveShaper curve twice, which node-web-audio-api refuses (the browser allows it)

| Claim | Metric | Target | Live |
|---|---|---|---|

### Radiowave

> Bandpass + bit-crush + tremolo — AM radio

Why live only: bit crusher: Tone.Distortion assigns its WaveShaper curve twice, which node-web-audio-api refuses (the browser allows it)

| Claim | Metric | Target | Live |
|---|---|---|---|

### Rain Ambience

> Tumult rain noise — subtle rain texture

Why live only: noise layer: gated by the engine playing flag, silent offline

| Claim | Metric | Target | Live |
|---|---|---|---|

### Frozen Texture

> Granular freeze — capture a moment

Why live only: freeze: captures on a trigger, passes nothing until one arrives

| Claim | Metric | Target | Live |
|---|---|---|---|

### Granular Cloud

> Freeze moments into evolving textures

Why live only: freeze: captures on a trigger, passes nothing until one arrives

| Claim | Metric | Target | Live |
|---|---|---|---|

### Princeton Glow

> Fender Princeton — shimmery tube warmth

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|
| shimmery tube warmth: 1 kHz over 4 kHz is not a dark sound (4 kHz within 3 dB of 1 kHz) | tilt 4000 Hz vs 1000 Hz | >= -3 |  |
| a clean amp keeps the dynamics (crest) | crest | >= -2 |  |

### Blackstar Clean

> Blackstar HT40 clean — British tube console

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Tube Screamer Glue

> TS808 low gain — mid-hump saturation glue

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Sovtek Warmth

> Sovtek 50 + tape — thick Russian tube harmonics

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Filmosound Master

> Filmosound projector amp — unique vintage

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Clean Fender

> Princeton clean — sparkling tube shimmer

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Crunch Marshall

> Blackstar HT40 clean driven — British crunch

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### High Gain Mesa

> Splawn OD high gain — tight modern crunch

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Dumble Lead

> Dumble — smooth singing lead tones

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Sovtek Doom

> Sovtek 50 + DOD — massive Russian tube doom

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### BadCat Jazz

> BadCat 50 clean — warm round jazz tones

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### El Coyote Blues

> El Coyote crunch + spring + tremolo — desert blues

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### ENGL Metal

> ENGL E645 — tight European metal

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### TS9 + Spring

> Tube Screamer + spring — blues/rock pedalboard

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Big Muff Doom

> Big Muff V6 + massive reverb — fuzzy doom

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### RAT + Delay

> ProCo RAT + delay — aggressive post-punk

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Revv G3 Chug

> Revv G3 — modern metal chug machine

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Goat + Leslie

> Goat fuzz + Leslie rotary — psychedelic swirl

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### Aguilar Bass Grit

> Aguilar Agro + compressor — punchy bass

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### SID Shredder

> SID as guitar lead — Mesa high gain, compression, spring reverb

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|

### SID Crunch Box

> Aggressive SID — Friedman BE-OD crunch, tight compression, presence

Why live only: neural amp model: the network runs only in the browser

| Claim | Metric | Target | Live |
|---|---|---|---|
