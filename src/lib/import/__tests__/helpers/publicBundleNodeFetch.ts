/**
 * Lets a main-thread wasm extractor (PsgplayWasmExtractor, AdPlug-style:
 * fetches `<BASE_URL><dir>/<file>`) load its bundle from public/ under
 * vitest (Node).
 *
 * `fetch` answers from disk for files under `dir`, and the emscripten
 * web/worker bundle gets the globals it probes for (the same hack
 * src/engine/__tests__/mdxMuteMask.test.ts uses).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';

const ROOT = resolve(__dirname, '../../../../..');

/** Install for `public/<dir>/`; returns the restore function. */
export function installPublicBundleNodeFetch(dir: string): () => void {
  const g = globalThis as Record<string, unknown>;
  const hadSelf = typeof g.self !== 'undefined';
  if (!hadSelf) g.self = globalThis;
  (g.self as Record<string, unknown>).location ??= { href: `file:///${dir}/` };
  const hadWGS = typeof g.WorkerGlobalScope !== 'undefined';
  if (!hadWGS) g.WorkerGlobalScope = class {};
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  const pattern = new RegExp(`${dir}/([^/?]+)$`);
  vi.stubGlobal('fetch', async (url: string) => {
    const m = pattern.exec(url);
    if (!m) throw new Error(`unexpected fetch in test: ${url}`);
    return new Response(readFileSync(resolve(ROOT, 'public', dir, m[1])), { status: 200 });
  });
  return () => {
    vi.unstubAllGlobals();
    Object.defineProperty(process, 'versions', versions);
    if (!hadWGS) delete g.WorkerGlobalScope;
    if (!hadSelf) delete g.self;
  };
}
