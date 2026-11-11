# Composing Neo Geo (YM2610) songs with effect commands

Measured on the live playback path of a song made in the tracker (not an imported .fur file).

## Effects that reach the chip

Every other effect code goes to the chip through the Furnace effect router, on the row it is written on, with or without a note: arpeggio (0xy), slides and vibrato (1xx to 4xx), and the chip-specific codes (10 and up: FM operator, ADPCM, and so on). The cell volume column on a row without a note sets the channel volume. The router drops a code a given chip does not use. Not yet checked by ear.

- Cxx (effTyp 12, eff = parameter): Set the volume. On a row with a note it sets that note volume; on a row without a note it sets the volume of the channel at once. 40 is full volume. Parameter 00 to 40 (hex, 0 to 64). Voice kinds: FM, SSG, ADPCM-A, ADPCM-B.

Put the effect in effTyp and eff of the cell (effTyp2 and eff2 for a second column). Example: {"note":60,"instrument":1,"effTyp":12,"eff":32} plays at half volume.

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
