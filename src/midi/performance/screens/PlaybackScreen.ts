/**
 * PlaybackScreen — MK2 live playback display.
 *
 * Left screen:  Scrolling pattern data following the playhead
 * Right screen: Per-channel mini oscilloscopes (stacked vertically)
 *
 * Auto-activates when playback starts, returns to previous mode on stop.
 * Not directly button-activated — managed by MK2ScreenManager transport subscription.
 */

import { MK2Display } from '../MK2Display';
import type { MK2Screen, MK2ScreenContext } from './MK2ScreenManager';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useOscilloscopeStore } from '@/stores/useOscilloscopeStore';

// XM note format: 0=empty, 1-96=notes, 97=note off
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteStr(note: number): string {
  if (note === 0) return '...';
  if (note === 97) return 'OFF';
  const n = note - 1; // 0-based
  const name = NOTE_NAMES[n % 12];
  const oct = Math.floor(n / 12);
  return `${name}${oct}`;
}

function instStr(inst: number): string {
  if (inst <= 0) return '..';
  return String(inst).padStart(2, '0');
}

export class PlaybackScreen implements MK2Screen {

  render(left: MK2Display, right: MK2Display, _ctx: MK2ScreenContext): void {
    this.renderPatternScroll(left);
    this.renderVUMeters(right);
  }

  softLabels(): string[] {
    const transport = useTransportStore.getState();
    const bpm = Math.round(transport.bpm);
    return ['', '', '', '', '', '', '', `${bpm}`];
  }

  // ── Left: scrolling pattern ────────────────────────────────────────────

  private renderPatternScroll(d: MK2Display): void {
    const { W, WHITE, BLACK } = MK2Display;
    const state = useTrackerStore.getState();
    const transport = useTransportStore.getState();
    const pattern = state.patterns[transport.currentPatternIndex];
    if (!pattern) return;

    const contentY = 10;  // below soft labels
    const contentH = 46;  // above transport bar
    const rowH = 7;       // 6px char + 1px gap
    const visibleRows = Math.floor(contentH / rowH); // ~6 rows
    const currentRow = transport.currentRow;

    // Page-based: text stays static, only the highlight bar moves.
    // This lets OLED pixels reach full brightness since text doesn't change between pages.
    const pageStart = Math.floor(currentRow / visibleRows) * visibleRows;

    const chW = 42;
    const rowNumW = 18;
    const maxCh = Math.floor((W - rowNumW) / chW);
    const numCh = Math.min(pattern.channels.length, maxCh);

    // Channel headers
    for (let c = 0; c < numCh; c++) {
      const x = rowNumW + c * chW;
      const chName = pattern.channels[c].shortName
        || pattern.channels[c].channelMeta?.shortName
        || `${c + 1}`;
      d.text(x, contentY - 8, chName.substring(0, 4), WHITE);
    }

    // Pattern rows — static page, highlight moves within
    for (let r = 0; r < visibleRows; r++) {
      const row = pageStart + r;
      if (row >= pattern.length) break;

      const y = contentY + r * rowH;
      const isCurrentRow = row === currentRow;

      // Highlight current row with inverted bar
      if (isCurrentRow) {
        d.fillRect(0, y, W, rowH - 1, WHITE);
      }

      const fg = isCurrentRow ? BLACK : WHITE;
      const bg = isCurrentRow ? WHITE : undefined;

      // Row number
      const rowStr = String(row).padStart(2, '0');
      d.text(0, y, rowStr, fg, bg);

      // Channel data — only notes, no clutter
      for (let c = 0; c < numCh; c++) {
        const cell = pattern.channels[c].rows[row];
        const x = rowNumW + c * chW;

        if (cell && cell.note > 0) {
          d.text(x, y, noteStr(cell.note), fg, bg);
          d.text(x + 20, y, instStr(cell.instrument), fg, bg);
        }
      }
    }
  }

  // ── Right: per-channel VU meters ─────────────────────────────────────

  private renderVUMeters(d: MK2Display): void {
    const { W, WHITE } = MK2Display;
    const oscState = useOscilloscopeStore.getState();
    const channelData = oscState.channelData;
    const channelNames = oscState.channelNames;

    if (!channelData || channelData.length === 0) {
      d.text(4, 28, 'NO AUDIO DATA', WHITE);
      return;
    }

    // Count active channels
    const activeChannels: number[] = [];
    for (let i = 0; i < channelData.length; i++) {
      if (channelData[i] && channelData[i]!.length > 0) {
        activeChannels.push(i);
      }
    }

    if (activeChannels.length === 0) {
      d.text(4, 28, 'SILENT', WHITE);
      return;
    }

    // Stack VU meter bars vertically, max 8 visible
    const maxVisible = Math.min(activeChannels.length, 8);
    const rowH = Math.floor(64 / maxVisible);
    const labelW = 30;
    const barW = W - labelW - 4;

    for (let i = 0; i < maxVisible; i++) {
      const chIdx = activeChannels[i];
      const y = i * rowH;
      const data = channelData[chIdx]!;

      // Channel label (left margin)
      const label = (channelNames[chIdx] || `${chIdx + 1}`).substring(0, 4);
      d.text(0, y + Math.floor((rowH - 7) / 2), label, WHITE);

      // Compute RMS level from waveform data
      let sumSq = 0;
      for (let s = 0; s < data.length; s++) {
        const v = data[s] / 32768;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / data.length);

      // Also get peak
      let peak = 0;
      for (let s = 0; s < data.length; s++) {
        const v = Math.abs(data[s]) / 32768;
        if (v > peak) peak = v;
      }

      // Bar dimensions — leave 1px gap top and bottom
      const barY = y + 1;
      const barH = rowH - 2;

      // RMS bar (solid fill)
      const rmsW = Math.round(Math.min(1, rms * 3) * barW); // scale up RMS for visibility
      if (rmsW > 0) {
        d.fillRect(labelW, barY, rmsW, barH, WHITE);
      }

      // Peak marker (single column, 2px wide)
      const peakX = Math.round(Math.min(1, peak) * barW);
      if (peakX > 0) {
        d.fillRect(labelW + peakX - 1, barY, 2, barH, WHITE);
      }
    }
  }
}
