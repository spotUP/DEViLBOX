import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { COMMAND_STREAM_BLOCKS, COMMAND_STREAM_DOC, COMMAND_STREAM_TOPIC } from '../../../server/src/ai/commandStreamEffects';
import { CS_EFFECT_GLYPH, CS_FX_MAX, CS_FX_MIN, RR_FX } from '../../lib/import/formats/commandStreamEffectGlyphs';

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('command-stream effect help topic', () => {
  it('lists every glyph-table entry exactly once, each with its glyph', () => {
    const rows = COMMAND_STREAM_BLOCKS.flatMap((b) => b.rows);
    const tableIds = Object.keys(CS_EFFECT_GLYPH).map(Number).sort((a, b) => a - b);
    expect(rows.map((r) => r.effTyp).sort((a, b) => a - b)).toEqual(tableIds);
    for (const r of rows) {
      expect(r.effTyp).toBeGreaterThanOrEqual(CS_FX_MIN);
      expect(r.effTyp).toBeLessThanOrEqual(CS_FX_MAX);
      expect(r.glyph).toBe(CS_EFFECT_GLYPH[r.effTyp]);
    }
  });
  it('shows Riff Raff set volume at its real effTyp', () => {
    expect(COMMAND_STREAM_DOC).toContain(`effTyp ${RR_FX.setVolume} (0x510), grid Vxx: set volume`);
  });
  it('docs file equals the single source, and both servers serve the topic', () => {
    expect(read('docs/formats/command-stream-effects.md')).toBe(COMMAND_STREAM_DOC);
    expect(read('server/src/mcp/mcpServer.ts')).toContain('COMMAND_STREAM_DOC');
    expect(read('server/src/ai/freeToolset.ts')).toContain('COMMAND_STREAM_DOC');
    expect(COMMAND_STREAM_TOPIC).toBe('command-stream-effects');
  });
});
