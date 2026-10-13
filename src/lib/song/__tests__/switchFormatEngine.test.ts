/** NS-7: switching a format's engine stores the choice and reopens the loaded song of that format on the other engine. */
import { describe, it, expect } from 'vitest';
import { switchFormatEngine, songBelongsTo, type SwitchDeps } from '../switchFormatEngine';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { NUADE_FORMATS } from '@/engine/nuade/nuadeFormats';

function rig(song: Partial<TrackerSong>, opts: { playing?: boolean; module?: ArrayBuffer | null; openOk?: boolean } = {}) {
  const calls: Record<string, unknown[]> = { choice: [], open: [], restore: [] };
  const deps: SwitchDeps = {
    getSong: () => ({ name: 'x', ...song }) as TrackerSong,
    isPlaying: () => opts.playing ?? false,
    position: () => ({ pattern: 3, row: 17 }),
    restorePosition: (p) => calls.restore!.push(p),
    moduleFor: async () => (opts.module === undefined ? new Uint8Array([9, 8, 7]).buffer : opts.module),
    open: async (name, bytes, companions, start) => { calls.open!.push({ name, len: bytes.byteLength, companions, start }); return opts.openOk === false ? { ok: false, error: 'boom' } : { ok: true }; },
    setChoice: (k, c) => calls.choice!.push([k, c]),
  };
  return { deps, calls };
}

describe('NS-7 switchFormatEngine', () => {
  it('stores the choice and reopens the loaded song of the format from its module, back at the order and row, playing if it was', async () => {
    const { deps, calls } = rig({ nuadePlayerId: 'soundmon', nuadeFileName: 'antidust.bp3' }, { playing: true });
    const r = await switchFormatEngine('soundmon', 'native', deps);
    expect(r).toEqual({ switched: true, reopened: true, stored: 'native' });
    expect(calls.choice).toEqual([['soundmon', 'native']]);
    expect(calls.open).toEqual([{ name: 'antidust.bp3', len: 3, companions: undefined, start: 'song' }]);
    expect(calls.restore).toEqual([{ pattern: 3, row: 17 }]);
  });

  it('a stopped song reopens stopped; a song of another format only stores the choice', async () => {
    const stopped = rig({ nuadePlayerId: 'soundmon', nuadeFileName: 'a.bp3' });
    await switchFormatEngine('soundmon', 'nuade', stopped.deps);
    expect((stopped.calls.open![0] as { start: unknown }).start).toBe(false);
    const other = rig({ nuadePlayerId: 'mmdc', nuadeFileName: 'a.mmdc' });
    expect(await switchFormatEngine('soundmon', 'nuade', other.deps)).toEqual({ switched: true, reopened: false, stored: 'nuade' });
    expect(other.calls.open).toEqual([]);
  });

  it('recognises a song that plays on UADE or our engine by the file name the format lists', async () => {
    expect(songBelongsTo({ name: 'x', uadeEditableFileName: 'dragon.rh' } as TrackerSong, NUADE_FORMATS.robhubbard!)).toBe(true);
    expect(songBelongsTo({ name: 'x', uadeEditableFileName: 'dragon.dm2' } as TrackerSong, NUADE_FORMATS.robhubbard!)).toBe(false);
    const { deps, calls } = rig({ uadeEditableFileName: 'dragon.rh' });
    expect((await switchFormatEngine('robHubbard', 'nuade', deps))).toMatchObject({ reopened: true });
    expect(calls.open).toHaveLength(1);
  });

  it('a replace row\'s UADE option is stored as what played before; an engine the row cannot play on, or an unknown key, is refused', async () => {
    const { deps, calls } = rig({});
    expect(await switchFormatEngine('earAche', 'uade', deps)).toMatchObject({ stored: 'native' });
    expect(calls.choice).toEqual([['earAche', 'native']]);
    const a = await switchFormatEngine('earAche', 'native', rig({}).deps);
    expect(a).toMatchObject({ switched: false });
    expect(await switchFormatEngine('nonsense', 'nuade', rig({}).deps)).toMatchObject({ switched: false, error: expect.stringContaining('nonsense') });
  });

  it('reports an open that fails and leaves the position alone', async () => {
    const { deps, calls } = rig({ nuadePlayerId: 'soundmon', nuadeFileName: 'a.bp3' }, { openOk: false });
    expect(await switchFormatEngine('soundmon', 'uade', deps)).toEqual({ switched: false, error: 'boom' });
    expect(calls.restore).toEqual([]);
  });
});
