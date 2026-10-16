/**
 * The tool loop: the model asks, the browser answers, the model replies.
 *
 * Ported from the AmiExpress BBS sysop-ai/loop.ts. PROVIDER-NEUTRAL: this file
 * knows nothing about any vendor's wire format. Everything vendor-specific sits
 * behind the small `LoopAdapter` seam (build request, parse tool calls, parse
 * final text, map errors, append a tool turn), so the Anthropic and OpenAI
 * adapters plug in without editing the loop. The OpenRouter adapter lives in
 * openRouterAdapter.ts.
 *
 * At most MAX_ROUNDS tool rounds, all inside `deadline`, the final round
 * without tools.
 */

export const MAX_ROUNDS = 3;
/** The longest ONE round trip may take, whatever is left of the deadline. */
export const DEFAULT_PER_ROUND_MS = 12000;
/** The whole reply's budget when a caller names none. */
export const DEFAULT_DEADLINE_MS = 45000;

/** A tool, vendor-neutral (JSON Schema input). */
export interface ToolSpec {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** One tool call the model made, vendor-neutral. */
export interface ParsedToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ParsedReply {
  /** Final text with any control markup removed; null when the model wrote none. */
  text: string | null;
  toolCalls: ParsedToolCall[];
  /** True when the model stopped for length, not for finishing. */
  truncated: boolean;
}

export interface ToolOutcome { ok: boolean; content: string }

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

/** Why a request failed, in the terms the orchestration branches on. */
export type FailureKind = 'auth' | 'credit' | 'rate' | 'bad-request' | 'server' | 'timeout' | 'other';

/** Thrown by `post` implementations (via adapter.mapError); safe to show: never contains a key. */
export class ProviderError extends Error {
  constructor(public readonly kind: FailureKind, message: string, public readonly status?: number) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface LoopAdapter {
  /** Native message list for a conversation start. */
  startMessages(system: string, history: ChatTurn[]): Array<Record<string, unknown>>;
  /** The native request body. `withTools` is false on the final round. */
  buildRequest(a: { model: string; messages: Array<Record<string, unknown>>; tools: ToolSpec[]; withTools: boolean; maxTokens: number }): Record<string, unknown>;
  /** Read a native response: tool calls (native or written as text), final text, truncation. */
  parseReply(raw: unknown): ParsedReply;
  /** Append the model's tool turn and the tool results to the native messages. */
  appendToolTurn(messages: Array<Record<string, unknown>>, reply: ParsedReply, results: Array<{ call: ParsedToolCall; outcome: ToolOutcome }>): void;
  /** Append a plain user nudge (used by the compose-from-results round). */
  appendUserNudge(messages: Array<Record<string, unknown>>, text: string): Array<Record<string, unknown>>;
  /** Map an HTTP failure to a ProviderError. Never include request headers. */
  mapError(status: number, body: unknown): ProviderError;
}

export interface ToolLoopRequest {
  adapter: LoopAdapter;
  model: string;
  system: string;
  history: ChatTurn[];
  tools: ToolSpec[];
  /** Run one tool; never throws (an error is an outcome with ok false). */
  execute: (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>;
  /** Absolute ms timestamp the whole reply must be in by. */
  deadline: number;
  perRoundMs?: number;
  maxTokens?: number;
  /** POST the native body; returns the parsed JSON; throws ProviderError on failure. */
  post: (body: Record<string, unknown>, timeoutMs: number) => Promise<unknown>;
}

export interface ToolLoopResult {
  text: string | null;
  truncated: boolean;
  calls: Array<{ name: string; args: Record<string, unknown>; ok: boolean }>;
  /** What the tools answered, in order. */
  toolResults: string[];
  /** Number of requests made (rounds plus the compose round). */
  requests: number;
}

const COMPOSE_NUDGE = 'Answer my question now, in your own words, using what the tools just returned. Do not call another tool.';

/**
 * One last round with the tools taken away. A small model can call a tool and
 * then write nothing; the answer is already on the table, so ask once more
 * with no tools offered and the results in hand.
 */
async function composeFromWhatTheToolsSaid(
  req: ToolLoopRequest,
  messages: Array<Record<string, unknown>>,
  counter: { n: number },
): Promise<string | null> {
  const left = req.deadline - Date.now();
  if (left < 1500) return null;
  const body = req.adapter.buildRequest({
    model: req.model,
    messages: req.adapter.appendUserNudge([...messages], COMPOSE_NUDGE),
    tools: req.tools,
    withTools: false,
    maxTokens: req.maxTokens ?? 400,
  });
  try {
    counter.n++;
    const reply = req.adapter.parseReply(await req.post(body, Math.min(left, req.perRoundMs ?? DEFAULT_PER_ROUND_MS)));
    return reply.text;
  } catch {
    return null;
  }
}

export async function askWithTools(req: ToolLoopRequest): Promise<ToolLoopResult> {
  const { adapter } = req;
  const messages = adapter.startMessages(req.system, req.history);
  const calls: ToolLoopResult['calls'] = [];
  const toolResults: string[] = [];
  const counter = { n: 0 };
  const result = (text: string | null, truncated: boolean): ToolLoopResult =>
    ({ text, truncated, calls, toolResults, requests: counter.n });

  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const left = req.deadline - Date.now();
    if (left < 500) return result(null, false);
    const withTools = round < MAX_ROUNDS && req.tools.length > 0; // last round: the model has to answer
    const body = adapter.buildRequest({ model: req.model, messages, tools: req.tools, withTools, maxTokens: req.maxTokens ?? 400 });
    // One round may not spend the whole budget: a slow model abandoned at the
    // cap is recorded as slow and a faster one answers inside the same budget.
    counter.n++;
    const reply = adapter.parseReply(await req.post(body, Math.min(left, req.perRoundMs ?? DEFAULT_PER_ROUND_MS)));

    if (reply.toolCalls.length === 0 || round === MAX_ROUNDS) {
      if (!reply.text && toolResults.length) {
        const composed = await composeFromWhatTheToolsSaid(req, messages, counter);
        if (composed) return result(composed, false);
      }
      return result(reply.text, reply.truncated);
    }

    const results: Array<{ call: ParsedToolCall; outcome: ToolOutcome }> = [];
    for (const call of reply.toolCalls) {
      const outcome = await req.execute(call.name, call.args);
      calls.push({ name: call.name, args: call.args, ok: outcome.ok });
      if (outcome.ok) toolResults.push(outcome.content);
      results.push({ call, outcome });
    }
    adapter.appendToolTurn(messages, reply, results);
  }
  return result(null, false);
}
