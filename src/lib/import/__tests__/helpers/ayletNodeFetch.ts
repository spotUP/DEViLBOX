/**
 * Lets AyletWasmExtractor load public/aylet/ under vitest (Node).
 *
 * The extractor fetches the bundle the way the browser does; here `fetch`
 * answers from disk, and the emscripten web/worker bundle gets the globals
 * it probes for (the same hack src/engine/__tests__/mdxMuteMask.test.ts uses).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';

const ROOT = resolve(__dirname, '../../../../..');

/** Install; returns the restore function. */
export function installAyletNodeFetch(): () => void {
  const g = globalThis as Record<string, unknown>;
  const hadSelf = typeof g.self !== 'undefined';
  if (!hadSelf) g.self = globalThis;
  (g.self as Record<string, unknown>).location ??= { href: 'file:///aylet/Aylet.js' };
  const hadWGS = typeof g.WorkerGlobalScope !== 'undefined';
  if (!hadWGS) g.WorkerGlobalScope = class {};
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  vi.stubGlobal('fetch', async (url: string) => {
    const m = /aylet\/(Aylet\.(?:js|wasm))$/.exec(url);
    if (!m) throw new Error(`unexpected fetch in test: ${url}`);
    const bytes = readFileSync(resolve(ROOT, 'public/aylet', m[1]));
    return new Response(bytes, { status: 200 });
  });
  return () => {
    vi.unstubAllGlobals();
    Object.defineProperty(process, 'versions', versions);
    if (!hadWGS) delete g.WorkerGlobalScope;
    if (!hadSelf) delete g.self;
  };
}
