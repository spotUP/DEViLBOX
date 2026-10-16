/**
 * AI CLI providers: discovery, argv construction and stream parsing for the
 * four supported command-line assistants (Claude, Copilot, Pi, OpenCode).
 *
 * The chat route (routes/ai.ts) is glue: it picks a provider here, spawns the
 * returned invocation and feeds every stdout JSON line through `parseEvent`.
 */

import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { join } from 'path';

export type AIProviderId = 'claude' | 'copilot' | 'pi' | 'opencode';

export const AI_PROVIDER_IDS: AIProviderId[] = ['claude', 'copilot', 'pi', 'opencode'];

/** Normalised event sent to the browser over SSE. */
export type AIStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; tool?: string; input?: unknown }
  | { type: 'tool_result'; tool?: string; result?: unknown }
  | { type: 'error'; error: string };

export interface McpServerSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface CliInvocation {
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
}

// --- Discovery -------------------------------------------------------------

function firstExisting(candidates: Array<string | undefined>): string | null {
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

export function findCli(provider: AIProviderId): string | null {
  switch (provider) {
    case 'claude':
      return firstExisting([process.env.CLAUDE_CLI_PATH, '/Users/spot/.local/bin/claude', '/usr/local/bin/claude']);
    case 'copilot':
      return firstExisting([process.env.COPILOT_CLI_PATH, '/usr/local/bin/copilot', '/Applications/copilot']);
    case 'pi':
      return firstExisting([process.env.PI_CLI_PATH, '/opt/homebrew/bin/pi', '/usr/local/bin/pi']);
    case 'opencode':
      return firstExisting([process.env.OPENCODE_CLI_PATH, join(homedir(), '.opencode', 'bin', 'opencode'), '/opt/homebrew/bin/opencode', '/usr/local/bin/opencode']);
  }
}

export const CLI_NOT_FOUND_MESSAGE: Record<AIProviderId, string> = {
  claude: 'Claude CLI not found',
  copilot: 'Copilot CLI not found',
  pi: 'Pi CLI not found',
  opencode: 'OpenCode CLI not found',
};

/** Has the user logged in to this CLI? (credential file present; no network) */
export function isLoggedIn(provider: AIProviderId): boolean {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  switch (provider) {
    case 'claude':
      try {
        const raw = JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8'));
        return !!raw.oauthAccount;
      } catch {
        return false;
      }
    case 'copilot':
      return true; // no cheap credential probe; presence of the binary is the signal
    case 'pi':
      return existsSync(join(home, '.pi', 'agent', 'auth.json'));
    case 'opencode':
      return existsSync(join(home, '.local', 'share', 'opencode', 'auth.json'));
  }
}

/** Build a clean env for spawning CLI (strip vars that prevent nesting) */
export function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_SESSION;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

/** Model ids go on a command line: refuse anything that could be read as a flag. */
function safeModel(model: unknown, fallback: string): string {
  return typeof model === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model) ? model : fallback;
}

// --- Invocation ------------------------------------------------------------

export interface BuildInput {
  provider: AIProviderId;
  model?: string;
  systemPrompt: string;
  fullPrompt: string;
  mcp: McpServerSpec;
}

export interface BuiltInvocation extends CliInvocation {
  /** Log line fragment describing the spawn */
  description: string;
}

