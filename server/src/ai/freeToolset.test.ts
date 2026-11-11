import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, type BrowserCaller } from '../mcp/mcpServer';
import { createFreeToolset, COMPOSER_TOOL_ALLOWLIST, FREE_TOOL_ALLOWLIST, MAX_COMPOSER_TOOLS, MAX_FREE_TOOLS } from './freeToolset';

describe('createMcpServer injected caller (FA-5)', () => {
  it('routes a tool call to the injected stub, not the relay', async () => {
    const seen: string[] = [];
    const callBrowser: BrowserCaller = async (method) => { seen.push(method); return { title: 'T' }; };
    const server = createMcpServer({ callBrowser });
    const [c, s] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 't', version: '1' });
    await Promise.all([server.connect(s), client.connect(c)]);
    await client.callTool({ name: 'get_song_info', arguments: {} });
    expect(seen).toContain('get_song_info');
    await client.close();
  });
});

describe('free toolset (FA-6)', () => {
  it('every allowlisted name exists on the MCP server (counted from listTools), none are dangerous, count <= 24', async () => {
    const server = createMcpServer({ callBrowser: async () => ({}) });
    const [c, s] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 't', version: '1' });
    await Promise.all([server.connect(s), client.connect(c)]);
    const all = new Set((await client.listTools()).tools.map((t) => t.name));
    await client.close();
    const missing = FREE_TOOL_ALLOWLIST.filter((n) => !all.has(n));
    expect(missing).toEqual([]);

    const ts = await createFreeToolset(async () => ({}));
    const names = ts.tools.map((t) => t.name);
    expect(names.length).toBe(FREE_TOOL_ALLOWLIST.length);
    expect(names.length).toBeLessThanOrEqual(MAX_FREE_TOOLS);
    expect(names).not.toContain('load_file');
    expect(names).not.toContain('evaluate_script');
    const out = await ts.execute('evaluate_script', {});
    expect(out.ok).toBe(false);
    await ts.close();
  });

  it('composer toolset: every name exists on the MCP server, the allowlist walk-arounds stay off, help lists only what is offered', async () => {
    const server = createMcpServer({ callBrowser: async () => ({}) });
    const [c, s] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 't', version: '1' });
    await Promise.all([server.connect(s), client.connect(c)]);
    const all = new Set((await client.listTools()).tools.map((t) => t.name));
    await client.close();
    expect(COMPOSER_TOOL_ALLOWLIST.filter((n) => !all.has(n))).toEqual([]);
    expect(new Set(COMPOSER_TOOL_ALLOWLIST).size).toBe(COMPOSER_TOOL_ALLOWLIST.length);

    const seen: string[] = [];
    const ts = await createFreeToolset(async (method) => { seen.push(method); return {}; }, { allowlist: COMPOSER_TOOL_ALLOWLIST, maxTools: MAX_COMPOSER_TOOLS });
    const names = ts.tools.map((t) => t.name);
    expect(names.length).toBe(COMPOSER_TOOL_ALLOWLIST.length);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toEqual(expect.arrayContaining(['add_pattern', 'create_instrument', 'write_note_sequence', 'set_pattern_order', 'set_channel_count']));
    for (const banned of ['batch', 'new_song', 'load_file', 'evaluate_script', 'hard_reload', 'execute_command']) {
      expect(names).not.toContain(banned);
      expect(await ts.execute(banned, {})).toEqual({ ok: false, content: `Unknown tool: ${banned}` });
    }
    expect(names.some((n) => n.startsWith('run_') || n.startsWith('export_'))).toBe(false);
    expect(seen).toEqual([]); // a refused tool never reaches the browser

    const help = await ts.execute('get_mcp_help', {});
    expect(help.ok).toBe(true);
    expect(help.content).toContain(`(${names.length})`);
    expect(help.content).toContain('- add_pattern:');
    expect(help.content).not.toContain('batch');
    expect(help.content).not.toContain('load_file');
    await ts.close();
  });
});
