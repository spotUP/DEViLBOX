/**
 * SongScreen — MK2 display for song/arrangement mode.
 *
 * Left screen:  Song position with pattern chain overview
 * Right screen: Current pattern detail (length, channels, BPM)
 *
 * Activated by the Navigate button.
 */

import { MK2Display } from '../MK2Display';
import type { MK2Screen, MK2ScreenContext } from './MK2ScreenManager';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';

export class SongScreen implements MK2Screen {

  render(left: MK2Display, right: MK2Display, _ctx: MK2ScreenContext): void {
    this.renderPatternChain(left);
    this.renderPatternDetail(right);
  }

  softLabels(): string[] {
    return ['<PAT', 'PAT>', '', '', '', '', 'ADD', 'DEL'];
  }

  private renderPatternChain(d: MK2Display): void {
    const { W, WHITE, BLACK } = MK2Display;
    const state = useTrackerStore.getState();
    const transport = useTransportStore.getState();
    const currentPat = transport.currentPatternIndex;

    const contentY = 10;
    const rowH = 8;
    const visibleRows = 6;

    // Center current pattern in view
    const startIdx = Math.max(0, currentPat - Math.floor(visibleRows / 2));

    for (let i = 0; i < visibleRows; i++) {
      const idx = startIdx + i;
      if (idx >= state.patterns.length) break;

      const pat = state.patterns[idx];
      const y = contentY + i * rowH;
      const isCurrent = idx === currentPat;

      const label = `${String(idx).padStart(2, '0')} ${pat.name || `Pattern ${idx}`}`.substring(0, 30);

      if (isCurrent) {
        d.fillRect(0, y, W, rowH, WHITE);
        d.text(2, y + 1, '>', BLACK, WHITE);
        d.text(10, y + 1, label, BLACK, WHITE);
      } else {
        d.text(2, y + 1, ' ', WHITE);
        d.text(10, y + 1, label, WHITE);
      }
    }

    // Pattern count at bottom
    d.text(4, contentY + visibleRows * rowH + 2, `${state.patterns.length} patterns`, WHITE);
  }

  private renderPatternDetail(d: MK2Display): void {
    const { W, WHITE, BLACK } = MK2Display;
    const state = useTrackerStore.getState();
    const transport = useTransportStore.getState();
    const pat = state.patterns[transport.currentPatternIndex];

    if (!pat) {
      d.text(4, 20, 'NO PATTERN', WHITE);
      return;
    }

    // Header
    d.fillRect(0, 0, W, 10, WHITE);
    d.text(2, 2, `PATTERN ${transport.currentPatternIndex}`, BLACK, WHITE);

    // Pattern info
    const rows = [
      ['Name', (pat.name || 'Untitled').substring(0, 14)],
      ['Length', `${pat.length} rows`],
      ['Channels', `${pat.channels.length}`],
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
