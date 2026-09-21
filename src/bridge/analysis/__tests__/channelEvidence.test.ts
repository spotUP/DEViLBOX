/**
 * Channel evidence — Phase 1 of the Channel Intelligence plan.
 *
 * These assert the NUMBERS, not a label. The whole point of the evidence layer
 * is that it commits to nothing: a later phase decides what a stepwise,
 * off-beat, monophonic low part in octave 2 should be called, and it can only
 * decide well if the measurements underneath are exact.
 *
 * Two kinds of coverage here:
 *   - hand-built patterns, where every expected number can be worked out by
 *     hand, so a wrong formula cannot hide behind plausible-looking output;
 *   - the committed Mortimer Twang module, so the shapes are exercised against
 *     music somebody actually wrote rather than against a fixture designed to
 *     pass.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  fingerprintChannelPattern,
  fingerprintPattern,
  fingerprintSong,
} from '../channelEvidence';
import { parseMOD } from '@/lib/import/formats/MODParser';
import { periodToNoteIndex, amigaNoteToXM } from '@/lib/import/formats/AmigaUtils';
import type { ChannelData, Pattern, TrackerCell } from '@/types/tracker';

// ── builders ────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** `fill` maps row -> one or more notes on that row (extra notes go to note2..4). */
function makeChannel(
  length: number,
  fill: Record<number, number | number[]>,
  instrument = 1,
): ChannelData {
  const rows: TrackerCell[] = Array.from({ length }, () => emptyCell());
  for (const [rowStr, v] of Object.entries(fill)) {
    const row = Number(rowStr);
    const notes = Array.isArray(v) ? v : [v];
    const cell: TrackerCell = { ...emptyCell(), note: notes[0], instrument };
    if (notes[1] !== undefined) cell.note2 = notes[1];
    if (notes[2] !== undefined) cell.note3 = notes[2];
    if (notes[3] !== undefined) cell.note4 = notes[3];
    rows[row] = cell;
  }
  return {
    id: 'c', name: 'c', rows,
    muted: false, solo: false, collapsed: false,
    volume: 100, pan: 0, instrumentId: instrument, color: null,
  };
}

const fingerprint = (ch: ChannelData, rows = 64) => fingerprintChannelPattern(ch, 0, 0, rows);

// ── pitch ───────────────────────────────────────────────────────────────────

describe('pitch evidence', () => {
  it('reports the sounded range rather than the mean', () => {
    // One stray high note must not drag the centre with it — that is exactly
    // what makes `avgOctave` a poor discriminator on chip formats.
    const p = fingerprint(makeChannel(64, { 0: 25, 4: 25, 8: 27, 12: 25, 16: 80 })).pitch!;
    expect(p.lowest).toBe(25);
    expect(p.highest).toBe(80);
    expect(p.median).toBe(25);
    expect(p.range).toBe(55);
  });

  it('separates stepwise writing from leaping writing', () => {
    const stepwise = fingerprint(makeChannel(64, { 0: 40, 4: 41, 8: 42, 12: 41 })).pitch!;
    expect(stepwise.stepwiseRatio).toBe(1);
    expect(stepwise.leapRatio).toBe(0);

    const leaping = fingerprint(makeChannel(64, { 0: 40, 4: 52, 8: 40, 12: 55 })).pitch!;
    expect(leaping.leapRatio).toBe(1);
    expect(leaping.stepwiseRatio).toBe(0);
  });

  it('counts pitch classes and octaves separately', () => {
    // C at three octaves: one pitch class, three octaves.
    const p = fingerprint(makeChannel(64, { 0: 13, 4: 25, 8: 37 })).pitch!;
    expect(p.uniquePitchClasses).toBe(1);
    expect(p.octaveSpread).toBe(3);
  });

  it('is null for a channel with no notes, rather than zeroes', () => {
    // Zeroes would read as "a part in octave 0 with no movement", which is a
    // claim. Silence is the absence of one.
    const f = fingerprint(makeChannel(64, {}));
    expect(f.pitch).toBeNull();
    expect(f.silent).toBe(true);
  });
});

