import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMaxTrax } from '@/lib/import/formats/maxtrax/maxtraxFormat';
import { deriveGrid, moveNote, setNoteDuration, absoluteTicksOf } from '@/lib/maxtrax/maxtraxGrid';

const FIXTURES = ['antmusic.mxtx','contraptionzack-funkfest.mxtx','contraptionzack-march.mxtx','darkseed (00).mxtx'];
const load = (f: string) => parseMaxTrax(new Uint8Array(readFileSync(join(process.cwd(),'public/data/songs/maxtrax',f))));

describe('MaxTrax grid bijection', () => {
  it('every fixture score derives a grid whose note-offs equal start+duration', () => {
    for (const f of FIXTURES) {
      const d = load(f);
      for (const score of d.scores) {
        const g = deriveGrid(score, 24);
        const abs = absoluteTicksOf(score);
        for (const c of g.noteCells) {
          if (c.kind !== 'noteOff') continue;
          const endTick = abs[c.eventIndex] + score.events[c.eventIndex].stopTime;
          expect(c.row * 24 + c.offset).toBe(endTick); // note-off lands exactly at end
        }
      }
    }
  });

  it('moveNote changes only the target absolute tick, leaving all others fixed', () => {
    const score = load('contraptionzack-march.mxtx').scores[0];
    const noteIdx = score.events.findIndex((e) => e.command <= 0x7f && e.startTime === 0);
    const before = absoluteTicksOf(score);
    const target = before[noteIdx] + 48;
    const edited = moveNote(score, noteIdx, target);
    const after = absoluteTicksOf(edited);
    for (let i = 0; i < before.length; i++) {
      if (i === noteIdx) expect(after[i]).toBe(target);
      else expect(after[i]).toBe(before[i]); // every other event's absolute time unchanged
    }
  });

  it('setNoteDuration writes stopTime and is reversible', () => {
    const score = load('darkseed (00).mxtx').scores[0];
    const idx = score.events.findIndex((e) => e.command <= 0x7f);
    const orig = score.events[idx].stopTime;
    const edited = setNoteDuration(setNoteDuration(score, idx, 500), idx, orig);
    expect(edited.events[idx].stopTime).toBe(orig);
    expect(edited.events).not.toBe(score.events); // returned a new array (no mutation)
    expect(score.events[idx].stopTime).toBe(orig); // input untouched
  });
});
