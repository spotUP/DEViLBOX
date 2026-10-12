/**
 * The record voice's cuts are shaped by the reference fader curve (scratch ledger SCR-PG-A2, gap
 * row F1; owner decision O7): `render_gesture` (scratch.py :299-302) builds the gain envelope with a
 * 1 + 2 (1 - v) ms ramp and raises it through the battle curve 1 - (1 - g)^12. Through the real ring
 * worklet and voice in an offline render: the same forward stroke with the fader held open and with
 * one window closing at 500 ms (60 BPM, one-beat cycle). At velocity 1 the ramp is 1 ms (48 frames);
 * half way down it the shaped gain is 1 - 0.5^12 = 0.9998 (a linear ramp would be 0.5); 43 frames in
 * (linear gain 0.10) the curve gives 0.73. At velocity 0 the ramp is 3 ms.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installRealWebAudio, resolveWorkletsFromPublic } from '@/test/audio/realWebAudio';
import { getScratchRecord, SCRATCH_PACK_DIR } from '../scratchCatalogue';
import { cutRampSec, scratchFaderModelStats } from '../scratchFaderModel';

const SR = 48000;
const T0 = 0.1;
const CLOSE_FRAME = Math.round((T0 + 0.5) * SR);

let DeckScratchBuffer: typeof import('../../DeckScratchBuffer').DeckScratchBuffer;
let SCRATCH_RECORD_RING_BASE: number;
let ScratchRecordVoice: typeof import('../ScratchRecordVoice').ScratchRecordVoice;
let createScratchBus: typeof import('../scratchBus').createScratchBus;

async function render(mode: 'open' | 'cut', velocity = 1): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.round(SR * 0.8), SR);
  const record = getScratchRecord('AH_STANDARD')!;
  const wav = readFileSync(join(process.cwd(), 'public', SCRATCH_PACK_DIR, record.file));
  const buffer = await ctx.decodeAudioData(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
  const ring = new DeckScratchBuffer(ctx as unknown as AudioContext, SCRATCH_RECORD_RING_BASE, { record: true });
  await ring.init();
  const sink = ctx.createGain();
  const bus = createScratchBus(ctx, sink, { room: 0, delayMix: 0 });
  const voice = new ScratchRecordVoice(0, ring, bus);
  await voice.load(record, buffer);
  ring.playbackGain.connect(ctx.destination);
  voice.cue('attack', T0);
  if (mode === 'open') voice.faderGain(1, T0);
  else voice.fader({ faderWindows: [{ open: [0, 0.5], curve: 'deck' }], cutLeadMs: 0, cycleBeats: 1 }, 60, { velocity, at: T0 });
  voice.stroke([{ t: 0, velocity: 0.5 }], 0.7, { loop: false, at: T0 });
  return (await ctx.startRendering()).getChannelData(0);
}

/** Output / open-fader output over frames [from, to) after the close, where the open render is loud. */
function gainAt(cut: Float32Array, open: Float32Array, from: number, to: number): number {
  let num = 0, den = 0;
  for (let i = CLOSE_FRAME + from; i < CLOSE_FRAME + to; i++) { num += Math.abs(cut[i]!) * Math.abs(open[i]!); den += open[i]! * open[i]!; }
  return den > 0 ? num / den : NaN;
}

describe('the record voice cuts through the reference battle curve (SCR-PG-A2)', () => {
  beforeAll(async () => {
    installRealWebAudio(); resolveWorkletsFromPublic();
    ({ DeckScratchBuffer, SCRATCH_RECORD_RING_BASE } = await import('../../DeckScratchBuffer'));
    ({ ScratchRecordVoice } = await import('../ScratchRecordVoice'));
    ({ createScratchBus } = await import('../scratchBus'));
  });

  it('ramp 1 + 2 (1 - v) ms: 1 ms at v 1, 3 ms at v 0 (sharper as the velocity rises)', () => {
    expect(cutRampSec(1)).toBeCloseTo(0.001, 9);
    expect(cutRampSec(0)).toBeCloseTo(0.003, 9);
    expect(cutRampSec(0.5)).toBeCloseTo(0.002, 9);
  });

  it('a closing cut at v 1 holds near full gain half way down its 1 ms ramp and is shut after it', async () => {
    const before = scratchFaderModelStats.faderCurveCalls;
    const open = await render('open');
    const cut = await render('cut', 1);
    expect(scratchFaderModelStats.faderCurveCalls - before).toBe(1);
    // before the close: the window is open
    expect(gainAt(cut, open, -200, -20)).toBeGreaterThan(0.99);
    // frames 18-30 of the 48-frame ramp: linear 0.62-0.38, the battle curve > 0.99
    expect(gainAt(cut, open, 18, 30)).toBeGreaterThan(0.98);
    // frames 40-46: linear 0.17-0.04, the curve 0.88-0.39
    const late = gainAt(cut, open, 40, 46);
    expect(late).toBeGreaterThan(0.3);
    expect(late).toBeLessThan(0.95);
    // after the ramp: shut
    expect(gainAt(cut, open, 60, 400)).toBeLessThan(1e-3);
  }, 60_000);
});
