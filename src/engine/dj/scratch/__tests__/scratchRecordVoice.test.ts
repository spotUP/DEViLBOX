/**
 * Scratch record voice (owner scratch plan sections 11, 16, 18; ledger
 * SCR-P2.5): one voice drives one record ring - cue to an anchor, stroke a
 * velocity curve as a frame-accurate rate curve, articulate with the
 * gesture's fader windows, release - and never leaves the record's safe
 * range: forward strokes past safeForward[1] are clamped and logged, a
 * reverse request with no safe reverse room is refused with a reason.
 * The ring is a fake here (the message contract); the real worklet is
 * measured in scratchRecordVoiceAudio.test.ts (P2.8).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ScratchRecordVoice, velocityCurveToRatePoints, predictExcursion, scratchVoiceStats,
  type ScratchVoiceRing, type ScratchVoiceBus,
} from '../ScratchRecordVoice';
import { getScratchRecord } from '../scratchCatalogue';
import { getGesture } from '../scratchGestureCatalog';
import type { RingRatePoint } from '../../DeckScratchBuffer';

const SR = 48000;

interface Call { type: string; args: unknown[] }

function fakeRing(): ScratchVoiceRing & { calls: Call[]; gain: number } {
  const calls: Call[] = [];
  const ring = {
    calls,
    gain: 0,
    sampleRate: SR,
    playbackGain: { connect: () => undefined } as unknown as GainNode,
    onPosition: null,
    loadRecord: async (buf: AudioBuffer) => { calls.push({ type: 'load', args: [buf.length] }); return buf.length; },
    setBounds: (a: number, b: number) => { calls.push({ type: 'bounds', args: [a, b] }); },
    startAt: (sec: number, rate: number) => { calls.push({ type: 'startAt', args: [sec, rate] }); ring.gain = 1; },
    seek: (sec: number) => { calls.push({ type: 'seek', args: [sec] }); },
    rateCurve: (points: readonly RingRatePoint[], opts: unknown) => { calls.push({ type: 'rateCurve', args: [points, opts] }); ring.gain = 1; },
    faderWindows: (w: unknown, opts: unknown) => { calls.push({ type: 'faderWindows', args: [w, opts] }); },
    faderGain: (g: number) => { calls.push({ type: 'faderGain', args: [g] }); },
    stopScratch: async () => { calls.push({ type: 'stop', args: [] }); ring.gain = 0; return 0; },
    stopAt: (at: number) => { calls.push({ type: 'stop', args: [at] }); ring.gain = 0; },
    silenceAndStop: () => { calls.push({ type: 'silence', args: [] }); ring.gain = 0; },
  };
  return ring;
}

function fakeBus(): ScratchVoiceBus & { ambience: number } {
  return { input: {} as AudioNode, ambience: 0, setAmbience(a: number) { this.ambience = a; } };
}

const fakeBuffer = (sec: number) => ({ length: Math.round(sec * SR), sampleRate: SR, numberOfChannels: 2 } as AudioBuffer);
const last = (ring: { calls: Call[] }, type: string) => [...ring.calls].reverse().find((c) => c.type === type);

describe('velocity curve -> rate points (D5 shape, SCR-P2.5)', () => {
  it('keyframes land on frames of the cycle; a looping curve wraps to its first rate, a one-shot ends at 0', () => {
    const loop = velocityCurveToRatePoints([{ t: 0, velocity: 1 }, { t: 0.5, velocity: -1 }], 0.5, SR, { loop: true });
    expect(loop).toEqual([{ frame: 0, rate: 1 }, { frame: 12000, rate: -1 }, { frame: 24000, rate: 1 }]);
    const once = velocityCurveToRatePoints([{ t: 0, velocity: 2 }], 0.25, SR, { loop: false });
    expect(once).toEqual([{ frame: 0, rate: 2 }, { frame: 12000, rate: 0 }]);
  });

  it('predicts the excursion in seconds of record from the cue', () => {
    // 1.5x forward for 0.2 s then 1.5x back for 0.2 s: +0.3 s out, back to 0
    const ex = predictExcursion([{ t: 0, velocity: 1.5 }, { t: 0.5, velocity: -1.5 }], 0.4, false);
    expect(ex.max).toBeCloseTo(0.3, 6);
    expect(ex.min).toBeCloseTo(0, 6);
    expect(ex.end).toBeCloseTo(0, 6);
    const lin = predictExcursion([{ t: 0, velocity: 0 }, { t: 1, velocity: 2 }], 1, true);
    expect(lin.max).toBeCloseTo(1, 3); // ramp 0..2 over 1 s = 1 s of record
  });
});

describe('ScratchRecordVoice (section 16, SCR-P2.5)', () => {
  const AH = getScratchRecord('AH_STANDARD')!; // safe 26..19558 / 22050, vowel 3300
  let ring: ReturnType<typeof fakeRing>;
  let bus: ReturnType<typeof fakeBus>;
  let voice: ScratchRecordVoice;

  beforeEach(async () => {
    ring = fakeRing(); bus = fakeBus();
    voice = new ScratchRecordVoice(0, ring, bus);
    scratchVoiceStats.strokes = 0; scratchVoiceStats.clamps = 0; scratchVoiceStats.refused = 0;
    await voice.load(AH, fakeBuffer(AH.durationSec));
  });

  it('load writes the record, bounds the ring to safe, and cues the vowel', () => {
    expect(last(ring, 'load')!.args[0]).toBe(Math.round(AH.durationSec * SR));
    expect(last(ring, 'bounds')!.args).toEqual([AH.safe[0], AH.safe[1]]);
    expect(voice.record).toBe(AH);
    expect(voice.cuePosition).toBeCloseTo(AH.anchors.vowel, 9);
  });

  it('cue resolves attack / vowel / tail / seconds / a word slice, clamped into safe', () => {
    expect(voice.cue('tail')).toBeCloseTo(AH.anchors.tail, 9);
    expect(voice.cue('attack')).toBeCloseTo(AH.safe[0], 9); // attack 0 lies before safe[0]: clamped
    expect(voice.cue(0.5)).toBeCloseTo(0.5, 9);
    expect(voice.cue(99)).toBeCloseTo(AH.safe[1], 9);
    expect(last(ring, 'seek')!.args[0]).toBeCloseTo(AH.safe[1], 9);
    const phrase = getScratchRecord('THREE_TWO_ONE')!;
    const v2 = new ScratchRecordVoice(1, fakeRing(), fakeBus());
    return v2.load(phrase, fakeBuffer(phrase.durationSec)).then(() => {
      expect(v2.cue({ word: '2' })).toBeCloseTo(phrase.wordSlices[1]!.vowel, 9);
      expect(v2.cue({ word: 'nope' })).toBeCloseTo(phrase.anchors.vowel, 9); // unknown word: the record's home
    });
  });

  it('a forward stroke inside the range posts the rate curve and is not clamped', () => {
    voice.cue('vowel');
    const res = voice.stroke([{ t: 0, velocity: 1 }], 0.2, { loop: false });
    expect(res).toEqual({ ok: true, clamped: false });
    const call = last(ring, 'rateCurve')!;
    expect(call.args[0]).toEqual([{ frame: 0, rate: 1 }, { frame: 9600, rate: 0 }]);
    expect(call.args[1]).toMatchObject({ loop: false, cycleFrames: 9600 });
    expect(scratchVoiceStats.strokes).toBe(1);
    expect(voice.safetyLog).toHaveLength(0);
  });

  it('a forward stroke past safeForward[1] is clamped and logged', () => {
    voice.cue('vowel');
    const res = voice.stroke([{ t: 0, velocity: 2 }], 1.0, { loop: false }); // 2 s of record from 0.15 s: past 0.887 s
    expect(res.ok).toBe(true);
    expect(res.clamped).toBe(true);
    expect(voice.safetyLog.at(-1)).toMatchObject({ kind: 'clampForward' });
    expect(scratchVoiceStats.clamps).toBe(1);
    expect(last(ring, 'rateCurve')).toBeDefined(); // the ring's bounds hold the head; the stroke still plays
  });

  it('a reverse request with no safe reverse room is refused with a reason', () => {
    voice.cue('attack'); // at safe[0]: nothing behind the needle
    const res = voice.stroke([{ t: 0, velocity: -1 }], 0.2, { loop: false });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/reverse/i);
    expect(scratchVoiceStats.refused).toBe(1);
    expect(voice.safetyLog.at(-1)).toMatchObject({ kind: 'reverseRefused' });
    expect(last(ring, 'rateCurve')).toBeUndefined();
    // from the vowel a reverse stroke that stays inside safeReverse is fine
    voice.cue('vowel');
    expect(voice.stroke([{ t: 0, velocity: -0.5 }], 0.2, { loop: false })).toEqual({ ok: true, clamped: false });
    // and one that would pass safeReverse[0] is clamped, not refused
    expect(voice.stroke([{ t: 0, velocity: -2 }], 0.5, { loop: false })).toEqual({ ok: true, clamped: true });
    expect(voice.safetyLog.at(-1)).toMatchObject({ kind: 'clampReverse' });
  });

  it('a gesture with a deck pattern plays as its velocity curve + fader windows, looping with a return to the anchor', () => {
    const chirp = getGesture('chirp');
    const res = voice.playGesture(chirp, 120, { ambience: 0.5 });
    expect(res.ok).toBe(true);
    const rc = last(ring, 'rateCurve')!;
    const cycleFrames = Math.round(chirp.cycleBeats * 60 / 120 * SR);
    expect(rc.args[1]).toMatchObject({ loop: true, cycleFrames, returnToAnchor: true, interpolate: chirp.interpolateVelocity });
    const fw = last(ring, 'faderWindows')!;
    const windows = fw.args[0] as Array<[number, number]>;
    expect(windows).toHaveLength(chirp.faderWindows.length);
    // chirp opens at (0.06, 0.44) with the -2 ms cut lead
    const leadFrames = (chirp.cutLeadMs ?? 0) / 1000 * SR;
    expect(windows[0]![0]).toBeCloseTo(0.06 * cycleFrames + leadFrames, 0);
    expect(windows[0]![1]).toBeCloseTo(0.44 * cycleFrames + leadFrames, 0);
    expect(fw.args[1]).toMatchObject({ cycleFrames, loop: true });
    expect(bus.ambience).toBe(0.5);
    expect(voice.busy).toBe(true);
  });

  it('a throw (drop) cues the attack and rides forward at rate 1 with the fader open, once', () => {
    const drop = getGesture('drop');
    voice.playGesture(drop, 90, {});
    expect(last(ring, 'seek')!.args[0]).toBeCloseTo(AH.safe[0], 9);
    const rc = last(ring, 'rateCurve')!;
    expect(rc.args[1]).toMatchObject({ loop: false, returnToAnchor: false });
    const points = rc.args[0] as RingRatePoint[];
    expect(points[0]!.rate).toBe(1);
    expect(last(ring, 'faderGain')!.args[0]).toBe(1);
  });

  it('a pre-scratched record refuses every gesture but drop (section 39)', async () => {
    const pre = getScratchRecord('SCRATCH_005')!;
    const v = new ScratchRecordVoice(1, fakeRing(), fakeBus());
    await v.load(pre, fakeBuffer(pre.durationSec));
    expect(v.playGesture(getGesture('chirp'), 120, {}).ok).toBe(false);
    expect(v.playGesture(getGesture('drop'), 120, {}).ok).toBe(true);
  });

  it('release stops the ring (the 3 ms gain ramp) and frees the voice', () => {
    voice.playGesture(getGesture('baby'), 100, {});
    voice.release();
    expect(last(ring, 'stop')).toBeDefined();
    expect(ring.gain).toBe(0);
    expect(voice.busy).toBe(false);
    expect(scratchVoiceStats.releases).toBeGreaterThan(0);
  });
});
