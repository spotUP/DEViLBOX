// Single source for the "format-private effect blocks" help topic: per format, the effTyp numbers its cells
// use, with grid glyph and name, generated from the same *EffectGlyphs.ts tables the grid renderer imports.
// Feeds the get_mcp_help topic "format-private-effects" and docs/formats/format-private-effects.md (kept equal
// by src/utils/__tests__/privateEffectBlocks.test.ts). Gaps: thoughts/spot/2026-11-12_effect-mapping-gaps.md.
import { type EffectBlock, PARAM_NOT_DOCUMENTED, renderBlocks, rowsFromFx, rowsFromNames } from './effectBlockDoc';
import * as ast from '../../../src/lib/import/formats/actionamicsEffectGlyphs';
import * as avp from '../../../src/lib/import/formats/activisionProEffectGlyphs';
import * as bth from '../../../src/lib/import/formats/beathovenEffectGlyphs';
import * as bd from '../../../src/lib/import/formats/benDaglishEffectGlyphs';
import * as dl from '../../../src/lib/import/formats/daveLoweEffectGlyphs';
import * as dw from '../../../src/lib/import/formats/davidWhittakerEffectGlyphs';
import * as fp from '../../../src/lib/import/formats/fpEffectGlyphs';
import * as fred from '../../../src/lib/import/formats/fredEffectGlyphs';
import * as jo from '../../../src/lib/import/formats/jesperOlsenEffectGlyphs';
import * as jx from '../../../src/lib/import/formats/jxsEffectGlyphs';
import * as ma from '../../../src/lib/import/formats/maEffectGlyphs';
import * as rh from '../../../src/lib/import/formats/robHubbardEffectGlyphs';
import * as snx from '../../../src/lib/import/formats/sonixEffectGlyphs';
import * as sf from '../../../src/lib/import/formats/soundFactoryEffectGlyphs';
import * as sm from '../../../src/lib/import/formats/soundMasterEffectGlyphs';
import * as spl from '../../../src/lib/import/formats/soundPlayerEffectGlyphs';
import * as sun from '../../../src/lib/import/formats/sunEffectGlyphs';
import * as tw from '../../../src/lib/import/formats/tonyWilliamsEffectGlyphs';

export const PRIVATE_EFFECTS_TOPIC = 'format-private-effects';

const twMeaning = (effTyp: number): string | undefined => {
  const m = tw.TW_EFFECT_MEANINGS[effTyp - tw.TW_FX_BASE];
  return m ? m.meaning : undefined;
};

const jxRows = () => {
  const rows = [
    ...jx.JX_SINGLE_SCRIPTS.map((sc) => ({ effTyp: jx.JX_FX_BASE + sc, name: jx.JX_SINGLE_NAMES[sc], parameter: jx.JX_SINGLE_MEANINGS[sc] })),
    ...jx.JX_SLOT_FIELD_NAMES.map((n, f) => ({ effTyp: jx.JX_SLOT_BASE + f, name: `slot ${n}`, parameter: `${jx.JX_SLOT_FIELD_MEANINGS[f]}; the slot number (0 to 3) is the auxiliary value` })),
    { effTyp: jx.JX_WAVE_RESET, name: 'wave reset', parameter: 'sets whether the selected wave restarts on every note (0 or 1); the wave number is the auxiliary value' },
    { effTyp: jx.JX_AUX, name: 'auxiliary value', parameter: 'second parameter of the row script: the bend speed, slot number or wave number' },
  ];
  return rows.map((r) => ({ ...r, glyph: jx.JX_EFFECT_GLYPH[r.effTyp] ?? '?' }));
};

