# Composing Game Boy songs with effect commands

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

## Game Boy APU (2 pulse, 1 wavetable, 1 noise)
Instrument synthType FurnaceGB, platform 6.
- effTyp 16 (10xx): 10xx: Set waveform
- effTyp 17 (11xx): 11xx: Set noise length (0: long; 1: short)
- effTyp 18 (12xx): 12xx: Set duty cycle (0 to 3)
- effTyp 19 (13xx): 13xy: Setup sweep (x: time; y: shift)
- effTyp 20 (14xx): 14xx: Set sweep direction (0: up; 1: down)

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
