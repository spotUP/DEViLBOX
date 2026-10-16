import { describe, it, expect, vi, beforeEach } from 'vitest';

const dispatchBridgeCall = vi.fn();
vi.mock('@/bridge/MCPBridge', () => ({
  dispatchBridgeCall: (m: string, p: Record<string, unknown>) => dispatchBridgeCall(m, p),
}));

import { sendMessage } from '../aiChatService';
import { useAIStore } from '@stores/useAIStore';

function sse(events: object[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, { status: 200 });
}

describe('aiChatService tool round trip', () => {
  beforeEach(() => {
    dispatchBridgeCall.mockReset();
    useAIStore.getState().clearHistory();
  });

  it('dispatches a tool_call and posts the result with callId and conversationId', async () => {
    dispatchBridgeCall.mockResolvedValue({ ok: true, data: { bpm: 125 } });
    const posts: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/ai/tool-result')) {
        posts.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response('{}', { status: 200 });
      }
      return sse([
        { type: 'init', conversationId: 'conv-1' },
        { type: 'model', model: 'some/free-model' },
        { type: 'tool_call', callId: 'c1', method: 'get_song_info', params: { a: 1 } },
        { type: 'done' },
      ]);
    }));

    await sendMessage('hi');
    await vi.waitFor(() => expect(posts).toHaveLength(1));

    expect(dispatchBridgeCall).toHaveBeenCalledTimes(1);
    expect(dispatchBridgeCall).toHaveBeenCalledWith('get_song_info', { a: 1 });
    expect(posts[0].body).toEqual({ conversationId: 'conv-1', callId: 'c1', result: { bpm: 125 } });
    expect(useAIStore.getState().activeModel).toBe('some/free-model');
  });

  it('posts an error when the dispatch fails', async () => {
    dispatchBridgeCall.mockResolvedValue({ ok: false, error: 'Unknown method: nope' });
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/ai/tool-result')) {
        posts.push(JSON.parse(String(init?.body)));
        return new Response('{}', { status: 200 });
      }
      return sse([
        { type: 'init', conversationId: 'conv-2' },
        { type: 'tool_call', callId: 'c2', method: 'nope' },
        { type: 'done' },
      ]);
    }));
    await sendMessage('hi');
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ conversationId: 'conv-2', callId: 'c2', error: 'Unknown method: nope' });
  });
});
