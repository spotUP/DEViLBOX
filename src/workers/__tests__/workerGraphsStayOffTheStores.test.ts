/**
 * No worker reaches the app's stores through its static imports.
 *
 * Vite bundles every worker entry as a separate Rollup build, and a worker
 * created from two places is bundled twice at the same time (the worker bundle
 * cache is only filled when a build finishes). The DJ render worker is created
 * by DJPipeline and by useChannelTypeStore. When sidPlayerClock took two BPM
 * constants from autodj/moduleBeatGrid, the worker reached songChannelIdentity
 * and through it every song store, ToneEngine and the synths: 2619 modules,
 * bundled twice beside the main graph. `vite build` peaked at 4.6 GB of heap in
 * the transform phase and CI died at its 4 GB limit
 * ("Ineffective mark-compacts near heap limit").
 *
 * A store in a worker is also wrong at runtime: zustand stores and their
 * persistence run there with no app to serve.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, reachableFiles } from '@/test/importGraph';

const WORKERS = fs.readdirSync(path.join(ROOT, 'src/workers'))
  .filter((f) => /\.worker\.ts$/.test(f))
  .map((f) => `src/workers/${f}`);

describe('worker import graphs', () => {
  it('finds the worker entries', () => {
    expect(WORKERS).toContain('src/workers/dj-render.worker.ts');
  });

  it('no worker statically imports a store', () => {
    const offenders: string[] = [];
    for (const worker of WORKERS) {
      for (const [file, chain] of reachableFiles(worker)) {
        if (file.startsWith('src/stores/')) { offenders.push(chain.join(' -> ')); break; }
      }
    }
    expect(offenders).toEqual([]);
  }, 60000);
});
