/**
 * APP-IDLE-CPU item 4: with a Maschine connected, the MK2/MK3 screen manager
 * re-armed a frame every 100 ms forever and only skipped the draw when nothing
 * was dirty. It now arms one frame per change (throttled to ~10 fps) and
 * nothing while the screens hold still.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fakeStore = () => ({ subscribe: () => () => {}, getState: () => ({}) });
vi.mock('@/midi/MaschineHIDBridge', () => ({ getMaschineHIDBridge: () => ({ isConnected: () => false }) }));
vi.mock('@/stores/useTransportStore', () => ({ useTransportStore: fakeStore() }));
vi.mock('@/stores/useInstrumentStore', () => ({ useInstrumentStore: fakeStore() }));
vi.mock('@/stores/useOscilloscopeStore', () => ({ useOscilloscopeStore: fakeStore() }));
vi.mock('@/stores/useTrackerStore', () => ({ useTrackerStore: fakeStore() }));
vi.mock('@/stores/useDrumPadStore', () => ({ useDrumPadStore: fakeStore() }));
vi.mock('@/stores/useMIDIStore', () => ({ useMIDIStore: fakeStore() }));

let frames = 0;
beforeEach(() => {
  vi.useFakeTimers();
  frames = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames++;
    return setTimeout(() => cb(performance.now()), 16) as unknown as number;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  delete (window as unknown as Record<string, unknown>).__mk2ScreenManager;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('MK2 screen loop', () => {
  it('arms no frame while nothing changes and one per burst of changes', async () => {
    const { getMK2ScreenManager } = await import('../performance/screens/MK2ScreenManager');
    const mgr = getMK2ScreenManager();
    mgr.start();
    vi.advanceTimersByTime(2000);
    expect(frames).toBe(1); // the initial render only

    mgr.markDirty();
    mgr.markDirty();
    mgr.markDirty();
    vi.advanceTimersByTime(2000);
    expect(frames).toBe(2);

    mgr.stop();
    mgr.markDirty();
    vi.advanceTimersByTime(2000);
    expect(frames).toBe(2);
  });
});
