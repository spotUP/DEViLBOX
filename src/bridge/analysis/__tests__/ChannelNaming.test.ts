/**
 * ChannelNaming tests — pure classifier coverage.
 *
 * Tests the priority order of instrument signals (drumType > DRUM_SYNTHS >
 * sample-name > inst-name regex), the role→label table, generic-name
 * detection, and the full autoNameChannels pipeline including duplicate
 * suffixing and user-rename protection.
 */

import { describe, it, expect } from 'vitest';
import {
  isGenericChannelName,
  classifyInstrument,
  classifyChannelWithInstruments,
  classifySongRoles,
  suggestChannelName,
  autoNameChannels,
  getChannelInstruments,
  type EnhancedChannelAnalysis,
} from '../ChannelNaming';
import type { ChannelData, Pattern, TrackerCell } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument/defaults';

// ── Tiny fixture builders ───────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function noteCell(note: number, instrument: number = 1): TrackerCell {
  return { note, instrument, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function makeChannel(name: string, length: number, fill: Record<number, { note: number; instrument?: number }>): ChannelData {
  const rows: TrackerCell[] = Array.from({ length }, () => emptyCell());
  for (const [rowStr, v] of Object.entries(fill)) {
    const row = parseInt(rowStr, 10);
    if (row >= 0 && row < length) rows[row] = noteCell(v.note, v.instrument ?? 1);
  }
  return {
    id: name, name, rows,
    muted: false, solo: false, collapsed: false,
    volume: 100, pan: 0, instrumentId: 1, color: null,
  };
}
function makePattern(channels: ChannelData[]): Pattern {
  return { id: 'p0', name: 'p', length: channels[0]?.rows.length ?? 64, channels };
}
function makeInstrument(partial: Partial<InstrumentConfig> & { id: number; name: string }): InstrumentConfig {
  // Minimal InstrumentConfig for classifier testing — only the fields the
  // classifier reads. Cast to full type; tests never hit unused fields.
  return {
    type: 'sample',
    synthType: 'Sampler',
    ...partial,
  } as InstrumentConfig;
}

// ── isGenericChannelName ────────────────────────────────────────────────────

describe('isGenericChannelName', () => {
  it('matches "Channel N" (MOD/XM/IT/S3M/native default)', () => {
    expect(isGenericChannelName('Channel 1')).toBe(true);
    expect(isGenericChannelName('Channel 42')).toBe(true);
  });
  it('matches "CHN" UI fallback', () => {
    expect(isGenericChannelName('CH1')).toBe(true);
    expect(isGenericChannelName('CH12')).toBe(true);
  });
  it('matches numeric-only scope labels', () => {
    expect(isGenericChannelName('1')).toBe(true);
    expect(isGenericChannelName('42')).toBe(true);
  });
  it('matches empty / whitespace / null / undefined', () => {
    expect(isGenericChannelName('')).toBe(true);
    expect(isGenericChannelName('   ')).toBe(true);
    expect(isGenericChannelName(null)).toBe(true);
    expect(isGenericChannelName(undefined)).toBe(true);
  });
  it('does NOT match user renames', () => {
    expect(isGenericChannelName('Bass')).toBe(false);
    expect(isGenericChannelName('My Lead')).toBe(false);
    expect(isGenericChannelName('Drums')).toBe(false);
    expect(isGenericChannelName('Channel')).toBe(false);
    expect(isGenericChannelName('Channel  2')).toBe(false); // double space
  });
});

// ── classifyInstrument priority order ──────────────────────────────────────

describe('classifyInstrument', () => {
  it('drumMachine.drumType is the top-priority signal (confidence 1.0)', () => {
    const inst = makeInstrument({
      id: 1, name: 'lead synth',  // name says "lead" but drumType wins
      synthType: 'DrumMachine',
      drumMachine: { drumType: 'snare' },
    });
    const res = classifyInstrument(inst);
    expect(res.role).toBe('percussion');
    expect(res.subrole).toBe('snare');
    expect(res.confidence).toBe(1.0);
  });

  it('DRUM_SYNTHS synthType trumps name/sample', () => {
    const inst = makeInstrument({
      id: 1, name: 'my bass', synthType: 'TR808',
    });
    const res = classifyInstrument(inst);
    expect(res.role).toBe('percussion');
    expect(res.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('sample URL categorize beats name regex', () => {
    const inst = makeInstrument({
      id: 1, name: 'Lead Synth', synthType: 'Sampler',
      sample: { url: 'samples/kick-808.wav', baseNote: 'C-4', detune: 0, loop: false, loopStart: 0, loopEnd: 0, reverse: false, playbackRate: 1 },
    });
    const res = classifyInstrument(inst);
    expect(res.role).toBe('percussion');
    expect(res.subrole).toBe('kick');
  });

  it('instrument name regex classifies when no sample/drumType/DRUM_SYNTH', () => {
    expect(classifyInstrument(makeInstrument({ id: 1, name: 'Sub Bass' })).role).toBe('bass');
    expect(classifyInstrument(makeInstrument({ id: 1, name: 'My Lead' })).role).toBe('lead');
    expect(classifyInstrument(makeInstrument({ id: 1, name: 'Warm Pad' })).role).toBe('pad');
    expect(classifyInstrument(makeInstrument({ id: 1, name: 'Snare 909' })).role).toBe('percussion');
    expect(classifyInstrument(makeInstrument({ id: 1, name: 'Snare 909' })).subrole).toBe('snare');
  });

  it('kick name regex picks kick subrole', () => {
    const res = classifyInstrument(makeInstrument({ id: 1, name: 'Kick Drum 01' }));
    expect(res.role).toBe('percussion');
    expect(res.subrole).toBe('kick');
  });

  it('returns empty/zero confidence for unknown instruments', () => {
    const res = classifyInstrument(makeInstrument({ id: 1, name: 'foobar' }));
    expect(res.role).toBe('empty');
    expect(res.confidence).toBe(0);
  });

  it('null/undefined instrument returns empty', () => {
    expect(classifyInstrument(null).role).toBe('empty');
    expect(classifyInstrument(undefined).role).toBe('empty');
  });
});

// ── getChannelInstruments ──────────────────────────────────────────────────

describe('getChannelInstruments', () => {
  it('counts instrument occurrences, ignoring instrument=0 and empty cells', () => {
    const ch = makeChannel('x', 8, {
      0: { note: 24, instrument: 1 },
      1: { note: 24, instrument: 1 },
      2: { note: 24, instrument: 2 },
      3: { note: 0,  instrument: 0 },
    });
    const freq = getChannelInstruments(ch);
    expect(freq.get(1)).toBe(2);
    expect(freq.get(2)).toBe(1);
    expect(freq.has(0)).toBe(false);
  });
});

// ── classifyChannelWithInstruments (blending) ──────────────────────────────

describe('classifyChannelWithInstruments', () => {
  it('dominant-instrument override when confidence >= 0.8 and cells >= 70%', () => {
    // Channel plays a "Kick 808" sample on 8/10 rows. Note-stats would
    // never classify this as percussion on its own (it's one pitch at
    // octave 2) but the instrument carries the signal.
    const ch = makeChannel('Channel 1', 10, {
      0: { note: 24 }, 1: { note: 24 }, 2: { note: 24 }, 3: { note: 24 },
      4: { note: 24 }, 5: { note: 24 }, 6: { note: 24 }, 7: { note: 24 },
    });
    const lookup = new Map<number, InstrumentConfig>();
    lookup.set(1, makeInstrument({
      id: 1, name: 'Kick 808', synthType: 'Sampler',
      sample: { url: 'kick-808.wav', baseNote: 'C-4', detune: 0, loop: false, loopStart: 0, loopEnd: 0, reverse: false, playbackRate: 1 },
    }));
    const res = classifyChannelWithInstruments(ch, 0, lookup);
    expect(res.role).toBe('percussion');
    expect(res.subrole).toBe('kick');
  });

  it("falls back to note-stats when dominant instrument's confidence is low", () => {
    // Instrument name says nothing useful → low confidence → note-stats wins.
    const ch = makeChannel('Channel 1', 64, {
      0: { note: 13 }, 4: { note: 15 }, 8: { note: 13 }, 12: { note: 15 },
    });
    const lookup = new Map<number, InstrumentConfig>();
    lookup.set(1, makeInstrument({ id: 1, name: 'foobar' }));
    const res = classifyChannelWithInstruments(ch, 0, lookup);
    // Low-octave, few unique, small intervals → classifyChannel says 'bass'.
    expect(res.role).toBe('bass');
  });

  it('tags low-octave bass as sub', () => {
    // Notes 2-3 → octave 0-ish (well under 2). classifyChannel → 'bass'.
    const ch = makeChannel('Channel 1', 64, {
      0: { note: 2 }, 4: { note: 3 }, 8: { note: 2 }, 12: { note: 3 },
    });
    const res = classifyChannelWithInstruments(ch, 0, new Map());
    expect(res.role).toBe('bass');
    expect(res.subrole).toBe('sub');
  });

  it('sets subrole=mixed when top-2 instruments are different perc types', () => {
    // Channel plays kick (instr 1) on half, snare (instr 2) on half.
    const ch = makeChannel('Channel 1', 8, {
      0: { note: 24, instrument: 1 }, 2: { note: 24, instrument: 1 },
      4: { note: 24, instrument: 2 }, 6: { note: 24, instrument: 2 },
      1: { note: 24, instrument: 1 }, 3: { note: 24, instrument: 2 },
    });
    const lookup = new Map<number, InstrumentConfig>();
    lookup.set(1, makeInstrument({
      id: 1, name: 'Kick', synthType: 'Sampler',
      sample: { url: 'kick.wav', baseNote: 'C-4', detune: 0, loop: false, loopStart: 0, loopEnd: 0, reverse: false, playbackRate: 1 },
    }));
    lookup.set(2, makeInstrument({
      id: 2, name: 'Snare', synthType: 'Sampler',
      sample: { url: 'snare.wav', baseNote: 'C-4', detune: 0, loop: false, loopStart: 0, loopEnd: 0, reverse: false, playbackRate: 1 },
    }));
    const res = classifyChannelWithInstruments(ch, 0, lookup);
    expect(res.role).toBe('percussion');
    expect(res.subrole).toBe('mixed');
  });
});

// ── suggestChannelName table ───────────────────────────────────────────────

describe('suggestChannelName', () => {
  function mk(role: EnhancedChannelAnalysis['role'], subrole?: EnhancedChannelAnalysis['subrole']): EnhancedChannelAnalysis {
    return {
      channel: 0, role, subrole,
      noteCount: 0, avgOctave: 0, avgPitch: 0, density: 0,
      uniqueNotes: 0, pitchRange: 0, avgInterval: 0,
    };
  }
  it('maps percussion subroles', () => {
    expect(suggestChannelName(mk('percussion', 'kick'))).toBe('Kick');
    expect(suggestChannelName(mk('percussion', 'snare'))).toBe('Snare');
    expect(suggestChannelName(mk('percussion', 'hat'))).toBe('Hi-Hat');
    expect(suggestChannelName(mk('percussion', 'clap'))).toBe('Clap');
    expect(suggestChannelName(mk('percussion', 'perc'))).toBe('Drums');
    expect(suggestChannelName(mk('percussion', 'mixed'))).toBe('Drums');
    expect(suggestChannelName(mk('percussion'))).toBe('Drums');
  });
  it('distinguishes sub bass from regular bass', () => {
    expect(suggestChannelName(mk('bass', 'sub'))).toBe('Sub Bass');
    expect(suggestChannelName(mk('bass'))).toBe('Bass');
    expect(suggestChannelName(mk('bass', 'synth'))).toBe('Bass');
  });
  it('maps other roles', () => {
    expect(suggestChannelName(mk('lead'))).toBe('Lead');
    expect(suggestChannelName(mk('chord'))).toBe('Chords');
    expect(suggestChannelName(mk('arpeggio'))).toBe('Arp');
    expect(suggestChannelName(mk('pad'))).toBe('Pad');
  });
  it('returns null for empty channels (don\'t rename)', () => {
    expect(suggestChannelName(mk('empty'))).toBe(null);
  });
});

// ── autoNameChannels end-to-end ────────────────────────────────────────────

describe('autoNameChannels', () => {
  it('renames generic-named channels using instrument signals', () => {
    const drumCh = makeChannel('Channel 1', 16, {
      0: { note: 24, instrument: 1 }, 4: { note: 24, instrument: 1 },
      8: { note: 24, instrument: 1 }, 12: { note: 24, instrument: 1 },
    });
    const bassCh = makeChannel('Channel 2', 16, {
      0: { note: 13, instrument: 2 }, 4: { note: 15, instrument: 2 },
      8: { note: 13, instrument: 2 }, 12: { note: 15, instrument: 2 },
    });
    const pattern = makePattern([drumCh, bassCh]);
    const lookup = new Map<number, InstrumentConfig>();
    lookup.set(1, makeInstrument({
      id: 1, name: 'Kick 808', synthType: 'Sampler',
      sample: { url: 'kick.wav', baseNote: 'C-4', detune: 0, loop: false, loopStart: 0, loopEnd: 0, reverse: false, playbackRate: 1 },
    }));
    lookup.set(2, makeInstrument({ id: 2, name: 'Sub Bass' }));

    const renames = autoNameChannels([pattern], lookup);
    const byIndex = new Map(renames.map(r => [r.index, r.newName]));
    expect(byIndex.get(0)).toBe('Kick');
    expect(byIndex.get(1)).toBe('Bass');
  });

  it('skips user-renamed channels (non-generic names)', () => {
    const ch1 = makeChannel('My Thing', 16, { 0: { note: 24, instrument: 1 } });
    const ch2 = makeChannel('Channel 2', 16, { 0: { note: 13, instrument: 2 } });
    const pattern = makePattern([ch1, ch2]);
    const lookup = new Map<number, InstrumentConfig>();
    lookup.set(1, makeInstrument({ id: 1, name: 'Kick', synthType: 'TR808' }));
    lookup.set(2, makeInstrument({ id: 2, name: 'Bass' }));

    const renames = autoNameChannels([pattern], lookup);
    // ch1 stays "My Thing"
    expect(renames.find(r => r.index === 0)).toBeUndefined();
    // ch2 renamed
    expect(renames.find(r => r.index === 1)?.newName).toBe('Bass');
  });

  it('suffixes duplicates with " 1", " 2" in channel-index order', () => {
    const bass1 = makeChannel('Channel 1', 16, {
      0: { note: 13, instrument: 2 }, 4: { note: 15, instrument: 2 },
    });
    const bass2 = makeChannel('Channel 2', 16, {
      0: { note: 13, instrument: 2 }, 4: { note: 15, instrument: 2 },
    });
    const pattern = makePattern([bass1, bass2]);
    const lookup = new Map<number, InstrumentConfig>();
    lookup.set(2, makeInstrument({ id: 2, name: 'Bass Synth' }));

    const renames = autoNameChannels([pattern], lookup);
    expect(renames.length).toBe(2);
    expect(renames[0].newName).toBe('Bass 1');
    expect(renames[1].newName).toBe('Bass 2');
  });

  it('returns empty diff when no generic channels to rename', () => {
    const ch = makeChannel('My Custom Name', 16, { 0: { note: 13 } });
    const renames = autoNameChannels([makePattern([ch])], new Map());
    expect(renames).toEqual([]);
  });

  it('handles empty pattern list', () => {
    expect(autoNameChannels([], new Map())).toEqual([]);
  });

  it('uses richest pattern per channel for classification', () => {
    // Pattern 0 is empty; pattern 1 has the real content.
    // Without per-channel richest-pattern selection, the classifier would
    // see "empty" and leave the channel unlabeled.
    const emptyCh = makeChannel('Channel 1', 16, {});
    const richCh = makeChannel('Channel 1', 16, {
      0: { note: 24, instrument: 1 }, 4: { note: 24, instrument: 1 },
      8: { note: 24, instrument: 1 }, 12: { note: 24, instrument: 1 },
    });
    const p0 = makePattern([emptyCh]);
    const p1 = makePattern([richCh]);
    const lookup = new Map<number, InstrumentConfig>();
    lookup.set(1, makeInstrument({ id: 1, name: 'Kick', synthType: 'TR808' }));

    const renames = autoNameChannels([p0, p1], lookup);
    expect(renames.length).toBe(1);
    expect(renames[0].newName).toBe('Drums');
  });
});

// ── classifySongRoles ───────────────────────────────────────────────────────

/**
 * Regression tests for the 2026-04-21 Auto-Dub role-classification bug.
 *
 * Symptom (world-class-dub.mod): Auto-Dub ran with Tubby + 0.75 intensity
 * for 30 s and only fired `subHarmonic` + `reverseEcho` (both non-role-
 * targeted). `channelMute` / `echoThrow` / `snareCrack` never fired.
 *
 * Root cause: `AutoDub.getCurrentPatternBundle()` classified the pattern
 * at `transport.currentPatternIndex`, which for libopenmpt-driven MODs
 * stays at 0 during playback. Pattern 0 in this song has a single note
 * on one channel — the rest of the channels were note-empty in the
 * current pattern, so `classifyPattern` returned `empty` for them and
 * every role-targeted rule was skipped.
 *
 * Fix: `classifySongRoles` picks the richest pattern PER CHANNEL (same
 * logic `autoNameChannels` uses) and classifies once per song. Roles
 * become stable regardless of playback position.
 *
 * If you revert the AutoDub or ChannelNaming change, the first test here
 * will fail because an empty pattern 0 will win the lookup.
 */
describe('classifySongRoles (regression: song-wide role classification)', () => {
  it('picks roles from the richest pattern per channel, not pattern[0]', () => {
    // Mimics world-class-dub.mod: pattern 0 is nearly empty; the real
    // content lives in a later pattern.
    const emptyCh0 = makeChannel('', 16, {});   // pattern 0 ch 0: no notes
    const emptyCh1 = makeChannel('', 16, {});
    const sparseCh2 = makeChannel('', 16, { 0: { note: 39, instrument: 1 } }); // pattern 0 ch 2: 1 note
    const emptyCh3 = makeChannel('', 16, {});
    const p0 = makePattern([emptyCh0, emptyCh1, sparseCh2, emptyCh3]);

    // Pattern 1 has real content on every channel:
    //   ch 0: 4 bass-octave notes       → 'bass'
    //   ch 1: dense single pitch        → 'percussion' (via stats fallback)
    //   ch 2: spread pitches            → 'lead' / 'pad' (anything non-empty)
    //   ch 3: 4 notes, labeled "Kick"   → 'percussion'
    const bassCh = makeChannel('', 16, {
      0: { note: 13, instrument: 2 }, 4: { note: 13, instrument: 2 },
      8: { note: 14, instrument: 2 }, 12: { note: 13, instrument: 2 },
    });
    const hatCh = makeChannel('', 16, {
      0: { note: 50, instrument: 3 }, 2: { note: 50, instrument: 3 },
      4: { note: 50, instrument: 3 }, 6: { note: 50, instrument: 3 },
      8: { note: 50, instrument: 3 }, 10: { note: 50, instrument: 3 },
      12: { note: 50, instrument: 3 }, 14: { note: 50, instrument: 3 },
    });
    const melodyCh = makeChannel('', 16, {
      0: { note: 48, instrument: 4 }, 4: { note: 52, instrument: 4 },
      8: { note: 55, instrument: 4 }, 12: { note: 60, instrument: 4 },
    });
    const kickCh = makeChannel('Kick', 16, {
      0: { note: 24, instrument: 5 }, 4: { note: 24, instrument: 5 },
      8: { note: 24, instrument: 5 }, 12: { note: 24, instrument: 5 },
    });
    const p1 = makePattern([bassCh, hatCh, melodyCh, kickCh]);

    const lookup = new Map<number, InstrumentConfig>();
    lookup.set(2, makeInstrument({ id: 2, name: 'Bass synth' }));
    lookup.set(3, makeInstrument({ id: 3, name: 'Hat' }));
    lookup.set(4, makeInstrument({ id: 4, name: 'Lead melody' }));
    lookup.set(5, makeInstrument({ id: 5, name: 'Kick drum', synthType: 'TR808' }));

    const roles = classifySongRoles([p0, p1], lookup);
    expect(roles).toHaveLength(4);

    // The bug's signature: every channel would have been 'empty' because
    // pattern 0 was nearly empty. The fix makes at least ONE role non-empty.
    expect(roles.filter(r => r !== 'empty').length).toBeGreaterThanOrEqual(3);

    // And specifically: the kick channel — classifiable via statistical
    // percussion AND via instrument drumType — must end up 'percussion'.
    expect(roles[3]).toBe('percussion');
  });

  it('returns empty array for a song with no patterns', () => {
    expect(classifySongRoles([], new Map())).toEqual([]);
  });

  it('returns empty array when the schema pattern has no channels', () => {
    const empty = { id: 'p', name: '', length: 0, channels: [] } as Pattern;
    expect(classifySongRoles([empty], new Map())).toEqual([]);
  });

  it('is memoized by patterns array identity (same call twice returns same instance)', () => {
    const ch = makeChannel('', 16, {
      0: { note: 24, instrument: 1 }, 4: { note: 24, instrument: 1 },
      8: { note: 24, instrument: 1 }, 12: { note: 24, instrument: 1 },
    });
    const p = makePattern([ch]);
    const lookup = new Map<number, InstrumentConfig>();
    lookup.set(1, makeInstrument({ id: 1, name: 'Kick', synthType: 'TR808' }));
    const arr = [p];
    const a = classifySongRoles(arr, lookup);
    const b = classifySongRoles(arr, lookup);
    expect(a).toBe(b);
  });
});
