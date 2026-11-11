/**
 * Drives the real POST /api/ai/chat handler (the entry point the frontend calls)
 * with each CLI replaced by a stub executable that prints that CLI's real
 * output format. Each stub records its argv + env to a sentinel file, so the
 * test proves the stub RAN and the parsed text reached the SSE response.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import aiRoutes from '../routes/ai';
import { setFreeProviderFetch } from './freeProvider';
import { resetModelCatalogue } from './freeModels';
import { resetModelCosts } from './modelCosts';
import { resetAgentHistory, resetAgentModelCache } from './anthropicAgent';

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
    if (pathOf(url).endsWith('/models')) return new Response(JSON.stringify({ data: MODELS }), { status: 200 });
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

/** The Anthropic model list as the SDK pages it: two chat models with display names. */
const ANTHROPIC_MODELS = {
  data: [
    { type: 'model', id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', max_tokens: 64000 },
    { type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', max_tokens: 64000 },
  ],
  has_more: false, first_id: 'claude-sonnet-5-5', last_id: 'claude-haiku-5-5',
};

/** The model list as Anthropic sends it: the SDK parses a body as JSON only when the content type says so. */
function anthropicModelList(): Response {
  return new Response(JSON.stringify(ANTHROPIC_MODELS), { status: 200, headers: { 'content-type': 'application/json' } });
}

type SseBlock =
  | { type: 'text'; deltas: string[] }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

/** One streamed Messages API reply, in the vendor's own server-sent event format. */
function anthropicSse(blocks: SseBlock[], stopReason: string): Response {
  const events: Array<Record<string, unknown>> = [{
    type: 'message_start',
    message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } },
  }];
  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      for (const text of block.deltas) events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } });
    } else {
      events.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
    }
    events.push({ type: 'content_block_stop', index });
  });
  events.push({ type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 20 } });
  events.push({ type: 'message_stop' });
  const text = events.map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** How many tool results the request body carries: the round the stubbed model is on. */
function toolResultCount(body: Record<string, unknown> | null): number {
  return (JSON.stringify(body?.messages ?? []).match(/"type":"tool_result"/g) ?? []).length;
}

/** The path of a vendor URL without its query: the Anthropic SDK lists models at /v1/models?limit=100. */
function pathOf(url: string): string {
  return new URL(url).pathname;
}

