/**
 * The agent that runs on a visitor's own Anthropic key: a streaming tool loop
 * that keeps going until the model says it is finished, so one request can
 * build a whole song. The Free and OpenAI paths stay on the short
 * askWithTools loop (toolLoop.ts); this one differs on purpose:
 *
 *  - text streams to the browser as it is written, and every tool call and
 *    result is shown, so a long job is never a silent wait;
 *  - the loop ends on the model's stop reason, not after a fixed few rounds;
 *  - the composer tool list (patterns, order, instruments, bulk notes);
 *  - the tool turns of earlier requests in the same conversation are kept, so
 *    "now add a bridge" continues from what was built;
 *  - the system prompt and tool block are prompt-cached.
 *
 * The key is used for this request only, never stored or logged, never part
 * of a cache key, and scrubbed from every message that leaves.
 */
import Anthropic from '@anthropic-ai/sdk';
import { COMPOSER_TOOL_ALLOWLIST, MAX_COMPOSER_TOOLS, createFreeToolset } from './freeToolset';
import type { ChatTurn } from './toolLoop';
import { VENDORS, pickModel } from './vendors';
import { providerFetch, scrub } from './vendorPost';
import type { BrowserCaller } from '../mcp/mcpServer';

export const MAX_AGENT_ROUNDS = 80;
export const AGENT_DEADLINE_MS = 15 * 60 * 1000;
const MODEL_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_OUTPUT_TOKENS = 32000;
const FALLBACK_OUTPUT_TOKENS = 16000;
/** What the model reads of one tool result; a full pattern dump can be far larger. */
const MODEL_RESULT_CHARS = 24000;
/** What the chat panel is sent of one tool result. */
const UI_RESULT_CHARS = 4000;
const MAX_TRUNCATION_RECOVERIES = 2;
const MAX_NATIVE_CONVERSATIONS = 20;
const MAX_NATIVE_CHARS = 600_000;

export interface AgentModel {
  id: string;
  label: string;
  maxTokens: number | null;
  adaptiveThinking: boolean;
}

// One list for every visitor: the catalog is public, and keying it by a
// visitor key would keep that key in memory.
let modelCache: { at: number; models: AgentModel[] } | null = null;
export function resetAgentModelCache(): void { modelCache = null; }

interface NativeConversation { model: string; messages: Anthropic.MessageParam[] }
const nativeHistory = new Map<string, NativeConversation>();
export function resetAgentHistory(): void { nativeHistory.clear(); }

function makeClient(key: string): Anthropic {
  return new Anthropic({ apiKey: key, fetch: providerFetch, maxRetries: 2 });
}

/** A message safe to send to the browser: the vendor's own wording, key scrubbed. */
export function agentErrorMessage(e: unknown, key: string): string {
  if (e instanceof Anthropic.APIError && typeof e.status === 'number') {
    return scrub(VENDORS.anthropic.adapter.mapError(e.status, e.error).message, key);
  }
  return 'Could not reach Anthropic';
}

