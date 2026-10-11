/**
 * DJBeatDetector - the musical BPM of a tracker song from its own timing.
 *
 * In tracker modules the tempo is two numbers set by Fxx (the S3M / IT
 * importers normalise A / T to Fxx): F01-F1F speed (ticks per row) and
 * F20-FFF tick tempo. At 4 rows a beat the musical BPM is 6 * tempo / speed,
 * so speed 3 / tempo 125 plays 250 BPM and speed 12 / tempo 125 plays 62.5.
 *
 * Strategy: walk the order list as the replayer plays it (the same walk the
 * module beat grid uses) and take the speed / tempo pair the song spends the
 * most time at.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { timeOrderPositions } from './autodj/trackerMixAnalysis';
import { musicalBpm } from './autodj/moduleBeatGrid';

export interface BPMDetectionResult {
  bpm: number;
  confidence: 'exact' | 'estimated' | 'default';
  source: string; // Description of where the BPM was found
}

/**
 * Detect the primary musical BPM of a tracker song: the speed / tempo pair it
 * plays longest, at 4 rows a beat.
 */
export function detectBPM(song: TrackerSong): BPMDetectionResult {
  const { tempoSeconds, tempoCommands } = timeOrderPositions(song);
  let dominant: { speed: number; bpm: number; seconds: number } | null = null;
  for (const e of tempoSeconds) if (!dominant || e.seconds > dominant.seconds) dominant = e;
  const speed = dominant?.speed ?? (song.initialSpeed > 0 ? song.initialSpeed : 6);
  const tempo = dominant?.bpm ?? (song.initialBPM > 0 ? song.initialBPM : 125);
  const bpm = Math.round(musicalBpm(speed, tempo) * 100) / 100;

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
