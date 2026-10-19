import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateSong, fetchStyles } from '../generateClient';

afterEach(() => vi.unstubAllGlobals());

describe('generateClient', () => {
  it('throws the server message on a non-2xx generate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'unknown style "x"' }), { status: 400 })));
    await expect(generateSong({ style: 'x', seed: 1 })).rejects.toThrow('unknown style "x"');
  });
  it('falls back to the status when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 502 })));
    await expect(fetchStyles()).rejects.toThrow('HTTP 502');
  });
});
