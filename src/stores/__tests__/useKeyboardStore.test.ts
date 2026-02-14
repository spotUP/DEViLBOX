import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useKeyboardStore } from '../useKeyboardStore';

describe('useKeyboardStore', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('validates scheme name and warns on invalid input', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    useKeyboardStore.getState().setActiveScheme('');
    expect(useKeyboardStore.getState().activeScheme).toBe('fasttracker2'); // unchanged
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid scheme name'), '');

    consoleSpy.mockRestore();
  });

  it('persists changes to localStorage', () => {
    useKeyboardStore.getState().setActiveScheme('impulse-tracker');

    // Check localStorage was updated
    const stored = localStorage.getItem('keyboard-preferences');
    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!);
    expect(parsed.state.activeScheme).toBe('impulse-tracker');
  });
});
