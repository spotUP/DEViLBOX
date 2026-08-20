/**
 * romWordAligner.test.ts — the forced aligner must segment on frame-domain
 * evidence, not on proportional guessing (the d3beb83f9 failure mode).
 *
 * Covered here:
 * - on a real letter recording it lands near the hand-verified boundary
 * - silent frames can only belong to stop/pause segments (closure is articulation)
 * - a phoneme sequence that does not match the recording is rejected, both when
 *   it cannot fit (duration constraints) and when it fits badly (cost ceiling)
 * - phrase pauses consume exactly the interior silence
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseVSMDirectory, type LPCFrame } from '../VSMROMParser';
import { alignPhonemesToFrames, resolveRepeatFrames, trimSilence } from '../ROMWordAligner';
import { segmentLetterFrames } from '../ROMPhonemeExtractor';
import type { PhonemeToken } from '../Reciter';

const ROMS = join(process.cwd(), 'public/roms/snspell');
const present = [join(ROMS, 'tmc0351n2l.vsm'), join(ROMS, 'tmc0352n2l.vsm')].every(existsSync);

function romWord(name: string) {
  const rom = new Uint8Array(Buffer.concat([
    readFileSync(join(ROMS, 'tmc0351n2l.vsm')),
    readFileSync(join(ROMS, 'tmc0352n2l.vsm')),
  ]));
  const words = parseVSMDirectory(rom);
  const word = words.find(w => w.name === name);
  if (!word) throw new Error(`word ${name} not in ROM`);
  return word;
}

const tokens = (...codes: string[]): PhonemeToken[] => codes.map(code => ({ code, stress: 0 }));

let kid = 0;
function frame(energy: number, unvoiced: boolean, kBase?: number): LPCFrame {
  // Distinct, internally-constant K vectors per call group keep compactness at ~0.
  const b = kBase ?? 8;
  return {
    energy,
    repeat: false,
    pitch: energy === 0 ? 0 : unvoiced ? 0 : 16,
    unvoiced,
    k: energy === 0 ? [] : [b, b, 8, 8, 8, 8, 8, 4, 4, 4].map((v, i) => (i < 2 ? b + (kid % 3) : v)),
  };
}
const voiced = (kBase = 12) => frame(10, false, kBase);
const unvoiced = (kBase = 16) => frame(8, true, kBase);
const silent = () => frame(0, false);

describe('ROMWordAligner', () => {
  it.skipIf(!present)('lands near the hand-verified boundary on letter B', () => {
    const word = romWord('B');
    const letterSegs = segmentLetterFrames('B', word.frames);
    const expectedBoundary = letterSegs.get('B*')!.length; // consonant frames come first

    const result = alignPhonemesToFrames(tokens('B*', 'IY'), word.frames);
    expect(result).not.toBeNull();
    expect(result!.segments.map(s => s.code)).toEqual(['B*', 'IY']);
    expect(Math.abs(result!.segments[1].start - expectedBoundary)).toBeLessThanOrEqual(4);
  });

  it.skipIf(!present)('aligns a real vocabulary word end to end', () => {
    const word = romWord('COLOR');
    // K* AH L ER — SAM's sequence for COLOR, hand-written to test the aligner only.
    const result = alignPhonemesToFrames(tokens('K*', 'AH', 'L*', 'R*'), word.frames);
    expect(result).not.toBeNull();
    // Every frame consumed exactly once, in order.
    let pos = 0;
    for (const seg of result!.segments) {
      expect(seg.start).toBe(pos);
      pos = seg.end;
    }
    expect(pos).toBe(result!.frames.length);
  });

  it('assigns closure silence to the stop, never to the vowel', () => {
    const frames = [unvoiced(), unvoiced(), silent(), silent(), voiced(), voiced(), voiced(), voiced(), voiced()];
    const result = alignPhonemesToFrames(tokens('T*', 'IY'), frames);
    expect(result).not.toBeNull();
    const [stop, vowel] = result!.segments;
    expect(stop.code).toBe('T*');
    // The stop owns both silent frames (indices 2-3); the vowel starts at 4.
    expect(stop.end).toBe(4);
    expect(vowel.start).toBe(4);
    for (let i = vowel.start; i < vowel.end; i++) {
      expect(result!.frames[i].energy).toBeGreaterThan(0);
    }
  });

  it('refuses to let vowels swallow silence', () => {
    const frames = [voiced(), voiced(), voiced(), silent(), silent(), voiced(), voiced(), voiced()];
    // Two vowels, no pause token: the silent run cannot be consumed at all.
    expect(alignPhonemesToFrames(tokens('AA', 'AA'), frames)).toBeNull();
  });

  it('routes interior silence to the pause token in phrases', () => {
    const frames = [voiced(), voiced(), voiced(), silent(), silent(), voiced(), voiced(), voiced()];
    const result = alignPhonemesToFrames(tokens('AA', ' ', 'AA'), frames);
    expect(result).not.toBeNull();
    const [first, pause, second] = result!.segments;
    expect(pause.code).toBe(' ');
    expect([pause.start, pause.end]).toEqual([3, 5]);
    expect(second.start).toBe(5);
    expect(first.start).toBe(0);
  });

  it('allows a pause token to consume zero frames', () => {
    const frames = [voiced(), voiced(), voiced(), voiced()];
    const result = alignPhonemesToFrames(tokens(' ', 'AA'), frames);
    expect(result).not.toBeNull();
    const [pause, vowel] = result!.segments;
    expect(pause.start).toBe(pause.end);
    expect(vowel.end).toBe(4);
  });

  it('rejects a sequence that cannot fit the recording', () => {
    // 8 voiced frames vs 9 phonemes with minimum durations — impossible.
    const frames = Array.from({ length: 8 }, () => voiced());
    const codes = ['AA', 'AH', 'EH', 'IY', 'OW', 'UW', 'AE', 'AO', 'IH'];
    expect(alignPhonemesToFrames(tokens(...codes), frames)).toBeNull();
  });

  it('rejects a plausible-length sequence whose voicing is all wrong', () => {
    // Unvoiced fricatives over purely voiced frames: every segment mismatches.
    const frames = Array.from({ length: 9 }, () => voiced());
    const result = alignPhonemesToFrames(tokens('S*', 'SH', 'F*'), frames);
    expect(result).toBeNull();
  });

  it('accepts a matching sequence at low cost', () => {
    const frames = [unvoiced(10), unvoiced(10), voiced(12), voiced(12), voiced(12), voiced(12)];
    const result = alignPhonemesToFrames(tokens('S*', 'AA'), frames);
    expect(result).not.toBeNull();
    expect(result!.perPhonemeCost).toBeLessThan(0.55);
  });

  it('resolves repeat frames before measuring distance', () => {
    // A repeat frame must inherit K coefficients, not carry an empty vector.
    const base = voiced(12);
    const frames: LPCFrame[] = [
      base,
      { energy: 9, repeat: true, pitch: 15, k: [], unvoiced: false },
      voiced(12),
    ];
    const resolved = trimSilence(resolveRepeatFrames(frames));
    expect(resolved[1].k).toEqual(resolved[0].k);
  });
});
