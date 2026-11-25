/**
 * Worklet-loaded Emscripten glues get their wasm bytes as Module.wasmBinary,
 * because an AudioWorklet has no fetch. emcc 7 drops wasmBinary from the
 * default INCOMING_MODULE_JS_API, so each build below names it explicitly
 * (2026-11-25, thoughts/spot/2026-11-25-glue-wasmbinary.md). locateFile points
 * at a missing file so the glue cannot fall back to reading its .wasm from disk.
 * GTUltra's deeper load-and-play check lives in gtultra/__tests__/gtUltraWasmBinary.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

interface GlueModule {
  _malloc: (n: number) => number;
  HEAPU8: Uint8Array;
}

const GLUES = [
  { name: 'GTUltra', dir: 'public/gtultra', factory: 'createGTUltra' },
  { name: 'Pxtone', dir: 'public/pxtone', factory: 'createPxtone' },
  // Built with ENVIRONMENT=worker: the glue reads self.location.href at start.
  { name: 'ProTracker4', dir: 'public/protracker4', factory: 'createProTracker4' },
];

describe('Emscripten glues instantiate from wasmBinary alone', () => {
  it.each(GLUES)('$name', async ({ name, dir: rel, factory }) => {
    const dir = join(process.cwd(), rel);
    const file = join(dir, `${name}.js`);
    const js = readFileSync(file, 'utf8');
    const wasmBinary = readFileSync(join(dir, `${name}.wasm`));
    const self = { location: { href: 'file:///nonexistent/' } };
    const create = new Function('require', '__dirname', '__filename', 'self', `${js}\nreturn ${factory};`)(
      createRequire(import.meta.url), dir, file, self,
    ) as (m: object) => Promise<GlueModule>;
    const m = await create({
      wasmBinary,
      locateFile: () => `/nonexistent/${name}.wasm`,
      print: () => {}, printErr: () => {},
    });
    const ptr = m._malloc(16);
    expect(ptr).toBeGreaterThan(0);
    m.HEAPU8[ptr] = 0xab;
    expect(m.HEAPU8[ptr]).toBe(0xab);
  });
});
