/**
 * Drives the real POST /api/ai/chat handler (the entry point the frontend calls)
 * with each CLI replaced by a stub executable that prints that CLI's real
 * output format. Each stub records its argv + env to a sentinel file, so the
 * test proves the stub RAN and the parsed text reached the SSE response.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import aiRoutes from '../routes/ai';
import { setFreeProviderFetch } from './freeProvider';
import { resetModelCatalogue } from './freeModels';
import { resetModelCosts } from './modelCosts';

let dir: string;
let server: Server;
let base: string;

function stub(name: string, lines: object[]): string {
  const out = join(dir, `${name}.out.ndjson`);
  writeFileSync(out, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const script = join(dir, name);
  writeFileSync(script, [
    '#!/bin/sh',
    `echo "$@" > "${join(dir, name)}.argv"`,
    `echo "$OPENCODE_CONFIG_CONTENT" > "${join(dir, name)}.env"`,
    `[ -f .pi/mcp.json ] && cp .pi/mcp.json "${join(dir, name)}.mcp"`,
    `cat "${out}"`,
  ].join('\n'));
  chmodSync(script, 0o755);
  return script;
}

async function chat(provider: string, model?: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'say hi', provider, model }),
  });
  const body = await r.text();
  return body.split('\n\n').filter((b) => b.startsWith('data: ')).map((b) => JSON.parse(b.slice(6)));
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ai-route-test-'));
  process.env.PI_CLI_PATH = stub('pi', [
    { type: 'session', version: 3 },
    { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'hmm' } },
    { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hello ' } },
    { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'from pi' } },
    { type: 'tool_execution_start', toolName: 'bash', args: { command: 'echo hello' } },
    { type: 'tool_execution_end', toolName: 'bash', result: { content: [{ type: 'text', text: 'hello\n' }] } },
  ]);
  process.env.OPENCODE_CLI_PATH = stub('opencode', [
    { type: 'step_start', part: { type: 'step-start' } },
    { type: 'tool_use', part: { type: 'tool', tool: 'bash', state: { status: 'completed', input: { command: 'echo hello' }, output: 'hello\n' } } },
    { type: 'text', part: { type: 'text', text: 'Hello from opencode' } },
  ]);
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRoutes);
  await new Promise<void>((ok) => { server = app.listen(0, '127.0.0.1', ok); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => {
  server?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/ai/chat with stubbed CLIs', () => {
  it('pi: runs the CLI in json mode with the devilbox MCP config and streams the text deltas', async () => {
    const events = await chat('pi', 'anthropic/claude-sonnet-4-6');
    const argv = readFileSync(join(dir, 'pi.argv'), 'utf8'); // sentinel: stub ran
    expect(argv).toContain('--mode json');
    expect(argv).toContain('--model anthropic/claude-sonnet-4-6');
    expect(JSON.parse(readFileSync(join(dir, 'pi.mcp'), 'utf8')).mcpServers.devilbox.command).toBe('npx');
    expect(events.filter((e) => e.type === 'text').map((e) => e.content).join('')).toBe('Hello from pi');
    expect(events.find((e) => e.type === 'tool_use')).toMatchObject({ tool: 'bash', input: { command: 'echo hello' } });
    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({ tool: 'bash', result: 'hello\n' });
    expect(events[events.length - 1]).toMatchObject({ type: 'done', code: 0 });
  });

  it('opencode: runs the CLI with inline MCP config and streams the text part', async () => {
    const events = await chat('opencode', 'opencode/big-pickle');
    const argv = readFileSync(join(dir, 'opencode.argv'), 'utf8'); // sentinel: stub ran
    expect(argv).toContain('run --format json');
    expect(argv).toContain('--model opencode/big-pickle');
    expect(JSON.parse(readFileSync(join(dir, 'opencode.env'), 'utf8')).mcp.devilbox.type).toBe('local');
    expect(events.filter((e) => e.type === 'text').map((e) => e.content).join('')).toBe('Hello from opencode');
    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({ tool: 'bash', result: 'hello\n' });
    expect(events[events.length - 1]).toMatchObject({ type: 'done', code: 0 });
  });

  it('reports a missing CLI instead of spawning', async () => {
    process.env.PI_CLI_PATH = join(dir, 'does-not-exist');
    // findCli falls through to real install paths; only assert when none exists there
    if (!existsSync('/opt/homebrew/bin/pi') && !existsSync('/usr/local/bin/pi')) {
      const events = await chat('pi');
      expect(events.some((e) => e.type === 'error')).toBe(true);
    }
  });
});

/**
 * FA-14: the Free provider through the real POST /api/ai/chat route, with the
 * OpenRouter fetch stubbed. Proves the whole path ran: discovery, free-only
 * choice, the tool schema offered, a tool_call reaching the browser channel,
 * the browser's POST /api/ai/tool-result feeding the second round, the final
 * text, and which key was sent.
 */
