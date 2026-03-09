/**
 * MCP Bridge — Analysis Handlers
 *
 * Song analysis, key detection, chord progression, channel classification.
 */

import { useTrackerStore } from '../../stores/useTrackerStore';
import { useTransportStore } from '../../stores/useTransportStore';
import { analyzeSong } from '../analysis/MusicAnalysis';

/** Analyze the loaded song: key, scale, chords, channel roles, note distribution */
export function analyzeSongHandler(_params: Record<string, unknown>): Record<string, unknown> {
  try {
    const { patterns } = useTrackerStore.getState();
    if (!patterns || patterns.length === 0) {
      return { error: 'No song loaded' };
    }

    const analysis = analyzeSong(patterns);
    const { bpm } = useTransportStore.getState();

    return {
      key: analysis.key.key,
      keyConfidence: analysis.key.confidence,
      root: analysis.key.root,
      mode: analysis.key.mode,
      scale: {
        name: analysis.scale.name,
        intervals: analysis.scale.intervals,
        coverage: analysis.scale.coverage,
        outOfScaleNotes: analysis.scale.outOfScale,
      },
      tempo: bpm,
      totalNotes: analysis.totalNotes,
      uniquePitchClasses: analysis.uniquePitchClasses,
      noteDistribution: analysis.noteDistribution,
      channelAnalysis: analysis.channelAnalysis.map(ch => ({
        channel: ch.channel,
        role: ch.role,
        noteCount: ch.noteCount,
        avgOctave: ch.avgOctave,
        density: ch.density,
        uniqueNotes: ch.uniqueNotes,
        pitchRange: ch.pitchRange,
        avgInterval: ch.avgInterval,
      })),
      chordProgression: analysis.chordProgression.slice(0, 32), // Cap at 32 chords
      usedInstruments: analysis.usedInstruments,
      topKeys: analysis.key.allKeys,
    };
  } catch (e) {
    return { error: `Analysis failed: ${(e as Error).message}` };
  }
}
