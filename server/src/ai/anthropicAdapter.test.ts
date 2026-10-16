import { describe, it, expect } from 'vitest';
import { anthropicAdapter as a } from './anthropicAdapter';
import { ProviderError, type ToolSpec } from './toolLoop';

const tools: ToolSpec[] = [{ name: 'get_song_info', description: 'Song', inputSchema: { type: 'object' } }];
const call = { id: 't1', name: 'get_song_info', args: {} };

describe('anthropicAdapter', () => {
  it('buildRequest lifts the system entry to the top level and maps tools', () => {
    const messages = a.startMessages('SYS', [{ role: 'user', content: 'hi' }]);
    const body = a.buildRequest({ model: 'm', messages, tools, withTools: true, maxTokens: 50 });
    expect(body).toMatchObject({ model: 'm', max_tokens: 50, system: 'SYS', tool_choice: { type: 'auto' } });
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.tools).toEqual([{ name: 'get_song_info', description: 'Song', input_schema: { type: 'object' } }]);
  });

  it('omits tools when none are used, keeps them with tool_choice none once tool blocks exist', () => {
    const messages = a.startMessages('S', [{ role: 'user', content: 'hi' }]);
    expect(a.buildRequest({ model: 'm', messages, tools, withTools: false, maxTokens: 5 })).not.toHaveProperty('tools');
    a.appendToolTurn(messages, { text: null, toolCalls: [call], truncated: false }, [{ call, outcome: { ok: true, content: 'x' } }]);
    const body = a.buildRequest({ model: 'm', messages, tools, withTools: false, maxTokens: 5 });
    expect(body.tool_choice).toEqual({ type: 'none' });
    expect(body.tools).toHaveLength(1);
  });

  it('parseReply reads text, tool_use and truncation', () => {
    const r = a.parseReply({
      content: [{ type: 'text', text: ' Hello ' }, { type: 'tool_use', id: 'u1', name: 'play', input: { a: 1 } }],
      stop_reason: 'max_tokens',
    });
    expect(r).toEqual({ text: 'Hello', toolCalls: [{ id: 'u1', name: 'play', args: { a: 1 } }], truncated: true });
    expect(a.parseReply({ content: [] }).text).toBeNull();
  });

  it('appendToolTurn pushes one assistant turn and ONE user turn of tool_results', () => {
    const messages: Array<Record<string, unknown>> = [];
    const second = { id: 't2', name: 'play', args: {} };
    a.appendToolTurn(messages, { text: 'ok', toolCalls: [call, second], truncated: false },
      [{ call, outcome: { ok: true, content: 'A' } }, { call: second, outcome: { ok: false, content: 'B' } }]);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'assistant', content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't1' }, { type: 'tool_use', id: 't2' }] });
    expect(messages[1]).toMatchObject({ role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't1', content: 'A', is_error: false },
      { type: 'tool_result', tool_use_id: 't2', content: 'B', is_error: true },
    ] });
  });

  it('the nudge merges into a tool_result user turn and is a new user message otherwise', () => {
    const messages: Array<Record<string, unknown>> = [{ role: 'user', content: 'hi' }];
    a.appendToolTurn(messages, { text: null, toolCalls: [call], truncated: false }, [{ call, outcome: { ok: true, content: 'A' } }]);
    const merged = a.appendUserNudge([...messages], 'now');
    expect(merged).toHaveLength(3);
    expect((merged[2].content as unknown[])[1]).toEqual({ type: 'text', text: 'now' });
    expect(messages[2].content as unknown[]).toHaveLength(1); // the original is untouched
    expect(a.appendUserNudge([{ role: 'assistant', content: 'x' }], 'now')).toHaveLength(2);
  });

  it('mapError', () => {
    const err = (s: number, message?: string) => a.mapError(s, message ? { error: { message } } : null);
    expect(err(401)).toMatchObject({ kind: 'auth', message: expect.stringContaining('Anthropic key was rejected') });
    expect(err(403).kind).toBe('auth');
    expect(err(400, 'Your credit balance is too low')).toMatchObject({ kind: 'credit' });
    expect(err(400, 'bad field').kind).toBe('bad-request');
    expect(err(429).kind).toBe('rate');
    expect(err(529).kind).toBe('server');
    expect(err(401)).toBeInstanceOf(ProviderError);
  });
});
