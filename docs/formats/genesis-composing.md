# Composing Sega Genesis / Mega Drive songs with effect commands

Applies to tracker-made songs with Furnace instruments. Imported .fur and .dmf songs play through Furnace's own sequencer, where every Furnace effect works. Write effects as effTyp (the Furnace effect number, two hex digits of the code) and eff (the parameter byte, or x and y nibbles). A parameter of 0 reuses the last parameter of that effect on the channel.

## Effects that reach every chip below
- 0xy (effTyp 0): Arpeggio (base, +x, +y semitones). E0xx sets the arpeggio speed in ticks.
- 1xx (effTyp 1): Pitch slide up.
- 2xx (effTyp 2): Pitch slide down.
- 3xx (effTyp 3): Tone portamento to the note on the row.
- 4xy (effTyp 4): Vibrato (x speed, y depth).
- 5xy (effTyp 5): Vibrato plus volume slide.
- 6xy (effTyp 6): Portamento plus volume slide.
- 7xy (effTyp 7): Tremolo.
- Axy (effTyp 10): Volume slide (x up, y down).
- E1xy (effTyp 225): Note slide up (x speed, y semitones).
- E2xy (effTyp 226): Note slide down (x speed, y semitones).
- E5xx (effTyp 229): Fine pitch (80 is centre).
- 8xy (effTyp 8): Panning (x left, y right, 0 to F).
- Cxx (effTyp 12): Volume 00 to 40 (hex), scaled to the chip maximum. The volume column works too.

## Effects that steer the song only
- Fxx: Speed (01 to 1F) or BPM (20 to FF).
- Bxx: Jump to order position xx.
- Dxx: Break to row xx of the next pattern.

## YM2612 (FM, 6 channels)
Instrument synthType FurnaceOPN, platform 2.
- effTyp 16 (10xx): 10xy: Setup LFO (x: enable; y: speed)
- effTyp 17 (11xx): 11xx: Set feedback (0 to 7)
- effTyp 18 (12xx): 12xx: Set level of operator 1 (0 highest, 7F lowest)
- effTyp 19 (13xx): 13xx: Set level of operator 2 (0 highest, 7F lowest)
- effTyp 20 (14xx): 14xx: Set level of operator 3 (0 highest, 7F lowest)
- effTyp 21 (15xx): 15xx: Set level of operator 4 (0 highest, 7F lowest)
- effTyp 22 (16xx): 16xy: Set operator multiplier (x: operator from 1 to 4; y: multiplier)
- effTyp 25 (19xx): 19xx: Set attack of all operators (0 to 1F)
- effTyp 26 (1Axx): 1Axx: Set attack of operator 1 (0 to 1F)
- effTyp 27 (1Bxx): 1Bxx: Set attack of operator 2 (0 to 1F)
- effTyp 28 (1Cxx): 1Cxx: Set attack of operator 3 (0 to 1F)
- effTyp 29 (1Dxx): 1Dxx: Set attack of operator 4 (0 to 1F)
- effTyp 48 (30xx): 30xx: Toggle hard envelope reset on new notes
- effTyp 80 (50xx): 50xy: Set AM (x: operator from 1 to 4 (0 for all ops); y: AM)
- effTyp 81 (51xx): 51xy: Set sustain level (x: operator from 1 to 4 (0 for all ops); y: sustain)
- effTyp 82 (52xx): 52xy: Set release (x: operator from 1 to 4 (0 for all ops); y: release)
- effTyp 83 (53xx): 53xy: Set detune (x: operator from 1 to 4 (0 for all ops); y: detune where 3 is center)
- effTyp 84 (54xx): 54xy: Set envelope scale (x: operator from 1 to 4 (0 for all ops); y: scale from 0 to 3)
- effTyp 85 (55xx): 55xy: Set SSG envelope (x: operator from 1 to 4 (0 for all ops); y: 0-7 on, 8 off)
- effTyp 86 (56xx): 56xx: Set decay of all operators (0 to 1F)
- effTyp 87 (57xx): 57xx: Set decay of operator 1 (0 to 1F)
- effTyp 88 (58xx): 58xx: Set decay of operator 2 (0 to 1F)
- effTyp 89 (59xx): 59xx: Set decay of operator 3 (0 to 1F)
- effTyp 90 (5Axx): 5Axx: Set decay of operator 4 (0 to 1F)
- effTyp 91 (5Bxx): 5Bxx: Set decay 2 of all operators (0 to 1F)
- effTyp 92 (5Cxx): 5Cxx: Set decay 2 of operator 1 (0 to 1F)
- effTyp 93 (5Dxx): 5Dxx: Set decay 2 of operator 2 (0 to 1F)
- effTyp 94 (5Exx): 5Exx: Set decay 2 of operator 3 (0 to 1F)
- effTyp 95 (5Fxx): 5Fxx: Set decay 2 of operator 4 (0 to 1F)
- effTyp 96 (60xx): 60xx: Set operator mask (bits 0-3)
- effTyp 97 (61xx): 61xx: Set algorithm (0 to 7)
- effTyp 98 (62xx): 62xx: Set LFO FM depth (0 to 7)
- effTyp 99 (63xx): 63xx: Set LFO AM depth (0 to 3)
- effTyp 108 (6Cxx): 6Cxx: Set test register $21 (dangerous)
- effTyp 109 (6Dxx): 6Dxx: Set test register $2C (dangerous)
- effTyp 223 (DFxx): DFxx: Set sample playback direction (0: normal; 1: reverse)

## SN76489 (PSG: 3 square, 1 noise)
Instrument synthType FurnacePSG, platform 4.
- effTyp 32 (20xx): 20xy: Set noise mode (x: preset freq/ch3 freq; y: thin pulse/noise)

## Furnace effects that do NOT reach the chip from a tracker cell
Not in TICK_STEPPED_EFFECTS (src/engine/furnace-dispatch/FurnaceTickEffects.ts:102), not in the router's standard switch (src/engine/furnace-dispatch/FurnaceEffectRouter.ts:107-188); routePlatformEffect drops them (FurnaceEffectRouter.ts:216-217) unless the chip table has the code.
- 09xx (Groove / speed 1, effTyp 9): dropped.
- E3xx (Vibrato shape, effTyp 227): dropped.
- E4xx (Vibrato range, effTyp 228): dropped.
- E8xy (Delayed legato up, effTyp 232): dropped.
- E9xy (Delayed legato down, effTyp 233): dropped.
- EAxx (Legato, effTyp 234): dropped.
- EBxx (Sample bank, effTyp 235): dropped.
- ECxx (Note cut, effTyp 236): dropped.
- EDxx (Note delay, effTyp 237): dropped.
- EExx (External command, effTyp 238): dropped.
- EFxx (Global pitch, effTyp 239): dropped.
- F0xx (Set BPM, effTyp 240): dropped.
- F1xx (Single tick pitch up, effTyp 241): dropped.
- F2xx (Single tick pitch down, effTyp 242): dropped.
- F3xx (Fine volume slide up, effTyp 243): dropped.
- F4xx (Fine volume slide down, effTyp 244): dropped.
- F8xx (Single tick volume up, effTyp 248): dropped.
- F9xx (Single tick volume down, effTyp 249): dropped.
- FAxx (Fast volume slide, effTyp 250): dropped.
- FCxx (Note release, effTyp 252): dropped.
- FFxx (Stop song, effTyp 255): dropped.

## What to do instead
- Note cut: put a note-off on the row, or Cxx with 00.
- Note delay: place the note one row later at a higher speed.
- Fine slides: use 1xx, 2xx or Axy with small parameters.