// ── rhythm ──────────────────────────────────────────────────────────────────

describe('rhythm evidence', () => {
  it('measures density against the pattern, not the notes', () => {
    const r = fingerprint(makeChannel(64, { 0: 25, 16: 25, 32: 25, 48: 25 })).rhythm;
    expect(r.onsetCount).toBe(4);
    expect(r.density).toBeCloseTo(4 / 64, 6);
  });

  it('tells a downbeat part from an off-beat one', () => {
    const onbeat = fingerprint(makeChannel(64, { 0: 25, 4: 25, 8: 25, 12: 25 })).rhythm;
    expect(onbeat.onbeatRatio).toBe(1);
    expect(onbeat.offbeatRatio).toBe(0);

    // Rows 2, 6, 10, 14 — the "and" of each beat, which is where a skank sits.
    const offbeat = fingerprint(makeChannel(64, { 2: 25, 6: 25, 10: 25, 14: 25 })).rhythm;
    expect(offbeat.offbeatRatio).toBe(1);
    expect(offbeat.skankConfidence).toBeGreaterThan(0);
  });

  it('scores an evenly spaced part as regular and a bursty one as not', () => {
    const even = fingerprint(makeChannel(64, { 0: 25, 8: 25, 16: 25, 24: 25, 32: 25 })).rhythm;
    expect(even.medianInterOnset).toBe(8);
    expect(even.regularity).toBe(1);

    const bursty = fingerprint(makeChannel(64, { 0: 25, 1: 25, 2: 25, 40: 25, 41: 25 })).rhythm;
    expect(bursty.regularity).toBeLessThan(0.5);
  });

  it('reports how much of the pattern the part occupies', () => {
    const early = fingerprint(makeChannel(64, { 0: 25, 4: 25, 8: 25 })).rhythm;
    expect(early.span).toBeCloseTo(8 / 64, 6);
  });
});

// ── harmony ─────────────────────────────────────────────────────────────────

describe('harmony evidence', () => {
  it('counts simultaneous notes across every note column', () => {
    const h = fingerprint(makeChannel(64, { 0: [40, 44, 47], 8: [40, 44] })).harmony;
    expect(h.maxPolyphony).toBe(3);
    expect(h.avgPolyphony).toBeCloseTo(2.5, 6);
    expect(h.monophonic).toBe(false);
    expect(h.chordRows).toBe(1);
  });

  it('calls a single-column part monophonic', () => {
    const h = fingerprint(makeChannel(64, { 0: 40, 8: 44 })).harmony;
    expect(h.maxPolyphony).toBe(1);
    expect(h.monophonic).toBe(true);
    expect(h.chordRows).toBe(0);
  });
});

// ── source ──────────────────────────────────────────────────────────────────

describe('source evidence', () => {
  it('ranks instruments by use and reports dominance', () => {
    const ch = makeChannel(64, { 0: 40, 8: 40, 16: 40 }, 7);
    ch.rows[24] = { ...emptyCell(), note: 40, instrument: 9 };
    const s = fingerprintChannelPattern(ch, 0, 0, 64).source;
    expect(s.instrumentIds).toEqual([7, 9]);
    expect(s.dominance).toBeCloseTo(3 / 4, 6);
    expect(s.instrumentChanges).toBe(true);
  });

  it('collects the effect types present', () => {
    const ch = makeChannel(64, { 0: 40 });
    ch.rows[0] = { ...ch.rows[0], effTyp: 15, eff: 6, effTyp2: 12, eff2: 32 };
    const s = fingerprintChannelPattern(ch, 0, 0, 64).source;
    expect(s.effectTypes).toEqual([12, 15]);
  });
});

// ── song walk ───────────────────────────────────────────────────────────────

