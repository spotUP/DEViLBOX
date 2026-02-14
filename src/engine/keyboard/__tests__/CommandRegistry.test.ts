// src/engine/keyboard/__tests__/CommandRegistry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { CommandRegistry } from '../CommandRegistry';

describe('CommandRegistry', () => {
  it('registers and executes a command', () => {
    const registry = new CommandRegistry();
    const handler = vi.fn(() => true);

    registry.register({
      name: 'test_command',
      contexts: ['pattern'],
      handler,
      description: 'Test command',
    });

    const result = registry.execute('test_command', 'pattern');

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('returns false for unknown command', () => {
    const registry = new CommandRegistry();
    const result = registry.execute('unknown', 'pattern');
    expect(result).toBe(false);
  });

  it('respects context restrictions', () => {
    const registry = new CommandRegistry();
    const handler = vi.fn(() => true);

    registry.register({
      name: 'pattern_only',
      contexts: ['pattern'],
      handler,
      description: 'Pattern only command',
    });

    // Should work in pattern context
    expect(registry.execute('pattern_only', 'pattern')).toBe(true);

    // Should NOT work in sample context
    expect(registry.execute('pattern_only', 'sample')).toBe(false);
    expect(handler).toHaveBeenCalledOnce(); // Only called once
  });
});
