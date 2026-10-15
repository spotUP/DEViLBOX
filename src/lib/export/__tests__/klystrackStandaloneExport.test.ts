/**
 * Standalone klystrack instruments are written into an exported .kt (owner: "we need to be able to export .kt").
 *
 * Route driven: exportAsKlystrack (the nativeExportRouter KT branch) -> planKlysExport -> KlysEngine.serializeSongWith ->
 * the real Klystrack worklet + WASM (klys_save_song_extended) -> the file is loaded by a SECOND real worklet.
 * Sentinel: the engine received serializeSongExtended.
 */
import { describe, it, expect, vi } from 'vitest';
import { startWorklet, songBuffer } from '@/engine/__tests__/workletHarness';

const seen = vi.hoisted(() => ({ w: null as null | { send(m: object): Promise<void>; posted: unknown[] }, sent: [] as Array<Record<string, unknown>> }));
const notified = vi.hoisted(() => ({ errors: [] as string[] }));

vi.mock('@stores/useNotificationStore', () => ({
  notify: { success: vi.fn(), warning: vi.fn(), info: vi.fn(), error: (m: string) => { notified.errors.push(m); } },
}));
vi.mock('@/engine/klystrack/KlysEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/klystrack/KlysEngine')>();
  const engine = Object.create(actual.KlysEngine.prototype) as Record<string, unknown>;
  // The worklet answers a serialize request with a serializeSongResult post; hand it to the waiting promise.
  engine.sendMessage = (msg: Record<string, unknown>) => {
    seen.sent.push(msg);
    const w = seen.w!;
    const before = w.posted.length;
    void w.send(msg).then(() => {
      const r = (w.posted.slice(before) as Array<{ type?: string; data?: ArrayBuffer; error?: string }>).find((m) => m.type === 'serializeSongResult');
      const e = engine as unknown as { _resolveSerialize: (b: ArrayBuffer) => void; _rejectSerialize: (e: Error) => void };
      if (r?.error) e._rejectSerialize(new Error(r.error));
      else if (r) e._resolveSerialize(r.data!);
    });
  };
  const K = actual.KlysEngine as unknown as { getInstance: () => unknown; hasInstance: () => boolean };
  K.getInstance = () => engine;
  K.hasInstance = () => true;
  return actual;
});

import { klysTransform, type KlysSongData } from '@/engine/klystrack/KlysEngine';
import { applyKlysSongData, klysInstrumentFromEngine } from '@/engine/klystrack/klysSongData';
import { KLYS_FIELDS, KLYS_FIELD_KEYS } from '@/engine/klystrack/klysInstrumentFields';
import { parseKlystrack } from '@/lib/import/formats/KlysParser';
import { exportAsKlystrack } from '../KlysExporter';
import { planKlysExport, KLYS_MAX_INSTRUMENTS } from '../klysStandaloneExport';
import { useFormatStore } from '@stores/useFormatStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { KLYS_PRESETS } from '@constants/klysPresets';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const SONG = 'public/data/songs/klystrack/Ocean Loader III.kt';
interface Msg { type?: string; data?: ArrayBuffer }
type W = Awaited<ReturnType<typeof startWorklet>>;

const songData = (w: W): KlysSongData => (w.posted as unknown as Array<Msg & KlysSongData>).filter((m) => m.type === 'songData').pop()!;
async function reload(buffer: ArrayBuffer): Promise<KlysSongData> {
  const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
  await w.send({ type: 'loadSong', buffer });
  return songData(w);
}
const standaloneConfig = (id: number, presetName: string): InstrumentConfig => ({
  id, name: presetName, type: 'synth', synthType: 'KlysSynth', effects: [], volume: -8, pan: 0,
  klystrack: structuredClone(KLYS_PRESETS.find((p) => p.name === presetName)!.instrument),
} as unknown as InstrumentConfig);