describe('POST /api/ai/chat provider free (reachability)', () => {
  const calls: Array<{ url: string; auth: string | null; body: Record<string, unknown> | null }> = [];
  const MODELS = [
    { id: 'a/free-one:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], context_length: 8000 },
    { id: 'b/free-two:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], context_length: 32000 },
    { id: 'c/paid', pricing: { prompt: '0.001', completion: '0.002' }, supported_parameters: ['tools'], context_length: 4000 },
  ];
  let completions = 0;

  const stubFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
    calls.push({ url, auth: headers.get('authorization'), body });
    if (url.endsWith('/models')) return new Response(JSON.stringify({ data: MODELS }), { status: 200 });
    completions++;
    const messages = (body?.messages ?? []) as Array<{ role: string }>;
    const answered = messages.some((m) => m.role === 'tool');
    const message = answered
      ? { content: 'The song is Test Song.' }
      : { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_song_info', arguments: '{}' } }] };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }] }), { status: 200 });
  };

  /** Run a chat like the browser does: read the SSE, answer each tool_call by POSTing the result. */
  async function freeChat(headers: Record<string, string> = {}): Promise<Array<Record<string, unknown>>> {
    const r = await fetch(`${base}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ prompt: 'what song is loaded?', provider: 'free', conversationId: `conv-${Math.random()}` }),
    });
    const events: Array<Record<string, unknown>> = [];
    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let conversationId = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts.filter((x) => x.startsWith('data: '))) {
        const ev = JSON.parse(part.slice(6)) as Record<string, unknown>;
        events.push(ev);
        if (ev.type === 'init') conversationId = String(ev.conversationId);
        if (ev.type === 'tool_call') {
          await fetch(`${base}/api/ai/tool-result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId, callId: ev.callId, result: { title: 'Test Song' } }),
          });
        }
      }
    }
    return events;
  }

  beforeAll(() => {
    process.env.DB_DIR = dir;
    setFreeProviderFetch(stubFetch);
  });
  afterAll(() => {
    setFreeProviderFetch(null);
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.DB_DIR;
  });
  const reset = () => { calls.length = 0; completions = 0; resetModelCatalogue(); resetModelCosts(); };

  it('no key anywhere: one error telling the visitor to add a key in Settings, and no network call', async () => {
    reset();
    delete process.env.OPENROUTER_API_KEY;
    const events = await freeChat();
    expect(calls).toHaveLength(0);
    expect(events.find((e) => e.type === 'error')).toMatchObject({ error: expect.stringContaining('Settings') });
  });

  it('server key: free model chosen, tool_call round trip through the browser channel, final text', async () => {
    reset();
    process.env.OPENROUTER_API_KEY = 'server-key';
    const events = await freeChat();
    const posts = calls.filter((c) => c.url.endsWith('/chat/completions') && (c.body?.max_tokens as number) > 5);
    expect(completions).toBeGreaterThanOrEqual(2); // sentinel: the stubbed OpenRouter ran for both rounds
    expect(posts[0].auth).toBe('Bearer server-key');
    expect(posts[0].body?.model).toBe('a/free-one:free'); // free, smaller context first; never c/paid
    expect(calls.some((c) => c.body?.model === 'c/paid')).toBe(false);
    const offered = (posts[0].body?.tools as Array<{ function: { name: string } }>).map((t) => t.function.name);
    expect(offered).toContain('get_song_info');
    expect(offered).not.toContain('load_file');
    expect(events.find((e) => e.type === 'tool_call')).toMatchObject({ method: 'get_song_info' });
    const second = posts[1].body?.messages as Array<{ role: string; content: string }>;
    expect(second.find((m) => m.role === 'tool')?.content).toContain('Test Song'); // the browser's answer reached the model
    expect(events.filter((e) => e.type === 'text').map((e) => e.content).join('')).toBe('The song is Test Song.');
    expect(events[events.length - 1]).toMatchObject({ type: 'done', code: 0 });
  });

  it('visitor key header: that key is used for every OpenRouter call and the server key is never sent', async () => {
    reset();
    process.env.OPENROUTER_API_KEY = 'server-key';
    const events = await freeChat({ 'X-OpenRouter-Key': 'visitor-key' });
    expect(calls.length).toBeGreaterThanOrEqual(3); // models + two rounds
    expect(calls.every((c) => c.auth === 'Bearer visitor-key')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('visitor-key');
    expect(events.filter((e) => e.type === 'text').map((e) => e.content).join('')).toBe('The song is Test Song.');
  });
});
