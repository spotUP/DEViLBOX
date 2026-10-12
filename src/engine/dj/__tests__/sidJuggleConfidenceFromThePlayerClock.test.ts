/**
 * Steady four-on-the-floor SIDs juggle: their beat grid comes from the player
 * clock, and sync is the grids' property, not "0 unless both decks play".
 *
 * Owner 2026-10-12 ("is it not capable of juggling sids?"): the juggle refused
 * Venus_Falling_SCC_Extended and La_Mer - "low confidence (beat 0.50 < 0.6,
 * sync 0.00 < 0.6, phrase 0.30 < 0.5)". A SID had only the audio detector's
 * grid: essentia's beats drift off its tempo (Venus: 124.18 BPM, its beats
 * lock to that period at 0.09), so the beat strengths smeared, the bar search
 * found no accent (meter 0.3) and bars came out at grid x 0.65. Sync was read
 * from the live decks, 0 whenever one of them did not play.
 *
 * Now a SID beat is a whole number of player calls (sidPlayerBeatGrid; both
 * tunes: 24 PAL frames = 125.31 BPM, the beats lock at 0.98 / 0.89), the bar
 * search runs on those exact beats, and sync is the grids' confidence. Beat and
 * sync no longer refuse. Phrase (0.30) still did: La Mer's boundaries were bars
 * 40 and 88 plus the tune's end (91, silence to the end) and the bar the 180 s
 * render cap cuts off (93). Owner decision 2026-10-13 (SID-FOLLOWUP-2 b): the
 * track end and the render cut-off are no section boundaries - La Mer's 40 and
 * 88 sit on an 8-bar grid (phrase 8, confidence 1.00) and it juggles. Venus
 * keeps refusing on its own arrangement: bars 15 and 70 sit on no 4 / 8 / 16-bar
 * grid (phrase 0.30), accepted by the owner.
 *
 * Inputs: the real renders' analysis (fixtures *.analysis.json: WebSID render +
 * essentia RhythmExtractor2013 as the analysis worker runs it + the extended
 * analysis); the player call rate the render measures (asserted by
 * sidRenderIsOneEmulationPass). Product path: buildDJTrackAnalysis (what every
 * deck load builds) -> the transition planner's pairConfidence and the juggle
 * controller's live context -> confidencePolicy.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildDJTrackAnalysis } from '../autodj/trackAnalysis';
import { pairConfidence } from '../autodj/transitionPlanner';
import { confidencePolicy, lowConfidenceReason } from '../autodj/juggle/jugglePlanner';
import { DJJuggleController } from '../autodj/juggle/juggleController';
import { trackBeatConfidence } from '../autodj/beatGrid';
import type { PipelineResult } from '../DJPipeline';

/** PAL frame rate: what WebSID measures for both tunes' player. */
const PAL_CALL_HZ = 985249 / 19656;

function analysisOf(file: string, playerCallHz?: number) {
  const a = JSON.parse(readFileSync(join(process.cwd(), 'src/lib/sid/__tests__/fixtures', `${file}.analysis.json`), 'utf8'));
  const analysis = {
    bpm: a.bpm, bpmConfidence: Math.min(1, a.rawConfidence / 5.32), beats: a.beats, downbeats: [], timeSignature: 4,
    musicalKey: 'Unknown', keyConfidence: 0, frequencyPeaks: [], rmsDb: -14, peakDb: -1,
    genre: { primary: 'Electronic', subgenre: 'House', confidence: 0.5, mood: 'Energetic', energy: 0.7, danceability: 0.8 },
    extended: a.extended, playerCallHz,
  } as NonNullable<PipelineResult['analysis']>;
  return buildDJTrackAnalysis({ id: file, durationSec: a.durationSec, analysis, extended: a.extended, song: null });
}

describe('steady four-on-the-floor SIDs juggle', () => {
  const venus = analysisOf('Venus_Falling_SCC_Extended', PAL_CALL_HZ);
  const laMer = analysisOf('La_Mer', PAL_CALL_HZ);

  it('the beat is 24 player calls (125.31 BPM) and the bars are found on the exact beats', () => {
    for (const a of [venus, laMer]) {
      expect(a.bpm).toBeCloseTo(PAL_CALL_HZ * 60 / 24, 6);
      expect(a.meter.beatsPerBar).toBe(4);
      expect(trackBeatConfidence(a), JSON.stringify(a.analysisConfidence)).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('the juggle transition between them is not refused on beat or sync confidence', () => {
    const pair = pairConfidence(venus, laMer);
    expect(pair.beatConfidence).toBeGreaterThanOrEqual(0.8);
    expect(pair.deckSyncConfidence).toBeGreaterThanOrEqual(0.8);
    const reason = lowConfidenceReason(pair);
    expect(reason).not.toContain('beat');
    expect(reason).not.toContain('sync');
    // Phrase alone decides now (see the header): with phrase evidence on the grid the pair juggles.
    expect(confidencePolicy({ ...pair, phraseConfidence: 0.6 })).not.toBe('none');
  });

  it('the track end and the render cut-off are no phrase boundaries: La Mer juggles (8-bar phrases), Venus keeps refusing on bars 15 / 70', () => {
    expect(laMer.sections.map((x) => x.startBar)).toEqual([0, 40, 88]);
    const lm = pairConfidence(laMer, laMer);
    expect(lm.phraseConfidence).toBe(1);
    expect(confidencePolicy(lm)).toBe('beat');
    expect(venus.sections.map((x) => x.startBar)).toEqual([0, 15, 70]);
    const v = pairConfidence(venus, venus);
    expect(v.phraseConfidence).toBeCloseTo(0.3, 6);
    expect(confidencePolicy(v)).toBe('none');
  });

  it('the live juggle context: with one deck playing, sync is the grids\' confidence, not 0', () => {
    const controller = new DJJuggleController({
      sink: { execute: () => {} } as never, clockFor: (() => ({})) as never, positionOf: () => 30, now: () => 0,
    });
    const ctx = controller.buildContext({
      masterDeck: 'A', setPhase: 'PEAK', energy: 0.7, targetEnergy: 0.8, performanceMode: 'JUGGLE', transitionApproachingSec: null,
      decks: {
        A: { trackId: 'venus', analysis: venus, positionSec: 30, playing: true, bpm: venus.bpm },
        B: { trackId: 'lamer', analysis: laMer, positionSec: 0, playing: false, bpm: laMer.bpm },
      },
    });
    expect(ctx.deckSyncConfidence).toBeCloseTo(Math.min(venus.beatGrid.confidence, laMer.beatGrid.confidence), 6);
    expect(lowConfidenceReason(ctx)).not.toContain('sync');
  });
});
