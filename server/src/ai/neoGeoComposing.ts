// Single source for "what effect commands reach the Neo Geo (YM2610) chip".
// Feeds three consumers: the get_mcp_help topic "neo-geo-composing", the short
// pointer in the composer system prompt, and docs/formats/neo-geo-composing.md
// (kept equal to NEO_GEO_COMPOSING_DOC by src/engine/furnace-dispatch/__tests__/neoGeoComposing.test.ts).
// Measured by reading the live path, see thoughts/spot/2026-11-11_neo-geo-effect-commands.md.

/** Cell effects that change what the chip plays. effTyp is the cell's numeric effect type. */
export const NEO_GEO_CHIP_EFFECTS = [
  { effTyp: 0x0c, code: 'Cxx', param: '00 to 40 (hex, 0 to 64)', does: 'Set the note volume. Applies at the note start on the same row, so the row needs a note. 40 is full volume.', kinds: 'FM, SSG, ADPCM-A, ADPCM-B' },
] as const;

/** Cell effects that only steer the song, never the chip. */
export const NEO_GEO_SONG_EFFECTS = [
  { code: 'Fxx', does: 'Speed (01 to 1F) or BPM (20 to FF). F00 stops.' },
  { code: 'Bxx', does: 'Jump to order position xx.' },
  { code: 'Dxx', does: 'Break to row xx of the next pattern.' },
  { code: 'E6x', does: 'Pattern loop.' },
] as const;

export const NEO_GEO_COMPOSING_TOPIC = 'neo-geo-composing';

export const NEO_GEO_COMPOSING_DOC = `# Composing Neo Geo (YM2610) songs with effect commands

Measured on the live playback path of a song made in the tracker (not an imported .fur file).

## Effects that reach the chip

${NEO_GEO_CHIP_EFFECTS.map((e) => `- ${e.code} (effTyp ${e.effTyp}, eff = parameter): ${e.does} Parameter ${e.param}. Voice kinds: ${e.kinds}.`).join('\n')}

Put the effect in effTyp and eff of the cell (effTyp2 and eff2 for a second column). Example: {"note":60,"instrument":1,"effTyp":12,"eff":32} plays at half volume.

## Effects that steer the song only

${NEO_GEO_SONG_EFFECTS.map((e) => `- ${e.code}: ${e.does}`).join('\n')}

## Effects that do NOT reach the chip

Every Furnace chip effect (arpeggio, slides, vibrato, FM operator commands, ADPCM commands, and the rest of the Furnace effect router) is dropped for tracker-made songs. Do not write them. The cell volume column and the flag columns are also ignored by the chip. Cxx without a note on the row has no audible effect.

## What to do instead

- Change tone with update_synth_config (algorithm, feedback, operator tl) before playback.
- Make an arpeggio or slide by writing the notes on separate rows.
- Use one instrument per channel kind: FM channels 0 to 3, SSG 4 to 6, ADPCM-A 7 to 12, ADPCM-B 13.
`;
