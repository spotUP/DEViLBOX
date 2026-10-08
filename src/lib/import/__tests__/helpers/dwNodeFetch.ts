/**
 * Lets DavidWhittakerWasmExtractor load public/davidwhittaker/ under vitest (Node), the way
 * ayletNodeFetch.ts does for aylet: `fetch` answers from disk and the emscripten web/worker bundle
 * gets the globals it probes for.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';

const ROOT = resolve(__dirname, '../../../../..');

/** Install; returns the restore function. */
export function installDwNodeFetch(): () => void {
  return installWasmNodeFetch('davidwhittaker', 'DavidWhittaker');
}

/**
 * The same for any emscripten bundle that lives in public/<dir>/<name>.js + .wasm and is loaded by
 * fetching both (an extractor in the AyletWasmExtractor pattern: DavidWhittaker, Bd).
 */
export function installWasmNodeFetch(dir: string, name: string): () => void {
  return installWasmNodeFetches([[dir, name]]);
}

/** The same for several bundles at once (a song whose import fetches more than one: Hippel's decoder, DW's replayer). */
export function installWasmNodeFetches(bundles: ReadonlyArray<readonly [dir: string, name: string]>): () => void {
  const [[dir, name]] = bundles;
  const g = globalThis as Record<string, unknown>;
  const hadSelf = typeof g.self !== 'undefined';
  if (!hadSelf) g.self = globalThis;
  (g.self as Record<string, unknown>).location ??= { href: `file:///${dir}/${name}.js` };
  const hadWGS = typeof g.WorkerGlobalScope !== 'undefined';
  if (!hadWGS) g.WorkerGlobalScope = class {};
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  vi.stubGlobal('fetch', async (url: string) => {
    for (const [d, n] of bundles) {
      const m = new RegExp(`${d}/(${n}\\.(?:js|wasm))$`).exec(url);
      if (m) return new Response(readFileSync(resolve(ROOT, 'public', d, m[1])), { status: 200 });
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  });
  return () => {
    vi.unstubAllGlobals();
    Object.defineProperty(process, 'versions', versions);
    if (!hadWGS) delete g.WorkerGlobalScope;
    if (!hadSelf) delete g.self;
  };
}
