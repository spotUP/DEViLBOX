/**
 * Scratch source selection (owner scratch plan sections 12, 13, 84-88; ledger SCR-P5.2-P5.7)
 * on the deterministic Auto DJ corpus: the section 13 examples and the four section 88 contexts.
 */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis, type CorpusId } from '../../autodj/testing/corpus';
import { buildScratchContext } from '../scratchContext';
import { fixturePerf } from './fixtures/analysisFixture';
import { selectScratchSource, scoreSource, sourceCandidates, sourceContext, type SourceRequest, type TrackerSampleInfo } from '../ScratchSourceSelector';
import { extractedAnchors, trackerScratchMaterial } from '../scratchMaterial';
import { timeAtBeat, barStartBeat } from '../../autodj/beatGrid';
import type { DJTrackAnalysis, DJPerformanceContext } from '../../autodj/types';
import type { ScratchDJStyle, ScratchGestureId, ScratchRole } from '../scratchTypes';

const barTime = (a: DJTrackAnalysis, bar: number) => timeAtBeat(a.beatGrid, barStartBeat(a.downbeats, bar));

function request(id: CorpusId | DJTrackAnalysis, bar: number, o: { style?: ScratchDJStyle; roles?: ScratchRole[]; gestures?: ScratchGestureId[]; perf?: Partial<DJPerformanceContext>; energy?: number; genre?: SourceRequest['genre']; trackerSamples?: TrackerSampleInfo[]; recent?: string[] } = {}): SourceRequest {
  const track = typeof id === 'string' ? corpusAnalysis(id) : id;
  const ctx = buildScratchContext({ perf: fixturePerf(track, barTime(track, bar) + 0.01, o.perf), style: o.style ?? 'boomBap', scratchPermission: 1 })!;
  return {
    ctx: o.energy !== undefined ? { ...ctx, energy: o.energy } : ctx, track, deck: 'A', roles: o.roles ?? ['THEME'],
    gestures: o.gestures ?? ['baby', 'chirp', 'forwardStab'], bar, genre: o.genre, trackerSamples: o.trackerSamples, recent: o.recent,
  };
}
const sectionBar = (id: CorpusId, kind: string) => corpusAnalysis(id).sections.find((s) => s.kind === kind)!.startBar + 2;

describe('source selection (SCR-P5.2)', () => {
  it('a breakdown prefers a voice record (AH / YEAH / FRESH)', () => {
    const d = selectScratchSource(request('breakdowns', sectionBar('breakdowns', 'breakdown')))!;
    expect(d.context).toBe('breakdown');
    expect(d.candidate.origin).toBe('crate');
    expect(['AH_VOWEL', 'YEAH_RESPONSE', 'FRESH']).toContain(d.candidate.record!.category);
  });

  it('a drum break prefers a count or a drum hit', () => {
    const d = selectScratchSource(request('uncertainKey', 4, { gestures: ['forwardStab', 'transformer8'], roles: ['ACCENT'] }))!;
    expect(d.context).toBe('drumBreak');
    expect(['count', 'snare', 'kick', 'drums']).toContain(d.candidate.material);
  });

  it('a high-energy drop prefers a stab / chirp / transformer source', () => {
    const d = selectScratchSource(request('drops', sectionBar('drops', 'drop'), { style: 'electro', energy: 0.9, gestures: ['forwardStab', 'chirp', 'transformer8'], roles: ['ACCENT'] }))!;
    expect(d.context).toBe('drop');
    const g = d.candidate.gestures;
    expect(!g || (['forwardStab', 'chirp', 'transformer8'] as const).every((x) => g.includes(x))).toBe(true);
  });

  it('a low-energy transition prefers a baby / drag source', () => {
    const d = selectScratchSource(request('longOutro', 40, { energy: 0.3, gestures: ['baby', 'drag'], perf: { transition: { style: 'longBlend', outgoingDeck: 'A', incomingDeck: 'B' } as never } }))!;
    expect(d.context).toBe('lowTransition');
    const g = d.candidate.gestures;
    expect(!g || (['baby', 'drag'] as const).every((x) => g.includes(x))).toBe(true);
  });

  it('the source used last is penalised below an alternative', () => {
    const req = request('breakdowns', sectionBar('breakdowns', 'breakdown'));
    const first = selectScratchSource(req)!;
    const again = selectScratchSource({ ...req, recent: [first.candidate.key] })!;
    expect(again.candidate.key).not.toBe(first.candidate.key);
    expect(scoreSource(first.candidate, { ...req, recent: [first.candidate.key] }, first.context).score).toBeLessThan(first.score);
  });
});

