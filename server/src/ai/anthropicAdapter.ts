/**
 * Anthropic Messages API behind the LoopAdapter seam. The system prompt
 * travels as the first message internally (the loop is vendor-neutral) and
 * buildRequest lifts it to the top-level `system` field.
 */
import {
  ProviderError,
  type ChatTurn, type LoopAdapter, type ParsedReply, type ParsedToolCall, type ToolSpec,
} from './toolLoop';

interface ContentBlock { type?: string; text?: string; id?: string; name?: string; input?: unknown }
type Message = Record<string, unknown>;

const toAnthropicTool = (t: ToolSpec) => ({ name: t.name, description: t.description, input_schema: t.inputSchema });

const isToolBlock = (b: unknown): boolean => {
  const type = (b as ContentBlock | null)?.type;
  return type === 'tool_use' || type === 'tool_result';
};
const hasToolBlocks = (messages: Message[]): boolean =>
  messages.some((m) => Array.isArray(m.content) && m.content.some(isToolBlock));

export const anthropicAdapter: LoopAdapter = {
  startMessages(system: string, history: ChatTurn[]) {
    return [{ role: 'system', content: system }, ...history.map((h) => ({ role: h.role, content: h.content }))];
  },

  buildRequest({ model, messages, tools, withTools, maxTokens }) {
    const system = messages.filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system');
    // The API rejects tool blocks without a tools definition, so later rounds keep it with choice none.
    const sendTools = tools.length > 0 && (withTools || hasToolBlocks(rest));
    return {
      model,
      max_tokens: maxTokens,
      system,
      messages: rest,
      ...(sendTools ? { tools: tools.map(toAnthropicTool), tool_choice: { type: withTools ? 'auto' : 'none' } } : {}),
    };
  },

  parseReply(raw: unknown): ParsedReply {
    const r = raw as { content?: unknown; stop_reason?: unknown } | null;
    const blocks: ContentBlock[] = Array.isArray(r?.content) ? r.content as ContentBlock[] : [];
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
    const toolCalls: ParsedToolCall[] = blocks.filter((b) => b.type === 'tool_use').map((b, i) => ({
      id: b.id ?? `call-${i}`,
      name: String(b.name ?? ''),
      args: b.input && typeof b.input === 'object' ? b.input as Record<string, unknown> : {},
    }));
    return { text: text || null, toolCalls, truncated: r?.stop_reason === 'max_tokens' };
  },

  appendToolTurn(messages, reply, results) {
    messages.push({
      role: 'assistant',
      content: [
        ...(reply.text ? [{ type: 'text', text: reply.text }] : []),
        ...reply.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args })),
      ],
    });
    messages.push({
      role: 'user',
      content: results.map(({ call, outcome }) => ({ type: 'tool_result', tool_use_id: call.id, content: outcome.content, is_error: !outcome.ok })),
    });
  },

  appendUserNudge(messages, text) {
    const last = messages[messages.length - 1];
    if (last && last.role === 'user' && Array.isArray(last.content)) {
      // Keep roles alternating: the nudge rides in the tool_result turn.
      messages[messages.length - 1] = { ...last, content: [...last.content, { type: 'text', text }] };
    } else {
      messages.push({ role: 'user', content: text });
    }
    return messages;
  },

  mapError(status: number, body: unknown): ProviderError {
    const detail = (body as { error?: { message?: unknown } } | null)?.error?.message;
    const note = typeof detail === 'string' ? `: ${detail.slice(0, 200)}` : '';
    if (status === 401 || status === 403) return new ProviderError('auth', `The Anthropic key was rejected${note}`, status);
    if (status === 400 && typeof detail === 'string' && /credit balance/i.test(detail)) {
      return new ProviderError('credit', `Anthropic reports no credit${note}`, status);
    }
    if (status === 400) return new ProviderError('bad-request', `Anthropic rejected the request${note}`, status);
    if (status === 429) return new ProviderError('rate', `Anthropic rate limit${note}`, status);
    if (status >= 500) return new ProviderError('server', `Anthropic error ${status}${note}`, status);
    return new ProviderError('other', `Anthropic error ${status}${note}`, status);
  },
};
