/**
 * A live subsong switch on a non-editable UADE song (the parser drew one tune's grid, UADE plays it)
 * reopens the file on the new tune, so the grid and the audio subsong are the same tune.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const openSong = vi.fn(async (_src: unknown, _o: unknown) => ({ ok: true as const }));
vi.mock('@/lib/song/openSong', () => ({ openSong: (s: unknown, o: unknown) => openSong(s, o) }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/tracker/playhead', () => ({ rewindPlayhead: vi.fn() }));
// The real tracker and transport stores pull the whole engine graph (85 s to load under a busy machine, past the
// pre-push timeout). The reopen path reads only isPlaying from the transport.
vi.mock('@stores/useTrackerStore', () => ({ useTrackerStore: { getState: () => ({}) } }));
vi.mock('@stores/useTransportStore', () => ({ useTransportStore: { getState: () => ({ isPlaying: false }) } }));

import { switchSubsong, uadeSubsongsFallback } from '@/lib/tracker/subsongSwitch';
import { useFormatStore } from '@/stores/useFormatStore';

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../public/data/songs/formats/centurion_battle.rh');

describe('switching the tune of a non-editable UADE song', () => {
  beforeEach(() => openSong.mockClear());

  it('opens the file again on the tune asked for', async () => {
    const b = readFileSync(FILE);
    const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const model = uadeSubsongsFallback({ uadeEditableFileName: 'centurion_battle.rh', initialSpeed: 6 }, { subsongCount: 4 }, 0)!;
    useFormatStore.setState({
      uadeEditableSubsongs: model, uadeEditableCurrentSubsong: model.start,
      uadeEditableFileData: bytes, uadeEditableFileName: 'centurion_battle.rh',
      furnaceSubsongs: null, sidMetadata: null, activisionProSubsongCount: 0, fileSubsongs: null, nativeSubsongs: null,
    });
    await switchSubsong(2);
    expect(openSong).toHaveBeenCalledTimes(1);
    const [src, opts] = openSong.mock.calls[0] as [{ name: string; bytes: ArrayBuffer }, { origin: string; subsong: number }];
    expect(src.name).toBe('centurion_battle.rh');
    expect(src.bytes.byteLength).toBe(bytes.byteLength);
    expect(opts).toMatchObject({ origin: 'subsong', subsong: 2 });
  });
});
