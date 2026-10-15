/**
 * KIE-2.2 / 2.4 / 2.5 (klystrack instrument editor): the engine could only change one instrument field at a time
 * and could not sound an instrument without starting the song.
 *
 *  - setInstrumentData is the exact inverse of the songData read: every field changed, saved, reloaded = identical.
 *  - previewNoteOn sounds the instrument on the spare channel 31 with the song stopped, and does not move the song.
 *  - programStatus reports each channel's instrument and program step while watched.
 *  - songData carries the song's wavetable entries.
 *
 * Driven with the real Klystrack worklet + WASM on the real song.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { klysTransform, packKlysInstrument, type KlysSongData } from '@/engine/klystrack/KlysEngine';

type Worklet = Awaited<ReturnType<typeof startWorklet>>;
type Inst = NonNullable<KlysSongData['instruments'][number]>;
interface Msg { type?: string; data?: ArrayBuffer; songPosition?: number; channels?: Array<{ instrument: number; step: number; running: boolean }> }
const SONG = 'public/data/songs/klystrack/Ocean Loader III.kt';

async function loaded(buffer: ArrayBuffer): Promise<{ w: Worklet; data: KlysSongData }> {
  const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
  await w.send({ type: 'loadSong', buffer });
  return { w, data: (w.posted as unknown as Msg[]).find((m) => m.type === 'songData') as unknown as KlysSongData };
}

function msgs(w: Worklet): Msg[] { return w.posted as unknown as Msg[]; }

describe('klystrack instrument data', () => {
  it('setInstrumentData with every field changed reads back identical after save and reload', { timeout: 120000 }, async () => {
    const { w, data } = await loaded(songBuffer(SONG));
    const before = data.instruments[1]!;
    const changed: Inst = {
      name: 'Round Trip',
      adsr: { a: 3, d: 5, s: 21, r: 17 },
      flags: 0x1f5, cydflags: 0x2a3, baseNote: 61, finetune: -7, slideSpeed: 9, pw: 0x555, volume: 99, progPeriod: 4,
      vibratoSpeed: 11, vibratoDepth: 13, pwmSpeed: 15, pwmDepth: 17,
      cutoff: 1234, resonance: 2, flttype: 1, ymEnvShape: 5, buzzOffset: -300,
      fxBus: 2, vibShape: 3, vibDelay: 6, pwmShape: 2, lfsrType: 3, wavetableEntry: 1, ringMod: 4, syncSource: 5,
      fmFlags: 0x3, fmModulation: 77, fmFeedback: 6, fmWave: 1, fmHarmonic: 0x42,
      fmAdsr: { a: 1, d: 2, s: 3, r: 4 }, fmAttackStart: 8,
      program: [0x0c40, 0x0000, 0x1234, ...new Array(29).fill(0xfffe)],
    };
    for (const k of Object.keys(before) as Array<keyof Inst>) {
      if (k !== 'name' && k !== 'program') expect(JSON.stringify(changed[k]), `field ${k} actually changes`).not.toBe(JSON.stringify(before[k]));
    }
    expect(packKlysInstrument(changed).length).toBe(147);

    await w.send({ type: 'setInstrumentData', idx: 1, data: packKlysInstrument(changed).buffer });
    msgs(w).splice(0);
    await w.send({ type: 'serializeSong' });
    const saved = msgs(w).find((m) => m.type === 'serializeSongResult')!.data!;
    const reloaded = (await loaded(saved)).data.instruments[1]!;
    expect(reloaded).toEqual(changed);
  });

  it('a short setInstrumentData buffer sets only the leading members', { timeout: 120000 }, async () => {
    const { w, data } = await loaded(songBuffer(SONG));
    const inst = { ...data.instruments[2]!, adsr: { a: 7, d: 8, s: 9, r: 10 } };
    await w.send({ type: 'setInstrumentData', idx: 2, data: packKlysInstrument(inst).slice(0, 4).buffer });
    msgs(w).splice(0);
    await w.send({ type: 'serializeSong' });
    const after = (await loaded(msgs(w).find((m) => m.type === 'serializeSongResult')!.data!)).data.instruments[2]!;
    expect(after).toEqual({ ...data.instruments[2]!, adsr: { a: 7, d: 8, s: 9, r: 10 } });
  });

  it('previewNoteOn sounds the instrument with the song stopped and does not move the song', { timeout: 120000 }, async () => {
    const { w, data } = await loaded(songBuffer(SONG));
    await w.send({ type: 'stop' });
    const out = stereoOutputs(1);
    const rms = (blocks: number): number => {
      let sum = 0, n = 0;
      for (let i = 0; i < blocks; i++) {
        w.proc.process([], out);
        for (let k = 0; k < 128; k++) { sum += out[0][0][k] ** 2 + out[0][1][k] ** 2; n += 2; }
      }
      return Math.sqrt(sum / n);
    };
    expect(rms(40), 'stopped song is silent').toBe(0);
    msgs(w).splice(0);
    const playable = data.instruments.findIndex((i) => i && i.cydflags !== 0 && i.volume > 0);
    await w.send({ type: 'previewNoteOn', inst: playable, note: 48 });
    expect(rms(200), 'the audition sounds').toBeGreaterThan(0.001);
    await w.send({ type: 'previewNoteOff' });
    rms(48000 * 3 / 128); // let the release die
    expect(rms(10), 'the audition stops by itself after note off').toBe(0);
    const positions = msgs(w).filter((m) => m.type === 'position').map((m) => m.songPosition);
    expect(new Set(positions).size, `song position stays put ${positions.slice(0, 3)}`).toBe(1);
  });

  it('programStatus reports each playing channel while watched, and songData carries the wavetables', { timeout: 120000 }, async () => {
    const { w, data } = await loaded(songBuffer(SONG));
    expect(Array.isArray(data.wavetables)).toBe(true);
    await w.send({ type: 'play' });
    msgs(w).splice(0);
    const out = stereoOutputs(1);
    for (let i = 0; i < 64; i++) w.proc.process([], out);
    expect(msgs(w).some((m) => m.type === 'programStatus'), 'not watched, not sent').toBe(false);
    await w.send({ type: 'watchProgram', on: true });
    for (let i = 0; i < 48000 / 128; i++) w.proc.process([], out);
    const reports = msgs(w).filter((m) => m.type === 'programStatus');
    expect(reports.length).toBeGreaterThan(0);
    const seen = new Set(reports.flatMap((r) => r.channels!.filter((c) => c.instrument !== 0xff).map((c) => c.instrument)));
    expect(seen.size, 'channels play instruments').toBeGreaterThan(0);
    await w.send({ type: 'watchProgram', on: false });
    msgs(w).splice(0);
    for (let i = 0; i < 64; i++) w.proc.process([], out);
    expect(msgs(w).some((m) => m.type === 'programStatus')).toBe(false);
  });
});
