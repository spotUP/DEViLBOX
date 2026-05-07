/**
 * SongScreen — MK2 display for song/arrangement mode.
 *
 * Left screen:  Song position list (patternOrder) following playhead
 * Right screen: Current pattern detail + slot mute summary
 *
 * Activated by the Navigate button.
 */

import { MK2Display } from '../MK2Display';
import type { MK2Screen, MK2ScreenContext } from './MK2ScreenManager';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';

export class SongScreen implements MK2Screen {

  render(left: MK2Display, right: MK2Display, _ctx: MK2ScreenContext): void {
    this.renderPositionChain(left);
    this.renderPatternDetail(right);
  }

  softLabels(): string[] {
    return ['<POS', 'POS>', '', 'DUP', '', '', 'ADD', 'DEL'];
  }

  // ── Left: position list following playback ────────────────────────────

  private renderPositionChain(d: MK2Display): void {
    const { W, WHITE, BLACK } = MK2Display;
    const state = useTrackerStore.getState();
    const { patternOrder, currentPositionIndex, patterns, slotMutes } = state;

    const contentY = 10;
    const rowH = 8;
    const visibleRows = 6;

    // Center current position in view
    const startIdx = Math.max(0, currentPositionIndex - Math.floor(visibleRows / 2));

    for (let i = 0; i < visibleRows; i++) {
      const posIdx = startIdx + i;
      if (posIdx >= patternOrder.length) break;

      const patIdx = patternOrder[posIdx];
      const pat = patterns[patIdx];
      const y = contentY + i * rowH;
      const isCurrent = posIdx === currentPositionIndex;

      // Count muted slots at this position
      let mutedCount = 0;
      const numCh = pat?.channels.length ?? 0;
      for (let ch = 0; ch < numCh; ch++) {
        if (slotMutes.has(`${posIdx}:${ch}`)) mutedCount++;
      }

      const posStr = String(posIdx).padStart(2, '0');
      const patStr = String(patIdx).padStart(2, '0');
      const name = pat?.name ? ` ${pat.name}` : '';
      const muteStr = mutedCount > 0 ? ` [${mutedCount}M]` : '';
      const label = `${posStr}:P${patStr}${name}${muteStr}`.substring(0, 28);

      if (isCurrent) {
        d.fillRect(0, y, W, rowH, WHITE);
        d.text(2, y + 1, '\u25B6', BLACK, WHITE);
        d.text(10, y + 1, label, BLACK, WHITE);
      } else {
        d.text(10, y + 1, label, WHITE);
      }
    }

    // Summary at bottom
    const totalMutes = slotMutes.size;
    const summary = `${patternOrder.length} pos${totalMutes > 0 ? ` · ${totalMutes} muted` : ''}`;
    d.text(4, contentY + visibleRows * rowH + 2, summary, WHITE);
  }

  // ── Right: pattern detail + mute grid ──────────────────────────────────

  private renderPatternDetail(d: MK2Display): void {
    const { W, WHITE, BLACK } = MK2Display;
    const state = useTrackerStore.getState();
    const transport = useTransportStore.getState();
    const { patternOrder, currentPositionIndex, patterns, slotMutes } = state;

    const patIdx = patternOrder[currentPositionIndex] ?? transport.currentPatternIndex;
    const pat = patterns[patIdx];

    if (!pat) {
      d.text(4, 20, 'NO PATTERN', WHITE);
      return;
    }

    // Header
    d.fillRect(0, 0, W, 10, WHITE);
    d.text(2, 2, `POS ${currentPositionIndex} \u2192 PAT ${patIdx}`, BLACK, WHITE);

    // Pattern info
    const numCh = pat.channels.length;
    let mutedSlots = 0;
    for (let ch = 0; ch < numCh; ch++) {
      if (slotMutes.has(`${currentPositionIndex}:${ch}`)) mutedSlots++;
    }

    const rows = [
      ['Name', (pat.name || 'Untitled').substring(0, 14)],
      ['Length', `${pat.length} rows`],
      ['Channels', `${numCh}${mutedSlots > 0 ? ` (${mutedSlots} muted)` : ''}`],
      ['BPM', `${pat.bpm || transport.bpm}`],
      ['Row', `${transport.currentRow}/${pat.length}`],
    ];

    for (let i = 0; i < rows.length; i++) {
      const y = 14 + i * 10;
      d.text(4, y, rows[i][0], WHITE);
      d.textRight(0, y, W - 4, rows[i][1], WHITE);
    }
  }
}
