import { describe, it, expect } from 'vitest';
import { BrowserChannel, deliverToolResult, capToolResult, MAX_TOOL_RESULT_BYTES } from './browserChannel';

function make(timeoutMs?: number) {
  const sent: Array<Record<string, unknown>> = [];
  return { sent, ch: new BrowserChannel(`c-${Math.random()}`, (e) => sent.push(e), timeoutMs) };
}

describe('BrowserChannel (FA-7)', () => {
  it('sends tool_call and resolves when the result is posted', async () => {
    const { sent, ch } = make();
    const p = ch.call('get_song_info', {});
    expect(sent[0]).toMatchObject({ type: 'tool_call', method: 'get_song_info' });
    expect(deliverToolResult(ch.conversationId, { callId: sent[0].callId, result: { a: 1 } })).toBe(true);
    await expect(p).resolves.toEqual({ a: 1 });
    expect(ch.pendingCount).toBe(0);
  });
  it('rejects an unknown callId or conversation', () => {
    const { ch } = make();
    expect(deliverToolResult(ch.conversationId, { callId: 'nope', result: 1 })).toBe(false);
    expect(deliverToolResult('missing', { callId: 'x' })).toBe(false);
  });
  it('times out', async () => {
    const { ch } = make(20);
    await expect(ch.call('play', {})).rejects.toThrow(/did not answer/);
  });
  it('close rejects pending calls and later calls', async () => {
    const { ch } = make();
    const p = ch.call('play', {});
    ch.close();
    await expect(p).rejects.toThrow();
    await expect(ch.call('stop', {})).rejects.toThrow(/closed/);
  });
  it('caps a huge result', () => {
    const capped = JSON.stringify(capToolResult('x'.repeat(MAX_TOOL_RESULT_BYTES * 2)));
    expect(capped.length).toBeLessThan(MAX_TOOL_RESULT_BYTES + 1000);
  });
});
