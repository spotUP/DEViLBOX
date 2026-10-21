import { describe, expect, it } from 'vitest';
import { actOneSchedule, fallSeconds, stageAtTime, BUILD_SECONDS, MAX_WAIT_SECONDS } from '../pacing';
import { decideToCells } from '../decideToCells';
import { initialFactoryState, reduceFactory, SLOT_OF_VOICE } from '../factoryModel';
import { fitCanvas } from '../draw';
import { popIn, REDUCED_FADE_SECONDS, Spring, SETTLE, stampBounce } from '../motion';
import { peaks } from '@/engine/uprough/r2Peaks';
import type { R2Event } from '@/engine/uprough/r2Events';
import { songFileToBarEvents } from '../../barEvents';
import { noteFromText, ROWS_PER_BAR, type SongFileDoc } from '../../songFile';
import records from './fixtures/decideRecords.json';
import trapSong from '../../__tests__/fixtures/e6.uprough-song.json';
import listSong from '../../__tests__/fixtures/ebass_sampled.uprough-song.json';

const tone = (n: number, decay: number): Float64Array => Float64Array.from({ length: n }, (_, i) => Math.sin(i / 5) * Math.exp(-i / decay));

describe('act 1 pacing', () => {
  it('a voice that decays quickly hands over before the maximum wait', () => {
    const fast = peaks(tone(22050, 400));
    expect(fallSeconds(fast, 22050)).toBeLessThan(MAX_WAIT_SECONDS);
  });

  it('appending a voice never moves an earlier one, and stages come in order', () => {
    const v = { voice: 'kick', stageCount: 3, bank: peaks(tone(8000, 2000)) };
    const w = { voice: 'snare', stageCount: 2, bank: peaks(tone(8000, 1000)) };
    const one = actOneSchedule([v], 22050);
    const two = actOneSchedule([v, w], 22050);
    expect(two[0]).toEqual(one[0]);
    expect(two[1]!.start).toBeGreaterThan(two[0]!.start);
    const line = two[0]!;
    expect(line.stageAt).toHaveLength(3);
    expect(line.stampAt).toBeGreaterThan(line.stageAt[2]!);
    expect(line.chipAt).toBeGreaterThan(line.stampAt);
    expect(line.stageAt[2]! - line.stageAt[0]!).toBeLessThan(BUILD_SECONDS);
  });

  it('stageAtTime reports the stage showing and the progress to the next', () => {
    const line = actOneSchedule([{ voice: 'kick', stageCount: 3, bank: peaks(tone(8000, 2000)) }], 22050)[0]!;
    expect(stageAtTime(line, line.start).index).toBe(-1);
    const mid = (line.stageAt[0]! + line.stageAt[1]!) / 2;
    const at = stageAtTime(line, mid);
    expect(at.index).toBe(0);
    expect(at.frac).toBeCloseTo(0.5, 5);
    expect(stageAtTime(line, 99)).toEqual({ index: 2, frac: 1 });
  });
});

describe('decide events to cells', () => {
  it('a kick hit lands on its home lane with the host volume rounding', () => {
    const cells = decideToCells('drums', 1, [['kick', 0, 1, 'main']]);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ lane: 'kick', row: 16, volume: 0x10 + 64 });
  });

  it('a second hit on a taken row overflows to perc2', () => {
    const taken = new Set<string>();
    const cells = decideToCells('drums', 0, [['rim', 4, 0.5, 'main'], ['tom', 4, 0.5, 'main']], taken);
    expect(cells.map((c) => c.lane)).toEqual(['perc1', 'perc2']);
  });

  it('bass decide cells equal the song file\'s bass cells', () => {
    // Each record is the host's decide for the same song as the song file fixture (decideRecords.json `_source`).
    const cases = [[records.bass_trap808, trapSong], [records.bass_list, listSong]] as const;
    for (const [r, song] of cases) {
      const doc = structuredClone(song) as unknown as SongFileDoc;
      const e = r as unknown as Extract<R2Event, { type: 'decide' }>;
      const bev = songFileToBarEvents(structuredClone(doc)).sections[e.section]!.bass[e.bar]!.bev;
      expect(Array.isArray(bev) ? bev : [bev]).toEqual(e.cells);
      const lane = (doc.sections[e.section]!.lanes as Record<string, ([string, ...unknown[]] | null)[]>).bass!;
      const fileCells: [number, number][] = [];
      for (let row = e.bar * ROWS_PER_BAR; row < (e.bar + 1) * ROWS_PER_BAR; row++) {
        const cell = lane[row];
        if (cell) fileCells.push([row, noteFromText(cell[0])]);
      }
      expect(fileCells.length).toBeGreaterThan(0);
      expect(decideToCells('bass', e.bar, e.cells).map((c) => [c.row, c.note])).toEqual(fileCells);
    }
  });

  it('melody notes spread overlapping notes over the melody lanes', () => {
    const mel = decideToCells('melody', 0, [[60, 0, 8], [64, 0, 8]]);
    expect(mel.map((c) => c.lane)).toEqual(['melody1', 'melody2']);
  });
});

