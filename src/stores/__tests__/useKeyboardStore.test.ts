import { describe, it, expect, beforeEach } from 'vitest';
import { useKeyboardStore } from '../useKeyboardStore';

describe('useKeyboardStore', () => {
  beforeEach(() => {
    useKeyboardStore.setState({
      activeScheme: 'fasttracker2',
      platformOverride: 'auto',
    });
  });

  it('has correct initial state', () => {
    const state = useKeyboardStore.getState();
    expect(state.activeScheme).toBe('fasttracker2');
    expect(state.platformOverride).toBe('auto');
  });

  it('can change active scheme', () => {
    useKeyboardStore.getState().setActiveScheme('impulse-tracker');
    expect(useKeyboardStore.getState().activeScheme).toBe('impulse-tracker');
  });

  it('can change platform override', () => {
    useKeyboardStore.getState().setPlatformOverride('mac');
    expect(useKeyboardStore.getState().platformOverride).toBe('mac');
  });
});
