/**
 * AI Chat Route — SSE endpoint that streams Claude responses.
 *
 * Spawns `claude` CLI as a subprocess with --print,
 * connected to the DEViLBOX MCP server so Claude can control the tracker.
 * Uses the user's existing Claude subscription (no API key needed).
 */

import { Router, type Request, type Response } from 'express';
import { spawn, type ChildProcess } from 'child_process';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { buildSystemPrompt } from '../ai/systemPrompt';

const router = Router();

// In-memory conversation history (max 10 conversations)
const conversations = new Map<string, Array<{ role: string; content: string }>>();
const MAX_CONVERSATIONS = 10;

// Track active Claude processes for cancellation
const activeProcesses = new Map<string, ChildProcess>();

// Path to the MCP server entry point
const MCP_SERVER_PATH = resolve(__dirname, '../mcp/index.ts');

/** Build a clean env for spawning claude CLI (strip vars that prevent nesting) */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_SESSION;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

// Find claude CLI
function findClaudeCli(): string | null {
  const candidates = [
    process.env.CLAUDE_CLI_PATH,
    '/Users/spot/.local/bin/claude',
    '/usr/local/bin/claude',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * GET /api/ai/status — Check if Claude CLI is available and authenticated
 */
router.get('/status', (_req: Request, res: Response) => {
  const claudePath = findClaudeCli();
  if (!claudePath) {
    return res.json({ available: false, error: 'Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code' });
  }

  // Lightweight check: Claude Code stores OAuth in ~/.claude.json
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const configPath = resolve(homeDir, '.claude.json');

  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      if (config.oauthAccount) {
        return res.json({ available: true });
      }
    }
  } catch {
    // Fall through
  }

  res.json({ available: false, error: 'Claude CLI not authenticated. Run `claude login` in terminal.' });
});

/**
 * POST /api/ai/chat — Stream AI responses via SSE
 *
 * Body: { prompt: string, context?: object, conversationId?: string, model?: string }
 */
router.post('/chat', (req: Request, res: Response) => {
  const { prompt, context, conversationId, model } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const MODEL_MAP: Record<string, string> = {
    haiku: 'haiku',
    sonnet: 'sonnet',
    opus: 'opus',
  };
  const cliModel = MODEL_MAP[model] || 'haiku';

  const claudePath = findClaudeCli();
  if (!claudePath) {
    return res.status(503).json({ error: 'Claude CLI not found' });
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

  // Build the full prompt (include recent history for context)
  const recentHistory = history.slice(-10);
  const fullPrompt = recentHistory.length > 1
    ? recentHistory.map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`).join('\n\n') + '\n\nRespond to the latest Human message above.'
    : prompt;

  // Build system prompt with tracker context
  const systemPrompt = buildSystemPrompt(context);

  // MCP config — claude spawns an MCP server subprocess that connects
  // to the existing WS relay (port 4003) started by Express
  const mcpConfig = JSON.stringify({
    mcpServers: {
      devilbox: {
        command: 'npx',
        args: ['tsx', MCP_SERVER_PATH],
        env: { PORT: String(process.env.PORT || 3001) },
      },
    },
  });

  const args = [
    '--print',
    '--model', cliModel,
    '--system-prompt', systemPrompt,
    '--mcp-config', mcpConfig,
    '--permission-mode', 'bypassPermissions',
    '--max-turns', '50',
    '--no-session-persistence',
    '-p', fullPrompt,
  ];

  console.log(`[AI] Spawning: claude --print --model ${cliModel} -p "${prompt.slice(0, 80)}"`);

  const child = spawn(claudePath, args, {
    env: cleanEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  console.log(`[AI] Process spawned: pid=${child.pid}`);

  activeProcesses.set(convId, child);

  // Send conversation ID to client
  res.write(`data: ${JSON.stringify({ type: 'init', conversationId: convId })}\n\n`);

  let assistantText = '';

  // Collect stdout — with --print, text arrives when response is complete
  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    console.log(`[AI] stdout (${text.length} chars)`);
    assistantText += text;
    res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
  });

  // Log stderr
  child.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) {
      console.error('[AI] stderr:', msg.slice(0, 500));
    }
  });

  child.on('close', (code) => {
    console.log(`[AI] Process exited: code=${code}, output=${assistantText.length} chars`);
    activeProcesses.delete(convId);

    // Save assistant response to history
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

  // Handle client disconnect
  req.on('close', () => {
    console.log(`[AI] Client disconnected, exitCode=${child.exitCode}`);
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
