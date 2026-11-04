/**
 * A song UADEParser hands to its native parser (NATIVE_ROUTES) keeps no plain
 * 'Synth' placeholder instruments.
 *
 * The route returned the native song as-is, skipping the retag
 * withNativeThenUADE applies. Sixteen formats (UFO, ProfessionalSoundArtists,
 * Infogrames, ...) kept 'Synth' instruments: a key played a generic Tone synth
 * and hybrid playback layered Tone notes over the UADE audio.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';

vi.mock('@engine/uade/UADEEngine', () => ({
  UADEEngine: {
    getInstance: () => ({
      ready: async () => undefined,
      enableTickSnapshots: () => undefined,
      resetTickSnapshots: () => undefined,
    }),
  },
}));

const retag = vi.fn();
vi.mock('../parsers/withFallback', async (orig) => {
  const real = await orig<typeof import('../parsers/withFallback')>();
  return {
    ...real,
    retagInstrumentsForUadeAudio: (...a: Parameters<typeof real.retagInstrumentsForUadeAudio>) => {
      retag();
      return real.retagInstrumentsForUadeAudio(...a);
    },
  };
});

const PATH = 'public/data/songs/formats/the punisher - title.psa';

describe('UADEParser native route (Professional Sound Artists)', () => {
  it('leaves no plain Synth instrument on the routed native song', async () => {
    const { parseUADEFile } = await import('../formats/UADEParser');
    const b = readFileSync(PATH);
    const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const meta: UADEMetadata = { player: 'ProfessionalSoundArtists', formatName: 'ProfessionalSoundArtists', minSubsong: 0, maxSubsong: 0, subsongCount: 1 };
    const song = await parseUADEFile(buf, 'the punisher - title.psa', 'enhanced', 0, meta);
    expect(retag).toHaveBeenCalledTimes(1);
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments.filter((i) => i.synthType === 'Synth')).toEqual([]);
    expect(song.instruments.some((i) => i.synthType === 'UADEEditableSynth')).toBe(true);
  });
});
