/**
 * Sample audio tests (owner scratch plan section 71; ledger SCR-P2.8): one
 * record per category (12) through the REAL record ring, voice and scratch
 * bus in an offline render - forward scratch, reverse scratch, anchor
 * return, rapid repeat (8 stabs in 1 s), stop, release - and the six
 * verdicts: no click, no runaway position, no invalid reverse range, no
 * silence where the fader is open, no DC, no stuck voice.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installRealWebAudio, resolveWorkletsFromPublic } from '@/test/audio/realWebAudio';
import { SCRATCH_RECORDS, SCRATCH_PACK_DIR, SCRATCH_RECORD_CATEGORIES, type ScratchRecord } from '../scratchCatalogue';

const SR = 48000;
/** Checkpoints start at 0.1 s: an offline `suspend(0)` can race the render start and be skipped. */
const T0 = 0.1;
const TOTAL_SEC = 2.7;
const RELEASE_AT = T0 + 2.3;

let DeckScratchBuffer: typeof import('../../DeckScratchBuffer').DeckScratchBuffer;
let SCRATCH_RECORD_RING_BASE: number;
let ScratchRecordVoice: typeof import('../ScratchRecordVoice').ScratchRecordVoice;
let createScratchBus: typeof import('../scratchBus').createScratchBus;

/** The first record of each category, in catalogue order. */
const ONE_PER_CATEGORY: ScratchRecord[] = SCRATCH_RECORD_CATEGORIES.map((c) => SCRATCH_RECORDS.find((r) => r.category === c)!);

interface Verdict {
  maxJump: number;
  positions: number[];
  openRms: number;
  mean: number;
  /** Peak of the RING output after release + 10 ms (the voice gain, before the bus). */
  tailPeak: number;
  /** Peak of the bus output over the last 100 ms of the render (200 ms after release). */
  endPeak: number;
  reverseOk: boolean;
  strokesOk: boolean;
  /** Checkpoints that ran (12 strokes + the release). */
  checkpoints: number;
}