describe('POST /api/ai/chat with a visitor Anthropic or OpenAI key (FA-14)', () => {
  const calls: Array<{ url: string; headers: Headers; body: Record<string, unknown> | null }> = [];

  const stubVendorFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
    calls.push({ url, headers, body });
    if (pathOf(url).endsWith('/models')) {
      if (url.includes('anthropic')) return anthropicModelList();
      return new Response(JSON.stringify({ data: [{ id: 'gpt-5-mini' }, { id: 'whisper-1' }] }), { status: 200 });
    }
    if (url.includes('anthropic')) {
      const answered = toolResultCount(body) > 0;
      return answered
        ? anthropicSse([{ type: 'text', deltas: ['The song is ', 'Test Song.'] }], 'end_turn')
        : anthropicSse([{ type: 'tool_use', id: 'u1', name: 'get_song_info', input: {} }], 'tool_use');
    }
    const answered = ((body?.messages ?? []) as Array<{ role: string }>).some((m) => m.role === 'tool');
    const message = answered
      ? { content: 'The song is Test Song.' }
      : { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_song_info', arguments: '{}' } }] };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }] }), { status: 200 });
  };

  async function vendorChat(provider: string, headers: Record<string, string> = {}): Promise<Array<Record<string, unknown>>> {
    const r = await fetch(`${base}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ prompt: 'what song is loaded?', provider, conversationId: `conv-${Math.random()}` }),
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

  beforeAll(() => { setFreeProviderFetch(stubVendorFetch); });
  afterAll(() => { setFreeProviderFetch(null); });
  beforeEach(() => { resetAgentModelCache(); resetAgentHistory(); });

  it.each([
    // The Anthropic SDK sends the key as a bearer token
    ['anthropic', 'x-anthropic-key', 'sk-ant-test', 'authorization', 'Bearer sk-ant-test', 'messages'],
    ['openai', 'x-openai-key', 'sk-test', 'authorization', 'Bearer sk-test', 'chat/completions'],
  ])('%s: the visitor key reaches the models and chat URLs, tool_call round trip, final text, key in no event', async (provider, header, key, sent, sentValue, chatPath) => {
    calls.length = 0;
    const events = await vendorChat(provider, { [header]: key });
    const models = calls.filter((c) => pathOf(c.url).endsWith('/models'));
    const chats = calls.filter((c) => pathOf(c.url).endsWith(chatPath));
    expect(models).toHaveLength(1); // sentinel: the stubbed vendor ran
    expect(chats.length).toBeGreaterThanOrEqual(2);
    expect([...models, ...chats].map((c) => `${pathOf(c.url)} ${c.headers.get(sent)}`)).toEqual([...models, ...chats].map((c) => `${pathOf(c.url)} ${sentValue}`));
    expect(events.find((e) => e.type === 'tool_call')).toMatchObject({ method: 'get_song_info' });
    expect(events.filter((e) => e.type === 'text').map((e) => e.content).join('')).toBe('The song is Test Song.');
    expect(events[events.length - 1]).toMatchObject({ type: 'done', code: 0 });
    expect(JSON.stringify(events)).not.toContain(key);
  });

  it.each(['anthropic', 'openai'])('%s with no key: one error event and zero fetches', async (provider) => {
    calls.length = 0;
    const events = await vendorChat(provider);
    expect(calls).toHaveLength(0);
    expect(events.filter((e) => e.type === 'error')).toHaveLength(1);
    expect(events.find((e) => e.type === 'error')).toMatchObject({ error: expect.stringContaining('Settings') });
  });

  it('a rejected key surfaces the vendor message with the key scrubbed', async () => {
    setFreeProviderFetch(async () => new Response(JSON.stringify({ error: { message: 'invalid x-api-key sk-ant-bad' } }), { status: 401 }));
    const events = await vendorChat('anthropic', { 'x-anthropic-key': 'sk-ant-bad' });
    setFreeProviderFetch(stubVendorFetch);
    const err = events.find((e) => e.type === 'error');
    expect(err).toMatchObject({ error: expect.stringContaining('Anthropic key was rejected') });
    expect(JSON.stringify(events)).not.toContain('sk-ant-bad');
  });

  it('GET /status reports key presence as booleans only', async () => {
    const r = await fetch(`${base}/api/ai/status`, { headers: { 'x-openai-key': 'sk-secret' } });
    const text = await r.text();
    expect(JSON.parse(text).vendors).toEqual({ anthropic: { keyPresent: false }, openai: { keyPresent: true } });
    expect(text).not.toContain('sk-secret');
  });

  it('POST /check-key: ok returns the model count; a 401 returns kind auth and never the key', async () => {
    const check = async (vendor: string, header: string, key: string) => {
      const r = await fetch(`${base}/api/ai/check-key`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', [header]: key }, body: JSON.stringify({ vendor }),
      });
      return r.text();
    };
    expect(JSON.parse(await check('anthropic', 'x-anthropic-key', 'sk-ant-test'))).toEqual({ ok: true, models: 2 });
    setFreeProviderFetch(async () => new Response(JSON.stringify({ error: { message: 'bad sk-ant-nope' } }), { status: 401 }));
    const bad = await check('anthropic', 'x-anthropic-key', 'sk-ant-nope');
    setFreeProviderFetch(stubVendorFetch);
    expect(JSON.parse(bad)).toMatchObject({ ok: false, kind: 'auth' });
    expect(bad).not.toContain('sk-ant-nope');
  });
  it('anthropic composes past three tool rounds: every call runs, text streams in pieces, the composer tools are offered and batch is not', async () => {
    const ROUNDS = 6;
    calls.length = 0;
    setFreeProviderFetch(async (input, init) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
      calls.push({ url, headers: new Headers(init?.headers), body });
      if (pathOf(url).endsWith('/models')) return anthropicModelList();
      const round = toolResultCount(body);
      return round < ROUNDS
        ? anthropicSse([{ type: 'text', deltas: [`Step ${round}.`] }, { type: 'tool_use', id: `u${round}`, name: 'get_song_info', input: {} }], 'tool_use')
        : anthropicSse([{ type: 'text', deltas: ['All ', 'done.'] }], 'end_turn');
    });
    const events = await vendorChat('anthropic', { 'x-anthropic-key': 'sk-ant-test' });
    setFreeProviderFetch(stubVendorFetch);

    const chats = calls.filter((c) => pathOf(c.url).endsWith('messages'));
    expect(chats).toHaveLength(ROUNDS + 1); // sentinel: the streaming loop ran every round
    expect(events.filter((e) => e.type === 'tool_call')).toHaveLength(ROUNDS);
    expect(events.filter((e) => e.type === 'tool_use')).toHaveLength(ROUNDS);
    const results = events.filter((e) => e.type === 'tool_result');
    expect(results).toHaveLength(ROUNDS);
    expect(results.every((e) => e.ok === true && String(e.result).includes('Test Song'))).toBe(true);
    const pieces = events.filter((e) => e.type === 'text').map((e) => String(e.content));
    expect(pieces.slice(-2)).toEqual(['\n\nAll ', 'done.']);
    expect(events.find((e) => e.type === 'model')).toMatchObject({ model: 'claude-sonnet-5-5' });
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events[events.length - 1]).toMatchObject({ type: 'done', code: 0 });

    const first = chats[0].body as { stream?: boolean; tools: Array<{ name: string }>; system: Array<{ cache_control?: unknown }> };
    expect(first.stream).toBe(true);
    const offered = first.tools.map((t) => t.name);
    expect(offered).toEqual(expect.arrayContaining(['add_pattern', 'create_instrument', 'write_note_sequence', 'set_pattern_order']));
    for (const banned of ['batch', 'new_song', 'load_file', 'evaluate_script', 'hard_reload']) expect(offered).not.toContain(banned);
    expect(first.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(JSON.stringify(events)).not.toContain('sk-ant-test');
  });

  it('anthropic uses the model the visitor picked, and falls back to the preferred one when the pick is not listed', async () => {
    const ask = async (model: string) => {
      calls.length = 0;
      const r = await fetch(`${base}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-anthropic-key': 'sk-ant-test' },
        body: JSON.stringify({ prompt: 'hi', provider: 'anthropic', model }),
      });
      await r.text();
      return (calls.find((c) => pathOf(c.url).endsWith('messages'))?.body as { model: string }).model;
    };
    setFreeProviderFetch(async (input, init) => {
      const url = String(input);
      calls.push({ url, headers: new Headers(init?.headers), body: typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null });
      if (pathOf(url).endsWith('/models')) return anthropicModelList();
      return anthropicSse([{ type: 'text', deltas: ['Hi.'] }], 'end_turn');
    });
    expect(await ask('claude-haiku-5-5')).toBe('claude-haiku-5-5');
    expect(await ask('claude-nonexistent')).toBe('claude-sonnet-5-5');
    setFreeProviderFetch(stubVendorFetch);
  });

  it('a refusal ends the chat with one error and runs no tool', async () => {
    setFreeProviderFetch(async (input) => (pathOf(String(input)).endsWith('/models')
      ? anthropicModelList()
      : anthropicSse([{ type: 'tool_use', id: 'u1', name: 'clear_pattern', input: {} }], 'refusal')));
    const events = await vendorChat('anthropic', { 'x-anthropic-key': 'sk-ant-test' });
    setFreeProviderFetch(stubVendorFetch);
    expect(events.filter((e) => e.type === 'tool_call')).toHaveLength(0);
    expect(events.find((e) => e.type === 'error')).toMatchObject({ error: 'The model declined this request.' });
  });

  it('POST /models lists the key\'s models with labels, and never returns the key', async () => {
    const list = async (vendor: string, headers: Record<string, string>) => {
      const r = await fetch(`${base}/api/ai/models`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ vendor }),
      });
      return { status: r.status, text: await r.text() };
    };
    const ok = await list('anthropic', { 'x-anthropic-key': 'sk-ant-test' });
    expect(JSON.parse(ok.text)).toEqual({
      ok: true,
      models: [{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' }, { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' }],
    });
    expect(ok.text).not.toContain('sk-ant-test');

    expect(JSON.parse((await list('anthropic', {})).text)).toMatchObject({ ok: false, kind: 'auth' });
    const unknown = await list('nobody', { 'x-anthropic-key': 'sk-ant-test' });
    expect(unknown.status).toBe(400);
    expect(JSON.parse(unknown.text)).toMatchObject({ ok: false, kind: 'bad-request' });

    resetAgentModelCache();
    setFreeProviderFetch(async () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key sk-ant-nope' } }), { status: 401 }));
    const bad = await list('anthropic', { 'x-anthropic-key': 'sk-ant-nope' });
    setFreeProviderFetch(stubVendorFetch);
    expect(JSON.parse(bad.text)).toMatchObject({ ok: false });
    expect(bad.text).not.toContain('sk-ant-nope');
  });
});
