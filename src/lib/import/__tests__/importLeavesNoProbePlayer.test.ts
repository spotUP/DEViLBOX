/**
 * Every module import created a ChiptunePlayer (a libopenmpt AudioWorklet
 * plus a Gain) to read metadata and never released it: after ~30 song loads
 * 13 libopenmpt-processor instances were still running on the audio thread.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const live = { created: 0, disposed: 0 };

vi.mock('../ChiptunePlayer', () => ({
  ChiptunePlayer: class {
    private h: Record<string, (d?: unknown) => void> = {};
    constructor() { live.created++; }
    onInitialized(f: () => void) { this.h.init = f; queueMicrotask(() => f()); }
    onMetadata(f: (d: unknown) => void) { this.h.meta = f; }
    onError(f: (d: unknown) => void) { this.h.err = f; }
    async play() { setTimeout(() => this.h.meta?.({ title: 't', type: 'IT', channels: 4 }), 5); }
    stop() {}
    dispose() { live.disposed++; }
  },
}));

describe('module import', () => {
  beforeEach(() => { live.created = 0; live.disposed = 0; });

  it('importing ten modules leaves no libopenmpt probe player running', async () => {
    const { loadModuleFile } = await import('../ModuleLoader');
    for (let i = 0; i < 10; i++) {
      const info = await loadModuleFile(new File([new Uint8Array(64)], `s${i}.it`));
      expect(info.metadata.title).toBe('t');
    }
    expect(live.created).toBe(10);
    expect(live.disposed).toBe(live.created);
  });
});
