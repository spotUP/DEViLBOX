import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
// The server cannot be imported by the editor build, but a test may read it.
import { PC_TRACKER_COMPOSING_DOC, PC_TRACKER_COMPOSING_TOPIC, PC_TRACKER_EFFECTS } from '../../../server/src/ai/pcTrackerComposing';
import { FT2_EFFECT_DESCRIPTIONS, FT2_E_COMMAND_DESCRIPTIONS } from '../ft2EffectDescriptions';
import { xmEffectToString } from '../../lib/xmConversions';

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('PC-tracker composing guidance', () => {
  it('lists every effect of the real table, with its effTyp number', () => {
    const keys = Object.keys(FT2_EFFECT_DESCRIPTIONS).filter((k) => k !== 'E').concat(Object.keys(FT2_E_COMMAND_DESCRIPTIONS));
    expect(PC_TRACKER_EFFECTS.map((e) => e.key)).toEqual(keys);
    for (const e of PC_TRACKER_EFFECTS) {
      const d = e.key.length === 2 ? FT2_E_COMMAND_DESCRIPTIONS[e.key] : FT2_EFFECT_DESCRIPTIONS[e.key];
      expect(PC_TRACKER_COMPOSING_DOC).toContain(`${d.command} (effTyp ${e.effTyp}`);
      expect(PC_TRACKER_COMPOSING_DOC).toContain(d.parameters);
    }
  });
  it('effTyp numbers agree with the grid display of the same number (letters the display knows)', () => {
    for (const e of PC_TRACKER_EFFECTS) {
      if (e.key.length === 2 || 'WZ'.includes(e.key)) continue;
      expect(xmEffectToString(e.effTyp, 1)[0]).toBe(e.key);
    }
  });
  it('docs/formats/pc-tracker-composing.md equals the single source', () => {
    expect(read('docs/formats/pc-tracker-composing.md')).toBe(PC_TRACKER_COMPOSING_DOC);
  });
  it('the system prompt points at the topic', () => {
    expect(read('server/src/ai/systemPrompt.ts')).toContain(PC_TRACKER_COMPOSING_TOPIC);
  });
  it('the MCP server and the chat toolset both serve the topic', () => {
    expect(read('server/src/mcp/mcpServer.ts')).toContain('PC_TRACKER_COMPOSING_DOC');
    expect(read('server/src/ai/freeToolset.ts')).toContain('PC_TRACKER_COMPOSING_DOC');
  });
});