describe('walking a song', () => {
  function patternOf(channels: ChannelData[]): Pattern {
    return { id: 'p', name: 'p', length: channels[0].rows.length, channels };
  }

  it('fingerprints every channel of a pattern', () => {
    const p = patternOf([
      makeChannel(64, { 0: 25, 8: 25 }),
      makeChannel(64, {}),
    ]);
    const out = fingerprintPattern(p, 3);
    expect(out).toHaveLength(2);
    expect(out[0].patternIndex).toBe(3);
    expect(out[0].channelIndex).toBe(0);
    expect(out[1].silent).toBe(true);
  });

  it('emits one entry per ORDER position, not per pattern', () => {
    // A pattern played three times is three instances. Collapsing them here
    // would destroy the distinction a segment timeline is built on.
    const p = patternOf([makeChannel(64, { 0: 25 })]);
    const song = fingerprintSong([p], [0, 0, 0]);
    expect(song).toHaveLength(3);
    expect(song.map(s => s.orderIndex)).toEqual([0, 1, 2]);
    expect(song.map(s => s.patternIndex)).toEqual([0, 0, 0]);
  });

  it('skips an order entry pointing at a pattern that does not exist', () => {
    const p = patternOf([makeChannel(64, { 0: 25 })]);
    expect(fingerprintSong([p], [0, 99])).toHaveLength(1);
  });
});

// ── a real song ─────────────────────────────────────────────────────────────

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../__tests__/fixtures');

describe('against a real module', () => {
  it('produces usable evidence for every channel of Mortimer Twang 2118bytes', async () => {
    const bytes = readFileSync(resolve(FIXTURES, 'mortimer-twang-2118bytes.mod'));
    const mod = await parseMOD(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );

    // The parser hands back patterns as rows[64] of RAW MOD cells — Amiga
    // periods, not note numbers — so transpose to channels and convert the
    // pitch with the same helpers the importers use. Reading `cell.note` off
    // these directly yields undefined, which is silence, which is how the
    // first version of this test passed nothing while looking fine.
    const raw = mod.patterns[0];
    const channelCount = raw[0].length;
    const channels: ChannelData[] = Array.from({ length: channelCount }, (_, c) => ({
      id: `c${c}`, name: `c${c}`,
      rows: raw.map((row): TrackerCell => {
        const src = row[c] as { period?: number; instrument?: number; effect?: number; effectParam?: number };
        const idx = periodToNoteIndex(src.period ?? 0);
        return {
          note: idx > 0 ? amigaNoteToXM(idx) : 0,
          instrument: src.instrument ?? 0,
          volume: 0,
          effTyp: src.effect ?? 0,
          eff: src.effectParam ?? 0,
          effTyp2: 0,
          eff2: 0,
        };
      }),
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
    }));

    const out = fingerprintPattern(
      { id: 'p0', name: 'p0', length: raw.length, channels },
      0,
    );

    expect(out).toHaveLength(channelCount);
    for (const f of out) {
      expect(f.totalRows).toBe(raw.length);
      // Every number is finite and in range — no NaN leaking from a division
      // by an empty channel, which is the failure mode that would poison every
      // consumer downstream.
      expect(Number.isFinite(f.rhythm.density)).toBe(true);
      expect(f.rhythm.density).toBeGreaterThanOrEqual(0);
      expect(f.rhythm.onbeatRatio + f.rhythm.offbeatRatio).toBeCloseTo(f.silent ? 0 : 1, 6);
      expect(Number.isFinite(f.rhythm.regularity)).toBe(true);
      expect(f.harmony.avgPolyphony).toBeGreaterThanOrEqual(0);
      if (f.pitch) {
        expect(f.pitch.lowest).toBeLessThanOrEqual(f.pitch.highest);
        expect(f.pitch.stepwiseRatio + f.pitch.leapRatio).toBeLessThanOrEqual(1);
        expect(f.pitch.uniquePitchClasses).toBeGreaterThan(0);
      }
    }

    // And it is actually measuring something: a real pattern is not silent on
    // every channel.
    expect(out.some(f => !f.silent)).toBe(true);
  });
});
