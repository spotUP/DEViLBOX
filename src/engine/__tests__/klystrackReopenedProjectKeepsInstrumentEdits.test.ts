/**
 * KIE-5 (klystrack instrument editor): a project saved after instrument edits and reopened loads the ORIGINAL file
 * into the engine, and the engine's songData used to overwrite the edited instruments in the store (and the engine
 * kept the original ones, so the next .kt save lost the edit too).
 *
 * Real worklet + WASM on the real song. The KlysEngine singleton is replaced by one that forwards setInstrumentData
 * to the harness worklet, so applyKlysSongData's engine writes are the real messages.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startWorklet, songBuffer } from './workletHarness';
import { klysTransform, packKlysInstrument, type KlysSongData } from '@/engine/klystrack/KlysEngine';

type Worklet = Awaited<ReturnType<typeof startWorklet>>;
interface Msg { type?: string; data?: ArrayBuffer }
const SONG = 'public/data/songs/klystrack/Ocean Loader III.kt';

const bridge = vi.hoisted(() => ({ sent: [] as Array<{ idx: number; data: ArrayBuffer }>, pending: [] as Promise<unknown>[], w: null as null | { send(m: object): Promise<void> } }));
vi.mock('@/engine/klystrack/KlysEngine', async (importActual) => {
  const actual = await importActual<typeof import('@/engine/klystrack/KlysEngine')>();
  const engine = {
    setInstrumentData(idx: number, inst: Parameters<typeof actual.packKlysInstrument>[0]) {
      const data = actual.packKlysInstrument(inst).buffer as ArrayBuffer;
      bridge.sent.push({ idx, data });
      bridge.pending.push(bridge.w!.send({ type: 'setInstrumentData', idx, data }));
    },
  };
  return { ...actual, KlysEngine: { getInstance: () => engine, hasInstance: () => true } };
});

import { applyKlysSongData } from '@/engine/klystrack/klysSongData';
import { parseKlystrack } from '@/lib/import/formats/KlysParser';
import { useFormatStore } from '@stores/useFormatStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';

async function loaded(buffer: ArrayBuffer): Promise<{ w: Worklet; data: KlysSongData }> {
  const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
  await w.send({ type: 'loadSong', buffer });
  return { w, data: (w.posted as unknown as Msg[]).find((m) => m.type === 'songData') as unknown as KlysSongData };
}

function storeFor(): void {
  const song = parseKlystrack(songBuffer(SONG));
  useFormatStore.setState({ klysNative: song.klysNative!, klysInstrumentUndoStack: [], klysInstrumentRedoStack: [] });
  useInstrumentStore.setState({ instruments: song.instruments });
}

describe('klystrack reopened project', () => {
  beforeEach(() => { bridge.sent.length = 0; bridge.pending.length = 0; });

  it('keeps edited instruments over the engine copy of the original file and sends them to the engine', { timeout: 120000 }, async () => {
    const first = await loaded(songBuffer(SONG));
    // The session that saved the project: engine data applied, then one edit through the one store action.
    storeFor();
    applyKlysSongData(first.data);
    const original = useFormatStore.getState().klysNative!.instruments[1];
    expect(useFormatStore.getState().klysNative!.instrumentsFrom).toBe('engine');
    useFormatStore.getState().setKlysInstrument(1, { cutoff: original.cutoff === 777 ? 778 : 777, name: 'Edited' });
    const saved = structuredClone(useFormatStore.getState().klysNative!);
    expect(saved.instrumentsFrom).toBe('edited');

    // Reopen: the saved native model is back in the store, the original file is loaded into a fresh worklet.
    const second = await loaded(songBuffer(SONG));
    bridge.w = second.w;
    useFormatStore.setState({ klysNative: saved });
    applyKlysSongData(second.data);
    await Promise.all(bridge.pending);

    const after = useFormatStore.getState().klysNative!;
    expect(after.instrumentsFrom).toBe('edited');
    expect(after.instruments[1].cutoff).toBe(saved.instruments[1].cutoff);
    expect(after.instruments[1].name).toBe('Edited');
    expect(bridge.sent.length, 'one setInstrumentData per instrument').toBe(saved.instruments.length);

    // The engine holds the edit: its saved song reads back the edited instrument.
    (second.w.posted as unknown as Msg[]).splice(0);
    await second.w.send({ type: 'serializeSong' });
    const bytes = (second.w.posted as unknown as Msg[]).find((m) => m.type === 'serializeSongResult')!.data!;
    const reread = (await loaded(bytes)).data.instruments[1]!;
    expect(reread.cutoff).toBe(saved.instruments[1].cutoff);
    expect(reread.name).toBe('Edited');
    expect(packKlysInstrument(reread).length).toBe(147);
  });

  it('a song whose instruments were never edited still takes the engine copy', { timeout: 120000 }, async () => {
    const { data } = await loaded(songBuffer(SONG));
    storeFor();
    applyKlysSongData(data);
    const native = useFormatStore.getState().klysNative!;
    expect(native.instrumentsFrom).toBe('engine');
    expect(native.instruments[1].cutoff).toBe(data.instruments[1]!.cutoff);
    expect(bridge.sent).toEqual([]);
  });
});
