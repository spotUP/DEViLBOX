/**
 * The loaded song surviving a hot reload.
 *
 * Observed repeatedly on 2026-09-21: editing `DubBus.ts` while playing reset
 * the project to "Untitled", one pattern, with the transport still running —
 * which presents as sudden silence and imitates a real playback fault closely
 * enough to have cost a wrong diagnosis once.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { dataOnly, keepAcrossHmr, type HotContext } from '../keepAcrossHmr';

/** A hot context that behaves like Vite's, so a reload can be driven twice. */
function fakeHot(data: Record<string, unknown> = {}): HotContext & { reload: () => void } {
  let disposer: ((d: Record<string, unknown>) => void) | null = null;
  return {
    data,
    dispose: (cb) => { disposer = cb; },
    reload: () => disposer?.(data),
  };
}

function fakeStore<T extends object>(initial: T) {
  let state = initial;
  return {
    getState: () => state,
    setState: (partial: Partial<T>) => { state = { ...state, ...partial }; },
  };
}

describe('dataOnly', () => {
  it('keeps the data', () => {
    expect(dataOnly({ name: 'world class dub', patterns: [1, 2], bpm: 125 }))
      .toEqual({ name: 'world class dub', patterns: [1, 2], bpm: 125 });
  });

  it('drops the functions', () => {
    // A store's actions live in its state. Restoring them from the old module
    // would reinstate the OLD closures and defeat the hot reload.
    const out = dataOnly({ name: 'x', play: () => {}, stop: () => {} });
    expect(out).toEqual({ name: 'x' });
  });

  it('leaves an empty object empty', () => {
    expect(dataOnly({})).toEqual({});
  });
});

describe('keepAcrossHmr', () => {
  it('does nothing at all outside a dev server', () => {
    // `import.meta.hot` is undefined in a production build.
    const store = fakeStore({ name: 'Untitled' });
    expect(() => keepAcrossHmr(undefined, store, 'project')).not.toThrow();
    expect(store.getState()).toEqual({ name: 'Untitled' });
  });

  it('carries the song over a reload', () => {
    const hot = fakeHot();
    const before = fakeStore({ name: 'world class dub', patterns: 15 });
    keepAcrossHmr(hot, before, 'project');

    hot.reload();                                   // module is replaced…
    const after = fakeStore({ name: 'Untitled', patterns: 1 });
    keepAcrossHmr(hot, after, 'project');           // …and re-executes

    expect(after.getState()).toEqual({ name: 'world class dub', patterns: 15 });
  });

  it('gives the new module its own actions back', () => {
    const oldPlay = vi.fn();
    const newPlay = vi.fn();
    const hot = fakeHot();
    keepAcrossHmr(hot, fakeStore({ name: 'dub', play: oldPlay }), 'x');
    hot.reload();

    const after = fakeStore({ name: 'Untitled', play: newPlay });
    keepAcrossHmr(hot, after, 'x');
    after.getState().play();

    expect(newPlay).toHaveBeenCalled();
    expect(oldPlay).not.toHaveBeenCalled();
    expect(after.getState().name).toBe('dub');
  });

  it('keeps each store in its own bucket, even sharing one module', () => {
    // Vite keeps one dispose callback per MODULE, so a naive second
    // registration would silently replace the first and drop that store.
    const hot = fakeHot();
    keepAcrossHmr(hot, fakeStore({ bpm: 125 }), 'transport');
    keepAcrossHmr(hot, fakeStore({ name: 'dub' }), 'project');
    hot.reload();

    const transport = fakeStore({ bpm: 0 });
    keepAcrossHmr(hot, transport, 'transport');
    expect(transport.getState()).toEqual({ bpm: 125 });
  });

  it('survives a store that cannot be read or written', () => {
    const hot = fakeHot({ project: { name: 'dub' } });
    const broken = {
      getState: () => { throw new Error('mid-teardown'); },
      setState: () => { throw new Error('mid-init'); },
    };
    expect(() => keepAcrossHmr(hot, broken as never, 'project')).not.toThrow();
    expect(() => hot.reload()).not.toThrow();
  });

  it('ignores a hot context that is not a real one', () => {
    // A test runner can hand over a partial context. Reading `data` off one
    // without it threw at module scope, which took the whole store down — 48
    // store-import tests went red on the first attempt at this.
    const store = fakeStore({ name: 'Untitled' });
    for (const partial of [{}, { data: undefined }, { data: {} }]) {
      expect(() => keepAcrossHmr(partial as never, store, 'project')).not.toThrow();
    }
    expect(store.getState()).toEqual({ name: 'Untitled' });
  });

  it('starts clean when there is nothing saved', () => {
    const store = fakeStore({ name: 'Untitled' });
    keepAcrossHmr(fakeHot(), store, 'project');
    expect(store.getState()).toEqual({ name: 'Untitled' });
  });
});

/**
 * One reachability test: a helper nothing calls carries nothing.
 */
describe('the stores that hold a song use it', () => {
  const root = join(__dirname, '..', '..', '..');
  for (const [file, key] of [
    ['useTrackerStore.ts', 'tracker'],
    ['useProjectStore.ts', 'project'],
    ['useInstrumentStore.ts', 'instruments'],
    ['useTransportStore.ts', 'transport'],
    ['useMixerStore.ts', 'mixer'],
    ['useDubStore.ts', 'dub'],
    ['useDrumPadStore.ts', 'drumPad'],
  ] as const) {
    it(`${file} carries its state across a reload`, () => {
      const src = readFileSync(join(root, 'stores', file), 'utf8');
      expect(src).toContain(`keepAcrossHmr(import.meta.hot,`);
      expect(src).toContain(`'${key}')`);
    });
  }

  it('never self-accepts, which would stop the update reaching the UI', () => {
    const helper = readFileSync(join(__dirname, '..', 'keepAcrossHmr.ts'), 'utf8');
    const code = helper.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(code).not.toMatch(/\.accept\(/);
  });
});
