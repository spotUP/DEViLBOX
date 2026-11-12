// Single source for "what effect commands reach the Neo Geo (YM2610) chip".
// Feeds three consumers: the get_mcp_help topic "neo-geo-composing", the short
// pointer in the composer system prompt, and docs/formats/neo-geo-composing.md
// (kept equal to NEO_GEO_COMPOSING_DOC by src/engine/furnace-dispatch/__tests__/neoGeoComposing.test.ts).
// Measured by reading the live path, see thoughts/spot/2026-11-11_neo-geo-effect-commands.md.

/** Cell effects that change what the chip plays (the Furnace effect router handles every code except the song-steering ones below). effTyp is the cell's numeric effect type. */
export const NEO_GEO_CHIP_EFFECTS = [
  { effTyp: 0x0c, code: 'Cxx', param: '00 to 40 (hex, 0 to 64)', does: 'Set the volume. On a row with a note it sets that note volume; on a row without a note it sets the volume of the channel at once. 40 is full volume.', kinds: 'FM, SSG, ADPCM-A, ADPCM-B' },
] as const;

/** Cell effects that only steer the song, never the chip. */
export const NEO_GEO_SONG_EFFECTS = [
  { code: 'Fxx', does: 'Speed (01 to 1F) or BPM (20 to FF). F00 stops.' },
  { code: 'Bxx', does: 'Jump to order position xx.' },
  { code: 'Dxx', does: 'Break to row xx of the next pattern.' },
  { code: 'E6x', does: 'Pattern loop.' },
] as const;

/**
 * Effects and sound tricks measured on the chip command log of a tracker-made song
 * (furnace_cmd_log). Kept apart from NEO_GEO_CHIP_EFFECTS because the composer system
 * prompt must name every entry of that list; these live in the help topic only.
 */
export const NEO_GEO_RECIPES = [
  { effTyp: 0, code: '0xy', does: 'Arpeggio: cycles the note, note + x and note + y semitones, one step per tick. It lasts only the row it is written on, so repeat it on every row the chord should shimmer. 047 is a major chord, 037 minor, 00C an octave.', kinds: 'FM, SSG', state: 'measured' },
  { effTyp: 1, code: '1xx', does: 'Pitch slide up, xx per tick.', kinds: 'FM, SSG', state: 'steps per tick in tests, not heard yet' },
  { effTyp: 2, code: '2xx', does: 'Pitch slide down, xx per tick.', kinds: 'FM, SSG', state: 'steps per tick in tests, not heard yet' },
  { effTyp: 3, code: '3xx', does: 'Portamento to the note on the row, xx per tick. The row does not retrigger the note.', kinds: 'FM, SSG', state: 'steps per tick in tests, not heard yet' },
  { effTyp: 4, code: '4xy', does: 'Vibrato, speed x, depth y.', kinds: 'FM, SSG', state: 'steps per tick in tests, not heard yet' },
  { effTyp: 7, code: '7xy', does: 'Tremolo, speed x, depth y.', kinds: 'FM, SSG', state: 'steps per tick in tests, not heard yet' },
  { effTyp: 10, code: 'Axy', does: 'Volume slide: x up, y down, per tick.', kinds: 'FM, SSG', state: 'steps per tick in tests, not heard yet' },
  { effTyp: 16, code: '10xy', does: 'Chip LFO: x = 1 on, 0 off; y = speed 0 to 7. One LFO for the whole chip. An FM instrument follows it only when its fms (pitch depth 0 to 7) or ams (volume depth 0 to 3) is above 0.', kinds: 'FM', state: 'measured' },
  { effTyp: 17, code: '11xx', does: 'FM feedback 00 to 07 of the channel. Stepping it over a few rows makes the tone grow harsher or softer while the note holds.', kinds: 'FM', state: 'measured' },
  { effTyp: 18, code: '12xx', does: 'Level of operator 1, 00 loudest to 7F silent. 13xx (effTyp 19), 14xx (effTyp 20) and 15xx (effTyp 21) do the same for operators 2, 3 and 4. On a modulator it changes brightness: written every few rows it sounds like a filter sweep.', kinds: 'FM', state: '12xx measured; 13xx to 15xx not measured' },
] as const;

export const NEO_GEO_COMPOSING_TOPIC = 'neo-geo-composing';

export const NEO_GEO_COMPOSING_DOC = `# Composing Neo Geo (YM2610) songs with effect commands

Measured on the live playback path of a song made in the tracker (not an imported .fur file).

## Effects that reach the chip

Every other effect code goes to the chip through the Furnace effect router, on the row it is written on, with or without a note. The cell volume column on a row without a note sets the channel volume. The router drops a code a given chip does not use.

${NEO_GEO_CHIP_EFFECTS.map((e) => `- ${e.code} (effTyp ${e.effTyp}, eff = parameter): ${e.does} Parameter ${e.param}. Voice kinds: ${e.kinds}.`).join('\n')}

Put the effect in effTyp and eff of the cell (effTyp2 and eff2 for a second column). Example: {"note":"C-4","instrument":1,"effTyp":12,"eff":32} plays at half volume. A note is a name ("C-4", "OFF") or a number 1 to 96 where 1 is C-0, so C-4 is 49; 97 is note off.

## Effects for expression

effTyp is the number to write; the code is what the grid shows.

${NEO_GEO_RECIPES.map((e) => `- ${e.code} (effTyp ${e.effTyp}): ${e.does} Voice kinds: ${e.kinds}. State: ${e.state}.`).join('\n')}

## What the chip cannot do, and the trick that replaces it

The YM2610 has no filter, no echo and no reverb. Its voices: 4 FM channels (4 operators, 8 algorithms, feedback, one LFO), 3 SSG square channels with one shared noise source and a hardware envelope, 6 ADPCM-A sample channels, 1 ADPCM-B sample channel.

- Echo: clone the lead (clone_instrument), put the clone on a free FM channel, write the same notes a few rows later with a low Cxx (for example C1C). Measured.
- Chorus or width: a second FM channel with the same notes and operator dt of the opposite sign.
- Filter sweep: 12xx to 15xx on a modulator operator, or 11xx feedback steps, while the note holds.
- Movement in a pad: 10xy with the instrument fms or ams above 0.
- Chord on one channel: 0xy on every row of the note.
- Drums on SSG: an instrument with a short falling volume macro (code 0) plus a noise macro (code 2) and wave macro (code 3, value 2 noise or 3 tone + noise). Kick: tone with a falling arpeggio macro (code 1). SSG drums stay thin; samples on ADPCM-A are the strong drums and no composer tool loads a sample yet.

## Effects that steer the song only

${NEO_GEO_SONG_EFFECTS.map((e) => `- ${e.code}: ${e.does}`).join('\n')}

## Effects that do NOT reach the chip

Fxx, Bxx, Dxx and E6x steer the song and are never sent to the chip. The flag columns are ignored by the chip.

## What to do instead

- Change tone with update_synth_config (algorithm, feedback, operator tl) before playback.
- Write an arpeggio or slide as the effect (effTyp 0, 1, 2) or, if you want exact control, as notes on separate rows.
- Use one instrument per channel kind: FM channels 0 to 3, SSG 4 to 6, ADPCM-A 7 to 12, ADPCM-B 13.
`;
