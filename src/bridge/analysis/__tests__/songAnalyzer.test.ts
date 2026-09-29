/**
 * The instrument-first song analyzer, on songs built for the purpose.
 *
 * Each test states one thing the analyzer must read from HOW an instrument
 * is played, independent of any sample: a drum is triggered at one pitch, a
 * bass line sits at the bottom of the song, the arpeggio effect is a chord,
 * and a channel's role changes with the section it is in.
 */
import { describe, it, expect } from 'vitest';
import { analyzeSong, roleFromName, namesInformative } from '../songAnalyzer';
import type { Pattern, TrackerCell } from '@typedefs/tracker';
import type { InstrumentConfig } from '@typedefs/instrument';

const EMPTY: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

/** A pattern from per-channel rows of [note, instrument, effTyp?, eff?]. */
function pattern(id: string, channels: Array<Array<[number, number, number?, number?] | null>>): Pattern {
  return {
    id, name: id, length: 16,
    channels: channels.map((rows, c) => ({
      id: `c${c}`, name: '', muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: 16 }, (_, r) => {
        const cell = rows[r];
        return cell ? { ...EMPTY, note: cell[0], instrument: cell[1], effTyp: cell[2] ?? 0, eff: cell[3] ?? 0 } : { ...EMPTY };
      }),
    })),
  } as Pattern;
}

const inst = (id: number, name = ''): InstrumentConfig => ({ id, name, synthType: 'Sampler' } as InstrumentConfig);

/** `n` onsets of instrument `id` at `pitch`, every `every` rows. */
const hits = (id: number, pitch: number | ((i: number) => number), every = 4, n = 16 / 4): Array<[number, number] | null> =>
  Array.from({ length: 16 }, (_, r) => (r % every === 0 && r / every < n ? [typeof pitch === 'function' ? pitch(r / every) : pitch, id] : null));

describe('songAnalyzer: playing evidence', () => {
  it('an instrument triggered at one pitch throughout is drums; a line at many pitches is not', () => {
    const p = pattern('p', [
      hits(1, 37, 4),                       // kick: C-3 on every beat
      hits(2, (i) => 25 + [0, 3, 5, 7][i], 4), // a line moving over four pitches
    ]);
    const a = analyzeSong([p, p, p], [0, 1, 2], new Map([[1, inst(1)], [2, inst(2)]]));
    expect(a.instruments.get(1)!.role).toBe('drums');
    expect(a.instruments.get(2)!.role).not.toBe('drums');
    expect(a.channelRoles).toEqual(['drums', 'bass']);
  });

  it('the lowest moving part of the song is the bass; a part two octaves up is not', () => {
    const p = pattern('p', [
      hits(1, (i) => 25 + [0, 3, 5, 7][i], 4),  // low line
      hits(2, (i) => 49 + [0, 2, 4, 5][i], 2, 8), // a line two octaves up, in steps
    ]);
    const a = analyzeSong([p, p], [0, 1], new Map([[1, inst(1)], [2, inst(2)]]));
    expect(a.instruments.get(1)!.role).toBe('bass');
    expect(a.instruments.get(2)!.role).toBe('lead');
  });

  it('the arpeggio effect (0xy) on a part makes it a chord', () => {
    const rows: Array<[number, number, number, number] | null> = Array.from({ length: 16 }, (_, r) => (r % 4 === 0 ? [37 + (r / 4) * 2, 1, 0, 0x47] : null));
    const p = pattern('p', [rows, hits(2, 25, 4)]);
    const a = analyzeSong([p, p], [0, 1], new Map([[1, inst(1)], [2, inst(2)]]));
    expect(a.instruments.get(1)!.role).toBe('harmony');
    expect(a.instruments.get(1)!.harmonyKind).toBe('chord');
  });

  it('unused patterns do not count, and a pattern played twice counts twice', () => {
    const drums = pattern('d', [hits(1, 37, 4), []]);
    const unused = pattern('u', [hits(2, (i) => 60 + i * 2, 2, 8), []]);
    const a = analyzeSong([drums, unused], [0, 0], new Map([[1, inst(1)], [2, inst(2)]]));
    expect([...a.instruments.keys()]).toEqual([1]);
    expect(a.timeline[0]).toEqual([{ channel: 0, fromOrder: 0, toOrder: 1, role: 'drums', instruments: [1] }]);
  });
});

