/**
 * DJBeatDetector - Scan module patterns for Fxx commands to detect BPM
 *
 * In tracker modules, BPM is set by the Fxx effect command:
 *   - F01-F1F: set speed (ticks per row)
 *   - F20-FFF: set BPM directly
 *
 * Strategy: scan first few patterns for the initial BPM. If no Fxx found,
 * use the song's initialBPM field.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern } from '@/types';

export interface BPMDetectionResult {
  bpm: number;
  confidence: 'exact' | 'estimated' | 'default';
  source: string; // Description of where the BPM was found
}

/**
 * Detect the primary BPM of a tracker song by scanning Fxx effect commands.
 */
export function detectBPM(song: TrackerSong): BPMDetectionResult {
  // First: use the song's declared initial BPM
  const initialBPM = song.initialBPM;

  // Scan song order for Fxx commands to find the "most common" BPM
  const bpmCounts = new Map<number, number>();
  let speed = song.initialSpeed;

  // Scan up to first 8 patterns in song order
  const scanLimit = Math.min(song.songLength, 8);
  for (let pos = 0; pos < scanLimit; pos++) {
    const patternIndex = song.songPositions[pos];
    const pattern = song.patterns[patternIndex];
    if (!pattern) continue;

    scanPatternForBPM(pattern, song.format, bpmCounts, speed);
  }

  // If we found explicit BPM commands, use the most common one
  if (bpmCounts.size > 0) {
    let maxCount = 0;
    let dominantBPM = initialBPM;
    for (const [bpm, count] of bpmCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantBPM = bpm;
      }
    }
    return {
      bpm: dominantBPM,
      confidence: 'exact',
      source: `Fxx effect (found ${bpmCounts.size} BPM commands)`,
    };
  }

  // Fall back to song header BPM
  if (initialBPM > 0 && initialBPM !== 125) {
    return {
      bpm: initialBPM,
      confidence: 'estimated',
      source: 'Song header initialBPM',
    };
  }

  // Default: 125 BPM (standard tracker tempo)
  return {
    bpm: 125,
    confidence: 'default',
    source: 'Default (no BPM data found)',
  };
}

/**
 * Scan a single pattern for Fxx BPM commands.
 */
function scanPatternForBPM(
  pattern: Pattern,
  format: string,
  bpmCounts: Map<number, number>,
  _speed: number,
): void {
  for (const channel of pattern.channels) {
    for (const cell of channel.rows) {
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      if (!effTyp && !eff) continue;

      // MOD/XM: effect F (0x0F)
      // IT/S3M: effect T (tempo) has different numbering, but in our
      // normalized format it's also stored as the appropriate effect type.
      const isFxx =
        (format === 'MOD' || format === 'XM') && effTyp === 0x0F ||
        (format === 'IT' || format === 'S3M') && effTyp === 0x14; // Txx

      if (isFxx && eff >= 0x20) {
        // Direct BPM setting
        bpmCounts.set(eff, (bpmCounts.get(eff) ?? 0) + 1);
      }
    }
  }
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
