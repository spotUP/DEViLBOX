import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchemeLoader } from '../SchemeLoader';
import type { KeyboardScheme } from '../types';

describe('SchemeLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads a valid scheme from JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'FastTracker 2',
        id: 'fasttracker2',
        version: '1.0.0',
        mappings: {
          'play-pattern': { pc: 'Alt+F5', mac: 'Option+F5' },
        },
      }),
    });

    const scheme = await SchemeLoader.load('fasttracker2');
    expect(scheme).toBeDefined();
    expect(scheme.id).toBe('fasttracker2');
    expect(scheme.mappings['play-pattern']).toEqual({ pc: 'Alt+F5', mac: 'Option+F5' });
  });

  it('throws error on invalid scheme ID', async () => {
    await expect(SchemeLoader.load('')).rejects.toThrow('Invalid scheme ID');
  });

  it('throws error on fetch failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(SchemeLoader.load('nonexistent')).rejects.toThrow('Failed to load');
  });
});
