/**
 * The startup jingle went silent because public/devilbox1.mp3 was never a
 * tracked file: App's playStartupJingle fetched it, the dev server and the
 * live host answered with the SPA index.html, and preload swallowed the
 * decode failure. These tests pin the asset to the URL the startup path uses
 * and make a missing asset fail loudly instead of playing nothing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JingleEngine, STARTUP_JINGLE_URL } from '../JingleEngine';

const PUBLIC_DIR = resolve(__dirname, '../../../../public');

class FakeAudioContext {
  static decodeCalls = 0;
  destination = {};
  createAnalyser() {
    return { fftSize: 0, connect: () => undefined };
  }
  async decodeAudioData(buf: ArrayBuffer) {
    FakeAudioContext.decodeCalls += 1;
    return { length: buf.byteLength } as unknown as AudioBuffer;
  }
  close() {
    return Promise.resolve();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeAudioContext.decodeCalls = 0;
});

describe('startup jingle asset', () => {
  it('is a real MP3 file in public/ at the URL the startup path fetches', () => {
    const file = resolve(PUBLIC_DIR, STARTUP_JINGLE_URL.replace(/^\//, ''));
    expect(existsSync(file)).toBe(true);
    const bytes = readFileSync(file);
    expect(bytes.length).toBeGreaterThan(50_000);
    const id3 = bytes.subarray(0, 3).toString('latin1') === 'ID3';
    const frameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    expect(id3 || frameSync).toBe(true);
  });

  it('preload rejects when the server answers with the HTML fallback', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })));
    await expect(new JingleEngine().preload(STARTUP_JINGLE_URL)).rejects.toThrow(/not found/);
    expect(FakeAudioContext.decodeCalls).toBe(0);
  });

  it('preload decodes the asset when it is served', async () => {
    const bytes = readFileSync(resolve(PUBLIC_DIR, STARTUP_JINGLE_URL.replace(/^\//, '')));
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })));
    await new JingleEngine().preload(STARTUP_JINGLE_URL);
    expect(FakeAudioContext.decodeCalls).toBe(1);
  });
});
