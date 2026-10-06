/**
 * Actionamics grid rules, one per replayer behaviour (act_play_tick), on small
 * hand-built modules. The whole-song proof against the running replayer is
 * src/engine/__tests__/actionamicsGridMatchesPlayer.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  decodeAstTrack, encodeAstTrack, astTrackRows, type ActionamicsModule, type AstTrack, type AstTrackEvent,
} from '../formats/ActionamicsModule';
import { walkActionamicsSong } from '../formats/actionamicsGrid';
import { astEffectType } from '../formats/actionamicsEffectGlyphs';

const note = (n: number, instrument: number | null = 1, delay: number | null = 0): AstTrackEvent =>
  ({ form: 'note', note: n, instrument, effect: null, arg: 0, delay });
const fx = (effect: number, arg: number): AstTrackEvent =>
  ({ form: 'effect', note: 0, instrument: null, effect, arg, delay: null });
const gap = (n: number): AstTrackEvent => ({ form: 'delay', note: 0, instrument: null, effect: null, arg: 0, delay: n });
const track = (...events: AstTrackEvent[]): AstTrack => ({ events, tail: [] });

/** A module with one song over `positions` (each four track numbers). */
function moduleOf(tracks: AstTrack[], positions: number[][], noteTranspose = 0): ActionamicsModule {
  return {
    tempo: 125, lengths: [], tracksOffset: 0, moduleInfoOffset: 0, totalLength: 0, image: new Uint8Array(0),
    positions: [0, 1, 2, 3].map((v) => positions.map((p) => ({ track: p[v], noteTranspose, instrumentTranspose: 0 }))),
    instruments: [{ sampleList: 0, arpeggioList: 0, frequencyList: 0, noteTranspose: 0 }],
    sampleLists: [[0, ...new Array(15).fill(0)]],
    arpeggioLists: [new Array(16).fill(0)],
    songs: [{ start: 0, end: positions.length - 1, loop: 0, speed: 6 }],
    samples: [{ name: 'a', length: 8, loopStart: 0, loopLength: 0, arpeggioList: 0, headerOffset: 0 }],
    samplePcm: [], tracks,
  };
}

const idle = track(gap(63));
const lengths = (m: ActionamicsModule): number[] => walkActionamicsSong(m).steps.map((s) => s.rows);

describe('Actionamics track codec', () => {
  it('a leading delay byte is an empty row and then the rows it counts', () => {
    // [0xFD]: ~0xFD = 2 -> this row is empty and so are the next 2: three rows (the old decoder made two)
    const t = decodeAstTrack(Uint8Array.from([0xfd]));
    expect(astTrackRows(t)).toHaveLength(3);
  });

  it('keeps every byte: a note with an instrument and any effect byte, a delay byte of 0, a truncated tail', () => {
    const bytes = Uint8Array.from([0x25, 0x03, 0x05, 0x09, 0xff, 0x30, 0x7c, 0x40, 0x25, 0xfe, 0x71]);
    const t = decodeAstTrack(bytes);
    expect(t.events).toHaveLength(4);
    expect(t.tail).toEqual([0x71]);
    expect(Array.from(encodeAstTrack(t))).toEqual(Array.from(bytes));
  });
});

describe('Actionamics walk', () => {
  it('a position is 64 rows until an effect says otherwise', () => {
    expect(lengths(moduleOf([idle], [[0, 0, 0, 0], [0, 0, 0, 0]]))).toEqual([64, 64]);
  });

  it('break: the position ends after the row that follows it, which is still played', () => {
    const brk = track(gap(2), fx(0x7b, 0), gap(60));
    expect(lengths(moduleOf([brk, idle], [[0, 1, 1, 1], [1, 1, 1, 1]]))).toEqual([5, 64]);
  });

  it('set rows takes effect for the position that holds it and stays for the later ones', () => {
    const rows8 = track(fx(0x75, 8), gap(62));
    expect(lengths(moduleOf([rows8, idle], [[0, 1, 1, 1], [1, 1, 1, 1]]))).toEqual([8, 8]);
  });

  it('a break on the last row makes the next position one row long', () => {
    const t = track(fx(0x75, 4), gap(1), fx(0x7b, 0));
    expect(lengths(moduleOf([t, idle], [[0, 1, 1, 1], [1, 1, 1, 1]]))).toEqual([4, 1]);
  });

  it('notes are the table period the replayer plays, named ProTracker style (period 856 = C-1)', () => {
    // table index 34 is period 856; the position transposes by +4, so the track holds index 30
    const t = track(note(30), gap(62));
    const walk = walkActionamicsSong(moduleOf([t, idle], [[0, 1, 1, 1]], 4));
    const cell = walk.steps[0].voices[0][0].cell;
    expect(cell.period).toBe(856);
    expect(cell.note).toBe(13);
  });

  it('effects keep their own id and argument', () => {
    const t = track(fx(0x7c, 0x30), gap(62));
    const cell = walkActionamicsSong(moduleOf([t, idle], [[0, 1, 1, 1]])).steps[0].voices[0][0].cell;
    expect([cell.effTyp, cell.eff]).toEqual([astEffectType(0x7c), 0x30]);
  });
});
