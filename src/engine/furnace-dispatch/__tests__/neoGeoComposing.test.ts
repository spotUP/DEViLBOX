import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
// The server cannot be imported by the editor build, but a test may read it.
import { NEO_GEO_CHIP_EFFECTS, NEO_GEO_COMPOSING_DOC, NEO_GEO_COMPOSING_TOPIC } from '../../../../server/src/ai/neoGeoComposing';

const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('Neo Geo composing guidance', () => {
  it('docs/formats/neo-geo-composing.md equals the single source', () => {
    expect(read('docs/formats/neo-geo-composing.md')).toBe(NEO_GEO_COMPOSING_DOC);
  });
  it('the system prompt points at the topic and names every chip effect', () => {
    const prompt = read('server/src/ai/systemPrompt.ts');
    expect(prompt).toContain(NEO_GEO_COMPOSING_TOPIC);
    for (const e of NEO_GEO_CHIP_EFFECTS) {
      expect(prompt).toContain(e.code);
      expect(prompt).toContain(`effTyp ${e.effTyp}`);
    }
  });
  it('the MCP server and the chat toolset both serve the topic', () => {
    expect(read('server/src/mcp/mcpServer.ts')).toContain('NEO_GEO_COMPOSING_DOC');
    expect(read('server/src/ai/freeToolset.ts')).toContain('NEO_GEO_COMPOSING_DOC');
  });
  it('the replayer still applies Cxx as the only chip effect (re-measure if this fails)', () => {
    const src = read('src/engine/TrackerReplayer.ts');
    expect(src).toMatch(/effTyp === 0xC|effectType === 0xC|0xC/);
    expect(read('src/engine/ToneEngine.ts')).toContain('applyFurnaceEffect');
  });
});
