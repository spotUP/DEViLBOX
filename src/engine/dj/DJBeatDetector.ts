/**
 * DJBeatDetector - the musical BPM of a tracker song from its own timing.
 *
 * In tracker modules the tempo is two numbers set by Fxx (the S3M / IT
 * importers normalise A / T to Fxx): F01-F1F speed (ticks per row) and
 * F20-FFF tick tempo. The musical BPM also needs the rows per beat, which
 * the speed alone does not give: songRowsPerBeat reads it from the song (the
 * 24-ticks-a-beat convention, corrected by the drums' backbeat).
 *
 * Strategy: walk the order list as the replayer plays it (the same walk the
 * module beat grid uses), take the speed / tempo pair the song spends the
 * most time at, and the song's rows per beat.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { timeOrderPositions } from './autodj/trackerMixAnalysis';
import { musicalBpm, dominantTempo, songRowsPerBeat } from './autodj/moduleBeatGrid';

export interface BPMDetectionResult {
  bpm: number;
  confidence: 'exact' | 'estimated' | 'default';
  source: string; // Description of where the BPM was found
}

/**
 * Detect the primary musical BPM of a tracker song: the speed / tempo pair it
 * plays longest, at the song's own rows per beat.
 */
export function detectBPM(song: TrackerSong): BPMDetectionResult {
  const walk = timeOrderPositions(song);
  const { tempoCommands } = walk;
  const { speed, bpm: tempo } = dominantTempo(song, walk);
  const { rowsPerBeat } = songRowsPerBeat(song, walk);
  const bpm = Math.round(musicalBpm(speed, tempo, rowsPerBeat) * 100) / 100;

  if (tempoCommands > 0) {
    return { bpm, confidence: 'exact', source: `Fxx speed ${speed} / tempo ${tempo} (${tempoCommands} speed/tempo commands)` };
  }
  if (speed !== 6 || tempo !== 125) {
    return { bpm, confidence: 'estimated', source: `Song header speed ${speed} / tempo ${tempo}` };
  }
  // Default: speed 6 / tempo 125 = 125 BPM (standard tracker tempo)
  return { bpm, confidence: 'default', source: 'Default (no BPM data found)' };
}

/**
 * Estimate total song duration in seconds based on patterns, BPM, and speed.
 */
export function estimateSongDuration(song: TrackerSong): number {
  let totalRows = 0;
  for (let pos = 0; pos < song.songLength; pos++) {
    const patternIndex = song.songPositions[pos];
    const pattern = song.patterns[patternIndex];
    totalRows += pattern?.length ?? 64;
  }

  // Each row = speed * (2.5 / BPM) seconds
  const tickDuration = 2.5 / song.initialBPM;
  return totalRows * song.initialSpeed * tickDuration;
}
