/**
 * computeTrackerPeaks - Generate a waveform-like amplitude overview for tracker modules.
 *
 * Since tracker modules are synthesized in real-time (no pre-rendered audio buffer),
 * this function estimates "loudness" per row by counting active notes and their
 * volumes across all channels. The result is downsampled into `numBins` bins
 * that can be rendered exactly like audio file waveform peaks.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

/**
 * Compute per-row note density / estimated amplitude for a tracker song,
 * then downsample to `numBins` peak values (0–1 Float32Array).
 */
export function computeTrackerPeaks(song: TrackerSong, numBins = 800): Float32Array {
  const peaks = new Float32Array(numBins);

  if (!song || song.songLength === 0 || song.patterns.length === 0) {
    return peaks;
  }

  // Collect per-row amplitude estimates across the whole song order
  const rowAmps: number[] = [];

  for (let pos = 0; pos < song.songLength; pos++) {
    const patIdx = song.songPositions[pos];
    const pattern = song.patterns[patIdx];
    if (!pattern) {
      // Empty pattern placeholder — push 64 silent rows
      for (let r = 0; r < 64; r++) rowAmps.push(0);
      continue;
    }

    const numRows = pattern.length || 64;
    const channels = pattern.channels;

    for (let row = 0; row < numRows; row++) {
      let rowAmp = 0;
      for (let ch = 0; ch < channels.length; ch++) {
        const cell = channels[ch]?.rows[row];
        if (!cell) continue;

        // Count notes (non-zero, non-note-off)
        if (cell.note > 0 && cell.note < 97) {
          // Use volume column if present, otherwise assume full volume
          const vol = cell.volume > 0 && cell.volume <= 64
            ? cell.volume / 64
            : cell.volume >= 0x10 && cell.volume <= 0x50
              ? (cell.volume - 0x10) / 64
              : 1.0;
          rowAmp += vol;
        }
        // Also count active effects that imply sound (retrigger, arpeggio, etc.)
        if (cell.effTyp > 0 && cell.note === 0) {
          // Effects like arpeggio(0), portamento(1-5), vibrato(4), retrigger(E9x)
          // imply the channel is still producing sound
          rowAmp += 0.3;
        }
      }
      rowAmps.push(rowAmp);
    }
  }

  if (rowAmps.length === 0) return peaks;

  // Find max amplitude for normalization
  let maxAmp = 0;
  for (let i = 0; i < rowAmps.length; i++) {
    if (rowAmps[i] > maxAmp) maxAmp = rowAmps[i];
  }
  if (maxAmp === 0) return peaks;

  // Downsample into bins — take max within each bin's row range
  const rowsPerBin = rowAmps.length / numBins;
  for (let bin = 0; bin < numBins; bin++) {
    const startRow = Math.floor(bin * rowsPerBin);
    const endRow = Math.floor((bin + 1) * rowsPerBin);
    let binMax = 0;
    for (let r = startRow; r < endRow && r < rowAmps.length; r++) {
      if (rowAmps[r] > binMax) binMax = rowAmps[r];
    }
    peaks[bin] = binMax / maxAmp;
  }

  return peaks;
}
