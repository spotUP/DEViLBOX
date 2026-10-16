import { describe, it, expect, beforeEach } from 'vitest';
import { useAIKeysStore, keyHeadersFor } from '../useAIKeysStore';

describe('useAIKeysStore', () => {
  beforeEach(() => useAIKeysStore.setState({ keys: {} }));

  it('setKey trims and empty removes', () => {
    useAIKeysStore.getState().setKey('openrouter', '  sk-or-abc  ');
    expect(useAIKeysStore.getState().keys.openrouter).toBe('sk-or-abc');
    useAIKeysStore.getState().setKey('openrouter', '   ');
    expect('openrouter' in useAIKeysStore.getState().keys).toBe(false);
  });

  it('clearKey removes the entry', () => {
    useAIKeysStore.getState().setKey('openrouter', 'k');
    useAIKeysStore.getState().clearKey('openrouter');
    expect(useAIKeysStore.getState().keys).toEqual({});
  });

  it('keyHeadersFor sends the openrouter key only for the free provider', () => {
    const keys = { openrouter: 'k1', anthropic: 'k2', openai: 'k3' };
    expect(keyHeadersFor('free', keys)).toEqual({ 'x-openrouter-key': 'k1' });
    expect(keyHeadersFor('free', {})).toEqual({});
    expect(keyHeadersFor('claude', keys)).toEqual({});
    expect(keyHeadersFor('openai', keys)).toEqual({});
  });
});
