/**
 * AI Chat Route — SSE endpoint that streams AI responses.
 *
 * Supports two providers:
 * - Claude CLI: `--output-format stream-json --verbose`
 * - Copilot CLI: `--output-format json --stream on --silent`
 *
 * Uses the user's existing CLI auth (no API key needed).
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

// Track active processes for cancellation
const activeProcesses = new Map<string, ChildProcess>();

// Path to the MCP server entry point
const MCP_SERVER_PATH = resolve(__dirname, '../mcp/index.ts');

/** Build a clean env for spawning CLI (strip vars that prevent nesting) */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_SESSION;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

// Find CLI paths
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

function findCopilotCli(): string | null {
  const candidates = [
    process.env.COPILOT_CLI_PATH,
    '/usr/local/bin/copilot',
    '/Applications/copilot',
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * GET /api/ai/status — Check if AI CLIs are available
 */
router.get('/status', (_req: Request, res: Response) => {
  const claudePath = findClaudeCli();
  const copilotPath = findCopilotCli();

  if (!claudePath && !copilotPath) {
    return res.json({ available: false, error: 'No AI CLI found. Install Claude CLI or GitHub Copilot CLI.' });
  }

  // Check Claude auth
  let claudeAvailable = false;
  if (claudePath) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const configPath = resolve(homeDir, '.claude.json');
    try {
      if (existsSync(configPath)) {
        const raw = readFileSync(configPath, 'utf8');
        const config = JSON.parse(raw);
        if (config.oauthAccount) claudeAvailable = true;
      }
    } catch { /* ignore */ }
  }

  res.json({
    available: true,
    providers: {
      claude: { available: claudeAvailable, path: claudePath },
      copilot: { available: !!copilotPath, path: copilotPath },
    },
  });
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

  // MCP config for both CLIs
  const mcpConfig = JSON.stringify({
    mcpServers: {
      devilbox: {
        command: 'npx',
        args: ['tsx', MCP_SERVER_PATH],
        env: { PORT: String(process.env.PORT || 3001) },
      },
    },
  });

  let child: ChildProcess;

  if (provider === 'claude') {
    const claudePath = findClaudeCli();
    if (!claudePath) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Claude CLI not found' })}\n\n`);
      res.end();
      return;
    }

    const CLAUDE_MODEL_MAP: Record<string, string> = {
      haiku: 'haiku', sonnet: 'sonnet', opus: 'opus',
    };
    const cliModel = CLAUDE_MODEL_MAP[model] || 'haiku';

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', cliModel,
      '--system-prompt', systemPrompt,
      '--mcp-config', mcpConfig,
      '--permission-mode', 'bypassPermissions',
      '--max-turns', '50',
      '--no-session-persistence',
      '-p', fullPrompt,
    ];

    console.log(`[AI] Spawning Claude --model ${cliModel} -p "${prompt.slice(0, 80)}"`);
    child = spawn(claudePath, args, { env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });

  } else {
    // Copilot CLI
    const copilotPath = findCopilotCli();
    if (!copilotPath) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Copilot CLI not found' })}\n\n`);
      res.end();
      return;
    }

    const cliModel = model || 'claude-sonnet-4.6';
    const isGptModel = cliModel.startsWith('gpt-');

    // Copilot has no --system-prompt flag — prepend context to the prompt
    const copilotPrompt = `<system>\n${systemPrompt}\n</system>\n\n${fullPrompt}`;

    const args = [
      '-p', copilotPrompt,
      '--output-format', 'json',
      '--stream', 'on',
      '--silent',
      '--model', cliModel,
      '--disable-builtin-mcps',
    ];

    // Claude models handle 200+ tools fine — give them full MCP access.
    // GPT models have a 128 tool limit — skip MCP tools, rely on system prompt context.
    if (!isGptModel) {
      args.push('--additional-mcp-config', mcpConfig, '--allow-all-tools');
    }

    console.log(`[AI] Spawning Copilot --model ${cliModel}${isGptModel ? ' (no MCP — GPT tool limit)' : ' (with MCP)'} -p "${prompt.slice(0, 80)}"`);
    // GPT models: spawn from /tmp to avoid .mcp.json auto-discovery
    child = spawn(copilotPath, args, {
      env: cleanEnv(),
      cwd: isGptModel ? '/tmp' : undefined,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  console.log(`[AI] Process spawned: pid=${child.pid}, provider=${provider}`);
  activeProcesses.set(convId, child);

  // Send conversation ID to client
  res.write(`data: ${JSON.stringify({ type: 'init', conversationId: convId })}\n\n`);

  let assistantText = '';
  let buffer = '';

  // Parse NDJSON stream — both providers emit JSON lines, different shapes
  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);

        if (provider === 'claude') {
          // Claude: {"type":"assistant","subtype":"text","content":"token"}
          if (event.type === 'assistant' && event.subtype === 'text' && typeof event.content === 'string') {
            assistantText += event.content;
            res.write(`data: ${JSON.stringify({ type: 'text', content: event.content })}\n\n`);
          }
          // Tool use
          if (event.type === 'assistant' && event.subtype === 'tool_use') {
            res.write(`data: ${JSON.stringify({ type: 'tool_use', tool: event.tool_name || event.name, input: event.input })}\n\n`);
          }
          // Tool result
          if (event.type === 'tool_result' || (event.type === 'system' && event.subtype === 'tool_output')) {
            res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: event.tool_name || event.name, result: event.content || event.output })}\n\n`);
          }
        } else {
          // Copilot: {"type":"assistant.message_delta","data":{"deltaContent":"token"}}
          if (event.type === 'assistant.message_delta' && event.data?.deltaContent) {
            assistantText += event.data.deltaContent;
            res.write(`data: ${JSON.stringify({ type: 'text', content: event.data.deltaContent })}\n\n`);
          }
          // Tool use
          if (event.type === 'assistant.tool_use' || event.type === 'tool_use') {
            res.write(`data: ${JSON.stringify({ type: 'tool_use', tool: event.data?.toolName || event.tool, input: event.data?.input || event.input })}\n\n`);
          }
          // Tool result
          if (event.type === 'tool_result') {
            res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: event.data?.toolName, result: event.data?.content })}\n\n`);
          }
          // Session error (e.g. too many tools for model)
          if (event.type === 'session.error') {
            const errMsg = event.data?.message || 'Unknown Copilot error';
            console.error(`[AI] Copilot session error: ${errMsg}`);
            res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
          }
        }
      } catch {
        // Non-JSON line, ignore
      }
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) console.error(`[AI] stderr (${provider}):`, msg.slice(0, 500));
  });

  child.on('close', (code) => {
    console.log(`[AI] Process exited: code=${code}, provider=${provider}, output=${assistantText.length} chars`);
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

  req.on('close', () => {
    console.log(`[AI] Client disconnected, provider=${provider}, exitCode=${child.exitCode}`);
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