describe('factory model', () => {
  const start: R2Event = { seq: 0, type: 'start', mode: 'generate', rate: 22050, style: 'trap', seed: 1, sections: [{ name: 'verse', bars: 2, layers: ['drums'] }] };

  it('has 11 slots and every drum voice has a home', () => {
    expect(initialFactoryState().slots).toHaveLength(11);
    expect(Object.keys(SLOT_OF_VOICE)).toContain('clap');
  });

  it('events fold into slots, attachments and sections; each event is counted', () => {
    const p = peaks(tone(4000, 1000));
    let s = reduceFactory(initialFactoryState(), start);
    s = reduceFactory(s, { seq: 1, type: 'stage', voice: 'snare', stage: 'noise', index: 0, peaks: p });
    s = reduceFactory(s, { seq: 2, type: 'bank', voice: 'snare', peaks: p, len: 4000 });
    s = reduceFactory(s, { seq: 3, type: 'attach', voice: 'snare_accent', parent: 'snare', peaks: p });
    s = reduceFactory(s, { seq: 4, type: 'decide', section: 0, bar: 1, lane: 'drums', cells: [] }, 5);
    const snare = s.slots.find((x) => x.id === 'snare')!;
    expect(snare.alive && snare.voices[0]!.bank && snare.attachments).toBeTruthy();
    expect(s.sections[0]!.decided.drums).toBe(2);
    expect(s.cellsWritten).toBe(5);
    expect(s.eventCount).toBe(5);
  });

  it('a lane event brings bass and melody to life with the first bar', () => {
    const p = peaks(tone(2000, 800));
    let s = reduceFactory(initialFactoryState(), start);
    s = reduceFactory(s, { seq: 1, type: 'lane', section: 0, lane: 'bass', peaks: p, born: p });
    expect(s.slots.find((x) => x.id === 'bass')!.born).toBeDefined();
  });
});

describe('motion', () => {
  it('a spring overshoots then settles; a reduced one fades without overshoot', () => {
    const pop = new Spring(0);
    pop.to(1);
    let max = 0;
    for (let i = 0; i < 240; i++) max = Math.max(max, pop.step(1 / 60));
    expect(max).toBeGreaterThan(1);
    expect(pop.value).toBeCloseTo(1, 2);
    const calm = new Spring(0, SETTLE, true);
    calm.to(1);
    calm.step(REDUCED_FADE_SECONDS / 2);
    expect(calm.value).toBeCloseTo(0.5, 5);
    calm.step(1);
    expect(calm.value).toBe(1);
  });

  it('popIn and stampBounce hold still under reduced motion', () => {
    expect(popIn(0.1, true).scale).toBe(1);
    expect(popIn(0.1, false).scale).not.toBe(1);
    expect(stampBounce(0.05, true)).toBe(0);
    expect(stampBounce(0.05, false)).toBeGreaterThan(0);
  });
});

describe('fitCanvas', () => {
  it('sizes the backing store to the displayed width times the pixel ratio, so a stretched panel keeps round gears', () => {
    // A 240 px backing store shown 878 px wide stretched every drawing 3.7x sideways (smeared gears, owner screenshot).
    const transforms: number[][] = [];
    const cv = { clientWidth: 878, width: 240, height: 40 } as unknown as HTMLCanvasElement;
    const ctx = { setTransform: (...m: number[]) => { transforms.push(m); } } as unknown as CanvasRenderingContext2D;
    expect(fitCanvas(cv, ctx, 40, 240, 2)).toEqual({ w: 878, h: 40 });
    expect(cv.width).toBe(1756);
    expect(cv.height).toBe(80);
    expect(transforms).toEqual([[2, 0, 0, 2, 0, 0]]);
  });

  it('falls back to the given width before layout', () => {
    const cv = { clientWidth: 0, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const ctx = { setTransform: () => undefined } as unknown as CanvasRenderingContext2D;
    expect(fitCanvas(cv, ctx, 56, 240, 1)).toEqual({ w: 240, h: 56 });
    expect(cv.width).toBe(240);
  });
});