/** Every format-private block, built from the real tables. */
export const PRIVATE_EFFECT_BLOCKS: readonly EffectBlock[] = [
  { formats: ['actionamics'], title: 'Actionamics', rows: rowsFromNames(ast.AST_EFFECT_NAMES, ast.AST_FX_BASE, ast.AST_EFFECT_GLYPH) },
  { formats: ['activisionPro'], title: 'Activision Pro', rows: rowsFromNames(avp.AVP_EFFECT_NAMES, avp.AVP_FX_BASE, avp.AVP_EFFECT_GLYPH) },
  { formats: ['beathoven'], title: 'Beathoven', rows: rowsFromFx(bth.BTH_FX, bth.BTH_EFFECT_GLYPH) },
  { formats: ['benDaglish'], alsoUsedBy: ['SAPParser', 'soundFactoryEffects', 'synthDream', 'timFollin', 'voodooSupreme'], title: 'Ben Daglish', rows: rowsFromFx(bd.BD_FX, bd.BD_EFFECT_GLYPH) },
  { formats: ['daveLowe'], title: 'Dave Lowe', rows: [{ effTyp: dl.DL_FX_VOL_ENV, glyph: 'E', name: 'set volume envelope', parameter: PARAM_NOT_DOCUMENTED }] },
  { formats: ['davidWhittaker'], title: 'David Whittaker', rows: rowsFromFx(dw.DW_FX, dw.DW_EFFECT_GLYPH) },
  { formats: ['futurePlayer'], title: 'Future Player', rows: rowsFromNames(fp.FP_EFFECT_NAMES, fp.FP_FX_BASE, fp.FP_EFFECT_GLYPH) },
  { formats: ['fred'], title: 'Fred Editor', rows: rowsFromFx(fred.FRED_FX, fred.FRED_EFFECT_GLYPH) },
  { formats: ['jesperOlsen'], title: 'Jesper Olsen', rows: rowsFromFx(jo.JO_FX, jo.JO_EFFECT_GLYPH) },
  { formats: ['jxs'], title: 'JayTrax (effTyp 330 is listed twice by the table: tempo and slot reset; treat it as ambiguous)', rows: jxRows() },
  { formats: ['musicAssembler'], title: 'Music Assembler', rows: rowsFromNames(ma.MA_EFFECT_NAMES, ma.MA_FX_BASE, ma.MA_EFFECT_GLYPH) },
  { formats: ['robHubbard'], title: 'Rob Hubbard', rows: rowsFromNames(rh.RH_EFFECT_NAMES, rh.RH_FX_BASE, rh.RH_EFFECT_GLYPH) },
  { formats: ['SonixMusicDriverParser'], title: 'Sonix Music Driver', rows: rowsFromFx(snx.SNX_FX, snx.SNX_EFFECT_GLYPH) },
  { formats: ['soundFactory'], title: 'Sound Factory', rows: rowsFromNames(sf.SF_EFFECT_NAMES, sf.SF_FX_BASE, sf.SF_EFFECT_GLYPH) },
  { formats: ['soundMaster'], title: 'Sound Master', rows: rowsFromFx(sm.SM_FX, sm.SM_EFFECT_GLYPH) },
  { formats: ['soundPlayer'], title: 'Sound Player', rows: rowsFromFx(spl.SPL_FX, spl.SPL_EFFECT_GLYPH) },
  { formats: ['suntronic'], title: 'SunTronic', rows: rowsFromFx(sun.SUN_FX, sun.SUN_EFFECT_GLYPH) },
  { formats: ['tonyWilliams'], title: 'Tony Williams', rows: rowsFromNames(tw.TW_EFFECT_NAMES, tw.TW_FX_BASE, tw.TW_EFFECT_GLYPH, twMeaning) },
];

export const PRIVATE_EFFECTS_DOC = `# Format-private effect commands (formats with their own effect set)

Source: the *EffectGlyphs.ts tables in src/lib/import/formats, the same tables the grid renderer imports. These formats do not use the standard effect numbers: a cell stores the effTyp below and the one-byte eff operand verbatim. effTyp is one global id space, so write exactly these numbers with set_cells; the standard table (topic pc-tracker-composing) does not apply to them.

Cell example: {"note":60,"instrument":1,"effTyp":160,"eff":3} writes Actionamics effect 0xA0 with operand 3.

Where a row says "${PARAM_NOT_DOCUMENTED}", no editor table, parser comment or player source in the repo states it in machine-readable form; do not guess it, copy operands from a real song of that format.

${renderBlocks(PRIVATE_EFFECT_BLOCKS)}
## Not verified

- Names are the table's own identifiers; glyphs are what the grid shows. Playback was not checked per command.
- Own-set formats with no table in the repo are not listed: see thoughts/spot/2026-11-12_effect-mapping-gaps.md.
`;
