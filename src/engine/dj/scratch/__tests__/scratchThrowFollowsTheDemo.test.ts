/**
 * A throw follows the demo (owner SCR-THROW-DEMO 2026-10-12, overturning section 41's whole word from
 * the attack): `render_gesture`'s play path rides the record forward at natural speed from its anchor -
 * the vowel - for the gesture's steps (drop 4, drop_phrase 16), at least 0.5 s, never past the record's
 * end; the planner reserves the gesture's steps. Every throw is the demo's render itself (PG-J: one stroke
 * renderer; scratchNullsTheDemo nulls a drop).
 */
import { describe, it, expect } from 'vitest';
import { throwBeats } from '../scratchPlacement';
import { buildThreeDeckRoutine } from '../scratchDemoRoutines';
import { anchorFor } from '../scratchAnchor';
import type { ScratchSource } from '../scratchTypes';
import { getScratchRecord } from '../scratchCatalogue';
import { gestureBeats, getGesture } from '../scratchGestureCatalog';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ScratchVoicePool } from '../scratchVoicePool';
import { lastWordSlice } from '../scratchCatalogue';

const crateSource = (recordId: string): ScratchSource => ({ type: 'CRATE', recordId, anchor: { position: 0, safe: [0, 1], safeForward: [0, 1], safeReverse: [0, 1] } });
const PHRASE = getScratchRecord('AH_FRESH_FULL_PHRASE')!;
const WORD = getScratchRecord('AH_STANDARD')!;

describe('a throw follows the demo (SCR-THROW-DEMO)', () => {
  it('the planner reserves the gesture\'s steps; the three-deck throw is followed by the chops it rides under', () => {
    expect(throwBeats(PHRASE, 125, 'dropPhrase')).toBe(gestureBeats('dropPhrase'));
    expect(throwBeats(WORD, 130, 'drop')).toBe(gestureBeats('drop'));
    const routine = buildThreeDeckRoutine(1);
    const drops = routine.filter((e) => e.gesture === 'drop');
    for (const d of drops) expect(routine.some((e) => e.bar === d.bar && e.step > d.step && e.gesture !== 'drop')).toBe(true);
  });

  it('a throw is cued at the vowel, like every gesture the demo plays', () => {
    const drop = anchorFor(crateSource('AH_STANDARD'), 'drop') as { cue: string; position: number };
    expect(drop.cue).toBe('vowel');
    expect(drop.position).toBeCloseTo(WORD.anchors.vowel, 9);
  });

  it('a phrase throw plays to the phrase\'s end, never stopping inside a word (SCR-PHRASE-CUT)', async () => {
    // 16 steps at 130 BPM are 1.85 s: from the vowel that stopped "that was fresh" on "that was fr"
    for (const id of ['AH_FRESH_FULL_PHRASE', 'HE_CUT_THE_MUSIC']) {
      const rec = getScratchRecord(id)!;
      const bytes = async () => { const b = readFileSync(join(process.cwd(), 'public', 'data', 'samples', 'packs', 'scratch-originals', rec.file)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
      const pool = new ScratchVoicePool({} as BaseAudioContext, {} as AudioNode, { bytes });
      const out = (await pool.renderStroke(getGesture('dropPhrase'), rec, { seed: 0, humanizeSamples: 0, chain: 'threeDeck' }, 130, 1))!;
      const end = lastWordSlice(rec)?.end ?? rec.demoCue.safe[1];
      const steps = Math.trunc(16 * 60 / (130 * 4) * 22050);
      expect(end - rec.demoCue.anchor).toBeGreaterThan(steps); // a long phrase: its steps alone would cut it
      expect(out.length).toBe(end - rec.demoCue.anchor);
    }
  }, 60_000);
});
