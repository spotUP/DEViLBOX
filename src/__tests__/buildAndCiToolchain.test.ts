/**
 * Guards for two CI-only breakages that the local gate could not see.
 *
 * 1. `vite build` failed with `Invalid value "iife" for option "worker.format"
 *    - UMD and IIFE output formats are not supported for code-splitting builds`
 *    once a worker graph reached a dynamic import() (songWalk.worker.ts ->
 *    songWalkClient -> import('./fpWalk') ...). Vite defaults worker.format to
 *    'iife'; the app's workers are all module workers, so the config must say
 *    'es'. The full production build takes ~4 min, too long for the pre-push
 *    gate, so this pins the config value instead.
 *
 * 2. CI ran Node 20, which cannot load a `.ts` file in a worker_threads Worker
 *    ("Unknown file extension .ts"); the render-worker tests passed locally on
 *    Node 24. Every workflow now takes its Node from .nvmrc, which must be a
 *    version that strips TypeScript types natively.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');

describe('production build', () => {
  it('emits module workers, so a worker whose graph code-splits still builds', () => {
    // Read as text: importing vite.config.ts runs its plugin factories
    // (version.json generation) as a side effect.
    const text = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(text).toMatch(/\n  worker:\s*\{[^}]*\bformat:\s*'es'/);
  });
});

describe('CI toolchain', () => {
  const workflowsDir = join(ROOT, '.github/workflows');
  const workflows = readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f));

  it('every workflow takes its Node version from .nvmrc, never a hard-coded one', () => {
    for (const wf of workflows) {
      const text = readFileSync(join(workflowsDir, wf), 'utf8');
      expect(text, wf).not.toMatch(/node-version:\s/);
      if (text.includes('actions/setup-node')) {
        expect(text, wf).toMatch(/node-version-file:\s*'\.nvmrc'/);
      }
    }
  });

  it('.nvmrc names a Node that loads .ts files in worker threads (type stripping, >= 22.18)', () => {
    const v = readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
    const [major, minor = 0] = v.split('.').map(Number);
    expect(major > 22 || (major === 22 && minor >= 18)).toBe(true);
  });
});
