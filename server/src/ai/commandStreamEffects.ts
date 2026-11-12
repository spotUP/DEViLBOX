// Single source for the "command-stream effects" help topic: the effTyp numbers that command-stream formats
// (per-channel command streams turned into a tick grid) use for their pattern commands, generated from
// commandStreamEffectGlyphs.ts, the table the grid renderer imports. Feeds the get_mcp_help topic
// "command-stream-effects" and docs/formats/command-stream-effects.md (kept equal by
// src/utils/__tests__/commandStreamEffects.test.ts). Gaps: thoughts/spot/2026-11-12_effect-mapping-gaps.md.
import { type EffectBlock, PARAM_NOT_DOCUMENTED, renderBlocks, rowsFromFx } from './effectBlockDoc';
import { CS_EFFECT_GLYPH, HC_FX, HD_FX, RK_FX, RR_FX, ST_FX, SPL_FX as CS_SPL_FX } from '../../../src/lib/import/formats/commandStreamEffectGlyphs';

export const COMMAND_STREAM_TOPIC = 'command-stream-effects';

export const COMMAND_STREAM_BLOCKS: readonly EffectBlock[] = [
  { formats: ['riffRaff'], title: 'Riff Raff', rows: rowsFromFx(RR_FX, CS_EFFECT_GLYPH) },
  { formats: ['howieDavies'], title: 'Howie Davies', rows: rowsFromFx(HD_FX, CS_EFFECT_GLYPH) },
  { formats: ['hippelCoso'], title: 'Jochen Hippel CoSo', rows: rowsFromFx(HC_FX, CS_EFFECT_GLYPH) },
  { formats: ['soundProgrammingLanguage'], title: 'Sound Programming Language', rows: rowsFromFx(CS_SPL_FX, CS_EFFECT_GLYPH) },
  { formats: ['ronKlaren'], title: 'Ron Klaren', rows: rowsFromFx(RK_FX, CS_EFFECT_GLYPH) },
  { formats: ['sawteeth'], title: 'Sawteeth (effect byte split: effTyp from the high nibble, eff the low nibble)', rows: rowsFromFx(ST_FX, CS_EFFECT_GLYPH) },
];

export const COMMAND_STREAM_DOC = `# Command-stream format effects (Riff Raff, Howie Davies, Hippel CoSo, Sound Programming Language, Ron Klaren)

Source: src/lib/import/formats/commandStreamEffectGlyphs.ts, the table the grid renderer imports. These formats store compiled per-channel command streams; the editor shows them as a tick grid. None of their commands is a standard effect: a cell stores the effTyp below and the one-byte eff operand verbatim (the stream's argument byte). effTyp is one global id space, so write exactly these numbers with set_cells; the standard table (topic pc-tracker-composing) does not apply.

Cell example: {"note":60,"instrument":1,"effTyp":${RR_FX.setVolume},"eff":64} writes the Riff Raff set volume command with operand 64.

Where a row says "${PARAM_NOT_DOCUMENTED}", no machine-readable table states it; do not guess it. Background on the grid recipe: docs/FORMAT_COMMAND_STREAM_GRID.md.

${renderBlocks(COMMAND_STREAM_BLOCKS)}
## Not verified

- Names are the table's own identifiers; glyphs are what the grid shows. Playback was not checked per command.
- Other command-stream formats (SidMon 2, Face The Music, IFF SMUS, KT, David Hanney, EMS v6, Dynamic Synthesizer, Synth Dream, Tim Follin) have no command-stream table in the repo: see thoughts/spot/2026-11-12_effect-mapping-gaps.md.
`;
