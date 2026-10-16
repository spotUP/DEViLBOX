/**
 * The tools the Free provider may use: the SAME tool table as the CLI path
 * (createMcpServer), reached through an in-process MCP client instead of a
 * stdio child, with every browser call going through the chat's channel.
 *
 * ALLOWLIST, not denylist: a tool added to the MCP server later stays off
 * until it is named here. Deliberately absent: load_file (reads server
 * paths), evaluate_script, hard_reload, run_* test tools, export_* (base64
 * blobs blow the context), profiling and monitoring.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, type BrowserCaller } from '../mcp/mcpServer';
import type { ToolOutcome, ToolSpec } from './toolLoop';

export const MAX_FREE_TOOLS = 24;

export const FREE_TOOL_ALLOWLIST: readonly string[] = [
  // read state
  'get_song_info', 'get_playback_state', 'get_full_state', 'get_pattern', 'get_cell',
  'get_instruments_list', 'get_instrument',
  // edit
  'set_cell', 'set_cells', 'update_instrument', 'set_synth_param', 'undo',
  // transport and mixing
  'play', 'stop', 'pause', 'set_bpm', 'set_speed', 'set_channel_mute', 'set_channel_solo',
  // find and load songs
  'search_modland', 'load_modland', 'search_hvsc', 'load_hvsc',
  // help
  'get_mcp_help',
];

export interface FreeToolset {
  tools: ToolSpec[];
  execute: (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>;
  close: () => Promise<void>;
}

export async function createFreeToolset(callBrowser: BrowserCaller): Promise<FreeToolset> {
  const server = createMcpServer({ callBrowser });
  const client = new Client({ name: 'devilbox-free-provider', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

  const listed = await client.listTools();
  const allowed = new Set(FREE_TOOL_ALLOWLIST);
  const tools: ToolSpec[] = listed.tools
    .filter((t) => allowed.has(t.name))
    .slice(0, MAX_FREE_TOOLS)
    .map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown> }));
  const offered = new Set(tools.map((t) => t.name));

  return {
    tools,
    async execute(name, args) {
      // A model can name a tool it was never offered; refuse it here too.
      if (!offered.has(name)) return { ok: false, content: `Unknown tool: ${name}` };
      try {
        const r = await client.callTool({ name, arguments: args });
        const parts = Array.isArray(r.content) ? r.content as Array<{ type?: string; text?: string }> : [];
        const text = parts.filter((p) => p.type === 'text').map((p) => p.text ?? '').join('\n');
        return { ok: !r.isError, content: text };
      } catch (e) {
        return { ok: false, content: e instanceof Error ? e.message : String(e) };
      }
    },
    async close() {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    },
  };
}
