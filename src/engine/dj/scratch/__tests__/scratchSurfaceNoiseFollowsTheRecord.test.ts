/**
 * Vinyl surface (scratch ledger SCR-PG-C1; reference turntable.py surface_noise :363-375, physics
 * s.46/47, needle_drop / needle_lift :384-399): the record's noise bed is read at the record's
 * position, so the noise moves with the record and stops when it stops; its level is the
 * cartridge's surface x the stroke velocity. Through the real ring worklet, record voice and scratch
 * bus offline, on a SILENT record (what is heard is the surface alone): while the record moves at
 * 1 x the bus carries the noise; while the hand holds it the noise is gone (a held needle reads one
 * point of the groove: DC, which the bus high pass removes). The needle drop is a 120 ms transient
 * on the bus.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic } from '@/test/audio/realWebAudio';
import { getScratchRecord } from '../scratchCatalogue';
import { getGesture } from '../scratchGestureCatalog';
import { TT_CARTRIDGES } from '@/engine/turntable/turntableSim';

const SR = 48000;
const T0 = 0.05;

let DeckScratchBuffer: typeof import('../../DeckScratchBuffer').DeckScratchBuffer;
let SCRATCH_RECORD_RING_BASE: number;
let ScratchRecordVoice: typeof import('../ScratchRecordVoice').ScratchRecordVoice;
let createScratchBus: typeof import('../scratchBus').createScratchBus;
let scratchVoiceStats: typeof import('../ScratchRecordVoice').scratchVoiceStats;

function rms(x: Float32Array, a: number, b: number): number {
  let q = 0; const from = Math.round(a * SR), to = Math.round(b * SR);
  for (let i = from; i < to; i++) q += x[i]! * x[i]!;
  return Math.sqrt(q / Math.max(1, to - from));
}

async function rig(seconds: number) {
  const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
  const record = getScratchRecord('AH_STANDARD')!;
  const silent = ctx.createBuffer(2, Math.round(record.durationSec * SR), SR);
  const ring = new DeckScratchBuffer(ctx as unknown as AudioContext, SCRATCH_RECORD_RING_BASE, { record: true });
  await ring.init();
  const bus = createScratchBus(ctx, ctx.destination, { room: 0, delayMix: 0 });
  const voice = new ScratchRecordVoice(0, ring, bus);
  await voice.load(record, silent);
  ring.playbackGain.connect(bus.input);
  return { ctx, voice };
}

describe('the vinyl surface moves with the record (SCR-PG-C1)', () => {
  beforeAll(async () => {
    installRealWebAudio(); resolveWorkletsFromPublic();
    ({ DeckScratchBuffer, SCRATCH_RECORD_RING_BASE } = await import('../../DeckScratchBuffer'));
    ({ ScratchRecordVoice, scratchVoiceStats } = await import('../ScratchRecordVoice'));
    ({ createScratchBus } = await import('../scratchBus'));
  });

  it('noise while the record moves (cartridge surface x velocity), none while the hand holds it', async () => {
    const { ctx, voice } = await rig(0.9);
    // the baby sets the battle cartridge and the surface level 0.0015 x 0.9; then a plain stroke: 0.3 s at 1 x, 0.4 s held
    expect(voice.playGesture(getGesture('baby'), 120, { velocity: 0.9, at: T0 }).ok).toBe(true);
    voice.stroke([{ t: 0, velocity: 1 }, { t: 0.3 / 0.7, velocity: 0 }], 0.7, { loop: false, at: T0 });
    const out = (await ctx.startRendering()).getChannelData(0);
    const moving = rms(out, T0 + 0.05, T0 + 0.28);
    const held = rms(out, T0 + 0.45, T0 + 0.68);
    expect(moving, 'the surface while the record moves').toBeGreaterThan(TT_CARTRIDGES.battle.surface * 0.9 * 0.2);
    expect(held, 'a held record is silent').toBeLessThan(moving * 0.02);
  }, 60_000);

  it('a throw carries no surface (the word as recorded)', async () => {
    const { ctx, voice } = await rig(0.5);
    expect(voice.playGesture(getGesture('drop'), 120, { velocity: 0.9, at: T0 }).ok).toBe(true);
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(rms(out, T0 + 0.05, T0 + 0.4)).toBeLessThan(1e-6);
  }, 60_000);

  it('the needle drop is a 120 ms transient on the bus', async () => {
    const { ctx, voice } = await rig(0.4);
    const before = scratchVoiceStats.needles;
    expect(voice.playGesture(getGesture('needleDrop'), 120, { at: T0 }).ok).toBe(true);
    expect(scratchVoiceStats.needles - before).toBe(1);
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(rms(out, T0, T0 + 0.03)).toBeGreaterThan(0.01);
    expect(rms(out, T0 + 0.2, T0 + 0.3)).toBeLessThan(rms(out, T0, T0 + 0.03) * 0.05);
  }, 60_000);
});
