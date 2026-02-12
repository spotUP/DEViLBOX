/**
 * resolveArrangement - Flatten arrangement timeline into songPositions[]
 *
 * Strategy: Walk the arrangement clips and build a linear sequence of
 * pattern references that TrackerReplayer can play. Multi-track clips
 * at the same time position are merged into composite patterns.
 *
 * For trimmed clips, virtual (sliced) patterns are created.
 * TrackerReplayer's tick loop stays untouched.
 */

import type { Pattern, TrackerCell, ChannelData } from '@/types/tracker';
import type { ArrangementClip, ArrangementTrack, ResolvedArrangement } from '@/types/arrangement';

const EMPTY: TrackerCell = {
  note: 0,
  instrument: 0,
  volume: 0,
  effTyp: 0,
  eff: 0,
  effTyp2: 0,
  eff2: 0,
};

/**
 * Resolve an arrangement into a flat playback schedule.
 *
 * @param clips - All clips in the arrangement
 * @param tracks - All tracks in the arrangement
 * @param patterns - All patterns (by id lookup)
 * @param speed - Ticks per row (for beat/bar calculations)
 * @returns ResolvedArrangement with songPositions, virtualPatterns, etc.
 */
export function resolveArrangement(
  clips: ArrangementClip[],
  tracks: ArrangementTrack[],
  patterns: Pattern[],
  speed: number = 6,
): ResolvedArrangement {
  void speed;
  if (clips.length === 0 || tracks.length === 0) {
    return {
      songPositions: [0],
      virtualPatterns: patterns.length > 0 ? [patterns[0]] : [],
      totalRows: 0,
      rowToGlobalRow: new Map(),
    };
  }

  // Build pattern lookup
  const patternById = new Map<string, Pattern>();
  for (const p of patterns) {
    patternById.set(p.id, p);
  }

  // Sort tracks by index; respect solo (if any track is solo, only solo tracks play)
  const hasSolo = tracks.some(t => t.solo);
  const sortedTracks = [...tracks]
    .filter(t => hasSolo ? t.solo : !t.muted)
    .sort((a, b) => a.index - b.index);

  // Filter out muted clips
  const activeClips = clips.filter(c => !c.muted);

  // Find total timeline length
  let totalRows = 0;
  for (const clip of activeClips) {
    const pattern = patternById.get(clip.patternId);
    const clipLen = clip.clipLengthRows ?? (pattern ? pattern.length - clip.offsetRows : 64);
    const endRow = clip.startRow + clipLen;
    if (endRow > totalRows) totalRows = endRow;
  }

  if (totalRows === 0) {
    return {
      songPositions: [0],
      virtualPatterns: patterns.length > 0 ? [patterns[0]] : [],
      totalRows: 0,
      rowToGlobalRow: new Map(),
    };
  }

  // Slice timeline into pattern-sized chunks (64 rows each for manageable patterns)
  const CHUNK_SIZE = 64;
  const numChunks = Math.ceil(totalRows / CHUNK_SIZE);
  const virtualPatterns: Pattern[] = [];
  const songPositions: number[] = [];
  const rowToGlobalRow = new Map<number, number>();

  for (let chunk = 0; chunk < numChunks; chunk++) {
    const chunkStart = chunk * CHUNK_SIZE;
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, totalRows);
    const chunkLength = chunkEnd - chunkStart;

    // Create channels for this chunk
    const channels: ChannelData[] = sortedTracks.map((track, chIdx) => {
      const rows: TrackerCell[] = [];

      for (let r = 0; r < chunkLength; r++) {
        const globalRow = chunkStart + r;

        // Find clip active on this track at this global row
        const clip = findActiveClip(activeClips, track.id, globalRow, patternById);

        if (clip) {
          const pattern = patternById.get(clip.patternId);
          if (pattern) {
            const patternRow = clip.offsetRows + (globalRow - clip.startRow);
            const channel = pattern.channels[clip.sourceChannelIndex];
            if (channel && patternRow >= 0 && patternRow < channel.rows.length) {
              rows.push({ ...channel.rows[patternRow] });
            } else {
              rows.push({ ...EMPTY });
            }
          } else {
            rows.push({ ...EMPTY });
          }
        } else {
          rows.push({ ...EMPTY });
        }
      }

      return {
        id: `vch-${chunk}-${chIdx}`,
        name: track.name,
        rows,
        muted: false,
        solo: false,
        collapsed: false,
        volume: track.volume,
        pan: track.pan,
        instrumentId: track.instrumentId,
        color: track.color,
      };
    });

    const virtualPattern: Pattern = {
      id: `vp-${chunk}`,
      name: `Chunk ${chunk}`,
      length: chunkLength,
      channels,
    };

    const patternIndex = virtualPatterns.length;
    virtualPatterns.push(virtualPattern);
    songPositions.push(patternIndex);

    // Build row mapping
    for (let r = 0; r < chunkLength; r++) {
      // Map: linear resolved row → global arrangement row
      rowToGlobalRow.set(chunk * CHUNK_SIZE + r, chunkStart + r);
    }
  }

  return {
    songPositions,
    virtualPatterns,
    totalRows,
    rowToGlobalRow,
  };
}

/**
 * Find the active clip on a given track at a given global row.
 * If multiple clips overlap, the latest-starting one wins.
 */
function findActiveClip(
  clips: ArrangementClip[],
  trackId: string,
  globalRow: number,
  patternById: Map<string, Pattern>,
): ArrangementClip | null {
  let best: ArrangementClip | null = null;

  for (const clip of clips) {
    if (clip.trackId !== trackId) continue;
    if (globalRow < clip.startRow) continue;

    const pattern = patternById.get(clip.patternId);
    const clipLen = clip.clipLengthRows ?? (pattern ? pattern.length - clip.offsetRows : 64);
    if (globalRow >= clip.startRow + clipLen) continue;

    // Latest-starting clip wins in overlap
    if (!best || clip.startRow > best.startRow) {
      best = clip;
    }
  }

  return best;
}