async function perform(record: ScratchRecord): Promise<Verdict> {
  // channel 0: the scratch bus output; channel 2: the ring's own output (the voice gain)
  const ctx = new OfflineAudioContext(3, Math.round(SR * TOTAL_SEC), SR);
  const wav = readFileSync(join(process.cwd(), 'public', SCRATCH_PACK_DIR, record.file));
  const buffer = await ctx.decodeAudioData(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
  expect(buffer.sampleRate).toBe(SR);

  const merger = ctx.createChannelMerger(3);
  merger.connect(ctx.destination);
  const ring = new DeckScratchBuffer(ctx as unknown as AudioContext, SCRATCH_RECORD_RING_BASE, { record: true });
  await ring.init();
  // the voice under test: the bus band without its space (the wet channel has its own test)
  const bus = createScratchBus(ctx, merger, { room: 0, delayMix: 0 });
  const voice = new ScratchRecordVoice(0, ring, bus);
  await voice.load(record, buffer);
  ring.playbackGain.connect(merger, 0, 2);

  const positions: number[] = [];
  const inner = ring.onPosition;
  ring.onPosition = (r) => { positions.push(r.sec); inner?.(r); };

  const isThrowOnly = !record.clean; // a pre-scratched record is thrown, never stroked (section 39)
  const home = isThrowOnly ? 'attack' : 'vowel';
  let reverseOk = true, strokesOk = true, checkpoints = 0;
  const check = (ok: boolean) => { strokesOk = strokesOk && ok; checkpoints++; };

  // Everything is scheduled ahead on the render clock (sample-accurate `at`),
  // the way a planner schedules a gesture on a beat.
  // forward scratch
  voice.faderGain(1, T0);
  voice.cue(home, T0);
  check(voice.stroke([{ t: 0, velocity: 1.5 }], 0.15, { loop: false, at: T0 }).ok);
  // reverse scratch (clean records: back from the vowel through safeReverse)
  if (!isThrowOnly) {
    voice.cue('vowel', T0 + 0.3);
    const res = voice.stroke([{ t: 0, velocity: -1.5 }], 0.15, { loop: false, at: T0 + 0.3 });
    reverseOk = res.ok;
    check(res.ok);
  } else {
    checkpoints++;
  }
  // anchor return: re-cue the home and go again
  voice.cue(home, T0 + 0.6);
  check(voice.stroke([{ t: 0, velocity: 1.5 }], 0.1, { loop: false, at: T0 + 0.6 }).ok);
  // rapid repeat: 8 stabs in 1 s
  for (let k = 0; k < 8; k++) {
    const t = T0 + 0.9 + k * 0.125;
    voice.cue(home, t);
    check(voice.stroke([{ t: 0, velocity: 2 }], 0.06, { loop: false, at: t }).ok);
  }
  // stop: hold the record
  check(voice.stroke([{ t: 0, velocity: 0 }], 0.1, { loop: false, at: T0 + 2.1 }).ok);
  // release
  voice.release(RELEASE_AT);
  checkpoints++;

  const out = await ctx.startRendering();
  await new Promise((r) => setTimeout(r, 30));
  const L = out.getChannelData(0);
  const V = out.getChannelData(2);

  let maxJump = 0, sum = 0, openSq = 0, tailPeak = 0, endPeak = 0;
  const openFrom = Math.round(SR * (T0 + 0.02)), openTo = Math.round(SR * (T0 + 0.14));
  const tailFrom = Math.round(SR * (RELEASE_AT + 0.010));
  const endFrom = L.length - Math.round(SR * 0.1);
  for (let i = 0; i < L.length; i++) {
    const v = L[i]!;
    sum += v;
    if (i > 0) maxJump = Math.max(maxJump, Math.abs(v - L[i - 1]!));
    if (i >= openFrom && i < openTo) openSq += v * v;
    if (i >= tailFrom) tailPeak = Math.max(tailPeak, Math.abs(V[i]!));
    if (i >= endFrom) endPeak = Math.max(endPeak, Math.abs(v));
  }
  ring.dispose(); bus.dispose();
  return {
    maxJump,
    positions,
    openRms: Math.sqrt(openSq / (openTo - openFrom)),
    mean: sum / L.length,
    tailPeak,
    endPeak,
    reverseOk,
    strokesOk,
    checkpoints,
  };
}

describe('sample audio tests, one record per category (section 71, SCR-P2.8)', () => {
  beforeAll(async () => {
    installRealWebAudio(); resolveWorkletsFromPublic();
    ({ DeckScratchBuffer, SCRATCH_RECORD_RING_BASE } = await import('../../DeckScratchBuffer'));
    ({ ScratchRecordVoice } = await import('../ScratchRecordVoice'));
    ({ createScratchBus } = await import('../scratchBus'));
  });

  it('covers all 12 categories', () => {
    expect(ONE_PER_CATEGORY).toHaveLength(12);
    expect(new Set(ONE_PER_CATEGORY.map((r) => r.category)).size).toBe(12);
  });

  for (const record of ONE_PER_CATEGORY) {
    it(`${record.category} / ${record.id}: no click, no runaway, reverse valid, no silence, no DC, no stuck voice`, async () => {
      const v = await perform(record);
      expect(v.checkpoints, 'every checkpoint ran').toBe(13);
      expect(v.strokesOk, 'every stroke accepted').toBe(true);
      expect(v.reverseOk, 'the reverse stroke is inside the safe reverse range').toBe(true);
      expect(v.maxJump, 'no click: max sample-to-sample jump').toBeLessThan(0.5);
      expect(v.positions.length).toBeGreaterThan(100);
      for (const p of v.positions) {
        expect(p, 'no runaway position').toBeGreaterThanOrEqual(record.safe[0] - 0.001);
        expect(p, 'no runaway position').toBeLessThanOrEqual(record.safe[1] + 0.001);
      }
      expect(20 * Math.log10(v.openRms), 'no silence where the fader is open').toBeGreaterThan(-60);
      expect(Math.abs(v.mean), 'no DC').toBeLessThan(0.01);
      // the ring's own output is silent 10 ms after release (3 ms gain ramp, worklet stopped);
      // the bus filters ring out and are gone by 200 ms
      expect(v.tailPeak, 'no stuck voice: the ring is silent 10 ms after release').toBe(0);
      expect(v.endPeak, 'no stuck voice: the bus is silent 200 ms after release').toBeLessThan(1e-5);
    }, 30_000);
  }
});
