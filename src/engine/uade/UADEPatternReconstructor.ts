/**
 * UADEPatternReconstructor.ts
 *
 * Reconstructs editable TrackerSong patterns from CIA tick snapshots captured
 * during the UADE enhanced scan.
 *
 * Algorithm:
 *  1. Detect `speed` — most common interval (in CIA ticks) between consecutive
 *     triggered=1 events across all channels. Fallback to 6 (ProTracker default).
 *  2. Group snapshots into rows: each row spans `speed` CIA ticks.
 *  3. For each row read the channel state at the first tick of that row.
 *  4. Map period → XM note using amigaPeriodToNote (MIDI 0-127 → XM 1-96).
 *  5. Map lc (chip RAM address) → instrument index via samplePtrToInstrIndex.
 *  6. Suppress held notes: if same period + lc as prior row, emit empty note.
 *  7. Detect basic effects:
 *       - Constant period delta per tick within a row → portamento (XM 1/2)
 *       - Constant volume delta per tick → volume slide (XM A)
 */

import type { Pattern, ChannelData, TrackerCell } from '@/types';
import type { UADETickSnapshot } from './UADEEngine';
import { amigaPeriodToNote } from './amigaPeriodToNote';
import { idGenerator } from '@utils/idGenerator';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ReconstructedSong {
  patterns:  Pattern[];
  bpm:       number;
  speed:     number;
  firstTick: number;      // CIA tick of the first row (offset for position calculation)
  warnings:  string[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Empty TrackerCell matching the required structure (all required fields). */
function emptyCell(): TrackerCell {
  return {
    note:       0,
    instrument: 0,
    volume:     0,
    effTyp:     0,
    eff:        0,
    effTyp2:    0,
    eff2:       0,
  };
}

/**
 * Convert an Amiga MIDI note (0-127 from amigaPeriodToNote) to XM note (1-96).
 * XM: 1 = C-0, 13 = C-1, 25 = C-2, etc. Formula: xm = midi + 1.
 */
function midiToXmNote(midiNote: number): number {
  const xm = midiNote + 1;
  return Math.max(1, Math.min(96, xm));
}

/**
 * Detect the speed (CIA ticks per row) by finding the most common inter-trigger
 * interval across all channels. Returns 6 if no reliable interval is found.
 */
function detectSpeed(snapshots: UADETickSnapshot[], channelCount: number): number {
  const intervalCounts = new Map<number, number>();

  for (let ch = 0; ch < channelCount; ch++) {
    let lastTriggerTick = -1;

    for (const snap of snapshots) {
      if (ch >= snap.channels.length) continue;
      const state = snap.channels[ch];
      if (state.triggered === 1) {
        if (lastTriggerTick >= 0) {
          const interval = snap.tick - lastTriggerTick;
          // Sanity check: interval should be between 1 and 200 CIA ticks
          if (interval >= 1 && interval <= 200) {
            intervalCounts.set(interval, (intervalCounts.get(interval) ?? 0) + 1);
          }
        }
        lastTriggerTick = snap.tick;
      }
    }
  }

  if (intervalCounts.size === 0) return 6;

  // Find the most common interval
  let bestInterval = 6;
  let bestCount = 0;
  for (const [interval, count] of intervalCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestInterval = interval;
    }
  }
  return bestInterval;
}

/**
 * Detect XM effects from per-tick state changes within a row.
 *
 * Detects: portamento up/down, volume slide, arpeggio, vibrato, retrigger.
 * Returns { effTyp, eff } or zeros if no effect detected.
 */
function detectEffect(
  rowSnapshots: UADETickSnapshot[],
  ch: number,
): { effTyp: number; eff: number } {
  if (rowSnapshots.length < 2) return { effTyp: 0, eff: 0 };

  const states = rowSnapshots
    .filter(s => ch < s.channels.length)
    .map(s => s.channels[ch]);

  if (states.length < 2) return { effTyp: 0, eff: 0 };

  // ── Arpeggio detection ──────────────────────────────────────────────────
  // Arpeggio cycles through 2-3 distinct period values rapidly (every tick).
  // XM effect 0 (0x00): xy — x=semitones up, y=semitones up (alternating).
  const uniquePeriods = new Set(states.filter(s => s.period > 0).map(s => s.period));
  if (uniquePeriods.size >= 2 && uniquePeriods.size <= 3) {
    const sorted = [...uniquePeriods].sort((a, b) => b - a); // highest period (lowest pitch) first
    const basePeriod = sorted[0];  // base note = lowest pitch = highest period
    // Check if the periods alternate (arpeggio pattern)
    let isArpeggio = true;
    for (const s of states) {
      if (s.period > 0 && !uniquePeriods.has(s.period)) {
        isArpeggio = false;
        break;
      }
    }
    if (isArpeggio && basePeriod > 0) {
      // Convert period ratios to semitones: semitones = 12 * log2(basePeriod / period)
      const semitonesArr = sorted.slice(1).map(p =>
        Math.round(12 * Math.log2(basePeriod / p))
      );
      const x = Math.min(0xF, Math.max(0, semitonesArr[0] ?? 0));
      const y = Math.min(0xF, Math.max(0, semitonesArr[1] ?? 0));
      if (x > 0 || y > 0) {
        return { effTyp: 0x00, eff: (x << 4) | y };
      }
    }
  }

  // ── Portamento detection ─────────────────────────────────────────────────
  // If the period changes by a constant delta each tick, it's a portamento.
  const periodDeltas: number[] = [];
  for (let i = 1; i < states.length; i++) {
    if (states[i].period > 0 && states[i - 1].period > 0) {
      periodDeltas.push(states[i].period - states[i - 1].period);
    }
  }
  if (periodDeltas.length >= 2) {
    const firstDelta = periodDeltas[0];
    const isConstant = periodDeltas.every(d => d === firstDelta);
    if (isConstant && firstDelta !== 0) {
      const absSpeed = Math.min(0xFF, Math.abs(firstDelta));
      if (firstDelta < 0) {
        // Period decreasing → pitch up → XM effect 1 (Portamento Up)
        return { effTyp: 0x01, eff: absSpeed };
      } else {
        // Period increasing → pitch down → XM effect 2 (Portamento Down)
        return { effTyp: 0x02, eff: absSpeed };
      }
    }
  }

  // ── Vibrato detection ───────────────────────────────────────────────────
  // Vibrato: period oscillates around a center value (alternating +/-).
  // XM effect 4 (0x04): xy — x=speed, y=depth.
  if (periodDeltas.length >= 3) {
    let signChanges = 0;
    for (let i = 1; i < periodDeltas.length; i++) {
      if ((periodDeltas[i] > 0 && periodDeltas[i - 1] < 0) ||
          (periodDeltas[i] < 0 && periodDeltas[i - 1] > 0)) {
        signChanges++;
      }
    }
    // Vibrato has frequent sign changes (oscillating pattern)
    if (signChanges >= 2) {
      const maxDelta = Math.max(...periodDeltas.map(Math.abs));
      const depth = Math.min(0xF, Math.round(maxDelta / 2));
      // Speed: estimate from how quickly the oscillation cycles
      const speed = Math.min(0xF, Math.max(1, Math.round(signChanges * 2)));
      if (depth > 0) {
        return { effTyp: 0x04, eff: (speed << 4) | depth };
      }
    }
  }

  // ── Volume slide detection ───────────────────────────────────────────────
  // If volume changes by a constant delta each tick, it's a volume slide.
  const volDeltas: number[] = [];
  for (let i = 1; i < states.length; i++) {
    volDeltas.push(states[i].volume - states[i - 1].volume);
  }
  if (volDeltas.length >= 2) {
    const firstDelta = volDeltas[0];
    const isConstant = volDeltas.every(d => d === firstDelta);
    if (isConstant && firstDelta !== 0) {
      // XM effect A (0x0A): volume slide. High nybble = up, low nybble = down.
      const absSpeed = Math.min(0x0F, Math.abs(firstDelta));
      const eff = firstDelta > 0
        ? (absSpeed << 4)        // slide up in high nybble
        : (absSpeed & 0x0F);     // slide down in low nybble
      return { effTyp: 0x0A, eff };
    }
  }

  // ── Retrigger detection ────────────────────────────────────────────────
  // Multiple DMA restarts within a single row = note retrigger.
  // XM effect E9x: retrigger note every x ticks.
  const triggerTicks: number[] = [];
  for (let i = 0; i < rowSnapshots.length; i++) {
    if (ch < rowSnapshots[i].channels.length && rowSnapshots[i].channels[ch].triggered === 1) {
      triggerTicks.push(i);
    }
  }
  if (triggerTicks.length >= 2) {
    // Compute interval between triggers
    const intervals: number[] = [];
    for (let i = 1; i < triggerTicks.length; i++) {
      intervals.push(triggerTicks[i] - triggerTicks[i - 1]);
    }
    // Check if intervals are consistent (retrigger pattern)
    const firstInterval = intervals[0];
    if (firstInterval > 0 && firstInterval <= 0xF &&
        intervals.every(d => d === firstInterval)) {
      return { effTyp: 0x0E, eff: 0x90 | firstInterval };  // E9x
    }
  }

  return { effTyp: 0, eff: 0 };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Reconstruct editable patterns from CIA tick snapshots.
 *
 * @param snapshots            Tick snapshots from UADEEngine.getTickSnapshots()
 * @param samplePtrToInstrIndex  Map from chip RAM address (lc register) to 1-based instrument index
 * @param channelCount         Number of Paula channels to reconstruct (default 4)
 */
export function reconstructPatterns(
  snapshots: UADETickSnapshot[],
  samplePtrToInstrIndex: Map<number, number>,
  channelCount = 4,
  speedHint?: number,
): ReconstructedSong {
  const warnings: string[] = [];

  // ── Guard: not enough data ────────────────────────────────────────────────
  if (snapshots.length < 2) {
    warnings.push('Too few CIA tick snapshots to reconstruct patterns (need ≥ 2)');
    return { patterns: [], bpm: 125, speed: 6, firstTick: 0, warnings };
  }

  // ── Step 1: detect speed ──────────────────────────────────────────────────
  const speed = speedHint ?? detectSpeed(snapshots, channelCount);

  // ── Step 2: group snapshots into rows ─────────────────────────────────────
  // Each row starts at firstTick + rowIndex * speed.
  const firstTick = snapshots[0].tick;

  // Build a tick → snapshot index lookup for fast access
  const tickToSnap = new Map<number, UADETickSnapshot>();
  for (const snap of snapshots) {
    if (!tickToSnap.has(snap.tick)) {
      tickToSnap.set(snap.tick, snap);
    }
  }

  // Determine total number of rows from the last tick
  const lastTick = snapshots[snapshots.length - 1].tick;
  const totalRows = Math.ceil((lastTick - firstTick + 1) / speed);

  if (totalRows === 0) {
    warnings.push('All tick snapshots have the same tick value — cannot reconstruct rows');
    return { patterns: [], bpm: 125, speed, firstTick, warnings };  }

  // ── Step 3: build channel rows ────────────────────────────────────────────
  // We build one large flat channel row array per channel, then slice into
  // 64-row patterns (standard XM/MOD pattern length).
  const PATTERN_LENGTH = 64;

  const channelRowArrays: TrackerCell[][] = Array.from(
    { length: channelCount },
    () => [],
  );

  // Track previous row state per channel for held-note and note-off detection
  const prevPeriod  = new Array<number>(channelCount).fill(0);
  const prevLc      = new Array<number>(channelCount).fill(0);
  const prevPlaying = new Array<boolean>(channelCount).fill(false);

  for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
    const rowStartTick = firstTick + rowIdx * speed;

    // Collect all snapshots that fall within this row's tick window
    const rowSnaps: UADETickSnapshot[] = [];
    for (const snap of snapshots) {
      const offset = snap.tick - rowStartTick;
      if (offset >= 0 && offset < speed) {
        rowSnaps.push(snap);
      }
    }

    // Use the first snapshot of the row for note/instrument state
    const firstSnap = rowSnaps[0] ?? tickToSnap.get(rowStartTick);

    for (let ch = 0; ch < channelCount; ch++) {
      const cell = emptyCell();

      if (firstSnap && ch < firstSnap.channels.length) {
        const state = firstSnap.channels[ch];

        // Use DMA restart detection (triggered flag) as primary note-on signal.
        // Fallback: if triggered is never set (old WASM without DMA detection),
        // use the legacy heuristic of period+LC change detection.
        const hasTriggered = state.triggered === 1;
        const hasDma = state.dmaEn !== 0 && state.period > 0;

        if (hasDma) {
          // Legacy heuristic: detect held notes by comparing period + instrument
          const currInstr = samplePtrToInstrIndex.get(state.lc) ?? 0;
          const prevInstr = samplePtrToInstrIndex.get(prevLc[ch]) ?? 0;
          const sameInstrument = currInstr !== 0 && currInstr === prevInstr;
          const isHeldLegacy = state.period === prevPeriod[ch] &&
                         (state.lc === prevLc[ch] || sameInstrument);

          // A note is "new" if the WASM triggered flag is set, OR (for old
          // WASM builds without DMA detection) the legacy heuristic fires.
          const isNewNote = hasTriggered || !isHeldLegacy;

          if (isNewNote) {
            // Map period → XM note
            const noteInfo = amigaPeriodToNote(state.period);
            if (noteInfo !== null) {
              cell.note = midiToXmNote(noteInfo.note);
            }

            // Map lc → instrument index
            const instrIdx = samplePtrToInstrIndex.get(state.lc);
            if (instrIdx !== undefined) {
              cell.instrument = instrIdx;
            }

            // Set volume column if volume is not default max (64)
            if (state.volume >= 0 && state.volume < 64) {
              // XM volume column: 0x10 + vol (0-64); vol=0 → 0x10 (explicit mute)
              cell.volume = 0x10 + Math.min(64, state.volume);
            } else if (state.volume === 64) {
              // Full volume — leave volume column empty (0x00 means nothing)
              cell.volume = 0;
            }
          }
          // Held note: leave all fields at 0 (empty cell)

          prevPeriod[ch] = state.period;
          prevLc[ch]     = state.lc;
          prevPlaying[ch] = true;
        } else {
          // DMA off or no period — emit note-off if channel was previously playing
          if (prevPlaying[ch]) {
            cell.note = 97; // XM note-off
          }
          prevPeriod[ch] = 0;
          prevLc[ch]     = 0;
          prevPlaying[ch] = false;
        }

        // Detect effects from intra-row tick deltas (only on non-empty/non-held rows)
        if (cell.note !== 0 || cell.instrument !== 0) {
          const { effTyp, eff } = detectEffect(rowSnaps, ch);
          cell.effTyp = effTyp;
          cell.eff    = eff;
        }
      }

      channelRowArrays[ch].push(cell);
    }
  }

  // ── Step 4: slice into patterns ───────────────────────────────────────────
  const patterns: Pattern[] = [];
  const numPatterns = Math.ceil(totalRows / PATTERN_LENGTH);

  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    const startRow = patIdx * PATTERN_LENGTH;
    const endRow   = Math.min(startRow + PATTERN_LENGTH, totalRows);
    const patLen   = endRow - startRow;

    // Amiga LRRL panning: ch0→L, ch1→R, ch2→R, ch3→L
    const AMIGA_PAN = [-50, 50, 50, -50];

    const channels: ChannelData[] = channelRowArrays.map((allRows, ch) => ({
      id:           idGenerator.generate('uade-ch'),
      name:         `Channel ${ch + 1}`,
      rows:         allRows.slice(startRow, endRow),
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          AMIGA_PAN[ch] ?? 0,
      instrumentId: null,
      color:        null,
      channelMeta: {
        importedFromMOD: true,
        originalIndex: ch,
        channelType: 'sample' as const,
      },
    }));

    patterns.push({
      id:     idGenerator.generate('uade-pat'),
      name:   `Pattern ${patIdx + 1}`,
      length: patLen,
      channels,
    });
  }

  // Warn if pattern count seems suspiciously high (likely noise)
  if (patterns.length > 256) {
    warnings.push(
      `Reconstructed ${patterns.length} patterns from ${totalRows} rows (speed=${speed}) — ` +
      'this may indicate noisy snapshot data',
    );
  }

  // BPM is not derivable from CIA tick snapshots alone (would need CIA timer rate vs audio SR).
  // Return 125 as the standard ProTracker/UADE default.
  return { patterns, bpm: 125, speed, firstTick, warnings };
}
