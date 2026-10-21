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

const chunked = (chunks: string[]): Response => {
  const enc = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); },
  }), { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
};
const lines = [
  { seq: 0, type: 'start', mode: 'generate' },
  { seq: 1, type: 'section', section: 0 },
  { seq: 2, type: 'done', mode: 'generate', samples: 0, song: { format: 'x', name: 'café é' } },
].map((e) => JSON.stringify(e)).join('\n') + '\n';

describe('generateSong streaming (R2c)', () => {
  it('without onEvent behaves as before: plain request, response text returned', async () => {
    const fetchMock = vi.fn(async () => new Response('{"song":1}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await generateSong({ style: 'trap', seed: 1 })).toBe('{"song":1}');
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ style: 'trap', seed: 1 });
  });
  it('asks for events, delivers every line in order and returns the done line song', async () => {
    const fetchMock = vi.fn(async () => chunked([lines]));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    const text = await generateSong({ style: 'trap', seed: 1 }, undefined, { onEvent: (e) => seen.push(e.type) });
    expect(seen).toEqual(['start', 'section', 'done']);
    expect(JSON.parse(text)).toEqual({ format: 'x', name: 'café é' });
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).events).toBe(true);
  });
  it('joins lines and multi-byte characters split across chunk boundaries', async () => {
    const bytes = new TextEncoder().encode(lines);
    const cut = [7, 40, bytes.length - 9]; // inside a line, and inside the two-byte e-acute
    const enc = new TextEncoder();
    const parts: Uint8Array[] = [];
    let from = 0;
    for (const c of [...cut, bytes.length]) { parts.push(bytes.slice(from, c)); from = c; }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(c) { for (const p of parts) c.enqueue(p); c.close(); },
    }), { status: 200 })));
    void enc;
    const seen: number[] = [];
    const text = await generateSong({ style: 'trap', seed: 1 }, undefined, { onEvent: (e) => seen.push(e.seq) });
    expect(seen).toEqual([0, 1, 2]);
    expect(JSON.parse(text).name).toBe('café é');
  });
  it('delivers a last line that has no newline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => chunked([lines.trimEnd()])));
    const seen: string[] = [];
    await generateSong({ style: 'trap', seed: 1 }, undefined, { onEvent: (e) => seen.push(e.type) });
    expect(seen).toEqual(['start', 'section', 'done']);
  });
  it('throws the server message of an error line after events started', async () => {
    const err = JSON.stringify({ type: 'error', error: 'generate failed', detail: 'Traceback boom' });
    vi.stubGlobal('fetch', vi.fn(async () => chunked([lines.split('\n')[0] + '\n', err + '\n'])));
    const seen: string[] = [];
    await expect(generateSong({ style: 'trap', seed: 1 }, undefined, { onEvent: (e) => seen.push(e.type) })).rejects.toThrow('generate failed: Traceback boom');
    expect(seen).toEqual(['start']);
  });
  it('throws when the stream ends without a done line', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => chunked([lines.split('\n').slice(0, 2).join('\n') + '\n'])));
    await expect(generateSong({ style: 'trap', seed: 1 }, undefined, { onEvent: () => undefined })).rejects.toThrow('without a done line');
  });
  it('a non-2xx streaming answer throws the JSON error as before', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'bad' }), { status: 400 })));
    await expect(generateSong({ style: 'x', seed: 1 }, undefined, { onEvent: () => undefined })).rejects.toThrow('bad');
  });
});
