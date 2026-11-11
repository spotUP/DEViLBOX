# Composing Neo Geo (YM2610) songs with effect commands

Measured on the live playback path of a song made in the tracker (not an imported .fur file).

## Effects that reach the chip

- Cxx (effTyp 12, eff = parameter): Set the note volume. Applies at the note start on the same row, so the row needs a note. 40 is full volume. Parameter 00 to 40 (hex, 0 to 64). Voice kinds: FM, SSG, ADPCM-A, ADPCM-B.

Put the effect in effTyp and eff of the cell (effTyp2 and eff2 for a second column). Example: {"note":60,"instrument":1,"effTyp":12,"eff":32} plays at half volume.

## Effects that steer the song only

- Fxx: Speed (01 to 1F) or BPM (20 to FF). F00 stops.
- Bxx: Jump to order position xx.
- Dxx: Break to row xx of the next pattern.
- E6x: Pattern loop.

## Effects that do NOT reach the chip

Every Furnace chip effect (arpeggio, slides, vibrato, FM operator commands, ADPCM commands, and the rest of the Furnace effect router) is dropped for tracker-made songs. Do not write them. The cell volume column and the flag columns are also ignored by the chip. Cxx without a note on the row has no audible effect.

## What to do instead

- Change tone with update_synth_config (algorithm, feedback, operator tl) before playback.
- Make an arpeggio or slide by writing the notes on separate rows.
- Use one instrument per channel kind: FM channels 0 to 3, SSG 4 to 6, ADPCM-A 7 to 12, ADPCM-B 13.