describe('songAnalyzer: channel timeline', () => {
  it('a channel that plays bass for a stretch and then the lead has two sections', () => {
    const bassPat = pattern('b', [hits(1, (i) => 25 + [0, 3, 5, 7][i], 4)]);
    const leadPat = pattern('l', [hits(2, (i) => 49 + [0, 2, 4, 5, 7, 9, 11, 12][i], 2, 8)]);
    const a = analyzeSong([bassPat, leadPat], [0, 0, 0, 1, 1, 1], new Map([[1, inst(1)], [2, inst(2)]]));
    expect(a.timeline[0].map((s) => [s.fromOrder, s.toOrder, s.role])).toEqual([[0, 2, 'bass'], [3, 5, 'lead']]);
    expect(a.channelRoles[0]).toBe('bass');
  });

  it('a one-position fill between equal neighbours is absorbed', () => {
    const bassPat = pattern('b', [hits(1, (i) => 25 + [0, 3, 5, 7][i], 4)]);
    const fill = pattern('f', [hits(3, 37, 4)]);
    const a = analyzeSong([bassPat, fill], [0, 0, 1, 0, 0], new Map([[1, inst(1)], [3, inst(3)]]));
    expect(a.timeline[0].map((s) => s.role)).toEqual(['bass']);
  });

  it('a channel sharing a bass line and a snare reports both', () => {
    // The bass on every beat, the snare on beats 2 and 4 (rows 4 and 12).
    const p = pattern('p', [Array.from({ length: 16 }, (_, r): [number, number] | null =>
      r % 4 === 0 ? [25 + [0, 3, 5, 7][r / 4], 1] : r % 8 === 6 ? [37, 2] : null)]);
    const a = analyzeSong([p, p], [0, 1], new Map([[1, inst(1)], [2, inst(2)]]));
    expect(a.timeline[0][0].role).toBe('bass');
    expect(a.timeline[0][0].also).toBe('drums');
  });
});

describe('songAnalyzer: one waveform, several parts', () => {
  it('a chip song playing bass and lead with the same instrument gets both', () => {
    const p = pattern('p', [
      hits(1, (i) => 25 + [0, 3, 5, 7][i], 4),
      hits(1, (i) => 49 + [0, 2, 4, 5, 7, 9, 11, 12][i], 2, 8),
    ]);
    const a = analyzeSong([p, p], [0, 1], new Map([[1, inst(1)]]));
    expect(a.channelRoles).toEqual(['bass', 'lead']);
  });
});

describe('songAnalyzer: names', () => {
  it('reads smushed tracker names', () => {
    expect(roleFromName('jstbass5')?.role).toBe('bass');
    expect(roleFromName('WAHBASS1.WAV')?.role).toBe('bass');
    expect(roleFromName('NEW:DRUM41.SPL')?.role).toBe('drums');
    expect(roleFromName('SPL:OPENHAT.SP')).toMatchObject({ role: 'drums', drumPart: 'hat' });
    expect(roleFromName('jstbellchord1')?.role).toBe('harmony');
    expect(roleFromName('SuperHyperBass')?.role).toBe('bass');
    expect(roleFromName('greetings to everyone')).toBeNull();
  });

  it('trusts a song\'s names only when they look like instrument names', () => {
    const used = new Set([1, 2, 3]);
    expect(namesInformative([inst(1, 'jstbass5'), inst(2, 'jstsnare1'), inst(3, 'jstpiano3')], used)).toBe(true);
    expect(namesInformative([inst(1, 'skope'), inst(2, 'professor aggressor'), inst(3, 'gives yuh dis')], used)).toBe(false);
    expect(namesInformative([inst(1, 'Sample 1'), inst(2, 'Sample 2'), inst(3, 'Sample 3')], used)).toBe(false);
  });
});
