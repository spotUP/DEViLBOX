// Single source for "which cell effect commands the PC-tracker family uses" (MOD, XM, S3M, IT and the
// formats that import into the standard effect set). Generated from the real effect table in
// src/utils/ft2EffectDescriptions.ts, so the help text cannot drift from the editor's own descriptions.
// Feeds: the get_mcp_help topic "pc-tracker-composing", the pointer in the composer system prompt, and
// docs/formats/pc-tracker-composing.md (kept equal to PC_TRACKER_COMPOSING_DOC by
// src/utils/__tests__/pcTrackerComposing.test.ts). Evidence: thoughts/spot/2026-11-12_pc-tracker-effects.md.
import { FT2_EFFECT_DESCRIPTIONS, FT2_E_COMMAND_DESCRIPTIONS } from '../../../src/utils/ft2EffectDescriptions';

export const PC_TRACKER_COMPOSING_TOPIC = 'pc-tracker-composing';

export interface PcTrackerEffectRow {
  /** Key in the real table: '0'..'9', 'A'..'Z', or 'E0'..'EF'. */
  key: string;
  /** Code as shown in the grid, e.g. "4xy" or "E9x". */
  code: string;
  /** Number the tools take in effTyp (XM numbering: digits 0-9, letters A=10 .. Z=35, E-commands all 14). */
  effTyp: number;
  /** Fixed high nibble of eff for E-commands (E9x -> 0x90); undefined otherwise. */
  effBase?: number;
  name: string;
  parameters: string;
  description: string;
}

function effTypOf(letter: string): number {
  return /[0-9]/.test(letter) ? Number(letter) : 10 + letter.charCodeAt(0) - 'A'.charCodeAt(0);
}

/** Every standard effect, in table order, with the number the tools take. Built from the real table. */
export const PC_TRACKER_EFFECTS: readonly PcTrackerEffectRow[] = [
  ...Object.entries(FT2_EFFECT_DESCRIPTIONS).map(([key, d]) => ({
    key, code: d.command, effTyp: effTypOf(key), name: d.name, parameters: d.parameters, description: d.description,
  })),
  ...Object.entries(FT2_E_COMMAND_DESCRIPTIONS).map(([key, d]) => ({
    key, code: d.command, effTyp: 0x0e, effBase: parseInt(key[1], 16) << 4, name: d.name, parameters: d.parameters, description: d.description,
  })),
].filter((e, _i, all) => !(e.key === 'E' && all.some((o) => o.key.length === 2))); // the bare "Exy" row is replaced by E0x..EFx

/** Cell volume column values (XM encoding, which every PC-tracker import is converted to). */
export const PC_TRACKER_VOLUME_COLUMN = [
  '0x00: empty. 0x10 to 0x50: set volume 0 to 64 (value = 0x10 + volume).',
  '0x60 to 0x6F: volume slide down by the low nibble. 0x70 to 0x7F: volume slide up.',
  '0x80 to 0x8F: fine volume slide down. 0x90 to 0x9F: fine volume slide up.',
  '0xA0 to 0xAF: set vibrato speed. 0xB0 to 0xBF: vibrato depth.',
  '0xC0 to 0xCF: set panning (0 left, F right). 0xD0 to 0xDF: panning slide left. 0xE0 to 0xEF: panning slide right.',
  '0xF0 to 0xFF: tone portamento with speed in the low nibble.',
] as const;

const effTypHex = (n: number) => `${n}`;

export const PC_TRACKER_COMPOSING_DOC = `# Composing PC-tracker songs (MOD, XM, S3M, IT and formats that use the standard effect set)

Source: the editor's own effect table (src/utils/ft2EffectDescriptions.ts). A cell holds effTyp and eff (numbers), plus effTyp2 and eff2 for a second effect column, and a volume column value. Write them with set_cells or fill_range.

## How a cell stores an effect

- effTyp is the effect number in XM numbering: the digit for 0 to 9, 10 for A, 11 for B, and so on up to 35 for Z. eff is the one-byte parameter (0 to 255).
- E-commands are effTyp 14 and eff = sub-command in the high nibble + value in the low nibble. E9x with x=3 is {"effTyp":14,"eff":147} (0x93).
- Example: {"note":60,"instrument":1,"effTyp":12,"eff":32} plays at half volume (C20 hex = 32 of 64).
- S3M and IT songs are converted to this same numbering on import, so the same effTyp numbers apply to them. Their own letters differ, see "Per-format differences".

## Effect table

Columns: code as shown in the grid, effTyp, parameter, meaning.

${PC_TRACKER_EFFECTS.map((e) => `- ${e.code} (effTyp ${effTypHex(e.effTyp)}${e.effBase !== undefined ? `, eff high nibble ${e.effBase >> 4}, i.e. eff = ${e.effBase} + x` : ''}): ${e.name}. ${e.description}. Parameter: ${e.parameters}.`).join('\n')}

## Volume column

${PC_TRACKER_VOLUME_COLUMN.map((l) => `- ${l}`).join('\n')}

## Per-format differences

- MOD: four channels (more on variants), no volume column, no second effect column, effTyp 0 to 15 only (the 16 MOD effects 0 to F; the E sub-commands are effTyp 14). G, H and later letters do not exist. Fxx: 01 to 1F is speed in ticks per row, 20 to FF is BPM.
- XM: effTyp 0 to 35, the volume column, K (key off), L (envelope position), P (panning slide), R (multi retrigger), T (tremor), X (extra fine portamento). Fxx splits speed (01 to 1F) from BPM (20 to FF) the same way.
- S3M: letters A to Z, not the XM numbers. On import: A is set speed (effTyp 15), T is set tempo (effTyp 15, parameter 32 or more), B jump (11), C break (13), D volume slide (10), E and F portamento down and up (2, 1; EFx/FFx fine become E2x/E1x, EEx/FEx become extra fine effTyp 33), G tone portamento (3), H vibrato (4), I tremor (29), J arpeggio (0), K and L combined slides (6, 5), O sample offset (9), Q retrigger (E9x), R tremolo (7), S sub-commands (S3x, S4x, S5x, S6x, S8x, SCx, SDx, SEx become the same E-command), U fine vibrato (4), V global volume (16), W global volume slide (17), X set panning (8, doubled), Y panbrello (25). M, N, P, Z and unlisted S sub-commands are dropped on import.
- IT: same letter mapping as S3M, plus a wider volume column (set volume 0 to 64, fine and normal slides, panning 0 to 64, vibrato speed and depth; portamento volume-column values are dropped on import). Speed is Axx and tempo is Txx (20 hex and up).
- Speed versus tempo: in MOD and XM one command (Fxx) carries both, split at 20 hex. In S3M and IT they are two commands (A speed, T tempo) that both land in effTyp 15 after import.
- Not applicable here: Amiga-specific and chip-specific formats (Furnace chips, private command blocks above 35) have their own topics.

## Not verified

- Parameter ranges are the editor's own description strings; they were not re-measured by ear.
- effTyp 32 (W, global pitch shift) and 35 (Z, MIDI macro / filter) are editor additions, not part of FT2 or MOD; their playback was not checked.
- The per-format list reflects the importers (S3MParser, ITParser), not the original players; S3M-only quirks (for example volume-slide "fine" cases of D) are not listed. Unverified.
- Whether the MOD exporter rejects or drops effTyp above 15 was not checked.
`;
