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
 * @param loopStart - Optional loop region start row (inclusive)
 * @param loopEnd - Optional loop region end row (exclusive)
 * @returns ResolvedArrangement with songPositions, virtualPatterns, etc.
 */
export function resolveArrangement(
  clips: ArrangementClip[],
  tracks: ArrangementTrack[],
  patterns: Pattern[],
  speed: number = 6,
  loopStart?: number,
  loopEnd?: number,
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
  let activeClips = clips.filter(c => !c.muted);

  // When loop bounds are provided, restrict clips to the [loopStart, loopEnd) range,
  // trimming clips at the boundaries so playback stays within the region.
  const hasLoopBounds = loopStart != null && loopEnd != null && loopEnd > loopStart;
  if (hasLoopBounds) {
    const lStart = loopStart!;
    const lEnd = loopEnd!;
    const trimmedClips: ArrangementClip[] = [];
    for (const clip of activeClips) {
      const pattern = patternById.get(clip.patternId);
      const clipLen = clip.clipLength ?? clip.clipLengthRows ?? (pattern ? pattern.length - clip.offsetRows : 64);
      const clipEnd = clip.startRow + clipLen;

      // Skip clips entirely outside the loop region
      if (clipEnd <= lStart || clip.startRow >= lEnd) continue;

      // Compute the overlap of this clip with [lStart, lEnd)
      const overlapStart = Math.max(clip.startRow, lStart);
      const overlapEnd = Math.min(clipEnd, lEnd);
      const overlapLen = overlapEnd - overlapStart;

      // Adjust startRow, offsetRows, and clipLengthRows to the trimmed region,
      // but shift startRow relative to lStart so the virtual timeline starts at 0.
      const deltaFromOriginalStart = overlapStart - clip.startRow;
      trimmedClips.push({
        ...clip,
        startRow: overlapStart - lStart,
        offsetRows: clip.offsetRows + deltaFromOriginalStart,
        clipLengthRows: overlapLen,
      });
    }
    activeClips = trimmedClips;
  }

  // Find total timeline length
  let totalRows = 0;
  for (const clip of activeClips) {
    const pattern = patternById.get(clip.patternId);
    const clipLen = clip.clipLength ?? clip.clipLengthRows ?? (pattern ? pattern.length - clip.offsetRows : 64);
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
            const rowInClip = globalRow - clip.startRow;
            // Determine the effective pattern row, accounting for loopClip and reverse
            let patternRow: number;
            const effectiveLength = pattern.length - clip.offsetRows;
            if (clip.loopClip && pattern.length > 0) {
              // Cyclic: repeat pattern rows to fill the clip region
              const cycleRow = rowInClip % pattern.length;
              patternRow = clip.reversed
                ? clip.offsetRows + (pattern.length - 1 - cycleRow)
                : clip.offsetRows + cycleRow;
            } else {
              patternRow = clip.reversed
                ? clip.offsetRows + Math.max(0, effectiveLength - 1 - rowInClip)
                : clip.offsetRows + rowInClip;
            }
            const channel = pattern.channels[clip.sourceChannelIndex];
            if (channel && patternRow >= 0 && patternRow < channel.rows.length) {
              const cell = { ...channel.rows[patternRow] };

              // --- Clip Transpose ---
              const semitones = clip.transpose ?? 0;
              if (semitones !== 0 && cell.note > 0 && cell.note < 97) {
                cell.note = Math.max(1, Math.min(96, cell.note + semitones));
              }

              // --- Clip Gain + Fade ---
              const clipGain = clip.gain ?? 1.0;
              const clipLen = clip.clipLength ?? clip.clipLengthRows ?? (pattern.length - clip.offsetRows);
              let fadeMultiplier = 1.0;

              // Fade in
              const fadeIn = clip.fadeInRows ?? 0;
              if (fadeIn > 0 && rowInClip < fadeIn) {
                const t = rowInClip / fadeIn;
                const curve = clip.fadeInCurve ?? 'linear';
                fadeMultiplier *= curve === 'exponential' ? t * t
                  : curve === 'logarithmic' ? Math.sqrt(t)
                  : t;
              }

              // Fade out
              const fadeOut = clip.fadeOutRows ?? 0;
              if (fadeOut > 0 && rowInClip >= clipLen - fadeOut) {
                const remaining = clipLen - rowInClip;
                const t = remaining / fadeOut;
                const curve = clip.fadeOutCurve ?? 'linear';
                fadeMultiplier *= curve === 'exponential' ? t * t
                  : curve === 'logarithmic' ? Math.sqrt(t)
                  : t;
              }

              // Apply gain + fade to volume column
              const totalGain = clipGain * fadeMultiplier;
              if (totalGain !== 1.0 && cell.volume > 0 && cell.volume <= 0x50) {
                // Volume column: 0x10-0x50 = volume 0-64
                const vol = cell.volume - 0x10;
                cell.volume = Math.max(0x10, Math.min(0x50, 0x10 + Math.round(vol * totalGain)));
              } else if (totalGain !== 1.0 && cell.note > 0 && cell.note < 97) {
                // No volume column set — inject one based on gain
                cell.volume = Math.max(0x10, Math.min(0x50, 0x10 + Math.round(64 * totalGain)));
              }

              // --- Clip Reverse ---
              // (reversed is handled structurally — reverse the row index)
              // Already handled above via patternRow calculation

              rows.push(cell);
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
    // clipLength (crop/loop length) takes priority over clipLengthRows, then pattern length
    const clipLen = clip.clipLength ?? clip.clipLengthRows ?? (pattern ? pattern.length - clip.offsetRows : 64);
    if (globalRow >= clip.startRow + clipLen) continue;

    // Latest-starting clip wins in overlap
    if (!best || clip.startRow > best.startRow) {
      best = clip;
    }
  }

  return best;
}
