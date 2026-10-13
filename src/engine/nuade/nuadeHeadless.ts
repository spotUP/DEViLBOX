/**
 * Headless nuade: the Nuade WASM (public/nuade/Nuade.{js,wasm}) driven from Node, no AudioContext. Used by the
 * comparison tooling (tools/nuade/) and by tests that need the engine's real output. The calls live in nuadeDriver.ts.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NuadeDriver } from './nuadeDriver';
import type { NuadeModule } from './nuadeModule';

export * from './nuadeDriver';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

let modulePromise: Promise<NuadeModule> | null = null;
function loadModule(): Promise<NuadeModule> {
  modulePromise ??= (async () => {
    // Evaluated as CommonJS: the package is "type": "module", which would make require() treat the .js as ESM.
    const file = resolve(ROOT, 'public/nuade/Nuade.js');
    const mod: { exports: unknown } = { exports: {} };
    new Function('module', 'exports', 'require', '__filename', '__dirname', readFileSync(file, 'utf8'))(
      mod, mod.exports, createRequire(import.meta.url), file, dirname(file),
    );
    const factory = mod.exports as (cfg: object) => Promise<NuadeModule>;
    return factory({ wasmBinary: readFileSync(resolve(ROOT, 'public/nuade/Nuade.wasm')) });
  })();
  return modulePromise;
}

export class NuadeHeadless extends NuadeDriver {
  /** One instance per call shares the WASM module's single song slot: use one at a time. */
  static async create(sampleRate = 48000): Promise<NuadeHeadless> {
    const m = await loadModule();
    m._nw_init(sampleRate);
    return new NuadeHeadless(m, sampleRate);
  }
}
