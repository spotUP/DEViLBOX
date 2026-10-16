import { describe, it, expect } from 'vitest';
import { AI_PROVIDERS, getModelsForProvider, getDefaultModel } from '../useAIStore';

describe('AI assistant providers', () => {
  it('lists all five providers with full-word labels, free first', () => {
    expect(AI_PROVIDERS.map((p) => [p.id, p.label])).toEqual([
      ['free', 'Free'], ['claude', 'Claude'], ['copilot', 'Copilot'], ['pi', 'Pi'], ['opencode', 'OpenCode'],
    ]);
  });

  it('gives Pi and OpenCode their own models, in provider/id form the CLIs accept', () => {
    expect(getModelsForProvider('pi').map((m) => m.id)).toEqual([
      'anthropic/claude-haiku-4-5', 'anthropic/claude-sonnet-4-6', 'anthropic/claude-opus-4-8',
    ]);
    expect(getModelsForProvider('opencode').map((m) => m.id)).toEqual([
      'opencode/big-pickle', 'opencode/claude-haiku-4-5', 'opencode/claude-sonnet-4-6', 'opencode/gpt-5',
    ]);
    expect(getDefaultModel('pi')).toBe('anthropic/claude-haiku-4-5');
    expect(getDefaultModel('opencode')).toBe('opencode/big-pickle');
  });
});
