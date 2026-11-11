import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './mcpServer';

type Prop = { maximum?: number };
async function schemaOf(tool: string): Promise<Record<string, Prop>> {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createMcpServer({ callBrowser: async () => ({ ok: true }) }).connect(b);
  const client = new Client({ name: 't', version: '1' });
  await client.connect(a);
  const { tools } = await client.listTools();
  const schema = tools.find((t) => t.name === tool)?.inputSchema as { properties: Record<string, unknown> };
  const props = schema.properties;
  if (tool === 'set_cells') {
    const items = (props.cells as { items: { properties: Record<string, Prop> } }).items;
    return items.properties;
  }
  return props as Record<string, Prop>;
}

describe('cell write tool schemas carry the whole cell', () => {
  it.each(['set_cell', 'set_cells', 'fill_range'])('%s accepts private format effect ids (0x550) in effTyp and effTyp2', async (tool) => {
    const props = await schemaOf(tool);
    expect(props.effTyp.maximum).toBeGreaterThanOrEqual(0x554);
    expect(props.effTyp2.maximum).toBeGreaterThanOrEqual(0x554);
  });

  it.each(['set_cells', 'fill_range'])('%s declares flag1, flag2 and probability', async (tool) => {
    const props = await schemaOf(tool);
    for (const key of ['flag1', 'flag2', 'probability']) expect(props).toHaveProperty(key);
  });

  it('fill_range declares effTyp2 and eff2', async () => {
    const props = await schemaOf('fill_range');
    expect(props).toHaveProperty('effTyp2');
    expect(props).toHaveProperty('eff2');
  });
});
