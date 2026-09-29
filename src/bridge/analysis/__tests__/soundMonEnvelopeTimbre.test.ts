/**
 * SoundMon synth instruments are classified from the envelope the replayer
 * plays, not from the editor's ADSR approximation.
 *
 * SoundMonParser reduced the real envelope table to attackSpeed = adsrSpeed,
 * and the classifier read attackSpeed 1 as a 1.28 s swell: every SoundMon
 * synth came back 'pad' at 0.7 - including nicktune1.bp's instrument 7, whose
 * envelope (63,35,12,6,3,1,0 one step per frame) is gone in 7 frames.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSoundMonFile } from '@/lib/import/formats/SoundMonParser';
import { extractSynthTimbre, classifyBySynthParams } from '../synthEvidence';
import type { InstrumentConfig } from '@typedefs/instrument';

async function instruments(): Promise<InstrumentConfig[]> {
  const b = readFileSync(join(process.cwd(), 'public/data/songs/bp-soundmon-2/nicktune1.bp'));
  const song = await parseSoundMonFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'nicktune1.bp');
  return song.instruments as InstrumentConfig[];
}

describe('SoundMon synth timbre', () => {
  it('reads the envelope table the replayer plays', async () => {
    const inst7 = (await instruments()).find((i) => i.id === 7)!;
    expect(inst7.soundMon?.adsr?.levels.slice(0, 8)).toEqual([63, 35, 12, 6, 3, 2, 1, 0]);
  });

  it('a hit that dies in a few frames is percussive, not a swelling pad', async () => {
    const ev = extractSynthTimbre((await instruments()).find((i) => i.id === 7))!;
    expect(ev.articulation).toBe('percussive');
    expect(classifyBySynthParams(ev).role).not.toBe('pad');
  });

  it('no synth in the song reads as swelling: none has a slow attack', async () => {
    for (const inst of (await instruments()).filter((i) => i.soundMon?.type === 'synth')) {
      expect(extractSynthTimbre(inst)?.articulation, `instrument ${inst.id}`).not.toBe('swelling');
    }
  });
});
