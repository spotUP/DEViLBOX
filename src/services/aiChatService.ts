/**
 * AI Chat Service — SSE client that streams Claude responses.
 * Shared by the chat UI panels.
 */

import { useAIStore } from '@stores/useAIStore';
import { useAIKeysStore, keyHeadersFor, AI_KEY_HEADERS, type AIKeyVendor } from '@stores/useAIKeysStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { dispatchBridgeCall } from '@/bridge/MCPBridge';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

let activeAbort: AbortController | null = null;

/** Gather current tracker context from stores */
function gatherContext(): Record<string, unknown> {
  try {
    const tracker = useTrackerStore.getState();
    const transport = useTransportStore.getState();
    const instruments = useInstrumentStore.getState();
    const pattern = tracker.patterns[tracker.currentPatternIndex];

    return {
      bpm: transport.bpm,
      channels: pattern?.channels?.length ?? 0,
      instruments: instruments.instruments?.length ?? 0,
      currentPattern: tracker.currentPatternIndex,
    };
  } catch {
    return {};
  }
}

export interface AIStatus {
  available: boolean;
  error?: string;
  /** Whether the server has its own OpenRouter key, so Free works without a visitor key. */
  free?: { available: boolean; message?: string };
}

/** Check if an AI backend is available */
export async function checkAIStatus(): Promise<AIStatus> {
  try {
    const res = await fetch(`${API_BASE}/ai/status`);
    return await res.json();
  } catch {
    return { available: false, error: 'Cannot reach server. Is the dev server running?' };
  }
}

export type AIKeyCheck =
  | { ok: true; models: number }
  | { ok: false; kind: string; error: string };

/** Ask the server whether this key works; the key is sent in the vendor's header and not stored here. */
export async function checkAIKey(vendor: AIKeyVendor, key: string): Promise<AIKeyCheck> {
  try {
    const res = await fetch(`${API_BASE}/ai/check-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [AI_KEY_HEADERS[vendor]]: key },
      body: JSON.stringify({ vendor }),
    });
    const body = await res.json();
    if (body && body.ok === true) return { ok: true, models: Number(body.models) || 0 };
    return {
      ok: false,
      kind: typeof body?.kind === 'string' ? body.kind : 'other',
      error: typeof body?.error === 'string' ? body.error : 'The key could not be checked.',
    };
  } catch {
    return { ok: false, kind: 'network', error: 'Cannot reach the server. Is it running?' };
  }
}

/** A failed key check in plain words. */
export function describeKeyCheckFailure(check: Extract<AIKeyCheck, { ok: false }>): string {
  switch (check.kind) {
    case 'auth': return 'The provider did not accept this key. Check that you copied all of it.';
    case 'credit': return 'This key has no credit left. Add credit with the provider, then try again.';
    case 'rate': return 'The provider is rate limiting this key. Wait a minute and try again.';
    default: return check.error;
  }
}

/** Run a server-requested tool in this browser and post the outcome back; never blocks the stream. */
async function runToolCall(
  conversationId: string | null,
  callId: string,
  method: string,
  params: Record<string, unknown>,
): Promise<void> {
  try {
    const outcome = await dispatchBridgeCall(method, params);
    const body = outcome.ok
      ? { conversationId, callId, result: outcome.data }
      : { conversationId, callId, error: outcome.error };
    await fetch(`${API_BASE}/ai/tool-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('[aiChat] tool call failed', method, err);
  }
}

/** Send a prompt and stream the response */
export async function sendMessage(prompt: string): Promise<void> {
  const store = useAIStore.getState();

  // Abort any previous stream
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }

  store.addUserMessage(prompt);
  const assistantId = store.addAssistantMessage();
  store.setStreaming(true);
  store.setError(null);
  store.setActiveModel(null);

  const abort = new AbortController();
  activeAbort = abort;

  try {
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...keyHeadersFor(store.provider, useAIKeysStore.getState().keys),
      },
      body: JSON.stringify({
        prompt,
        context: gatherContext(),
        conversationId: store.conversationId,
        provider: store.provider,
        model: store.model,
      }),
      signal: abort.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data) continue;

        try {
          const event = JSON.parse(data);
          const s = useAIStore.getState();

          switch (event.type) {
            case 'init':
              s.setConversationId(event.conversationId);
              break;
            case 'model':
              s.setActiveModel(typeof event.model === 'string' ? event.model : null);
              break;
            case 'tool_call':
              void runToolCall(
                s.conversationId ?? event.conversationId ?? null,
                String(event.callId),
                String(event.method),
                (event.params ?? {}) as Record<string, unknown>,
              );
              break;
            case 'text':
              s.appendAssistantText(assistantId, event.content);
              break;
            case 'tool_use':
              s.addToolCall(assistantId, {
                tool: event.tool,
                input: event.input || {},
              });
              break;
            case 'tool_result':
              s.addToolResult(assistantId, event.tool, event.result);
              break;
            case 'error':
              s.setError(event.error);
              break;
            case 'done':
              break;
          }
        } catch {
          // Parse error, skip
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      // User cancelled
    } else {
      useAIStore.getState().setError(err instanceof Error ? err.message : 'Unknown error');
    }
  } finally {
    useAIStore.getState().finalizeAssistantMessage(assistantId);
    useAIStore.getState().setStreaming(false);
    if (activeAbort === abort) activeAbort = null;
  }
}

/** Stop the current stream */
export function stopStreaming(): void {
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }

  const { conversationId } = useAIStore.getState();
  if (conversationId) {
    fetch(`${API_BASE}/ai/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    }).catch(() => {});
  }
}