describe('deck, extracted and tracker material (SCR-P5.3-P5.5)', () => {
  it('a house four-on-the-floor transition scratches the live deck; a vocal bar does not', () => {
    const house = selectScratchSource(request('steady', 10, { style: 'electro', genre: 'house', perf: { transition: { style: 'longBlend', outgoingDeck: 'A', incomingDeck: 'B' } as never } }))!;
    expect(house.candidate.source.type).toBe('DECK');
    expect(house.candidate.origin).toBe('deck');
    const vocalBar = sectionBar('vocals', 'vocal-heavy');
    const vocal = request('vocals', 10, { perf: { transition: { style: 'longBlend', outgoingDeck: 'A', incomingDeck: 'B' } as never } });
    expect(sourceCandidates(vocal).some((c) => c.origin === 'deck'), `bar ${vocalBar}`).toBe(false);
  });

  it('a vocal onset at the start of the vocal section yields a vocalOnset anchor there (+-20 ms); a flat timeline yields none', () => {
    const a = corpusAnalysis('vocals');
    const onsetBar = 8;
    const anchors = extractedAnchors(a, onsetBar).filter((x) => x.kind === 'vocalOnset');
    expect(anchors.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(anchors[0]!.position - barTime(a, onsetBar))).toBeLessThanOrEqual(0.02);
    const flat = { ...a, vocalActivity: { ...a.vocalActivity, values: a.vocalActivity.values.map(() => 0.5) }, arrangementEvents: [] };
    expect(extractedAnchors(flat, onsetBar).filter((x) => x.kind === 'vocalOnset')).toEqual([]);
  });

  it('a tracker channel is what it does now: percussion at bar 8, bass at bar 20 (rejected under a busy master bass)', () => {
    const a = corpusAnalysis('steady');
    const barT = (b: number) => barTime(a, b);
    const seg = (start: number, end: number, fam: 'drums' | 'bass') => ({ channel: 4, start: barT(start), end: barT(end), instrumentFamily: fam, musicalFunction: fam === 'drums' ? 'rhythm' as const : 'bass' as const, importance: 0.8, density: 0.5, confidence: 0.9 });
    const t: DJTrackAnalysis = { ...a, tracker: { channelSegments: [seg(0, 16, 'drums'), seg(16, 32, 'bass')], events: [], confidence: 0.9 } as never };
    expect(trackerScratchMaterial(t, 8, 'A')[0]!.kind).toBe('percussion');
    expect(trackerScratchMaterial(t, 20, 'A')[0]!.kind).toBe('bass');
    const req = request(t, 20);
    const bassSource = sourceCandidates({ ...req, ctx: { ...req.ctx, bassActivity: 0.8 } }).find((c) => c.origin === 'trackerChannel')!;
    expect(bassSource.material).toBe('bass');
    expect(scoreSource(bassSource, { ...req, ctx: { ...req.ctx, bassActivity: 0.8 } }, 'groove').terms.bassConflict).toBe(1);
    const d = selectScratchSource({ ...req, ctx: { ...req.ctx, bassActivity: 0.8 } })!;
    expect(d.candidate.key).not.toBe(bassSource.key);
  });
});

describe('three-source strategy (SCR-P5.7, section 88)', () => {
  it('hip-hop breakdown -> crate vocal; tracker demo -> tracker sample; house transition -> live deck; vocal call/response -> song vocal hit', () => {
    const breakdown = selectScratchSource(request('breakdowns', sectionBar('breakdowns', 'breakdown'), { style: 'boomBap', genre: 'hipHop' }))!;
    expect(breakdown.candidate.source.type).toBe('CRATE');

    const samples: TrackerSampleInfo[] = [{ deck: 'A', sampleId: '2', name: 'Snare', kind: 'snare' }, { deck: 'A', sampleId: '1', name: 'Kick', kind: 'kick' }];
    const demo = selectScratchSource(request('tracker', 10, { trackerSamples: samples, roles: ['ACCENT'] }))!;
    expect(demo.context).toBe('trackerDemo');
    expect(demo.candidate.source.type).toBe('TRACKER_SAMPLE');

    const house = selectScratchSource(request('steady', 10, { style: 'electro', genre: 'house', perf: { transition: { style: 'longBlend', outgoingDeck: 'A', incomingDeck: 'B' } as never } }))!;
    expect(house.candidate.source.type).toBe('DECK');

    const call = selectScratchSource(request('vocals', 9, { roles: ['ANSWER'] }))!;
    expect(call.context).toBe('vocalCall');
    expect(call.candidate.origin).toBe('extracted');
    expect(call.candidate.material).toBe('vocalHit');
  });

  it('every decision carries its score terms and reasons', () => {
    const d = selectScratchSource(request('breakdowns', sectionBar('breakdowns', 'breakdown')))!;
    expect(Object.keys(d.terms)).toHaveLength(12);
    expect(d.reasons[0]).toMatch(/^breakdown: crate/);
    expect(sourceContext(request('breakdowns', sectionBar('breakdowns', 'breakdown')))).toBe('breakdown');
  });
});