describe('exporting standalone klystrack instruments', () => {
  it('writes used standalone instruments into the table, renumbers their steps in the copy only, and leaves the live song alone', { timeout: 240_000 }, async () => {
    const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
    seen.w = w as never;
    await w.send({ type: 'loadSong', buffer: songBuffer(SONG) });
    const parsed = parseKlystrack(songBuffer(SONG));
    useFormatStore.setState({ klysNative: parsed.klysNative!, klysInstrumentUndoStack: [], klysInstrumentRedoStack: [] });
    const original = songData(w);
    applyKlysSongData(original);
    const live = useFormatStore.getState().klysNative!;
    const songCount = live.instruments.length;

    // Two standalone instruments past the song's table; the first is used by pattern 0 step 0, the second is not.
    const used = songCount + 2, unusedId = songCount + 5;
    const configs = [...parsed.instruments, standaloneConfig(used + 1, 'Deep Kick'), standaloneConfig(unusedId + 1, 'Chord Stab')];
    useInstrumentStore.setState({ instruments: configs });
    const patterns = structuredClone(live.patterns);
    patterns[0].steps[0] = { ...patterns[0].steps[0], note: 48, instrument: used };
    useFormatStore.setState({ klysNative: { ...live, patterns } });
    await w.send({ type: 'setPatternStep', patIdx: 0, stepIdx: 0, note: 48, instrument: used, ctrl: 0, volume: 255, cmdLo: 0, cmdHi: 0 });

    (w.posted as unknown[]).splice(0);
    await w.send({ type: 'serializeSong' });
    const liveBefore = new Uint8Array((w.posted as unknown as Msg[]).find((m) => m.type === 'serializeSongResult')!.data!);

    seen.sent.length = 0;
    const result = await exportAsKlystrack({ name: 'Mix' } as TrackerSong);
    expect(seen.sent.map((m) => m.type), 'sentinel: the extended serializer ran').toEqual(['serializeSongExtended']);
    const exported = await reload(await result.data.arrayBuffer());

    // Table: song instruments in their slots, then the used standalone one, then the unused one.
    expect(exported.instruments.length).toBe(songCount + 2);
    const field = (i: number) => KLYS_FIELD_KEYS.map((k) => KLYS_FIELDS[k].get(klysInstrumentFromEngine(exported.instruments[i]!)));
    const expected = (inst: InstrumentConfig) => KLYS_FIELD_KEYS.map((k) => KLYS_FIELDS[k].get(inst.klystrack!));
    expect(field(songCount)).toEqual(expected(configs[configs.length - 2]));
    expect(field(songCount + 1)).toEqual(expected(configs[configs.length - 1]));
    expect(exported.instruments[songCount]!.name).toBe('Deep Kick');
    expect(exported.instruments[songCount]!.program).toEqual(KLYS_PRESETS.find((p) => p.name === 'Deep Kick')!.instrument.program);
    // The step that named the standalone instrument now names its slot; every other step is as it was.
    expect(exported.patterns[0].steps[0].instrument).toBe(songCount);
    expect(exported.patterns[0].steps.slice(1)).toEqual(original.patterns[0].steps.slice(1));
    expect(exported.patterns[1]).toEqual(original.patterns[1]);
    expect(exported.instruments.slice(0, songCount)).toEqual(original.instruments);

    // The live song (engine and store) is untouched.
    (w.posted as unknown[]).splice(0);
    await w.send({ type: 'serializeSong' });
    expect(new Uint8Array((w.posted as unknown as Msg[]).find((m) => m.type === 'serializeSongResult')!.data!)).toEqual(liveBefore);
    expect(useFormatStore.getState().klysNative!.patterns[0].steps[0].instrument).toBe(used);
  });

  it('a song with no standalone instruments exports byte-identical to the engine serializer', { timeout: 240_000 }, async () => {
    const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
    seen.w = w as never;
    await w.send({ type: 'loadSong', buffer: songBuffer(SONG) });
    const parsed = parseKlystrack(songBuffer(SONG));
    useFormatStore.setState({ klysNative: parsed.klysNative! });
    useInstrumentStore.setState({ instruments: parsed.instruments });
    (w.posted as unknown[]).splice(0);
    await w.send({ type: 'serializeSong' });
    const direct = new Uint8Array((w.posted as unknown as Msg[]).find((m) => m.type === 'serializeSongResult')!.data!);
    seen.sent.length = 0;
    const result = await exportAsKlystrack({ name: 'Plain' } as TrackerSong);
    expect(seen.sent.map((m) => m.type)).toEqual(['serializeSong']);
    expect(new Uint8Array(await result.data.arrayBuffer())).toEqual(direct);
  });

  it('a project with standalone instruments and no klystrack song exports them in an empty song', { timeout: 240_000 }, async () => {
    const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
    seen.w = w as never;
    useFormatStore.setState({ klysNative: null });
    const configs = [standaloneConfig(1, 'Deep Kick'), standaloneConfig(2, 'Chord Stab')];
    useInstrumentStore.setState({ instruments: configs });
    const result = await exportAsKlystrack({ name: 'Bank' } as TrackerSong);
    const exported = await reload(await result.data.arrayBuffer());
    expect(exported.instruments.length).toBe(2);
    configs.forEach((c, i) => expect(KLYS_FIELD_KEYS.map((k) => KLYS_FIELDS[k].get(klysInstrumentFromEngine(exported.instruments[i]!)))).toEqual(KLYS_FIELD_KEYS.map((k) => KLYS_FIELDS[k].get(c.klystrack!))));
  });

  it('reports an error to the user, and drops nothing silently, when used standalone instruments do not fit 127', () => {
    const native = { instruments: new Array(KLYS_MAX_INSTRUMENTS - 1).fill(null), patterns: [{ steps: [{ instrument: 130 }, { instrument: 131 }] }] } as never;
    const configs = [standaloneConfig(131, 'Deep Kick'), standaloneConfig(132, 'Chord Stab')];
    const plan = planKlysExport(configs, native);
    expect(plan.error).toMatch(/at most 127/);
    // Unused ones that do not fit are left out WITH a warning.
    const unusedOnly = planKlysExport(configs, { ...(native as object), patterns: [] } as never);
    expect(unusedOnly.error).toBeUndefined();
    expect(unusedOnly.extra.length).toBe(1);
    expect(unusedOnly.warnings.join(' ')).toMatch(/left out/);
  });

  it('exportAsKlystrack notifies and throws on the over-limit error', async () => {
    const native = { instruments: new Array(KLYS_MAX_INSTRUMENTS - 1).fill(null), patterns: [{ steps: [{ instrument: 130 }, { instrument: 131 }] }] } as never;
    useFormatStore.setState({ klysNative: native });
    useInstrumentStore.setState({ instruments: [standaloneConfig(131, 'Deep Kick'), standaloneConfig(132, 'Chord Stab')] });
    notified.errors.length = 0;
    await expect(exportAsKlystrack({ name: 'Full' } as TrackerSong)).rejects.toThrow(/at most 127/);
    expect(notified.errors.length).toBe(1);
  });
});
