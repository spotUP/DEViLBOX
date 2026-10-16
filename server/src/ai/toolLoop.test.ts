import { describe, it, expect } from 'vitest';
import { askWithTools } from './toolLoop';
import { openRouterAdapter } from './openRouterAdapter';

const tools = [{ name: 'get_song_info', inputSchema: { type: 'object' } }];
const call = { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_song_info', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] };
const text = (t: string) => ({ choices: [{ message: { content: t }, finish_reason: 'stop' }] });
const ok = async () => ({ ok: true, content: '{"title":"T"}' });

describe('askWithTools (FA-4)', () => {
  it('one native tool round then text', async () => {
    const replies = [call, text('done')];
    const r = await askWithTools({ adapter: openRouterAdapter, model: 'm', system: 's', history: [{ role: 'user', content: 'q' }], tools, execute: ok, deadline: Date.now() + 5000, post: async () => replies.shift() });
    expect(r.text).toBe('done');
    expect(r.calls).toEqual([{ name: 'get_song_info', args: {}, ok: true }]);
    expect(r.requests).toBe(2);
  });
  it('executes a tool call written as text', async () => {
    const replies = [text('<|tool_call_start|>[get_song_info()]<|tool_call_end|>'), text('after')];
    const r = await askWithTools({ adapter: openRouterAdapter, model: 'm', system: 's', history: [{ role: 'user', content: 'q' }], tools, execute: ok, deadline: Date.now() + 5000, post: async () => replies.shift() });
    expect(r.calls.length).toBe(1);
    expect(r.text).toBe('after');
  });
  it('an expired deadline stops further rounds', async () => {
    let posts = 0;
    const r = await askWithTools({ adapter: openRouterAdapter, model: 'm', system: 's', history: [{ role: 'user', content: 'q' }], tools, execute: ok, deadline: Date.now() - 1, post: async () => { posts++; return call; } });
    expect(posts).toBeLessThanOrEqual(1);
    expect(r.requests).toBeLessThanOrEqual(1);
  });
  it('a model that always calls tools is cut off at MAX_ROUNDS plus the final round', async () => {
    let posts = 0;
    await askWithTools({ adapter: openRouterAdapter, model: 'm', system: 's', history: [{ role: 'user', content: 'q' }], tools, execute: ok, deadline: Date.now() + 5000, post: async () => { posts++; return call; } });
    expect(posts).toBeLessThanOrEqual(5);
  });
});
