# Composing Neo Geo (YM2610) songs with effect commands

Measured on the live playback path of a song made in the tracker (not an imported .fur file).

## Effects that reach the chip

Every other effect code goes to the chip through the Furnace effect router, on the row it is written on, with or without a note. The cell volume column on a row without a note sets the channel volume. The router drops a code a given chip does not use.

- Cxx (effTyp 12, eff = parameter): Set the volume. On a row with a note it sets that note volume; on a row without a note it sets the volume of the channel at once. 40 is full volume. Parameter 00 to 40 (hex, 0 to 64). Voice kinds: FM, SSG, ADPCM-A, ADPCM-B.

Put the effect in effTyp and eff of the cell (effTyp2 and eff2 for a second column). Example: {"note":"C-4","instrument":1,"effTyp":12,"eff":32} plays at half volume. A note is a name ("C-4", "OFF") or a number 1 to 96 where 1 is C-0, so C-4 is 49; 97 is note off.

## Effects for expression

effTyp is the number to write; the code is what the grid shows.

- 0xy (effTyp 0): Arpeggio: cycles the note, note + x and note + y semitones, one step per tick. It lasts only the row it is written on, so repeat it on every row the chord should shimmer. 047 is a major chord, 037 minor, 00C an octave. Voice kinds: FM, SSG. State: measured.
- 1xx (effTyp 1): Pitch slide up, xx per tick. Voice kinds: FM, SSG. State: steps per tick in tests, not heard yet.
- 2xx (effTyp 2): Pitch slide down, xx per tick. Voice kinds: FM, SSG. State: steps per tick in tests, not heard yet.
- 3xx (effTyp 3): Portamento to the note on the row, xx per tick. The row does not retrigger the note. Voice kinds: FM, SSG. State: steps per tick in tests, not heard yet.
- 4xy (effTyp 4): Vibrato, speed x, depth y. Voice kinds: FM, SSG. State: steps per tick in tests, not heard yet.
- 7xy (effTyp 7): Tremolo, speed x, depth y. Voice kinds: FM, SSG. State: steps per tick in tests, not heard yet.
- Axy (effTyp 10): Volume slide: x up, y down, per tick. Voice kinds: FM, SSG. State: steps per tick in tests, not heard yet.
- 10xy (effTyp 16): Chip LFO: x = 1 on, 0 off; y = speed 0 to 7. One LFO for the whole chip. An FM instrument follows it only when its fms (pitch depth 0 to 7) or ams (volume depth 0 to 3) is above 0. Voice kinds: FM. State: measured.
- 11xx (effTyp 17): FM feedback 00 to 07 of the channel. Stepping it over a few rows makes the tone grow harsher or softer while the note holds. Voice kinds: FM. State: measured.
- 12xx (effTyp 18): Level of operator 1, 00 loudest to 7F silent. 13xx (effTyp 19), 14xx (effTyp 20) and 15xx (effTyp 21) do the same for operators 2, 3 and 4. On a modulator it changes brightness: written every few rows it sounds like a filter sweep. Voice kinds: FM. State: 12xx measured; 13xx to 15xx not measured.

## What the chip cannot do, and the trick that replaces it

The YM2610 has no filter, no echo and no reverb. Its voices: 4 FM channels (4 operators, 8 algorithms, feedback, one LFO), 3 SSG square channels with one shared noise source and a hardware envelope, 6 ADPCM-A sample channels, 1 ADPCM-B sample channel.

- Echo: clone the lead (clone_instrument), put the clone on a free FM channel, write the same notes a few rows later with a low Cxx (for example C1C). Measured.
- Chorus or width: a second FM channel with the same notes and operator dt of the opposite sign.
- Filter sweep: 12xx to 15xx on a modulator operator, or 11xx feedback steps, while the note holds.
- Movement in a pad: 10xy with the instrument fms or ams above 0.
- Chord on one channel: 0xy on every row of the note.
- Drums on SSG: an instrument with a short falling volume macro (code 0) plus a noise macro (code 2) and wave macro (code 3, value 2 noise or 3 tone + noise). Kick: tone with a falling arpeggio macro (code 1). SSG drums stay thin; samples on ADPCM-A are the strong drums and no composer tool loads a sample yet.

## Effects that steer the song only

- Fxx: Speed (01 to 1F) or BPM (20 to FF). F00 stops.
- Bxx: Jump to order position xx.
- Dxx: Break to row xx of the next pattern.
- E6x: Pattern loop.

## Effects that do NOT reach the chip

Fxx, Bxx, Dxx and E6x steer the song and are never sent to the chip. The flag columns are ignored by the chip.

## What to do instead

- Change tone with update_synth_config (algorithm, feedback, operator tl) before playback.
- Write an arpeggio or slide as the effect (effTyp 0, 1, 2) or, if you want exact control, as notes on separate rows.
- Use one instrument per channel kind: FM channels 0 to 3, SSG 4 to 6, ADPCM-A 7 to 12, ADPCM-B 13.
