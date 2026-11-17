import { describe, it, expect } from 'vitest';
import type { NesCapture, NesChip, NesEvent } from '../nes/nesCapture';
import { NES_CONTROL } from '../nes/nesCapture';
import { CHIP_ORDER, decodeNesStream, encodeNesStreams, encodeNesSubsong, nesCaptureToTicks, nesSizeReport } from '../nes/nesStream';

const SR = 48000, TR = 60;
const SPT = SR / TR; // 800 samples per tick

/** Deterministic song-like capture: a repeating 16-tick pattern with per-chip register traffic, wave loads and PCM. */
function synth(ticks: number): NesCapture {
  const events: NesEvent[] = [];
  let seed = 12345;
  const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  const w = (chip: NesChip, t: number, addr: number, value: number, kind: 'write' | 'pcm' = 'write', off = 0) =>
    events.push({ kind, chip, sample: t * SPT + off, addr, value });
  for (let t = 0; t < ticks; t++) {
    const step = t % 16;
    if (t % 40 >= 30) continue; // silent stretch -> repeat runs
    if (step % 4 === 0) { w('nes', t, 0x4002, 0x80 + (step << 2)); w('nes', t, 0x4003, 0x08); w('nes', t, 0x4000, 0xbf); }
    if (step === 8) { w('nes', t, 0x4003, 0x08); w('nes', t, 0x4003, 0x08); } // duplicate write kept
    if (step % 2 === 0) { w('vrc6', t, 0x9001, 0x10 + step); w('vrc6', t, 0x9002, 0x80); w('vrc6', t, 0xB000, 0x3f); }
    if (step % 4 === 2) { w('mmc5', t, 0x5002, step); w('mmc5', t, 0x5003, 0x08); }
    if (step % 4 === 1) { w('s5b', t, 0x00, step * 7); w('s5b', t, 0x01, 1); w('s5b', t, 0x08, 0x0f); }
    if (step === 3) { w('vrc7', t, 0x10, 0x80 + step); w('vrc7', t, 0x30, 0x1f); }
    if (t === 0) {
      for (let i = 0; i < 8; i++) w('vrc7', t, i, (i * 37) & 0xff); // custom patch: ascending run
      w('fds', t, 0x4089, 0x80); // wave write enable
      for (let i = 0; i < 64; i++) w('fds', t, 0x4040 + i, (i * 5) & 0x3f);
      w('fds', t, 0x4089, 0x00);
      for (let i = 0; i < 32; i++) w('fds', t, 0x4088, (i * 3) & 7); // mod table: same register
      for (let i = 0; i < 16; i++) w('n163', t, 0x40 + i, (i * 11) & 0xff);
    }
    if (step % 4 === 0) { w('fds', t, 0x4080, 0x80 | step); w('fds', t, 0x4082, step * 3); w('n163', t, 0x78, step); w('n163', t, 0x79, 0x20); w('n163', t, 0x7f, 0x70); }
    if (t % 5 === 0) w('nes', t, 0x4015, 0x0f);
    if (rnd(7) === 0) w('nes', t, 0x4001, rnd(256)); // noise so not every tick is identical
    if (t >= 100 && t < 110) { // DPCM / DAC section with timed samples
      for (let k = 0; k < 3; k++) w('nes', t, 0x4011, rnd(128), 'pcm', k * 250 + 3);
      for (let k = 0; k < 2; k++) w('vrc6', t, 0x9000, 0x80 | rnd(64), 'pcm', k * 300 + 9);
    }
    if (t === 100) {
      events.push({ kind: 'control', chip: 'nes', sample: t * SPT + 1, control: NES_CONTROL.DAC_RATE, channel: 0, value: 8287 });
      events.push({ kind: 'control', chip: 'nes', sample: t * SPT + 2, control: NES_CONTROL.DPCM_BANK, channel: 0, value: 3 });
      events.push({ kind: 'control', chip: 'vrc6', sample: t * SPT + 4, control: NES_CONTROL.DAC_RATE, channel: 1, value: 4000 });
    }
    if (t === 110) events.push({ kind: 'control', chip: 'nes', sample: t * SPT, control: NES_CONTROL.SAMPLE_STOP, channel: 0, value: 0 });
  }
  return { events, sampleRate: SR, tickRateHz: TR };
}

describe('nesStream round trip', () => {
  const cap = synth(480);
  const expected = nesCaptureToTicks(cap);

  it('every chip appears in the synthetic capture and the tick bucketing is exact', () => {
    for (const c of CHIP_ORDER) expect(cap.events.some((e) => e.chip === c), c).toBe(true);
    expect(expected[100].events.filter((e) => e.kind === 'pcm').map((e) => e.offset)).toEqual([3, 253, 503, 9, 309]);
  });

  for (const bankSize of [0, 4096]) {
    it(`encode then decode equals the captured writes and events per tick (bankSize ${bankSize})`, () => {
      const regions = encodeNesStreams([{ ntsc: cap, loopTick: 32 }, { ntsc: synth(50) }], bankSize);
      for (const r of ['ntsc', 'pal', 'dendy'] as const) {
        const d = decodeNesStream(regions[r], 0, bankSize);
        expect(d.tickRateCentiHz).toBe(6000);
        expect(d.loopTick).toBe(32);
        expect(d.ticks.length).toBe(expected.length);
        d.ticks.forEach((t, i) => expect(t, `tick ${i}`).toEqual(expected[i]));
        const d2 = decodeNesStream(regions[r], 1, bankSize);
        expect(d2.loopTick).toBeUndefined();
        expect(d2.ticks).toEqual(nesCaptureToTicks(synth(50)));
      }
    });
  }

  it('rejects an address outside the chip register range', () => {
    expect(() => encodeNesSubsong({ sampleRate: SR, tickRateHz: TR, events: [{ kind: 'write', chip: 'nes', sample: 0, addr: 0x5000, value: 1 }] })).toThrow();
  });

  it('size report per chip (raw vs encoded)', () => {
    const rows = nesSizeReport(cap);
    const total = encodeNesSubsong(cap).length;
    const raw = rows.reduce((n, r) => n + r.raw, 0);
    console.log(['chip raw encoded', ...rows.map((r) => `${r.chip} ${r.raw} ${r.encoded}`), `all-chips-together ${raw} ${total}`].join('\n'));
    expect(total).toBeLessThan(raw);
  });
});
