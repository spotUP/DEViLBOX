/**
 * Owner 2026-10-14: budokan.rh (6 tunes) on nuade showed a subsong control that did nothing. The tune switch reopens
 * the file from the format store's data field, and playOnNuade had moved the module to nuadeFileData; the nuade song
 * also never told the engine which tune the grid shows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const openSong = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/song/openSong', () => ({ openSong: (...a: unknown[]) => openSong(...(a as [])) }));
vi.mock('@stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import { useFormatStore } from '@stores/useFormatStore';
import { reopenAtFileSubsong } from '../reopenSubsong';
import { playOnNuade } from '@/lib/import/parsers/withNuade';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const bytes = (): ArrayBuffer => {
  const b = readFileSync(join(__dirname, '../../../../public/data/songs/rob-hubbard/budokan.rh'));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('a multi-tune file played on nuade', () => {
  beforeEach(() => { openSong.mockClear(); });

  it('starts nuade on the tune the grid shows and keeps the tune list', () => {
    const song = { instruments: [], patterns: [], format: 'MOD', fileSubsongs: { count: 6, current: 3, fileName: 'budokan.rh' } } as unknown as TrackerSong;
    playOnNuade(song, 'robhubbard', bytes(), 'budokan.rh');
    expect(song.nuadeSubsong).toBe(3);
    expect(song.fileSubsongs).toEqual({ count: 6, current: 3, fileName: 'budokan.rh' });
  });

  it('the subsong control reopens the file on the chosen tune (the module is in nuadeFileData, not the format field)', async () => {
    useFormatStore.setState({ fileSubsongs: { count: 6, current: 0, fileName: 'budokan.rh' }, nuadeFileData: bytes(), uadeEditableFileData: null } as never);
    await reopenAtFileSubsong(2);
    expect(openSong).toHaveBeenCalledTimes(1);
    expect(openSong.mock.calls[0]).toMatchObject([{ name: 'budokan.rh' }, { origin: 'subsong', subsong: 2 }]);
  });
});
