/**
 * The Free provider: answers a chat through OpenRouter's free models, with the
 * DEViLBOX tools, no CLI and no account on the visitor's side.
 *
 * Emits the same SSE event shapes the CLI path emits (`init` is the route's;
 * here `text`, `error`, `done`) plus `model` (which model answered). The
 * `tool_call` events come from the browser channel.
 *
 * Key: a visitor's own key (X-OpenRouter-Key) overrides OPENROUTER_API_KEY for
 * that request only. It is held in a local variable for the request, never
 * stored, never logged, and scrubbed from any message sent back.
 */
import { noteModelCost, noteModelMute } from './modelCosts';
import {
  OPENROUTER_BASE, freeModelRanking, modelSupportsTools, probeAnUnmeasuredModel, reRank, requestedModelIfFree,
  type FetchFn,
} from './freeModels';
import { openRouterAdapter } from './openRouterAdapter';
import { createFreeToolset } from './freeToolset';
import { makeJsonPost, providerFetch, scrub, setProviderFetch } from './vendorPost';
import { DEFAULT_DEADLINE_MS, ProviderError, askWithTools, type ChatTurn, type LoopAdapter, type ToolSpec } from './toolLoop';
import type { BrowserCaller } from '../mcp/mcpServer';

export const MAX_ATTEMPTS = 8;
export const MAX_TOKENS = 600;
export const NO_KEY_MESSAGE = 'No OpenRouter key is available. Add your own key in Settings (OpenRouter API Key) to use the free models.';
const REFERER_HEADERS = { 'HTTP-Referer': 'https://devilbox.uprough.net', 'X-Title': 'DEViLBOX' };

/** Test seam: replace the fetch the provider uses (shared with the vendor providers). */
export const setFreeProviderFetch = setProviderFetch;
const doFetch: FetchFn = providerFetch;

export type FreeEvent = Record<string, unknown>;

export interface FreeChatOptions {
  system: string;
  /** The conversation so far, ending with the visitor's new message. */
  history: ChatTurn[];
  /** The key from the visitor's request header, if any. */
  visitorKey?: string;
  requestedModel?: string;
  emit: (event: FreeEvent) => void;
  callBrowser: BrowserCaller;
  signal?: AbortSignal;
  adapter?: LoopAdapter;
  deadlineMs?: number;
}

/** The status a free provider can use: is any key available at all? */
export function freeAvailability(visitor?: string): { available: boolean; message?: string } {
  const available = !!visitor || !!process.env.OPENROUTER_API_KEY;
  return available ? { available } : { available, message: NO_KEY_MESSAGE };
}

export async function runFreeChat(opts: FreeChatOptions): Promise<{ text: string | null; model: string | null }> {
  const { emit } = opts;
  const adapter = opts.adapter ?? openRouterAdapter;
  const key = opts.visitorKey || process.env.OPENROUTER_API_KEY || '';
  const fail = (message: string): { text: null; model: null } => {
    emit({ type: 'error', error: scrub(message, key) });
    return { text: null, model: null };
  };

  // Key check first: no discovery round trip without one.
  if (!key) return fail(NO_KEY_MESSAGE);

  const ranking = await freeModelRanking(doFetch, key);
  const wanted = requestedModelIfFree(opts.requestedModel);
  const order = wanted ? [wanted, ...ranking.filter((m) => m !== wanted)] : ranking;
  if (order.length === 0) return fail('No free model is available right now.');

  const toolset = await createFreeToolset(opts.callBrowser);
  const deadline = Date.now() + (opts.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const post = makeJsonPost({
    url: `${OPENROUTER_BASE}/chat/completions`,
    headers: { Authorization: `Bearer ${key}`, ...REFERER_HEADERS },
    vendor: 'OpenRouter', adapter, signal: opts.signal,
  });
  let lastError = 'No free model answered in time. Try again in a moment.';
  let answer: { text: string; model: string } | null = null;
  let stopped = false;

  try {
    let attempts = 0;
    for (const model of order) {
      if (answer || stopped) break;
      // Plain retry (no tools) on a 400/500 from this model, once.
      for (const plain of [false, true]) {
        if (attempts >= MAX_ATTEMPTS || Date.now() > deadline - 500 || opts.signal?.aborted) break;
        attempts++;
        const tools: ToolSpec[] = !plain && modelSupportsTools(model) ? toolset.tools : [];
        const startedAt = Date.now();
        try {
          const r = await askWithTools({
            adapter, model, system: opts.system, history: opts.history, tools,
            execute: toolset.execute, deadline, maxTokens: MAX_TOKENS, post,
          });
          noteModelCost(model, Date.now() - startedAt, !!r.text);
          noteModelMute(model, !r.text);
          if (r.text) { answer = { text: r.text, model }; }
          break;
        } catch (e) {
          const err = e instanceof ProviderError ? e : new ProviderError('other', 'Unexpected error');
          noteModelCost(model, Date.now() - startedAt, false);
          lastError = err.message;
          if (opts.signal?.aborted) { stopped = true; break; }
          if (err.kind === 'auth' || err.kind === 'credit') { stopped = true; break; } // every model would fail the same way
          if (err.kind === 'bad-request' || err.kind === 'server') { if (plain) break; continue; }
          break; // rate / timeout / other: next model
        }
      }
      if (attempts >= MAX_ATTEMPTS) break;
    }
  } finally {
    await toolset.close();
    reRank();
  }

  if (answer) {
    emit({ type: 'model', model: answer.model });
    emit({ type: 'text', content: answer.text });
    emit({ type: 'done', code: 0 });
    // Measure one unmeasured model in the background, on the SERVER's key and
    // only for a request that used it: a visitor's key is never used for
    // anything but their own request, and a visitor request spends no server quota.
    const serverKey = process.env.OPENROUTER_API_KEY;
    if (serverKey && !opts.visitorKey) void probeAnUnmeasuredModel(doFetch, serverKey, REFERER_HEADERS).catch(() => undefined);
    return { text: answer.text, model: answer.model };
  }
  if (opts.signal?.aborted) return { text: null, model: null };
  return fail(lastError);
}