export async function listAgentModels(key: string, signal?: AbortSignal): Promise<AgentModel[]> {
  if (modelCache && Date.now() - modelCache.at < MODEL_CACHE_TTL_MS) return modelCache.models;
  const models: AgentModel[] = [];
  for await (const m of makeClient(key).models.list({ limit: 100 }, { signal })) {
    models.push({
      id: m.id,
      label: m.display_name || m.id,
      maxTokens: m.max_tokens ?? null,
      adaptiveThinking: m.capabilities?.thinking?.types?.adaptive?.supported === true,
    });
  }
  if (models.length > 0) modelCache = { at: Date.now(), models };
  return models;
}

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}\n[truncated: ${text.length - max} more characters. Ask for a smaller range.]`;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isPlainUserText = (m: Anthropic.MessageParam): boolean => m.role === 'user' && typeof m.content === 'string';

/** Text turns as API messages: must start with a user turn and alternate. */
function fromTextHistory(history: ChatTurn[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const turn of history) {
    if (!turn.content) continue;
    const last = out[out.length - 1];
    if (!last && turn.role !== 'user') continue;
    if (last && last.role === turn.role) last.content = `${last.content as string}\n\n${turn.content}`;
    else out.push({ role: turn.role, content: turn.content });
  }
  return out;
}

/** Drop whole earliest requests (each starts at a plain user text) until the conversation fits. */
function trimMessages(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  let size = JSON.stringify(messages).length;
  let start = 0;
  while (size > MAX_NATIVE_CHARS) {
    let next = -1;
    for (let i = start + 1; i < messages.length; i++) {
      if (isPlainUserText(messages[i])) { next = i; break; }
    }
    if (next < 0) break;
    size -= JSON.stringify(messages.slice(start, next)).length;
    start = next;
  }
  return start === 0 ? messages : messages.slice(start);
}

function storeHistory(convId: string | undefined, model: string, messages: Anthropic.MessageParam[]): void {
  if (!convId) return;
  nativeHistory.delete(convId);
  nativeHistory.set(convId, { model, messages: trimMessages(messages) });
  while (nativeHistory.size > MAX_NATIVE_CONVERSATIONS) {
    const oldest = nativeHistory.keys().next().value;
    if (oldest === undefined) break;
    nativeHistory.delete(oldest);
  }
}

export interface AnthropicAgentOptions {
  /** Static prompt: the cached prefix. */
  system: string;
  /** Changes every request; sent as a second, uncached system block. */
  trackerState?: string;
  /** Text turns, the last one being this request's prompt. */
  history: ChatTurn[];
  conversationId?: string;
  visitorKey: string;
  requestedModel?: string;
  emit: (event: Record<string, unknown>) => void;
  callBrowser: BrowserCaller;
  signal?: AbortSignal;
  deadlineMs?: number;
  maxRounds?: number;
}

export async function runAnthropicAgent(opts: AnthropicAgentOptions): Promise<{ text: string | null; model: string | null }> {
  const key = opts.visitorKey;
  const none = { text: null, model: null };
  const timeout = AbortSignal.timeout(opts.deadlineMs ?? AGENT_DEADLINE_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const stopped = (): boolean => opts.signal?.aborted === true;
  const fail = (message: string): { text: null; model: null } => {
    opts.emit({ type: 'error', error: scrub(message, key) });
    return none;
  };

  let catalog: AgentModel[];
  try {
    catalog = await listAgentModels(key, signal);
  } catch (e) {
    if (stopped()) return none;
    return fail(agentErrorMessage(e, key));
  }
  const modelId = pickModel(catalog.map((m) => m.id), VENDORS.anthropic.preferredModels, opts.requestedModel);
  if (!modelId) return fail('Anthropic lists no model this key can chat with.');
  const info = catalog.find((m) => m.id === modelId);
  opts.emit({ type: 'model', model: modelId });

  const prompt = opts.history[opts.history.length - 1];
  if (!prompt || prompt.role !== 'user') return fail('No prompt to answer.');
  const kept = opts.conversationId ? nativeHistory.get(opts.conversationId) : undefined;
  // Thinking blocks belong to the model that wrote them: a model change starts from the text turns.
  const messages: Anthropic.MessageParam[] = kept && kept.model === modelId
    ? [...kept.messages, { role: 'user', content: prompt.content }]
    : fromTextHistory(opts.history);

  const system: Anthropic.TextBlockParam[] = [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }];
  if (opts.trackerState) system.push({ type: 'text', text: opts.trackerState });

  const toolset = await createFreeToolset(opts.callBrowser, { allowlist: COMPOSER_TOOL_ALLOWLIST, maxTools: MAX_COMPOSER_TOOLS });
  // No eager_input_streaming: inputs are small JSON and nothing shows them
  // while they stream, and without it the API hands over only complete inputs.
  const tools: Anthropic.Tool[] = toolset.tools.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));
  const client = makeClient(key);
  const maxRounds = opts.maxRounds ?? MAX_AGENT_ROUNDS;
  let text = '';
  let truncations = 0;

  try {
    for (let round = 0; round < maxRounds; round++) {
      let wroteThisRound = false;
      const stream = client.messages.stream({
        model: modelId,
        max_tokens: Math.min(MAX_OUTPUT_TOKENS, info?.maxTokens ?? FALLBACK_OUTPUT_TOKENS),
        system,
        tools,
        messages,
        cache_control: { type: 'ephemeral' },
        ...(info?.adaptiveThinking ? { thinking: { type: 'adaptive' as const } } : {}),
      }, { signal });
      stream.on('text', (delta) => {
        if (!delta) return;
        const piece = !wroteThisRound && text ? `\n\n${delta}` : delta;
        wroteThisRound = true;
        text += piece;
        opts.emit({ type: 'text', content: piece });
      });
      const message = await stream.finalMessage();
      const calls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

      if (message.stop_reason === 'refusal') {
        if (opts.conversationId) nativeHistory.delete(opts.conversationId);
        return fail('The model declined this request.');
      }
      if (message.stop_reason === 'model_context_window_exceeded') {
        if (opts.conversationId) nativeHistory.delete(opts.conversationId);
        return fail('This conversation grew too long for the model. Start a new chat and continue from the song as it is.');
      }
      if (message.stop_reason === 'max_tokens') {
        if (++truncations > MAX_TRUNCATION_RECOVERIES) {
          return fail('The model kept running out of room in one reply. Ask for the work in smaller steps.');
        }
        if (calls.length > 0) {
          // A cut-off tool input must never run. The turn is dropped and asked for again, smaller.
          messages.push({ role: 'user', content: 'Your last reply was cut off inside a tool call, so nothing in it ran. Repeat it with smaller tool calls: one channel of one pattern per call.' });
        } else {
          messages.push({ role: 'assistant', content: message.content });
          messages.push({ role: 'user', content: 'Continue from where you stopped.' });
        }
        continue;
      }
      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content });
        continue;
      }
      if (message.stop_reason !== 'tool_use' || calls.length === 0) {
        messages.push({ role: 'assistant', content: message.content });
        storeHistory(opts.conversationId, modelId, messages);
        opts.emit({ type: 'done', code: 0 });
        return { text: text || null, model: modelId };
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        if (signal.aborted) break;
        opts.emit({ type: 'tool_use', tool: call.name, input: call.input });
        const outcome = isPlainObject(call.input)
          ? await toolset.execute(call.name, call.input)
          : { ok: false, content: 'Tool input must be a JSON object.' };
        const content = outcome.content || (outcome.ok ? 'OK' : 'The tool failed without a message.');
        opts.emit({ type: 'tool_result', tool: call.name, ok: outcome.ok, result: clip(content, UI_RESULT_CHARS) });
        results.push({ type: 'tool_result', tool_use_id: call.id, is_error: !outcome.ok, content: clip(content, MODEL_RESULT_CHARS) });
      }
      // Stopped between tools: the assistant turn was never pushed, so the stored messages stay valid.
      if (results.length < calls.length) break;
      messages.push({ role: 'assistant', content: message.content });
      messages.push({ role: 'user', content: results });
    }

    if (stopped()) return none;
    if (timeout.aborted) return fail('The AI worked for the longest time one request may take. Ask it to continue.');
    // Out of rounds: what ran is in the song and in the history; say so and let the visitor continue.
    const note = `${text ? '\n\n' : ''}Stopped after ${maxRounds} steps. Ask me to continue.`;
    text += note;
    opts.emit({ type: 'text', content: note });
    storeHistory(opts.conversationId, modelId, messages);
    opts.emit({ type: 'done', code: 0 });
    return { text, model: modelId };
  } catch (e) {
    if (stopped()) return none;
    if (timeout.aborted) return fail('The AI worked for the longest time one request may take. Ask it to continue.');
    if (e instanceof Anthropic.NotFoundError) {
      resetAgentModelCache();
      return fail('That model is not available for this key. Pick another model.');
    }
    return fail(agentErrorMessage(e, key));
  } finally {
    await toolset.close();
  }
}
