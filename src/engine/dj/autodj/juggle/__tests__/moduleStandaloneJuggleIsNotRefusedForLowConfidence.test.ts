/**
 * A 4/4 tracker module with 64-row patterns is not refused a stand-alone
 * juggle as "low confidence" (audit 2026-10-11 M1). Its phrases are its
 * pattern changes, read from the order list (owner plan section 37), so the
 * phrase confidence is the module's, not the audio detector's: a short drum
 * break that throws the audio boundaries off 4/8/16 bars (phrase confidence
 * 0.3) must not decide it. The section 31 thresholds are unchanged.
 *
 * Real module (public/data/songs/formats/shortsong1.mod: 10 positions of 64
 * rows, speed 6 / tempo 125, 4 bars a pattern), the real analysis builder,
 * the controller's own context builder and the stand-alone gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { timeOrderPositions } from '../../trackerMixAnalysis';
import { MODULE_GRID_TOLERANCE } from '../../moduleBeatGrid';
import { computeExtendedAnalysis } from '../../activityTimelines';
import { buildDJTrackAnalysis } from '../../trackAnalysis';
import { corpusPipelineAnalysis } from '../../testing/corpus';
import { renderSyntheticTrack } from '../../testing/synthTrack';
import { DJJuggleController, type TickInput } from '../juggleController';
import { juggleOpportunity } from '../juggleOpportunity';
import { POLICY_MIN } from '../jugglePlanner';
import type { DJTrackAnalysis } from '../../types';

const MODULE = 'public/data/songs/formats/shortsong1.mod';

async function loadModule(): Promise<TrackerSong> {
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  return parseModuleToSong(new File([readFileSync(resolve(process.cwd(), MODULE))], 'shortsong1.mod'));
}

/**
 * The module's audio as the analyser hears it: 40 bars at 125 BPM whose
 * drums drop out for short, odd-length breaks (bars 6-7, 13-15, 22-23), so
 * the audio's arrangement boundaries sit off every 4/8/16-bar phrase.
 */
function offGridAudio() {
  const g = (bars: number) => ({ bars, kick: true, bass: true, hats: true, pad: true });
  const brk = (bars: number) => ({ bars, pad: true, level: 0.5 });
  return renderSyntheticTrack({ name: 'module render', bpm: 125, root: 57, mode: 'minor', sections: [g(6), brk(2), g(5), brk(3), g(6), brk(2), g(16)] });
}

function contextAt(a: DJTrackAnalysis, positionSec: number) {
  const controller = new DJJuggleController({
    sink: { apply: () => {}, state: () => ({ crossfader: 0, playing: { A: true, B: false }, audible: { A: true, B: false }, loops: { A: false, B: false } }), restore: () => {} },
    clockFor: () => ({ beatNow: () => 0, beatSec: () => 0.48 }),
    positionOf: () => positionSec,
    now: () => 1_000_000,
  });
  const input: TickInput = {
    masterDeck: 'A',
    decks: {
      A: { trackId: 'shortsong1.mod', analysis: a, positionSec, playing: true, bpm: a.bpm },
      B: { trackId: '', analysis: null, positionSec: 0, playing: false, bpm: 0 },
    },
    setPhase: 'CRUISING', energy: 0.6, targetEnergy: 0.65, performanceMode: 'JUGGLE', transitionApproachingSec: 400,
  };
  return controller.buildContext(input);
}

describe('a 4/4 module with 64-row patterns reaches the stand-alone juggle gate', () => {
  it('is not refused for low confidence: its phrases are its pattern changes', async () => {
    const song = await loadModule();
    const walk = timeOrderPositions(song);
    const walkEnd = walk.positions[walk.positions.length - 1].end;
    expect(walk.positions.map((p) => p.rows)).toEqual(Array(10).fill(64));

    const track = offGridAudio();
    // The render carries a 1 s tail, inside the walk-vs-render agreement.
    expect(Math.abs(track.durationSec / walkEnd - 1)).toBeLessThan(MODULE_GRID_TOLERANCE);
    const pipeline = corpusPipelineAnalysis(track);
    const extended = computeExtendedAnalysis(track.pcm, track.sampleRate, { beats: track.beats });

    // The scenario: the audio alone puts the phrases below the phrase-trading minimum.
    const audioOnly = buildDJTrackAnalysis({ id: 'audio', durationSec: track.durationSec, analysis: pipeline, extended, song: null });
    expect(audioOnly.phrases[0].confidence).toBeLessThan(POLICY_MIN.phrase.phrase);

    const a = buildDJTrackAnalysis({ id: 'shortsong1', durationSec: track.durationSec, analysis: pipeline, extended, song });
    expect(a.tempoSource).toBe('module');
    // Order 0 0 1 1 0 0 1 2 2 2, 4 bars a pattern: the pattern changes at bars 8, 16, 24 and 28; three of the
    // four sit on 8 bars, so the song counts in 8-bar phrases (confidence 3/4), restarted at the change on bar 28.
    expect(walk.positions.map((p) => p.patternIndex)).toEqual([0, 0, 1, 1, 0, 0, 1, 2, 2, 2]);
    expect(a.phraseLengthBars).toBe(8);
    expect(a.phrases.map((p) => p.startBar)).toEqual([0, 8, 16, 24, 28, 36]);
    expect(a.phrases.map((p) => p.start)).toEqual([0, 2, 4, 6, 7, 9].map((i) => expect.closeTo(walk.positions[i].start, 6)));
    expect(a.phrases.map((p) => p.confidence)).toEqual(Array(6).fill(0.75));

    // Bar 15.5 (the last quarter of the phrase on bars 8-15): the gate passes on confidence.
    const barSec = 4 * 60 / 125;
    const ctx = contextAt(a, 15.5 * barSec);
    expect(ctx.phraseConfidence).toBe(0.75);
    const why: string[] = [];
    const op = juggleOpportunity(ctx, 'MUSICAL', null, why);
    expect(why.join('; ')).not.toMatch(/low confidence/);
    expect(op, why.join('; ')).not.toBeNull();
    expect(op!.trigger).toBe('phraseEnd');
  }, 60_000);
});
