import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
// The server cannot be imported by the editor build, but a test may read it.
import { GENESIS_CHIPS, GENESIS_COMPOSING_DOC, GENESIS_COMPOSING_TOPIC } from '../../../../server/src/ai/genesisComposing';
import { GAME_BOY_CHIPS, GAME_BOY_COMPOSING_DOC, GAME_BOY_COMPOSING_TOPIC } from '../../../../server/src/ai/gameBoyComposing';
import { FURNACE_GLOBAL_CANDIDATES, FURNACE_STANDARD_EFFECTS, wiredChipCodes } from '../../../../server/src/ai/furnaceChipComposing';
import { TICK_STEPPED_EFFECTS } from '../FurnaceTickEffects';
import { SYNTH_TO_DISPATCH } from '../synthPlatforms';
import { FurnaceEffectRouter } from '../FurnaceEffectRouter';
import { FurnaceDispatchPlatform } from '../platforms';
import { FURNACE_EFFECT_TABLE } from '../furnaceEffectTable.gen';

const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const FAMILIES = [
  { topic: GENESIS_COMPOSING_TOPIC, doc: GENESIS_COMPOSING_DOC, docName: 'GENESIS_COMPOSING_DOC', chips: GENESIS_CHIPS },
  { topic: GAME_BOY_COMPOSING_TOPIC, doc: GAME_BOY_COMPOSING_DOC, docName: 'GAME_BOY_COMPOSING_DOC', chips: GAME_BOY_CHIPS },
];

describe.each(FAMILIES)('$topic guidance', ({ topic, doc, docName, chips }) => {
  it('docs/formats/<topic>.md equals the single source', () => {
    expect(read(`docs/formats/${topic}.md`)).toBe(doc);
  });
  it('the MCP server and the chat toolset both serve the topic', () => {
    expect(read('server/src/mcp/mcpServer.ts')).toContain(docName);
    expect(read('server/src/ai/freeToolset.ts')).toContain(docName);
    expect(read('server/src/mcp/mcpServer.ts')).toContain(`"${topic}"`);
  });
  it('each instrument synth still addresses the documented platform', () => {
    for (const c of chips) expect(SYNTH_TO_DISPATCH[c.synthType]).toBe(c.platform);
  });
  it('every undocumented global is dropped by the router (re-measure if this fails)', () => {
    for (const c of chips) {
      for (const g of FURNACE_GLOBAL_CANDIDATES) {
        if (wiredChipCodes(c.platform).includes(g.effTyp)) continue;
        expect(new FurnaceEffectRouter(c.platform).routeEffect(c.platform, 0, g.effTyp, 0x11)).toEqual([]);
      }
    }
  });
});

describe('shared Furnace composing tables', () => {
  it('the stepped list equals TICK_STEPPED_EFFECTS', () => {
    const stepped = FURNACE_STANDARD_EFFECTS.filter((e) => e.stepped).map((e) => e.effTyp).sort((a, b) => a - b);
    expect(stepped).toEqual([...TICK_STEPPED_EFFECTS].sort((a, b) => a - b));
  });
  it.each([
    ['FurnaceOPN', FurnaceDispatchPlatform.YM2612, [0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x19, 0x1d, 0x30, 0x50, 0x63, 0x6c, 0x6d, 0xdf]],
    ['FurnaceOPM', FurnaceDispatchPlatform.YM2151, [0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1d]],
  ] as const)('%s chip codes route through its stand-in chip table', (synth, standIn, codes) => {
    const platform = SYNTH_TO_DISPATCH[synth];
    expect(FURNACE_EFFECT_TABLE[platform]).toBeUndefined(); // compound system: no map of its own
    const router = new FurnaceEffectRouter(platform);
    const viaStandIn = new FurnaceEffectRouter(standIn);
    for (const code of codes) {
      const cmds = router.routePlatformEffect(platform, 0, code, 0x11);
      expect(cmds.length, `${synth} ${code.toString(16)}xx`).toBeGreaterThan(0);
      expect(cmds).toEqual(viaStandIn.routePlatformEffect(standIn, 0, code, 0x11));
    }
  });
});
