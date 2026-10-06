/**
 * SAP Warhawk (and every mono SAP) played at double speed, an octave up:
 * asap_wasm_render asked ASAP for frames*4 bytes, but a one-POKEY tune has
 * 2-byte blocks, so it rendered twice the audio per call and the caller read
 * it as stereo frames. The song position ASAP reports must advance by the
 * wall time rendered, and a mono tune must come out on both channels.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';

const ROOT = process.cwd();
const SONGS = join(ROOT, 'public/data/songs/sap');
const RATE = 44100;

interface AsapModule {
  _malloc: (n: number) => number;
  _free: (p: number) => void;
  _asap_wasm_init: (sampleRate: number) => void;
  _asap_wasm_load: (ptr: number, len: number, namePtr: number) => number;
  _asap_wasm_render: (ptr: number, frames: number) => number;
  _asap_wasm_get_position: () => number;
  _asap_wasm_get_channels: () => number;
  _asap_wasm_stop: () => void;
}

let b: WebBundle<AsapModule>;
beforeAll(async () => {
  b = await loadWebBundle<AsapModule>(join(ROOT, 'public/asap/Asap.js'), join(ROOT, 'public/asap/Asap.wasm'), 'createAsap');
}, 60_000);

function renderThreeSeconds(name: string) {
  const m = b.module;
  m._asap_wasm_init(RATE);
  const data = new Uint8Array(readFileSync(join(SONGS, name)));
  const ptr = m._malloc(data.length);
  b.heap().set(data, ptr);
  const nameBytes = new TextEncoder().encode(`${name}\0`);
  const namePtr = m._malloc(nameBytes.length);
  b.heap().set(nameBytes, namePtr);
  expect(m._asap_wasm_load(ptr, data.length, namePtr)).toBe(1);
  m._free(ptr); m._free(namePtr);
  const frames = 1000;
  const buf = m._malloc(frames * 4);
  let total = 0, mismatched = 0;
  for (let calls = 0; calls < (3 * RATE) / frames; calls++) {
    const got = m._asap_wasm_render(buf, frames);
    expect(got).toBe(frames);
    const h = new Int16Array(b.heap().buffer, buf, got * 2);
    for (let i = 0; i < got; i++) if (h[i * 2] !== h[i * 2 + 1]) mismatched++;
    total += got;
  }
  const out = { posMs: m._asap_wasm_get_position(), channels: m._asap_wasm_get_channels(), total, mismatched };
  m._free(buf);
  m._asap_wasm_stop();
  return out;
}

describe('ASAP render speed', () => {
  for (const name of readdirSync(SONGS).filter((n) => /\.sap$/i.test(n)).sort()) {
    it(`${name}: three seconds rendered advance the song by three seconds, not six`, () => {
      const r = renderThreeSeconds(name);
      expect(Math.abs(r.posMs - (r.total / RATE) * 1000)).toBeLessThan(30);
      // a mono tune is spread over both channels
      if (r.channels === 1) expect(r.mismatched).toBe(0);
    });
  }
});
