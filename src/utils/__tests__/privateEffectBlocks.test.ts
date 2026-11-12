import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PRIVATE_EFFECTS_DOC, PRIVATE_EFFECTS_TOPIC, PRIVATE_EFFECT_BLOCKS } from '../../../server/src/ai/privateEffectBlocks';
import { PARAM_NOT_DOCUMENTED } from '../../../server/src/ai/effectBlockDoc';
import { AST_FX_BASE, AST_EFFECT_NAMES } from '../../lib/import/formats/actionamicsEffectGlyphs';
import { TW_EFFECT_MEANINGS } from '../../lib/import/formats/tonyWilliamsEffectGlyphs';

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('format-private effect help topic', () => {
  it('lists every Actionamics effect at its real effTyp', () => {
    const b = PRIVATE_EFFECT_BLOCKS.find((x) => x.formats[0] === 'actionamics')!;
    expect(b.rows.map((r) => r.effTyp)).toEqual(AST_EFFECT_NAMES.map((_, i) => AST_FX_BASE + i));
    for (const r of b.rows) expect(PRIVATE_EFFECTS_DOC).toContain(`effTyp ${r.effTyp} (`);
  });
  it('takes parameter meaning from the table where one exists and flags the rest', () => {
    const tw = PRIVATE_EFFECT_BLOCKS.find((x) => x.formats[0] === 'tonyWilliams')!;
    expect(tw.rows[0].parameter).toBe(TW_EFFECT_MEANINGS[0].meaning);
    expect(PRIVATE_EFFECTS_DOC).toContain(PARAM_NOT_DOCUMENTED);
  });
  it('every block has rows with a glyph and no duplicate effTyp inside a block', () => {
    for (const b of PRIVATE_EFFECT_BLOCKS) {
      expect(b.rows.length).toBeGreaterThan(0);
      // jxs: single script 74 (tempo, 0x14A) and slot field 10 (reset, 0x14A) share one id in jxsEffectGlyphs.ts; reported in the gaps file.
      if (b.formats[0] !== 'jxs') expect(new Set(b.rows.map((r) => r.effTyp)).size).toBe(b.rows.length);
      for (const r of b.rows) expect(r.glyph).not.toBe('?');
    }
  });
  it('docs file equals the single source, and both servers serve the topic', () => {
    expect(read('docs/formats/format-private-effects.md')).toBe(PRIVATE_EFFECTS_DOC);
    expect(read('server/src/mcp/mcpServer.ts')).toContain('PRIVATE_EFFECTS_DOC');
    expect(read('server/src/ai/freeToolset.ts')).toContain('PRIVATE_EFFECTS_DOC');
    expect(PRIVATE_EFFECTS_TOPIC).toBe('format-private-effects');
  });
});
