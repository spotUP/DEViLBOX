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
