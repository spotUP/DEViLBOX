/**
 * CV-1.5 live voice status: the real Klystrack worklet + WASM reports, while watched, the envelope stage and level,
 * the effective filter cutoff and the elapsed time of the note sounding on the audition channel.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { klysTransform, type KlysChannelVoice } from '@/engine/klystrack/KlysEngine';
import { voiceMarkerFor } from '@/engine/klystrack/klysVoiceStatus';

type Worklet = Awaited<ReturnType<typeof startWorklet>>;
interface Msg { type?: string; channels?: KlysChannelVoice[] }
const SONG = 'public/data/songs/klystrack/Ocean Loader III.kt';
const INST = 3;

const voiceMsgs = (w: Worklet): Msg[] => (w.posted as unknown as Msg[]).filter((m) => m.type === 'voiceStatus');

async function setup(): Promise<{ w: Worklet; run: (blocks: number) => void; last: () => KlysChannelVoice | undefined }> {
  const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
  await w.send({ type: 'loadSong', buffer: songBuffer(SONG) });
  await w.send({ type: 'stop' });
  const out = stereoOutputs(1);
  const run = (blocks: number): void => { for (let i = 0; i < blocks; i++) w.proc.process([], out); };
  const last = (): KlysChannelVoice | undefined => {
    const m = voiceMsgs(w);
    return m.length ? m[m.length - 1].channels?.find((c) => c.channel === 31) : undefined;
  };
  const set = (paramId: number, value: number) => w.send({ type: 'setInstrumentParam', idx: INST, paramId, value });
  // Sawtooth, low-pass wide open, no program: attack 10, decay 10, sustain 16 of 31 (level about 0.5), release 10.
  await set(5, 8 | 512); await set(11, 0); await set(16, 2047); await set(17, 0); await set(18, 0);
  await set(0, 10); await set(1, 10); await set(2, 16); await set(3, 10); await set(10, 128);
  return { w, run, last };
}

describe('klystrack live voice status', () => {
  it('reports attack, decay, sustain with the level rising then settling, then release falling', { timeout: 120000 }, async () => {
    const { w, run, last } = await setup();
    await w.send({ type: 'watchVoices', on: true });
    await w.send({ type: 'previewNoteOn', inst: INST, note: 48 });
    const stages: string[] = [];
    const levels: number[] = [];
    for (let i = 0; i < 4000; i++) {
      run(8);
      const v = last();
      if (!v) continue;
      const marker = voiceMarkerFor([v], INST);
      if (marker && stages[stages.length - 1] !== marker.stage) { stages.push(marker.stage); levels.push(marker.level); }
      if (marker?.stage === 'sustain') break;
    }
    expect(stages.slice(0, 3)).toEqual(['attack', 'decay', 'sustain']);
    run(400);
    const held = voiceMarkerFor([last()!], INST)!;
    expect(held.stage).toBe('sustain');
    expect(held.level, 'level settles near sustain 16/31').toBeGreaterThan(0.45);
    expect(held.level).toBeLessThan(0.58);
    expect(held.elapsedSeconds, 'elapsed time advances').toBeGreaterThan(0.5);
    const early = voiceMsgs(w).map((m) => m.channels!.find((c) => c.channel === 31)!).find((c) => c.stage === 0 && c.level > 0)!;
    expect(early.level, 'attack level is below the sustain peak path').toBeLessThan(1);

    await w.send({ type: 'previewNoteOff' });
    run(16);
    const rel1 = voiceMarkerFor([last()!], INST)!;
    expect(rel1.stage).toBe('release');
    run(200);
    const rel2 = voiceMarkerFor([last()!], INST);
    expect(rel2 === null || rel2.level < rel1.level, 'level falls in release').toBe(true);
    expect(rel1.level).toBeLessThan(held.level + 0.01);
  });

  it('a cutoff change on the sounding instrument shows in the reported cutoff', { timeout: 120000 }, async () => {
    const { w, run, last } = await setup();
    await w.send({ type: 'watchVoices', on: true });
    await w.send({ type: 'previewNoteOn', inst: INST, note: 48 });
    run(80);
    expect(last()!.cutoff).toBe(2047);
    await w.send({ type: 'setInstrumentParam', idx: INST, paramId: 16, value: 600 });
    run(80);
    expect(last()!.cutoff).toBe(600);
    expect(voiceMarkerFor(voiceMsgs(w).at(-1)!.channels!, INST)!.cutoff).toBe(600);
  });

  it('sends nothing while not watched, and stops after unwatching', { timeout: 120000 }, async () => {
    const { w, run } = await setup();
    await w.send({ type: 'previewNoteOn', inst: INST, note: 48 });
    run(200);
    expect(voiceMsgs(w).length).toBe(0);
    await w.send({ type: 'watchVoices', on: true });
    run(200);
    const n = voiceMsgs(w).length;
    expect(n).toBeGreaterThan(0);
    await w.send({ type: 'watchVoices', on: false });
    run(200);
    expect(voiceMsgs(w).length).toBe(n);
  });
});

describe('voiceMarkerFor', () => {
  const v = (o: Partial<KlysChannelVoice>): KlysChannelVoice => ({
    channel: 0, instrument: 3, stage: 2, level: 0.5, cutoff: 100, resonance: 0, pulseWidth: 0, elapsedTicks: 50, tickRate: 50, active: true, ...o,
  });
  it('picks the audition channel, else the newest, converts ticks to seconds, ignores other instruments and finished voices', () => {
    expect(voiceMarkerFor([v({ channel: 0, elapsedTicks: 10 }), v({ channel: 31, elapsedTicks: 99 })], 3)!.channel).toBe(31);
    expect(voiceMarkerFor([v({ channel: 0, elapsedTicks: 100 }), v({ channel: 1, elapsedTicks: 10 })], 3)!.channel).toBe(1);
    expect(voiceMarkerFor([v({})], 3)!.elapsedSeconds).toBe(1);
    expect(voiceMarkerFor([v({ instrument: 4 })], 3)).toBeNull();
    expect(voiceMarkerFor([v({ active: false })], 3)).toBeNull();
  });
});
