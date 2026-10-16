/**
 * The per-chat channel from the Free provider's tools to the visitor's browser.
 *
 * The Free provider has no CLI and no WebSocket relay entry for a visitor's
 * tab, so a tool call goes out on the chat's own SSE response as a
 * `tool_call` event and comes back as POST /api/ai/tool-result. A result is
 * accepted only for a call that is pending for THAT conversation, so one
 * visitor cannot answer (or poison) another's tool call.
 */
import { randomUUID } from 'crypto';

export const TOOL_CALL_TIMEOUT_MS = 30000;
export const MAX_TOOL_RESULT_BYTES = 64 * 1024;

export interface ToolResultBody { callId?: unknown; result?: unknown; error?: unknown }

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/** conversationId -> its open channel. */
const channels = new Map<string, BrowserChannel>();

/** Keep a result inside the model's context: oversize results become a short stub. */
export function capToolResult(result: unknown): unknown {
  const text = JSON.stringify(result ?? null);
  if (text.length <= MAX_TOOL_RESULT_BYTES) return result ?? null;
  return { truncated: true, note: `Result was ${text.length} bytes; only the start is shown.`, preview: text.slice(0, MAX_TOOL_RESULT_BYTES - 200) };
}

export class BrowserChannel {
  private pending = new Map<string, Pending>();
  private closed = false;

  constructor(
    readonly conversationId: string,
    private readonly send: (event: Record<string, unknown>) => void,
    private readonly timeoutMs = TOOL_CALL_TIMEOUT_MS,
  ) {
    channels.set(conversationId, this);
  }

  call = (method: string, params: Record<string, unknown>): Promise<unknown> => {
    if (this.closed) return Promise.reject(new Error('The browser connection is closed'));
    const callId = randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(callId);
        reject(new Error(`The browser did not answer ${method} within ${Math.round(this.timeoutMs / 1000)} s`));
      }, this.timeoutMs);
      timer.unref();
      this.pending.set(callId, { resolve, reject, timer });
      this.send({ type: 'tool_call', callId, method, params });
    });
  };

  /** True when `callId` was pending here and has now been answered. */
  answer(callId: string, body: { result?: unknown; error?: unknown }): boolean {
    const p = this.pending.get(callId);
    if (!p) return false;
    this.pending.delete(callId);
    clearTimeout(p.timer);
    if (typeof body.error === 'string' && body.error) p.reject(new Error(body.error.slice(0, 500)));
    else p.resolve(capToolResult(body.result));
    return true;
  }

  /** The response closed: nothing can answer any more. */
  close(): void {
    this.closed = true;
    if (channels.get(this.conversationId) === this) channels.delete(this.conversationId);
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('The browser connection closed'));
      this.pending.delete(id);
    }
  }

  get pendingCount(): number { return this.pending.size; }
}

/** Route glue for POST /api/ai/tool-result. */
export function deliverToolResult(conversationId: unknown, body: ToolResultBody): boolean {
  if (typeof conversationId !== 'string' || typeof body.callId !== 'string') return false;
  return channels.get(conversationId)?.answer(body.callId, body) ?? false;
}
