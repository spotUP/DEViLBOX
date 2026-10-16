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

  it('keyHeadersFor sends only the chosen provider\'s own key header', () => {
    const keys = { openrouter: 'k1', anthropic: 'k2', openai: 'k3' };
    expect(keyHeadersFor('free', keys)).toEqual({ 'x-openrouter-key': 'k1' });
    expect(keyHeadersFor('anthropic', keys)).toEqual({ 'x-anthropic-key': 'k2' });
    expect(keyHeadersFor('openai', keys)).toEqual({ 'x-openai-key': 'k3' });
    expect(keyHeadersFor('free', {})).toEqual({});
    expect(keyHeadersFor('anthropic', { openai: 'k3' })).toEqual({});
    expect(keyHeadersFor('claude', keys)).toEqual({});
  });
});
