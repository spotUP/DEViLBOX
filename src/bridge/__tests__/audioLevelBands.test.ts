/**
 * get_audio_level { bands: true } reports real octave-band levels.
 *
 * The analyser's band energies are display values (peak-weighted, boosted,
 * clamped at 1), useless for measuring an effect's frequency response; the
 * master FX audit needs dB per octave band from the FFT (2026-09-29).
 */
import { describe, it, expect, vi } from 'vitest';

const FFT_BINS = 1024;
const fft = new Float32Array(FFT_BINS).fill(-120);
// One loud bin at 1 kHz (48 kHz, 1024 bins of 23.4 Hz).
fft[Math.round(1000 / (24000 / FFT_BINS))] = -10;
vi.mock('../../engine/vj/AudioDataBus', () => ({
  AudioDataBus: { getShared: () => ({ update: () => ({ rms: 0.1, peak: 0.2, fft }) }) },
}));
vi.mock('../../utils/audio-context', async (orig) => ({
  ...(await orig<typeof import('../../utils/audio-context')>()),
  getDevilboxAudioContext: () => ({ sampleRate: 48000 }),
}));

import { getAudioLevel } from '../handlers/writeHandlers';

describe('get_audio_level bands', () => {
  it('puts a 1 kHz tone in the 1 kHz octave band', async () => {
    const r = await getAudioLevel({ durationMs: 60, bands: true }) as { bandsDb: Record<string, number> };
    const loudest = Object.entries(r.bandsDb).sort((a, b) => b[1] - a[1])[0][0];
    expect(loudest).toBe('1000');
    expect(r.bandsDb['1000']).toBeCloseTo(-10, 0);
    expect(r.bandsDb['63']).toBeLessThan(-80);
  });

  it('without bands, returns levels only', async () => {
    const r = await getAudioLevel({ durationMs: 30 });
    expect(r).not.toHaveProperty('bandsDb');
  });
});
