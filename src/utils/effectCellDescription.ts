/**
 * effectCellDescription.ts - single source of truth for "what does this effect cell do".
 *
 * effTyp is one global id space shared by every format (see the *EffectGlyphs.ts blocks), so the
 * lookup keys on effTyp exactly like the renderers' glyph selection and xmEffectToString do; no
 * separate format flag exists to drift. Standard effects (effTyp below 0x40: FT2/MOD/XM/IT, OPL)
 * go through ft2EffectDescriptions. Each private block gets its meanings from the table next to its
 * glyph table. Blocks without a table return null (listed as open in thoughts/spot/todos.md).
 */
import { xmEffectToString } from '@/lib/xmConversions';
import { isDubEffectTypeForDisplay } from '@/engine/dub/moveTable';
import { getFT2EffectDescription } from '@/utils/ft2EffectDescriptions';
import { TW_FX_BASE, TW_EFFECT_MEANINGS } from '@/lib/import/formats/tonyWilliamsEffectGlyphs';
import { jxsDescribe } from '@/lib/import/formats/jxsEffectGlyphs';

export interface EffectCellDescription {
  /** Short command text as drawn in the grid, e.g. "D05". */
  command: string;
  name: string;
  meaning: string;
  /** The parameter byte in words. */
  value: string;
}

export function describeEffectCell(effTyp: number, eff: number): EffectCellDescription | null {
  if (!effTyp && !eff) return null;
  const command = xmEffectToString(effTyp, eff);

  const twIndex = effTyp - TW_FX_BASE;
  if (twIndex >= 0 && twIndex < TW_EFFECT_MEANINGS.length) {
    const m = TW_EFFECT_MEANINGS[twIndex];
    return { command, name: m.name, meaning: m.meaning, value: m.value(eff) };
  }

  const jx = jxsDescribe(effTyp, eff);
  if (jx) return { command, ...jx };

  if (effTyp < 0x40 && !isDubEffectTypeForDisplay(effTyp)) {
    const d = getFT2EffectDescription(command);
    if (d) return { command, name: d.name, meaning: d.description, value: d.parameters };
  }
  return null;
}

/** The effect in slot `slot` (0-based) of a pattern cell, described; null when the slot is empty or unknown. */
export function describeEffectSlot(cell: object | undefined, slot: number): EffectCellDescription | null {
  if (!cell) return null;
  const fields = cell as Record<string, number | undefined>;
  const n = slot + 1;
  const typ = fields[n === 1 ? 'effTyp' : `effTyp${n}`] ?? 0;
  const val = fields[n === 1 ? 'eff' : `eff${n}`] ?? 0;
  return describeEffectCell(typ, val);
}
