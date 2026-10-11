/**
 * Audit JA-M5 (2026-10-11 juggling audit; owner plan sections 9, 41): the
 * stand-alone tease started the next track's phrase 1 on whatever bar of the
 * master's phrase came next, so the two phrase grids sat 1-7 bars apart for
 * the whole tease. The incoming is cued as many bars before one of its
 * phrase starts as the master has bars left to its own next phrase start:
 * the phrases meet where the pattern begins. Corpus analyses.
 */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis } from '../../testing/corpus';
import { mixInPhraseStartOf, teaseCueSec } from '../standaloneJuggle';
import type { DJTrackAnalysis } from '../../types';

const barOf = (a: DJTrackAnalysis, t: number): number => a.downbeats.bars.findIndex((b) => Math.abs(b.start - t) < 1e-6);

describe('a teased next track runs its phrases with the master\'s', () => {
  const master = corpusAnalysis('drops');
  const incoming = corpusAnalysis('compatibleKey');
  const phrase = master.phrases.find((p) => p.startBar >= 8)!;

  for (const barsLeft of [3, 5, 1]) {
    it(`the master ${barsLeft} bars from its next phrase: the incoming reaches a phrase start of its own on that same bar`, () => {
      const startSec = master.downbeats.bars[phrase.startBar - barsLeft].start;
      const cue = teaseCueSec(master, startSec, incoming);
      const cueBar = barOf(incoming, cue);
      expect(cueBar, `cue ${cue} is a bar start`).toBeGreaterThanOrEqual(0);
      const met = incoming.phrases.find((p) => p.startBar === cueBar + barsLeft);
      expect(met, `no incoming phrase starts ${barsLeft} bars after the cue (bar ${cueBar})`).toBeDefined();
      expect(met!.start).toBeGreaterThanOrEqual(mixInPhraseStartOf(incoming) - 0.01);
    });
  }

  it('the master on a phrase start: the incoming starts on its mix-in phrase', () => {
    expect(teaseCueSec(master, phrase.start, incoming)).toBe(mixInPhraseStartOf(incoming));
  });
});
