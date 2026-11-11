import { describe, it, expect } from 'vitest';
import { formatAIChatLog } from '../aiChatLog';

describe('formatAIChatLog', () => {
  it('writes every turn with full tool input and result, the models and the error', () => {
    const longResult = 'r'.repeat(500);
    const log = formatAIChatLog({
      provider: 'anthropic',
      model: 'auto',
      activeModel: 'claude-sonnet-5-5',
      error: 'The model took too long',
      isStreaming: false,
      messages: [
        { id: 'u', role: 'user', content: 'Make a Neo Geo song', toolCalls: [], timestamp: 0 },
        {
          id: 'a',
          role: 'assistant',
          content: '',
          toolCalls: [
            { tool: 'set_cell', input: { row: 0, note: 'C-4' }, result: longResult },
            { tool: 'play', input: {} },
          ],
          timestamp: 1000,
        },
      ],
    });
    expect(log).toContain('Provider: anthropic');
    expect(log).toContain('Model answering: claude-sonnet-5-5');
    expect(log).toContain('Error: The model took too long');
    expect(log).toContain('--- user 1970-01-01T00:00:00.000Z ---\nMake a Neo Geo song');
    expect(log).toContain('[tool 1] set_cell\n  input: {"row":0,"note":"C-4"}');
    expect(log).toContain(`  result: ${longResult}`);
    expect(log).toContain('[tool 2] play\n  input: {}\n  result: (no result)');
    expect(log).toContain('(no text)');
  });
});
