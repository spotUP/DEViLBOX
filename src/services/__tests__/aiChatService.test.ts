import { describe, it, expect, vi, beforeEach } from 'vitest';

const dispatchBridgeCall = vi.fn();
vi.mock('@/bridge/MCPBridge', () => ({
  dispatchBridgeCall: (m: string, p: Record<string, unknown>) => dispatchBridgeCall(m, p),
}));

import { sendMessage } from '../aiChatService';
import { useAIStore } from '@stores/useAIStore';
import { useAIKeysStore } from '@stores/useAIKeysStore';

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

describe('aiChatService visitor key header', () => {
  async function chatHeaders(): Promise<Headers> {
    let headers = new Headers();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      headers = new Headers(init?.headers);
      return sse([{ type: 'done' }]);
    }));
    await sendMessage('hi');
    return headers;
  }

  beforeEach(() => {
    useAIStore.getState().clearHistory();
    useAIStore.setState({ provider: 'free' });
    useAIKeysStore.setState({ keys: {} });
  });

  it('sends x-openrouter-key for the free provider when a key is saved', async () => {
    useAIKeysStore.getState().setKey('openrouter', 'sk-or-mine');
    expect((await chatHeaders()).get('x-openrouter-key')).toBe('sk-or-mine');
  });

  it('omits the header when no key is saved', async () => {
    expect((await chatHeaders()).has('x-openrouter-key')).toBe(false);
  });
});

describe('checkAIKey', () => {
  it('posts the vendor with the key in that vendor header and maps failures to plain words', async () => {
    const seen: { url: string; headers: Record<string, string>; body: unknown }[] = [];
    const replies = [{ ok: true, models: 7 }, { ok: false, kind: 'credit', error: 'raw' }];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      seen.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    }));
    const { checkAIKey, describeKeyCheckFailure } = await import('../aiChatService');
    expect(await checkAIKey('openai', 'sk-x')).toEqual({ ok: true, models: 7 });
    expect(seen[0].url.endsWith('/ai/check-key')).toBe(true);
    expect(seen[0].headers['x-openai-key']).toBe('sk-x');
    expect(seen[0].body).toEqual({ vendor: 'openai' });
    const bad = await checkAIKey('openai', 'sk-x');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(describeKeyCheckFailure(bad)).toContain('no credit');
  });
});
