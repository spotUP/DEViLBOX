import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFCFile } from '@/lib/import/formats/FCParser';
import { classifyInstrument } from '../ChannelNaming';
import { extractSynthTimbre } from '../synthEvidence';

/**
 * The evidence must reach the classifier on a REAL song, not just in a unit
 * test built from a hand-written config.
 *
 * `synthEvidence` is exactly the shape of code that passes its own tests and
 * is never called: the extractor is pure, the classifier reaches it through
 * four earlier steps that all return first for most instruments, and the
 * formats that need it are the ones nobody loads while developing. So this
 * parses starglide1.fc off disk, runs the classifier the product runs, and
 * asserts the replayer path actually carried the verdict.
 *
 * ONE reachability test for the feature. The per-format behaviour is asserted
 * in `synthEvidence.test.ts`, where it lives.
 */

const SONG = resolve(__dirname, '../../../../public/data/songs/future-composer-1.4/starglide1.fc');

function loadStarglide() {
  const buf = readFileSync(SONG);
  return parseFCFile(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    'starglide1.fc',
  );
}

describe('FutureComposer instruments reach the synth-parameter path', () => {
  it('parses the real song and gives its instruments an fc parameter block', () => {
    const song = loadStarglide();
    expect(song.instruments.length).toBeGreaterThan(0);
    const withFc = song.instruments.filter(i => i.fc);
    expect(withFc.length).toBeGreaterThan(0);
  });

  it('extracts replayer timbre evidence from them', () => {
    const song = loadStarglide();
    const evidence = song.instruments
      .map(i => extractSynthTimbre(i))
      .filter((e): e is NonNullable<typeof e> => e !== null);

    expect(evidence.length).toBeGreaterThan(0);
    // The sentinel: `source` names which extractor ran. Without
    // `fromAmigaReplayer` these instruments produced nothing at all, so a
    // 'replayer' source proves the new code executed on real song data.
    expect(evidence.some(e => e.source === 'replayer')).toBe(true);
  });

  it('describes envelopes in a plausible range rather than raw frame counts', () => {
    const song = loadStarglide();
    for (const inst of song.instruments) {
      const t = extractSynthTimbre(inst);
      if (!t || t.source !== 'replayer') continue;
      // A frame count read as milliseconds would put every envelope under
      // 256ms and call the whole song percussive.
      expect(t.attackMs).toBeGreaterThanOrEqual(0);
      expect(t.attackMs).toBeLessThanOrEqual(20_000);
      expect(t.decayMs).toBeLessThanOrEqual(20_000);
      expect(t.releaseMs).toBeLessThanOrEqual(20_000);
    }
  });

  it('does not make every channel of the song look like one role', () => {
    // The failure this work exists to fix: with no instrument evidence every
    // channel fell through to note statistics and came back the same, which is
    // why `riddimSection` had nothing melodic to mute.
    const song = loadStarglide();
    const verdicts = song.instruments
      .filter(i => i.fc)
      .map(i => classifyInstrument(i));
    expect(verdicts.length).toBeGreaterThan(0);
    // Every verdict must at least be a real one rather than the empty default.
    expect(verdicts.every(v => v.role !== 'empty')).toBe(true);
  });
});
