/**
 * The Auto Scratch routine never cuts faster than a hand (owner 2026-10-14, SCRATCH-FADER-TRAVEL fail #2: the
 * Deck 3 scratch fader "still moves multiple times faster than a human could move it"). The demo writes every
 * gesture in 16th steps at hip-hop tempo (three_deck.py:629 bpm 92; scratch.py:192 "scales to tempo"); over a
 * 174 BPM set the live routine rendered those 16ths at 174, so a transformer's four cuts in two steps ran 23 cuts/s
 * (a hand: ~10-15 Hz). Fix: the routine plays half-time against a fast set (`scratchTempoFold`), its 16ths two of
 * the set's, still on the set's grid.
 *
 * Through the controller's entry (`DJScratchDJ.tick`, Render three_deck) over the corpus' 174 BPM track: every
 * stroke it schedules is rendered as `fx_scratch_*` renders it (`ScratchVoicePool.renderStrokeViz`, the clock's
 * tempo and the stroke's spec) and its fader gain's cuts are counted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DJScratchDJ } from '../scratch/DJScratchDJ';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import { scratchStyleFor, type ScratchProfileId } from '../scratch/scratchStyles';
import { ScratchVoicePool } from '../scratch/scratchVoicePool';
import { getGesture } from '../scratch/scratchGestureCatalog';
import { getScratchRecord } from '../scratch/scratchCatalogue';
import { DEMO_RATE } from '../scratch/scratchRender';
import { scratchTempoFold, SCRATCH_HOME_BPM } from '../scratch/scratchTempo';
import type { DJPerformanceContext } from '../autodj/types';
import type { ScratchEvent } from '../scratch/scratchTypes';

/** The fastest a turntablist's fader hand cuts (transformer / crab family, ~10-15 Hz): the cap for one gesture. */
const HAND_MAX_CUTS_PER_SEC = 15;

async function routineCutRates(id: 'fastBpm' | 'steady', render: 'three_deck' | 'section' = 'three_deck', profile?: ScratchProfileId) {
  const track = corpusAnalysis(id);
  const fired: ScratchEvent[] = [];
  const ctrl = new DJScratchDJ({
    seed: 11,
    executorFor: () => ({ schedule: (e) => { fired.push(e); }, cancel: () => {}, active: 0, contextTimeAtBeat: (b) => timeAtBeat(track.beatGrid, b), clockBpm: () => track.bpm }),
  });
  const choice = scratchStyleFor('auto', 'hipHop');
  for (let b = 0; b < track.downbeats.bars.length - 1; b++) {
    const t = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b)) + 0.1;
    ctrl.tick({
      perf: { currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, setPhase: 'CRUISING', setEnergy: 0.6, targetEnergy: 0.7 } as unknown as DJPerformanceContext,
      deck: 'A', mode: 'PERFORMER', style: choice.style, genre: choice.modifiers, genreHint: choice.genre, profile: profile ?? choice.profile, scratchPermission: 4, render,
    });
  }
  const bytes = async (rec: { file: string }) => { const b = readFileSync(join(process.cwd(), 'public', 'data', 'samples', 'packs', 'scratch-originals', rec.file)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer; };
  const pool = new ScratchVoicePool({ currentTime: 0, sampleRate: DEMO_RATE } as unknown as BaseAudioContext, {} as AudioNode, { bytes });
  const strokes = fired.filter((e) => e.render && !e.gesture.startsWith('needle'));
  const rates: Array<{ gesture: string; cutsPerSec: number; home: number }> = [];
  const cutRate = (fade: ArrayLike<number>): { cuts: number; perSec: number } => {
    let cuts = 0;
    for (let i = 1; i < fade.length; i++) if (fade[i]! > 0.5 && fade[i - 1]! <= 0.5) cuts++;
    if (fade[0]! > 0.5) cuts++;
    return { cuts, perSec: cuts / (fade.length / DEMO_RATE) };
  };
  for (const e of strokes) {
    const record = e.source.type === 'CRATE' ? getScratchRecord(e.source.recordId) ?? null : null;
    const r = await pool.renderStrokeViz(getGesture(e.gesture), record, e.render!, track.bpm, e.velocity, null);
    if (!r?.viz) continue;
    const c = cutRate(r.viz.fade);
    if (c.cuts < 2) continue;
    // the same stroke as the demo plays it at its own tempo (92 BPM, unfolded): a gesture the demo itself writes
    // faster than a hand (hydroplane's friction, 24.5 cuts/s) is held to the demo's rate, not past it
    const home = await pool.renderStrokeViz(getGesture(e.gesture), record, { ...e.render!, tempoFold: 1 }, SCRATCH_HOME_BPM, e.velocity, null);
    rates.push({ gesture: e.gesture, cutsPerSec: c.perSec, home: home?.viz ? cutRate(home.viz.fade).perSec : 0 });
  }
  return { strokes, rates, bpm: track.bpm };
}

