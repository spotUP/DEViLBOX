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

  describe('error handling', () => {
    it('throws when scheme not found (404)', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const loader = new SchemeLoader();
      await expect(loader.loadScheme('missing')).rejects.toThrow(/404/);
      await expect(loader.loadScheme('missing')).rejects.toThrow(/Not Found/);
    });

    it('throws when JSON is malformed', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new SyntaxError('Unexpected token'); }
      });

      const loader = new SchemeLoader();
      await expect(loader.loadScheme('bad')).rejects.toThrow();
    });

    it('throws when schema is invalid (missing platform)', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'Test', version: '1.0.0' })
      });

      const loader = new SchemeLoader();
      await expect(loader.loadScheme('invalid')).rejects.toThrow(/Invalid scheme format/);
    });

    it('throws when platform.pc is missing', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'Test',
          version: '1.0.0',
          platform: { mac: { 'Space': 'play' } }
        })
      });

      const loader = new SchemeLoader();
      await expect(loader.loadScheme('invalid')).rejects.toThrow(/Invalid scheme format/);
    });

    it('returns undefined when no scheme loaded', () => {
      const loader = new SchemeLoader();
      expect(loader.getCommand('Space', 'pc')).toBeUndefined();
    });

    it('returns undefined for non-existent key combo', async () => {
      const mockScheme = {
        name: 'Test',
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
      await loader.loadScheme('test');
      expect(loader.getCommand('Alt+Z', 'pc')).toBeUndefined();
    });
  });
});
