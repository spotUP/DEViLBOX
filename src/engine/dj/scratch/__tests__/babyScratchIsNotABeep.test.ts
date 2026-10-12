/**
 * Owner 2026-10-12 LOCAL: the Baby Scratch "sounds but crushed and beepy". Measured cause: the
 * reference back-and-forth was given a stab's keyframe scale (+-3.2 x the record's speed, 1.7
 * octaves up) on a 4-step stroke. The reference baby moves A x amp = 1560 samples (22,050 Hz) per
 * quarter of 2 steps at 92 BPM: 0.87 x. Through the real ring worklet and record voice in an
 * offline render, the baby's zero-crossing rate (a pitch proxy) stays within 1.4 x of the same
 * record played straight at 1 x; the beep read 3 x.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installRealWebAudio, resolveWorkletsFromPublic } from '@/test/audio/realWebAudio';
import { getScratchRecord, SCRATCH_PACK_DIR } from '../scratchCatalogue';
import { getGesture } from '../scratchGestureCatalog';
import { motionPeak } from '../scratchPhysics';

const SR = 48000;
const T0 = 0.05;

let DeckScratchBuffer: typeof import('../../DeckScratchBuffer').DeckScratchBuffer;
let SCRATCH_RECORD_RING_BASE: number;
let ScratchRecordVoice: typeof import('../ScratchRecordVoice').ScratchRecordVoice;
let createScratchBus: typeof import('../scratchBus').createScratchBus;

async function render(kind: 'baby' | 'straight'): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.round(SR * 0.7), SR);
  const record = getScratchRecord('AH_STANDARD')!;
  const wav = readFileSync(join(process.cwd(), 'public', SCRATCH_PACK_DIR, record.file));
  const buffer = await ctx.decodeAudioData(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
  const ring = new DeckScratchBuffer(ctx as unknown as AudioContext, SCRATCH_RECORD_RING_BASE, { record: true });
  await ring.init();
  const bus = createScratchBus(ctx, ctx.createGain(), { room: 0, delayMix: 0 });
  const voice = new ScratchRecordVoice(0, ring, bus);
  await voice.load(record, buffer);
  ring.playbackGain.connect(ctx.destination);
  if (kind === 'baby') {
    expect(voice.playGesture(getGesture('baby'), 92, { velocity: 0.7, at: T0 }).ok).toBe(true);
  } else {
    voice.cue('vowel', T0);
    voice.faderGain(1, T0);
    voice.stroke([{ t: 0, velocity: 1 }], 0.6, { loop: false, at: T0 });
  }
  return (await ctx.startRendering()).getChannelData(0);
}

/** Zero crossings per second where the signal is above -40 dBFS (a pitch proxy for a vowel). */
function zcr(x: Float32Array, from: number, to: number): number {
  let n = 0, loud = 0;
  for (let i = Math.round(from * SR) + 1; i < Math.round(to * SR); i++) {
    if (Math.abs(x[i]!) < 0.01) continue;
    loud++;
    if ((x[i]! >= 0) !== (x[i - 1]! >= 0)) n++;
  }
  return loud > 0 ? n / (loud / SR) : 0;
}

describe('the Baby Scratch is the record at about its own pitch, not a beep (owner 2026-10-12)', () => {
  beforeAll(async () => {
    installRealWebAudio(); resolveWorkletsFromPublic();
    ({ DeckScratchBuffer, SCRATCH_RECORD_RING_BASE } = await import('../../DeckScratchBuffer'));
    ({ ScratchRecordVoice } = await import('../ScratchRecordVoice'));
    ({ createScratchBus } = await import('../scratchBus'));
  });

  it('the stroke reads the record at about its own speed, and the render pitch is within 1.4 x of the record straight', async () => {
    // the turntable model's baby at velocity 0.7, 2 steps at 92 BPM: about the record's own speed
    const peak = motionPeak(getGesture('baby'), 2 * 60 / (92 * 4), 0.7);
    expect(peak).toBeLessThanOrEqual(1.6);
    expect(peak).toBeGreaterThan(0.5);
    const baby = zcr(await render('baby'), T0, T0 + 0.6);
    const straight = zcr(await render('straight'), T0, T0 + 0.6);
    expect(straight).toBeGreaterThan(0);
    expect(baby / straight, `baby ${baby.toFixed(0)} vs straight ${straight.toFixed(0)} crossings/s`).toBeLessThan(1.4);
  }, 60_000);
});
