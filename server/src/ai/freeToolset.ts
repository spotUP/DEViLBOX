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

/**
 * What a visitor's own Anthropic key may use on top of the Free list: the
 * tools a song is built with (patterns, order, instruments, bulk note entry).
 * Still an allowlist. `batch` stays off on purpose: it forwards any tool name
 * to the browser and would walk around this list. `new_song` stays off: it
 * opens another tab, which this chat's channel does not reach.
 */
export const COMPOSER_TOOL_ALLOWLIST: readonly string[] = [
  ...FREE_TOOL_ALLOWLIST,
  // song structure
  'get_pattern_list', 'get_pattern_order', 'add_pattern', 'duplicate_pattern', 'resize_pattern',
  'clear_pattern', 'clear_channel', 'clear_cell', 'set_pattern_order', 'add_to_order', 'remove_from_order',
  'set_project_metadata',
  // instruments
  'create_instrument', 'clone_instrument', 'delete_instrument', 'get_synth_config', 'update_synth_config',
  'get_loaded_synths',
  // bulk note entry and checks
  'write_note_sequence', 'fill_range', 'generate_pattern', 'transform_pattern', 'render_pattern_text',
  'validate_pattern', 'redo',
  // mixing
  'set_channel_volume', 'set_channel_pan', 'set_master_volume',
];
export const MAX_COMPOSER_TOOLS = COMPOSER_TOOL_ALLOWLIST.length;

export interface ToolsetOptions {
  allowlist?: readonly string[];
  maxTools?: number;
}

export interface FreeToolset {
  tools: ToolSpec[];
  execute: (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>;
  close: () => Promise<void>;
}

export function describeTools(tools: readonly ToolSpec[]): string {
  const lines = tools.map((t) => `- ${t.name}: ${(t.description ?? '').split('\n')[0]}`);
  return `Tools you can call in this chat (${tools.length}). No other tool exists here.\n${lines.join('\n')}`;
}

export async function createFreeToolset(callBrowser: BrowserCaller, options: ToolsetOptions = {}): Promise<FreeToolset> {
  const server = createMcpServer({ callBrowser });
  const client = new Client({ name: 'devilbox-free-provider', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

  const listed = await client.listTools();
  const allowed = new Set(options.allowlist ?? FREE_TOOL_ALLOWLIST);
  // Sorted by name: the tool block is a prompt-cache prefix and must not move
  // when the MCP server's registration order does.
  const tools: ToolSpec[] = listed.tools
    .filter((t) => allowed.has(t.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, options.maxTools ?? MAX_FREE_TOOLS)
    .map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown> }));
  const offered = new Set(tools.map((t) => t.name));

  return {
    tools,
    async execute(name, args) {
      // A model can name a tool it was never offered; refuse it here too.
      if (!offered.has(name)) return { ok: false, content: `Unknown tool: ${name}` };
      // The MCP server's own help lists every tool it has. Answer with the
      // tools this chat can call, so the model never plans around one it cannot.
      if (name === 'get_mcp_help') return { ok: true, content: describeTools(tools) };
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
