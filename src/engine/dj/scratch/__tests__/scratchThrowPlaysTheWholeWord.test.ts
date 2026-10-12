/**
 * A throw plays its whole word (owner scratch plan section 41 "drop: the full word"; owner report
 * 2026-10-12 "that was fr" instead of "that was fresh"). Measured cause: `dropPhrase` is 16 steps
 * = 1.92 s at 125 BPM, AH_FRESH_FULL_PHRASE runs 2.17 s from its attack, and both the voice
 * (stroke length = min(gesture, record)) and the planner (event length = the gesture's) cut the
 * last 0.25 s. Now the planner reserves the record's length (`throwBeats`), the executor releases
 * at that end, and the voice plays to the end of the safe range.
 */
import { describe, it, expect } from 'vitest';
import { throwBeats } from '../scratchPlacement';
import { buildThreeDeckRoutine } from '../scratchDemoRoutines';
import { ScratchVoicePool } from '../scratchVoicePool';
import { ScratchRecordVoice, type ScratchVoiceRing, type ScratchVoiceBus } from '../ScratchRecordVoice';
import { getScratchRecord } from '../scratchCatalogue';
import { getGesture } from '../scratchGestureCatalog';

const SR = 48000;
const PHRASE = getScratchRecord('AH_FRESH_FULL_PHRASE')!; // "aaaah fresh that was fresh"
const wordSec = (r: typeof PHRASE) => r.safe[1] - r.anchors.attack;

describe('a throw plays the whole word (section 41)', () => {
  it('the three-deck throw rides on its own voice: the chops after it (on the theme voice) never cut the word', () => {
    // the demo's throw sums under the scratches that follow it in the same bar (three_deck); one voice
    // would stop the word at the first chop ("that was fr")
    const routine = buildThreeDeckRoutine(1);
    const drops = routine.filter((e) => e.gesture === 'drop');
    expect(drops.length).toBeGreaterThan(5);
    for (const d of drops) expect(routine.some((e) => e.bar === d.bar && e.step > d.step && e.gesture !== 'drop')).toBe(true);
    const pool = Object.create(ScratchVoicePool.prototype) as ScratchVoicePool;
    (pool as unknown as { voices: unknown[] }).voices = [{ busy: false }, { busy: false }];
    expect(pool.acquire('INTRO')).not.toBe(pool.acquire('THEME'));
    expect(throwBeats(PHRASE, 125, 'dropPhrase') * 60 / 125).toBeGreaterThan(getGesture('dropPhrase').durationSteps / 4 * 60 / 125);
  });

  it('the voice strokes the phrase from its attack to the end of its safe range at 125 BPM', async () => {
    const calls: Array<{ type: string; opts?: { cycleFrames: number } }> = [];
    const ring = {
      sampleRate: SR, playbackGain: { connect: () => undefined } as unknown as GainNode, onPosition: null,
      loadRecord: async (b: AudioBuffer) => b.length, setBounds: () => {}, startAt: () => {}, seek: () => {},
      rateCurve: (_p: unknown, opts: { cycleFrames: number }) => { calls.push({ type: 'rateCurve', opts }); },
      faderWindows: () => {}, faderGain: () => {}, stopScratch: async () => 0, stopAt: () => {}, silenceAndStop: () => {},
    } as unknown as ScratchVoiceRing;
    const bus = { input: {} as AudioNode, setAmbience: () => {} } as ScratchVoiceBus;
    const voice = new ScratchRecordVoice(0, ring, bus);
    await voice.load(PHRASE, { length: Math.round(PHRASE.durationSec * SR), sampleRate: SR, numberOfChannels: 2 } as AudioBuffer);
    expect(voice.playGesture(getGesture('dropPhrase'), 125).ok).toBe(true);
    const frames = calls.at(-1)!.opts!.cycleFrames;
    expect(frames / SR).toBeGreaterThanOrEqual(wordSec(PHRASE) - 1 / SR);
  });
});
