import { describe, it, expect } from 'vitest';
import { describeEffectCell, describeEffectSlot } from '@/utils/effectCellDescription';
import { TW_FX_BASE, TW_EFFECT_MEANINGS, TW_EFFECT_GLYPH } from '@/lib/import/formats/tonyWilliamsEffectGlyphs';
import { JX_FX_BASE, JX_SINGLE_SCRIPTS, JX_SLOT_BASE, JX_SLOT_FIELDS } from '@/lib/import/formats/jxsEffectGlyphs';

describe('describeEffectCell', () => {
  it('gives every Tony Williams glyph letter a name, meaning and value', () => {
    expect(TW_EFFECT_MEANINGS).toHaveLength(16);
    for (let i = 0; i < 16; i++) {
      const d = describeEffectCell(TW_FX_BASE + i, 0x10);
      expect(d, TW_EFFECT_GLYPH[TW_FX_BASE + i]).not.toBeNull();
      expect(d!.name.length).toBeGreaterThan(2);
      expect(d!.meaning.length).toBeGreaterThan(10);
      expect(d!.value.length).toBeGreaterThan(0);
    }
    expect('DTVEPXSBOFUARGQL').toHaveLength(16);
  });

  it('describes JayTrax single scripts and slot fields', () => {
    for (const s of JX_SINGLE_SCRIPTS) {
      const d = describeEffectCell(JX_FX_BASE + s, 0x20);
      expect(d, `script ${s}`).not.toBeNull();
      expect(d!.meaning.length).toBeGreaterThan(10);
    }
    for (let f = 0; f < JX_SLOT_FIELDS; f++) expect(describeEffectCell(JX_SLOT_BASE + f, 1)).not.toBeNull();
  });

  it('describes an FT2 effect and returns null for an empty slot', () => {
    const d = describeEffectCell(0x0c, 0x40); // Cxx set volume
    expect(d).not.toBeNull();
    expect(`${d!.name} ${d!.meaning}`.toLowerCase()).toContain('volume');
    expect(describeEffectCell(0, 0)).toBeNull();
    expect(describeEffectSlot({ effTyp: 0x0c, eff: 0x40, effTyp2: 0, eff2: 0 }, 1)).toBeNull();
    expect(describeEffectSlot({ effTyp: 0, eff: 0, effTyp2: 0x0c, eff2: 0x40 }, 1)).not.toBeNull();
  });
});
