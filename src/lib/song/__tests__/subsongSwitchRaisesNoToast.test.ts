/**
 * Selecting a subsong spammed toasts (owner 2026-10-14): a subsong switch is not an import, so it
 * raises no success or info toast for any source - the SUBSONG box shows the tune. A normal file
 * open still says "Imported ..." once; an error or warning still toasts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const toasts = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('@stores/useNotificationStore', () => ({ notify: toasts }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: toasts }));

const open = vi.hoisted(() => ({ openSong: vi.fn() }));
vi.mock('@/lib/song/openSong', () => open);

vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => ({ setSpeed2: vi.fn(), getC64SIDEngine: () => ({ setSubsong: vi.fn() }) }),
}));
vi.mock('@engine/uade/UADEEngine', () => ({
  UADEEngine: { hasInstance: () => true, getInstance: () => ({ setSubsong: vi.fn(), play: vi.fn() }) },
}));
vi.mock('@engine/activisionpro/ActivisionProEngine', () => ({
  ActivisionProEngine: { hasInstance: () => true, getInstance: () => ({ setSubsong: vi.fn(), play: vi.fn() }) },
}));
vi.mock('@engine/replayer/nativeSubsongPlayback', () => ({ selectNativeSubsong: vi.fn(async () => undefined) }));

import { useFormatStore } from '@stores/useFormatStore';
import { switchSubsong } from '@/lib/tracker/subsongSwitch';

const furnaceSub = (n: string) => ({
  name: n, patterns: [], songPositions: [0], initialBPM: 125, initialSpeed: 6,
});

const SOURCES: Array<[string, () => void]> = [
  ['furnace', () => useFormatStore.setState({
    furnaceSubsongs: [furnaceSub('a'), furnaceSub('b')] as never, furnaceActiveSubsong: 0 })],
  ['uade', () => useFormatStore.setState({
    uadeEditableSubsongs: { count: 3, speeds: [6, 6, 6] } as never, uadeEditableCurrentSubsong: 0 })],
  ['sid', () => useFormatStore.setState({
    sidMetadata: { subsongs: 3, currentSubsong: 0, defaultSubsong: 0 } as never })],
  ['activisionPro', () => useFormatStore.setState({
    activisionProSubsongCount: 3, activisionProCurrentSubsong: 0 })],
  ['native', () => useFormatStore.setState({ nativeSubsongs: { count: 3, current: 0 } as never })],
  ['file', () => {
    useFormatStore.setState({ fileSubsongs: { count: 3, current: 0, fileName: 'x.dw' } as never });
    (useFormatStore.setState as (s: object) => void)({ nuadeFileData: new ArrayBuffer(8) });
  }],
];

beforeEach(() => {
  vi.clearAllMocks();
  open.openSong.mockResolvedValue({ ok: true });
  useFormatStore.setState({
    furnaceSubsongs: null, uadeEditableSubsongs: null, sidMetadata: null, activisionProSubsongCount: 0,
    nativeSubsongs: null, fileSubsongs: null,
  } as never);
});

describe('a subsong switch raises no success or info toast', () => {
  for (const [source, arrange] of SOURCES) {
    it(`${source}: switching to the next subsong toasts nothing`, async () => {
      arrange();
      await switchSubsong(1);
      if (source === 'file') expect(open.openSong).toHaveBeenCalledTimes(1);
      expect(toasts.success).not.toHaveBeenCalled();
      expect(toasts.info).not.toHaveBeenCalled();
    });
  }

  it('a failed file reopen still raises the error toast', async () => {
    SOURCES.find(([s]) => s === 'file')![1]();
    open.openSong.mockResolvedValue({ ok: false, error: 'boom' });
    await switchSubsong(1);
    expect(toasts.error).toHaveBeenCalledTimes(1);
  });
});
