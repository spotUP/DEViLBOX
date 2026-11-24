import { describe, expect, it } from 'vitest';
import { createWavFile } from '@/lib/import/InstrumentConverter';
import { readWavPcm16 } from '@/lib/export/neogeo/neoGeoCompose';
import { resampleTadSample } from '../tadProjectBuilder';
import type { TadSampleFile } from '../tadSongWriter';

const wav = (n: number, rate: number, loop?: number): TadSampleFile => {
  const pcm = new Int16Array(n).map((_, i) => Math.round(8000 * Math.sin(i / 5)));
  return {
    name: 's0', path: 'samples/s0.wav', data: new Uint8Array(createWavFile(pcm, rate)),
    entry: { name: 's0', source: { type: 'wav', source: 'samples/s0.wav', ...(loop !== undefined ? { loop_point: loop } : {}) }, pitches: { type: 'notes', frequency: 100, first_note: '40', last_note: '60' } },
  };
};

describe('resampleTadSample', () => {
  it('keeps the loop on 16-sample blocks and scales the tuning by the exact ratio', () => {
    const { file, rate } = resampleTadSample(wav(32 + 1600, 32000, 32), 24000);
    const { data } = readWavPcm16(file.data);
    const loop = (file.entry.source as { loop_point: number }).loop_point;
    expect(loop % 16).toBe(0);
    expect(data.length % 16).toBe(0);
    expect((data.length - loop) % 16).toBe(0);
    const ratio = 1600 / (data.length - loop);
    expect((file.entry.pitches as { frequency: number }).frequency).toBeCloseTo(100 * ratio, 6);
    expect(rate).toBe(Math.round(32000 / ratio));
  });

  it('halves a one-shot sample', () => {
    const { file, rate } = resampleTadSample(wav(3200, 32000), 16000);
    expect(rate).toBe(16000);
    expect(readWavPcm16(file.data).data.length).toBe(1600);
    expect((file.entry.pitches as { frequency: number }).frequency).toBeCloseTo(200, 6);
  });

  it('decodes an authored BRR sample (counted as 32 kHz) and sends it back as WAV', () => {
    // Two blocks: shift 12, filter 0, every nibble 1 -> 2048 * 2 = 4096 per sample.
    const data = new Uint8Array(18).fill(0x11); data[0] = 0xc0; data[9] = 0xc1;
    const s: TadSampleFile = { name: 's1', path: 'samples/s1.brr', data, entry: { name: 's1', source: { type: 'brr', source: 'samples/s1.brr' }, pitches: { type: 'notes', frequency: 100 } } };
    const { file, rate, from } = resampleTadSample(s, 16000);
    expect(from).toBe(32000);
    expect(rate).toBe(16000);
    expect(file.path).toBe('samples/s1.wav');
    expect(file.entry.source).toMatchObject({ type: 'wav', source: 'samples/s1.wav' });
    const pcm = readWavPcm16(file.data).data;
    expect(pcm.length).toBe(16);
    expect(Math.abs(pcm[8] - 4096)).toBeLessThan(200);
  });
});
