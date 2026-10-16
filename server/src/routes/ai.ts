/**
 * AI Chat Route — SSE endpoint that streams AI responses.
 *
 * Supports four providers (see ../ai/cliProviders.ts): Claude, Copilot, Pi, OpenCode.
 *
 * Uses the user's existing CLI auth (no API key needed).
 */

import { Router, type Request, type Response } from 'express';
import { spawn, type ChildProcess } from 'child_process';
import { resolve } from 'path';
import { buildSystemPrompt } from '../ai/systemPrompt';
import {
  AI_PROVIDER_IDS, CLI_NOT_FOUND_MESSAGE, buildInvocation, findCli, isLoggedIn, parseEvent,
  type AIProviderId,
} from '../ai/cliProviders';

const router = Router();

// In-memory conversation history (max 10 conversations)
const conversations = new Map<string, Array<{ role: string; content: string }>>();
const MAX_CONVERSATIONS = 10;

// Track active processes for cancellation
const activeProcesses = new Map<string, ChildProcess>();

// Path to the MCP server entry point
const MCP_SERVER_PATH = resolve(__dirname, '../mcp/index.ts');

/**
 * GET /api/ai/status — Check if AI CLIs are available
 */
router.get('/status', (_req: Request, res: Response) => {
  const providers: Record<string, { available: boolean; path: string | null }> = {};
  for (const id of AI_PROVIDER_IDS) {
    const path = findCli(id);
    providers[id] = { available: !!path && isLoggedIn(id), path };
  }

  if (AI_PROVIDER_IDS.every((id) => !providers[id].path)) {
    return res.json({ available: false, error: 'No AI CLI found. Install Claude, Copilot, Pi or OpenCode.' });
  }

  res.json({ available: true, providers });
});

/**
 * POST /api/ai/chat — Stream AI responses via SSE
 *
 * Body: { prompt, context?, conversationId?, provider?, model? }
 */
router.post('/chat', (req: Request, res: Response) => {
  const { prompt, context, conversationId, provider = 'copilot', model } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const convId = conversationId || crypto.randomUUID();

  // Build conversation history
  let history = conversations.get(convId) || [];
  history.push({ role: 'user', content: prompt });

  const recentHistory = history.slice(-10);
  const fullPrompt = recentHistory.length > 1
    ? recentHistory.map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`).join('\n\n') + '\n\nRespond to the latest Human message above.'
    : prompt;

  const systemPrompt = buildSystemPrompt(context);

  const providerId: AIProviderId = (AI_PROVIDER_IDS as string[]).includes(provider) ? provider : 'copilot';
  const cliPath = findCli(providerId);
  if (!cliPath) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: CLI_NOT_FOUND_MESSAGE[providerId] })}\n\n`);
    res.end();
    return;
  }

  const invocation = buildInvocation({
    provider: providerId,
    model,
    systemPrompt,
    fullPrompt,
    mcp: { command: 'npx', args: ['tsx', MCP_SERVER_PATH], env: { PORT: String(process.env.PORT || 3001) } },
  });

  console.log(`[AI] Spawning ${invocation.description} -p "${prompt.slice(0, 80)}"`);
  const child: ChildProcess = spawn(cliPath, invocation.args, {
    env: invocation.env,
    cwd: invocation.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  console.log(`[AI] Process spawned: pid=${child.pid}, provider=${providerId}`);
  activeProcesses.set(convId, child);

  // Send conversation ID to client
  res.write(`data: ${JSON.stringify({ type: 'init', conversationId: convId })}\n\n`);

  let assistantText = '';
  let buffer = '';

  // Parse NDJSON stream - every provider emits JSON lines in its own shape
  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        continue; // Non-JSON line, ignore
      }
      for (const out of parseEvent(providerId, event)) {
        if (out.type === 'text') assistantText += out.content;
        if (out.type === 'error') console.error(`[AI] ${providerId} error: ${out.error}`);
        res.write(`data: ${JSON.stringify(out)}\n\n`);
      }
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) console.error(`[AI] stderr (${providerId}):`, msg.slice(0, 500));
  });

  child.on('close', (code) => {
    console.log(`[AI] Process exited: code=${code}, provider=${providerId}, output=${assistantText.length} chars`);
    activeProcesses.delete(convId);

    if (assistantText) {
      history.push({ role: 'assistant', content: assistantText });
      if (conversations.size >= MAX_CONVERSATIONS && !conversations.has(convId)) {
        const oldest = conversations.keys().next().value;
        if (oldest) conversations.delete(oldest);
      }
      conversations.set(convId, history);
    }

    res.write(`data: ${JSON.stringify({ type: 'done', code })}\n\n`);
    res.end();
  });

  child.on('error', (err) => {
    activeProcesses.delete(convId);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  });

  // The response closing means the browser went away. (req 'close' also fires as soon as
  // the request body has been read, which would kill the CLI right after spawning.)
  res.on('close', () => {
    console.log(`[AI] Client disconnected, provider=${providerId}, exitCode=${child.exitCode}`);
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      activeProcesses.delete(convId);
    }
  });
});

/**
 * POST /api/ai/stop — Stop a running AI conversation
 */
router.post('/stop', (req: Request, res: Response) => {
  const { conversationId } = req.body;
  const child = activeProcesses.get(conversationId);
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    activeProcesses.delete(conversationId);
    res.json({ stopped: true });
  } else {
    res.json({ stopped: false, reason: 'No active process' });
  }
});

export default router;
