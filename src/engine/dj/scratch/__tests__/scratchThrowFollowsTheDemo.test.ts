/**
 * A throw follows the demo (owner SCR-THROW-DEMO 2026-10-12, overturning section 41's whole word from
 * the attack): `render_gesture`'s play path rides the record forward at natural speed from its anchor -
 * the vowel - for the gesture's steps (drop 4, drop_phrase 16), at least 0.5 s, never past the record's
 * end; the planner reserves the gesture's steps. A demo routine's throw is the demo's render itself
 * (scratchNullsTheDemo nulls a drop); this pins the voice ring's throw, which the overlay still plays.
 */
import { describe, it, expect } from 'vitest';
import { throwBeats } from '../scratchPlacement';
import { buildThreeDeckRoutine } from '../scratchDemoRoutines';
import { ScratchVoicePool } from '../scratchVoicePool';
import { ScratchRecordVoice, type ScratchVoiceRing, type ScratchVoiceBus } from '../ScratchRecordVoice';
import { anchorFor } from '../scratchAnchor';
import type { ScratchSource } from '../scratchTypes';
import { getScratchRecord } from '../scratchCatalogue';
import { getGesture, gestureBeats } from '../scratchGestureCatalog';

const SR = 48000;
const crateSource = (recordId: string): ScratchSource => ({ type: 'CRATE', recordId, anchor: { position: 0, safe: [0, 1], safeForward: [0, 1], safeReverse: [0, 1] } });
const PHRASE = getScratchRecord('AH_FRESH_FULL_PHRASE')!;
const WORD = getScratchRecord('AH_STANDARD')!;

function voiceOn(record: typeof PHRASE) {
  const calls: Array<{ type: string; args: unknown[] }> = [];
  const ring = {
    sampleRate: SR, playbackGain: { connect: () => undefined } as unknown as GainNode, onPosition: null,
    loadRecord: async (b: AudioBuffer) => b.length, setBounds: () => {}, startAt: () => {},
    seek: (...args: unknown[]) => { calls.push({ type: 'seek', args }); },
    rateCurve: (...args: unknown[]) => { calls.push({ type: 'rateCurve', args }); },
    faderWindows: () => {}, faderGain: () => {}, stopScratch: async () => 0, stopAt: () => {}, silenceAndStop: () => {},
  } as unknown as ScratchVoiceRing;
  const bus = { input: {} as AudioNode, setAmbience: () => {} } as ScratchVoiceBus;
  const voice = new ScratchRecordVoice(0, ring, bus);
  return { voice, calls, load: () => voice.load(record, { length: Math.round(record.durationSec * SR), sampleRate: SR, numberOfChannels: 2 } as AudioBuffer) };
}
const strokeSec = (calls: Array<{ type: string; args: unknown[] }>) => (calls.filter((c) => c.type === 'rateCurve').at(-1)!.args[1] as { cycleFrames: number }).cycleFrames / SR;

describe('a throw follows the demo (SCR-THROW-DEMO)', () => {
  it('the planner reserves the gesture\'s steps; the three-deck throw still rides on its own voice under the chops after it', () => {
    expect(throwBeats(PHRASE, 125, 'dropPhrase')).toBe(gestureBeats('dropPhrase'));
    expect(throwBeats(WORD, 130, 'drop')).toBe(gestureBeats('drop'));
    const routine = buildThreeDeckRoutine(1);
    const drops = routine.filter((e) => e.gesture === 'drop');
    for (const d of drops) expect(routine.some((e) => e.bar === d.bar && e.step > d.step && e.gesture !== 'drop')).toBe(true);
    const pool = Object.create(ScratchVoicePool.prototype) as ScratchVoicePool;
    (pool as unknown as { voices: unknown[] }).voices = [{ busy: false }, { busy: false }];
    expect(pool.acquire('INTRO')).not.toBe(pool.acquire('THEME'));
  });

  it('a throw is cued at the vowel, like every gesture the demo plays', () => {
    const drop = anchorFor(crateSource('AH_STANDARD'), 'drop') as { cue: string; position: number };
    expect(drop.cue).toBe('vowel');
    expect(drop.position).toBeCloseTo(WORD.anchors.vowel, 9);
  });

  it('the voice rides the word from the vowel for 4 steps but at least 0.5 s (130 BPM: 0.46 s -> 0.5 s), a phrase for its 16 steps', async () => {
    const w = voiceOn(WORD); await w.load();
    expect(w.voice.playGesture(getGesture('drop'), 130).ok).toBe(true);
    expect(w.calls.filter((c) => c.type === 'seek').at(-1)!.args[0]).toBeCloseTo(WORD.anchors.vowel, 9);
    expect(strokeSec(w.calls)).toBeCloseTo(Math.min(WORD.durationSec - WORD.anchors.vowel, 0.5), 3);
    const p = voiceOn(PHRASE); await p.load();
    expect(p.voice.playGesture(getGesture('dropPhrase'), 125).ok).toBe(true);
    expect(strokeSec(p.calls)).toBeCloseTo(Math.min(PHRASE.durationSec - PHRASE.anchors.vowel, 16 * 60 / (125 * 4)), 3);
  });
});
