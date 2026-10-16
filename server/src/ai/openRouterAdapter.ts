/**
 * The OpenAI chat-completions dialect behind the LoopAdapter seam, as a factory:
 * OpenRouter and OpenAI share this one implementation and differ only in the
 * vendor name, the max-tokens field and the error map. The Anthropic adapter
 * (a different wire format) is in anthropicAdapter.ts.
 */
import {
  ProviderError,
  type ChatTurn, type LoopAdapter, type ParsedReply, type ParsedToolCall, type ToolSpec,
} from './toolLoop';

interface NativeToolCall { id?: string; type?: string; function?: { name?: string; arguments?: unknown } }
interface Completion {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: NativeToolCall[] };
    finish_reason?: string | null;
  }>;
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(String(raw ?? '{}'));
    return v && typeof v === 'object' ? v as Record<string, unknown> : {};
  } catch { return {}; }
}

/**
 * A tool call the model wrote out as TEXT. Several free models emit the call
 * into `content` wrapped in their own control tokens:
 *   <|tool_call_start|>[search_modland(query='fairlight')]<|tool_call_end|>
 */
const TEXT_TOOL_CALL = /<\|tool_call(?:_start|_begin)\|>\s*\[?\s*([A-Za-z_][\w-]*)\s*\(([\s\S]*?)\)\s*\]?\s*<\|tool_call(?:_end|_close)\|>/g;

function parseKeywordArgs(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const v: unknown = JSON.parse(trimmed);
      if (v && typeof v === 'object') return v as Record<string, unknown>;
    } catch { /* fall through to keywords */ }
  }
  const args: Record<string, unknown> = {};
  const pair = /([A-Za-z_][\w-]*)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^,]+))/g;
  for (let m = pair.exec(trimmed); m; m = pair.exec(trimmed)) {
    args[m[1]] = (m[2] ?? m[3] ?? String(m[4] ?? '').trim()).trim();
  }
  return args;
}

export function toolCallsWrittenAsText(content: unknown): ParsedToolCall[] {
  if (typeof content !== 'string' || !content.includes('tool_call')) return [];
  const out: ParsedToolCall[] = [];
  TEXT_TOOL_CALL.lastIndex = 0;
  for (let m = TEXT_TOOL_CALL.exec(content); m; m = TEXT_TOOL_CALL.exec(content)) {
    out.push({ id: `text-${out.length}`, name: m[1], args: parseKeywordArgs(m[2] ?? '') });
  }
  return out;
}

/** No model's control tokens belong on screen. */
export function withoutControlTokens(text: string): string {
  return text
    .replace(/<\|tool_call(?:_start|_begin)\|>[\s\S]*?<\|tool_call(?:_end|_close)\|>/g, '')
    .replace(/<\|[^|>]*\|>/g, '')
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .trim();
}

const toOpenAiTool = (t: ToolSpec) => ({
  type: 'function' as const,
  function: { name: t.name, description: t.description, parameters: t.inputSchema },
});

export interface ChatCompletionsOptions {
  vendor: string;
  maxTokensField: 'max_tokens' | 'max_completion_tokens';
  /** A vendor-specific mapping tried before the generic one; null falls through. */
  mapStatus?: (status: number, body: unknown, note: string) => ProviderError | null;
}

export function chatCompletionsAdapter(o: ChatCompletionsOptions): LoopAdapter {
  return {
    startMessages(system: string, history: ChatTurn[]) {
      return [{ role: 'system', content: system }, ...history.map((h) => ({ role: h.role, content: h.content }))];
    },

    buildRequest({ model, messages, tools, withTools, maxTokens }) {
      return {
        model,
        messages,
        [o.maxTokensField]: maxTokens,
        ...(withTools && tools.length ? { tools: tools.map(toOpenAiTool), tool_choice: 'auto' } : {}),
      };
    },

    parseReply(raw: unknown): ParsedReply {
      const choice = (raw as Completion).choices?.[0];
      const message = choice?.message;
      if (!message) return { text: null, toolCalls: [], truncated: false };
      const native: ParsedToolCall[] = (Array.isArray(message.tool_calls) ? message.tool_calls : []).map((c, i) => ({
        id: c.id ?? `call-${i}`,
        name: String(c.function?.name ?? ''),
        args: parseArgs(c.function?.arguments),
      }));
      const toolCalls = native.length ? native : toolCallsWrittenAsText(message.content);
      const cleaned = typeof message.content === 'string' ? withoutControlTokens(message.content) : '';
      return { text: cleaned || null, toolCalls, truncated: choice?.finish_reason === 'length' };
    },

    appendToolTurn(messages, reply, results) {
      // The assistant's turn without its control tokens (echoing the raw markup
      // teaches the next round to answer in it again), then one tool message per call.
      messages.push({
        role: 'assistant',
        content: reply.text,
        tool_calls: reply.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })),
      });
      for (const { call, outcome } of results) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: outcome.content });
      }
    },

    appendUserNudge(messages, text) {
      messages.push({ role: 'user', content: text });
      return messages;
    },

    mapError(status: number, body: unknown): ProviderError {
      const detail = (body as { error?: { message?: unknown } } | null)?.error?.message;
      const note = typeof detail === 'string' ? `: ${detail.slice(0, 200)}` : '';
      const mapped = o.mapStatus?.(status, body, note);
      if (mapped) return mapped;
      const v = o.vendor;
      if (status === 401 || status === 403) return new ProviderError('auth', `The ${v} key was rejected${note}`, status);
      if (status === 402) return new ProviderError('credit', `${v} reports no credit${note}`, status);
      if (status === 429) return new ProviderError('rate', `${v} rate limit${note}`, status);
      if (status === 400) return new ProviderError('bad-request', `${v} rejected the request${note}`, status);
      if (status >= 500) return new ProviderError('server', `${v} error ${status}${note}`, status);
      return new ProviderError('other', `${v} error ${status}${note}`, status);
    },
  };
}

export const openRouterAdapter: LoopAdapter = chatCompletionsAdapter({ vendor: 'OpenRouter', maxTokensField: 'max_tokens' });

/** OpenAI: same dialect, `max_completion_tokens`, and a 429 that can mean the quota is spent. */
export const openAiAdapter: LoopAdapter = chatCompletionsAdapter({
  vendor: 'OpenAI',
  maxTokensField: 'max_completion_tokens',
  mapStatus(status, body, note) {
    if (status !== 429) return null;
    const err = (body as { error?: { code?: unknown; type?: unknown } } | null)?.error;
    if (err?.code === 'insufficient_quota' || err?.type === 'insufficient_quota') {
      return new ProviderError('credit', `OpenAI reports no credit or quota left${note}`, status);
    }
    return null;
  },
});
