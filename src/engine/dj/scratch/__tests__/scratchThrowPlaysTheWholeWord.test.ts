/**
 * A throw plays its whole word (owner scratch plan section 41 "drop: the full word"; owner report
 * 2026-10-12 "that was fr" instead of "that was fresh"). Measured cause: `dropPhrase` is 16 steps
 * = 1.92 s at 125 BPM, AH_FRESH_FULL_PHRASE runs 2.17 s from its attack, and both the voice
 * (stroke length = min(gesture, record)) and the planner (event length = the gesture's) cut the
 * last 0.25 s. Now the planner reserves the record's length (`throwBeats`), the executor releases
 * at that end, and the voice plays to the end of the safe range.
 */
import { describe, it, expect } from 'vitest';
import { planScratch } from '../scratchPlanner';
import { throwBeats, oneHandConflicts } from '../scratchPlacement';
import { toScratchEvents } from '../scratchPlanner';
import { ScratchRecordVoice, type ScratchVoiceRing, type ScratchVoiceBus } from '../ScratchRecordVoice';
import { getScratchRecord } from '../scratchCatalogue';
import { getGesture } from '../scratchGestureCatalog';
import { scenarioContext } from './fixtures/scenarioContext';
import { fixtureAnalysis } from './fixtures/analysisFixture';

const SR = 48000;
const PHRASE = getScratchRecord('AH_FRESH_FULL_PHRASE')!; // "aaaah fresh that was fresh"
const wordSec = (r: typeof PHRASE) => r.safe[1] - r.anchors.attack;

describe('a throw plays the whole word (section 41)', () => {
  it('the planner reserves the whole phrase: the throw event lasts >= the record from its attack, nothing starts inside it', () => {
    let throws = 0;
    for (const bpm of [92, 125, 140]) {
      for (let seed = 1; seed <= 10; seed++) {
        const ctx = scenarioContext({ style: 'boomBap', kind: 'breakdown', bpm, energy: 0.5 });
        const p = planScratch(ctx, { mode: 'MUSICAL', seed, fromBar: 16, bars: 16, record: PHRASE, throwMemory: {} });
        const t = p.events.find((e) => e.gesture === 'dropPhrase' || e.gesture === 'drop');
        if (!t) continue;
        throws++;
        expect(t.gesture).toBe('dropPhrase');
        const events = toScratchEvents(p.events, { type: 'CRATE', recordId: PHRASE.id, anchor: PHRASE.anchor }, PHRASE.anchor, { bpm, seed, downbeats: fixtureAnalysis().downbeats });
        const te = events.find((e) => e.gesture === 'dropPhrase')!;
        expect(te.durationBeats * 60 / bpm, `bpm ${bpm} seed ${seed}`).toBeGreaterThanOrEqual(wordSec(PHRASE) - 1e-9);
        expect(oneHandConflicts(p.events)).toBe(0);
        for (const e of events) if (e !== te) expect(e.executeAtBeat >= te.executeAtBeat + te.durationBeats - 1e-9 || e.executeAtBeat + e.durationBeats <= te.executeAtBeat + 1e-9, `${e.gesture} inside the throw`).toBe(true);
      }
    }
    expect(throws).toBeGreaterThanOrEqual(10);
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