describe('the Auto Scratch routine never cuts faster than a hand (SCRATCH-FADER-TRAVEL)', () => {
  // measured before the fold (fastest gesture, cuts/s): 174 BPM crab 29.0, transformer 23.2; 126 BPM crab 21.0, transformer 16.8
  for (const id of ['fastBpm', 'steady'] as const) {
    it(`over a ${id === 'fastBpm' ? 174 : 126} BPM set the three-deck routine plays half-time on the set grid and no gesture cuts faster than ${HAND_MAX_CUTS_PER_SEC} per second`, async () => {
      const { strokes, rates, bpm } = await routineCutRates(id);
      expect(scratchTempoFold(bpm)).toBe(2);
      expect(strokes.length).toBeGreaterThan(20);
      expect(strokes.every((e) => e.render!.tempoFold === 2)).toBe(true);
      // on the set's 8th grid (a routine 16th = two of the set's)
      expect(strokes.every((e) => Math.abs(e.executeAtBeat * 2 - Math.round(e.executeAtBeat * 2)) < 1e-6)).toBe(true);
      expect(rates.length).toBeGreaterThan(5);
      const worst = rates.reduce((a, b) => (b.cutsPerSec > a.cutsPerSec ? b : a));
      expect(worst.cutsPerSec, `${worst.gesture} ${worst.cutsPerSec.toFixed(1)} cuts/s`).toBeLessThanOrEqual(HAND_MAX_CUTS_PER_SEC);
    }, 300_000);
  }

  // SCRATCH-FOLD-OVERLAY: the Section Overlay render (the demo's render_scratch_section, section by section) was not
  // folded and still cut at the set's tempo over a fast set
  for (const id of ['fastBpm', 'steady'] as const) {
    it(`over a ${id === 'fastBpm' ? 174 : 126} BPM set the Section Overlay plays half-time on the set grid and no gesture cuts faster than ${HAND_MAX_CUTS_PER_SEC} per second`, async () => {
      // the electro profile: its overlay plays the fastest fader gestures (transformer, crab, hydroplane)
      const { strokes, rates, bpm } = await routineCutRates(id, 'section', 'electro');
      expect(scratchTempoFold(bpm)).toBe(2);
      expect(strokes.length).toBeGreaterThanOrEqual(10);
      expect(strokes.every((e) => e.render!.tempoFold === 2)).toBe(true);
      expect(strokes.every((e) => Math.abs(e.executeAtBeat * 2 - Math.round(e.executeAtBeat * 2)) < 1e-6)).toBe(true);
      expect(rates.length).toBeGreaterThan(5);
      expect(rates.some((r) => r.gesture.startsWith('transformer') || r.gesture === 'crab')).toBe(true);
      // measured before the fold (fastest per gesture, cuts/s): 174 BPM hydroplane 46.4, crab 29.0, transformer 23.2; 126 BPM hydroplane 33.6, transformer 16.8
      for (const r of rates) expect(r.cutsPerSec, `${r.gesture} ${r.cutsPerSec.toFixed(1)} cuts/s`).toBeLessThanOrEqual(Math.max(HAND_MAX_CUTS_PER_SEC, r.home + 0.5));
    }, 300_000);
  }

  it('a hip-hop set plays the routine as written; a very slow one double-time', () => {
    expect([60, 92, 100, 115].map(scratchTempoFold)).toEqual([1, 1, 1, 1]);
    expect([116, 126, 176, 230].map(scratchTempoFold)).toEqual([2, 2, 2, 2]);
    expect(scratchTempoFold(50)).toBe(0.5);
  });
});
