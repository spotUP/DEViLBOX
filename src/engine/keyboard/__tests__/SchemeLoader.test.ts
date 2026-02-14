import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchemeLoader } from '../SchemeLoader';

// Mock fetch
global.fetch = vi.fn();

describe('SchemeLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads scheme from JSON file', async () => {
    const mockScheme = {
      name: 'FastTracker 2',
      version: '1.0.0',
      platform: {
        pc: { 'Space': 'play_stop_toggle' },
        mac: { 'Space': 'play_stop_toggle' }
      }
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockScheme
    });

    const loader = new SchemeLoader();
    const scheme = await loader.loadScheme('fasttracker2');

    expect(scheme).toEqual(mockScheme);
    expect(global.fetch).toHaveBeenCalledWith('/keyboard-schemes/fasttracker2.json');
  });

  it('maps key combo to command for PC platform', async () => {
    const mockScheme = {
      name: 'Test',
      version: '1.0.0',
      platform: {
        pc: { 'Ctrl+C': 'copy_selection' },
        mac: { 'Cmd+C': 'copy_selection' }
      }
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockScheme
    });

    const loader = new SchemeLoader();
    await loader.loadScheme('test');

    const command = loader.getCommand('Ctrl+C', 'pc');
    expect(command).toBe('copy_selection');
  });

  it('maps key combo to command for Mac platform', async () => {
    const mockScheme = {
      name: 'Test',
      version: '1.0.0',
      platform: {
        pc: { 'Ctrl+C': 'copy_selection' },
        mac: { 'Cmd+C': 'copy_selection' }
      }
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockScheme
    });

    const loader = new SchemeLoader();
    await loader.loadScheme('test');

    const command = loader.getCommand('Cmd+C', 'mac');
    expect(command).toBe('copy_selection');
  });
});