export function buildInvocation(input: BuildInput): BuiltInvocation {
  const { provider, model, systemPrompt, fullPrompt, mcp } = input;
  const mcpConfig = JSON.stringify({ mcpServers: { devilbox: mcp } });

  switch (provider) {
    case 'claude': {
      const map: Record<string, string> = { haiku: 'haiku', sonnet: 'sonnet', opus: 'opus' };
      const cliModel = map[model ?? ''] || 'haiku';
      return {
        description: `Claude --model ${cliModel}`,
        env: cleanEnv(),
        args: [
          '--print', '--output-format', 'stream-json', '--verbose',
          '--model', cliModel,
          '--system-prompt', systemPrompt,
          '--mcp-config', mcpConfig,
          '--permission-mode', 'bypassPermissions',
          '--max-turns', '50',
          '--no-session-persistence',
          '-p', fullPrompt,
        ],
      };
    }
    case 'copilot': {
      const cliModel = safeModel(model, 'claude-sonnet-4.6');
      const isGptModel = cliModel.startsWith('gpt-');
      // Copilot has no --system-prompt flag: prepend context to the prompt
      const args = [
        '-p', `<system>\n${systemPrompt}\n</system>\n\n${fullPrompt}`,
        '--output-format', 'json', '--stream', 'on', '--silent',
        '--model', cliModel,
        '--disable-builtin-mcps',
      ];
      // Claude models handle 200+ tools; GPT models cap at 128 so skip MCP for them.
      if (!isGptModel) args.push('--additional-mcp-config', mcpConfig, '--allow-all-tools');
      return {
        description: `Copilot --model ${cliModel}${isGptModel ? ' (no MCP - GPT tool limit)' : ' (with MCP)'}`,
        env: cleanEnv(),
        // GPT models: spawn from /tmp to avoid .mcp.json auto-discovery
        cwd: isGptModel ? tmpdir() : undefined,
        args,
      };
    }
    case 'pi': {
      const cliModel = safeModel(model, 'anthropic/claude-haiku-4-5');
      // Pi reads MCP servers from <cwd>/.pi/mcp.json (trusted via --approve); there is no
      // per-run MCP flag, so each run gets its own throwaway project directory.
      const dir = mkdtempSync(join(tmpdir(), 'devilbox-pi-'));
      mkdirSync(join(dir, '.pi'));
      writeFileSync(join(dir, '.pi', 'mcp.json'), JSON.stringify({ mcpServers: { devilbox: mcp } }));
      return {
        description: `Pi --model ${cliModel}`,
        env: cleanEnv(),
        cwd: dir,
        args: [
          '-p', '--mode', 'json', '--no-session', '--approve',
          '--no-builtin-tools', '--no-context-files',
          '--model', cliModel,
          '--append-system-prompt', systemPrompt,
          '--', fullPrompt,
        ],
      };
    }
    case 'opencode': {
      const cliModel = safeModel(model, 'opencode/big-pickle');
      // OpenCode takes its config inline from the environment (no config file needed).
      const config = {
        mcp: {
          devilbox: {
            type: 'local',
            command: [mcp.command, ...mcp.args],
            environment: mcp.env,
            enabled: true,
          },
        },
      };
      return {
        description: `OpenCode --model ${cliModel}`,
        env: { ...cleanEnv(), OPENCODE_CONFIG_CONTENT: JSON.stringify(config) },
        // No system-prompt flag: prepend context like Copilot
        args: [
          'run', '--format', 'json', '--auto', '--model', cliModel,
          '--', `<system>\n${systemPrompt}\n</system>\n\n${fullPrompt}`,
        ],
      };
    }
  }
}

// --- Stream parsing --------------------------------------------------------

function joinContent(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => (c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : '')).join('');
  }
  return undefined;
}

/** Map one parsed JSON line from the CLI's stdout to zero or more browser events. */
export function parseEvent(provider: AIProviderId, event: any): AIStreamEvent[] {
  const out: AIStreamEvent[] = [];
  switch (provider) {
    case 'claude':
      // {"type":"assistant","subtype":"text","content":"token"}
      if (event.type === 'assistant' && event.subtype === 'text' && typeof event.content === 'string') {
        out.push({ type: 'text', content: event.content });
      }
      if (event.type === 'assistant' && event.subtype === 'tool_use') {
        out.push({ type: 'tool_use', tool: event.tool_name || event.name, input: event.input });
      }
      if (event.type === 'tool_result' || (event.type === 'system' && event.subtype === 'tool_output')) {
        out.push({ type: 'tool_result', tool: event.tool_name || event.name, result: event.content || event.output });
      }
      break;
    case 'copilot':
      // {"type":"assistant.message_delta","data":{"deltaContent":"token"}}
      if (event.type === 'assistant.message_delta' && event.data?.deltaContent) {
        out.push({ type: 'text', content: event.data.deltaContent });
      }
      if (event.type === 'assistant.tool_use' || event.type === 'tool_use') {
        out.push({ type: 'tool_use', tool: event.data?.toolName || event.tool, input: event.data?.input || event.input });
      }
      if (event.type === 'tool_result') {
        out.push({ type: 'tool_result', tool: event.data?.toolName, result: event.data?.content });
      }
      if (event.type === 'session.error') {
        out.push({ type: 'error', error: event.data?.message || 'Unknown Copilot error' });
      }
      break;
    case 'pi':
      // {"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"token"}}
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta'
        && typeof event.assistantMessageEvent.delta === 'string') {
        out.push({ type: 'text', content: event.assistantMessageEvent.delta });
      }
      if (event.type === 'tool_execution_start') {
        out.push({ type: 'tool_use', tool: event.toolName, input: event.args });
      }
      if (event.type === 'tool_execution_end') {
        out.push({ type: 'tool_result', tool: event.toolName, result: joinContent(event.result?.content) });
      }
      break;
    case 'opencode':
      // {"type":"text","part":{"type":"text","text":"whole message"}}
      if (event.type === 'text' && typeof event.part?.text === 'string') {
        out.push({ type: 'text', content: event.part.text });
      }
      // {"type":"tool_use","part":{"tool":"bash","state":{"status":"completed","input":{},"output":""}}}
      if (event.type === 'tool_use' && event.part) {
        out.push({ type: 'tool_use', tool: event.part.tool, input: event.part.state?.input });
        if (event.part.state?.status === 'completed' || event.part.state?.status === 'error') {
          out.push({ type: 'tool_result', tool: event.part.tool, result: event.part.state.output ?? event.part.state.error });
        }
      }
      if (event.type === 'error') {
        out.push({ type: 'error', error: event.error?.data?.message || event.error?.name || 'Unknown OpenCode error' });
      }
      break;
  }
  return out;
}
