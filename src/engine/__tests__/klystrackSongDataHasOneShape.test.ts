/**
 * KLYS-INSTRUMENT-EDITOR (KIE-1.4): two writers stored the worklet's songData in two shapes (flat fm* fields vs
 * nested `fm`), so whichever ran last decided whether the instrument editor could read inst.fm. There is one writer
 * now: applyKlysSongData. Real worklet, real song; the instrument names reach the instrument list.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer } from './workletHarness';
import { klysTransform, type KlysSongData } from '@/engine/klystrack/KlysEngine';
import { applyKlysSongData } from '@/engine/klystrack/klysSongData';
import { parseKlystrack } from '@/lib/import/formats/KlysParser';
import { useFormatStore } from '@stores/useFormatStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';

const SONG = 'public/data/songs/klystrack/Ocean Loader III.kt';

describe('klystrack songData', () => {
  it('Ocean Loader III.kt: every instrument is stored with its FM fields nested and its name in the instrument list', { timeout: 120000 }, async () => {
    const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
    await w.send({ type: 'loadSong', buffer: songBuffer(SONG) });
    const data = (w.posted as unknown as Array<{ type?: string }>).find((m) => m.type === 'songData') as unknown as KlysSongData;
    expect(data, 'the worklet posted songData').toBeTruthy();

    const song = parseKlystrack(songBuffer(SONG));
    useFormatStore.setState({ klysNative: song.klysNative! });
    useInstrumentStore.setState({ instruments: song.instruments });
    applyKlysSongData(data);

    const stored = useFormatStore.getState().klysNative!.instruments;
    expect(stored.length).toBe(data.instruments.filter((i) => i !== null).length);
    stored.forEach((inst) => {
      expect(inst.fm, 'nested fm object').toBeTruthy();
      expect(inst.fm.adsr).toBeTruthy();
      expect((inst as unknown as Record<string, unknown>).fmFlags, 'no flat fm field').toBeUndefined();
    });
    const first = data.instruments[0]!;
    expect(stored[0].fm.modulation).toBe(first.fmModulation);
    expect(stored[0].fm.harmonic).toBe(first.fmHarmonic);

    const named = stored.map((inst, i) => [i, inst.name] as const).filter(([, n]) => n !== '');
    expect(named.length, 'the song names some instruments').toBeGreaterThan(0);
    for (const [i, name] of named) {
      expect(useInstrumentStore.getState().instruments.find((c) => c.id === i + 1)!.name).toBe(name);
    }
  });
});
