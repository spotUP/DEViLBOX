/**
 * The song analyzer's instrument verdicts against the owner's ear.
 *
 * fixtures/instrument-labels.json holds what the owner heard, per song and
 * instrument (pulled from the instrument list's role picker, or given in
 * conversation). Every labelled instrument the song plays must get the
 * owner's role and drum part; an instrument the song never plays has no
 * verdict and is not scored.
 *
 * First entries, 2026-09-29, micro15.mod: 0A read "kick" and 0B "snare"
 * because their spectra were judged at the samples' recorded speed; the song
 * plays them an octave up, where 0A is the snare and 0B a rimshot.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCorpusSong } from './classifierCorpus';
import type { InstrumentRole, DrumPart } from '../songAnalyzer';

vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
// The drag-and-drop import below, with only the audio engine, toasts and
// lookups mocked (as modAfterAhxIsClassic.test.ts runs it).
vi.mock('@/engine/ToneEngine', () => {
  const engine = { releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}), invalidateInstrument: vi.fn(), setBPM: vi.fn() };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

interface LabelledInstrument { role: InstrumentRole; drumPart?: DrumPart; note?: string }
interface LabelledSongInstruments { song: string; labelledBy: 'owner'; date: string; instruments: Record<string, LabelledInstrument> }

const LABELS = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/instrument-labels.json'), 'utf8')) as LabelledSongInstruments[];

function expectLabels(entry: LabelledSongInstruments, instruments: ReadonlyMap<number, { role: InstrumentRole; drumPart?: DrumPart }>) {
  for (const [id, truth] of Object.entries(entry.instruments)) {
    const v = instruments.get(Number(id));
    if (!v) continue; // not played in the song
    expect({ id, role: v.role, drumPart: v.drumPart }).toEqual({ id, role: truth.role, drumPart: truth.drumPart });
  }
}

describe('instrument verdicts match the owner\'s ear', () => {
  for (const entry of LABELS) {
    it(entry.song.split('/').pop()!, async () => {
      const { analyzeSong } = await import('../songAnalyzer');
      const song = await loadCorpusSong(entry.song);
      const a = analyzeSong(song.patterns, song.songPositions ?? [], new Map(song.instruments.map((i) => [i.id, i])));
      expectLabels(entry, a.instruments);
    }, 120000);
  }

  // The app loads a dropped .mod another way (importTrackerModule ->
  // convertMODModule), which numbers notes two octaves lower and keeps each
  // cell's period. The verdicts must not depend on the path.
  it('the same verdicts on a song loaded the way the app loads it', async () => {
    const entry = LABELS.find((e) => e.song.endsWith('micro15-goto80.mod'))!;
    const { parseMOD } = await import('@/lib/import/formats/MODParser');
    const { importTrackerModule } = await import('@/lib/file/UnifiedFileLoader');
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { analyzeSong } = await import('../songAnalyzer');
    const bytes = readFileSync(resolve(__dirname, '../../../..', entry.song));
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const parsed = await parseMOD(arrayBuffer);
    await importTrackerModule({
      metadata: { title: 'micro15', type: 'MOD', channels: 4, patterns: 5, orders: 6, instruments: 16, samples: 16, duration: 0 },
      arrayBuffer, file: new File([bytes], 'micro15.mod'),
      nativeData: { format: 'MOD', importMetadata: parsed.metadata, instruments: parsed.instruments, patterns: parsed.patterns },
    } as never, { useLibopenmpt: false } as never);
    await new Promise<void>((r) => queueMicrotask(r));
    const t = useTrackerStore.getState();
    const a = analyzeSong(t.patterns, t.patternOrder, new Map(useInstrumentStore.getState().instruments.map((i) => [i.id, i])));
    expectLabels(entry, a.instruments);
  }, 120000);
});
