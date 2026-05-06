/**
 * MixerScreen — MK2 display for mixer mode.
 *
 * Left screen:  8 channel level meters with names
 * Right screen: Selected channel detail (volume, pan, mute, solo)
 *
 * Activated by the Control button.
 */

import { MK2Display } from '../MK2Display';
import type { MK2Screen, MK2ScreenContext } from './MK2ScreenManager';
import { useTrackerStore } from '@/stores/useTrackerStore';

export class MixerScreen implements MK2Screen {

  render(left: MK2Display, right: MK2Display, ctx: MK2ScreenContext): void {
    this.renderChannelMeters(left, ctx.selectedChannel);
    this.renderChannelDetail(right, ctx.selectedChannel);
  }

  softLabels(): string[] {
    // Soft buttons: channels 1-8
    return ['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'CH8'];
  }

  private renderChannelMeters(d: MK2Display, selectedCh: number): void {
    const { W, WHITE, BLACK } = MK2Display;
    const state = useTrackerStore.getState();
    const pattern = state.patterns[state.currentPatternIndex];
    if (!pattern) return;

    const numCh = Math.min(pattern.channels.length, 8);
    const contentY = 10; // below soft labels
    const contentH = 64 - 10 - 8; // above transport bar
    const slotW = Math.floor(W / 8);

    for (let i = 0; i < numCh; i++) {
      const ch = pattern.channels[i];
      const x = i * slotW;

      // Channel number
      const label = `${i + 1}`;
      d.text(x + Math.floor((slotW - label.length * 6) / 2), contentY, label, WHITE);

      // Volume bar (vertical)
      const barX = x + 4;
      const barW = slotW - 8;
      const barH = contentH - 12;
      const barY = contentY + 10;
      const vol = (ch.volume ?? 80) / 100;

      d.rect(barX, barY, barW, barH, WHITE);
      const filled = Math.round(vol * (barH - 2));
      if (filled > 0) {
        d.fillRect(barX + 1, barY + barH - 1 - filled, barW - 2, filled, WHITE);
      }

      // Selection indicator
      if (i === selectedCh) {
        d.hline(x, contentY + contentH - 1, slotW, WHITE);
      }

      // Mute indicator
      if (ch.muted) {
        d.text(x + 2, barY + Math.floor(barH / 2) - 3, 'M', BLACK, WHITE);
      }
    }
  }

  private renderChannelDetail(d: MK2Display, selectedCh: number): void {
    const { W, WHITE, BLACK } = MK2Display;
    const state = useTrackerStore.getState();
    const pattern = state.patterns[state.currentPatternIndex];
    if (!pattern) return;

    const ch = pattern.channels[selectedCh];
    if (!ch) {
      d.text(4, 20, 'NO CHANNEL', WHITE);
      return;
    }

    // Header
    d.fillRect(0, 0, W, 10, WHITE);
    d.text(2, 2, `CHANNEL ${selectedCh + 1}`, BLACK, WHITE);

    // Volume
    const vol = (ch.volume ?? 80) / 100;
    d.text(4, 14, 'Volume', WHITE);
    d.rect(80, 14, W - 84, 6, WHITE);
    const volFill = Math.round(vol * (W - 86));
    if (volFill > 0) d.fillRect(81, 15, volFill, 4, WHITE);
    d.text(4, 23, `${Math.round(vol * 100)}%`, WHITE);

    // Pan
    const pan = (ch.pan ?? 0) / 100;
    d.text(4, 34, 'Pan', WHITE);
    const panBarW = W - 84;
    const panBarX = 80;
    d.rect(panBarX, 34, panBarW, 6, WHITE);
    const panCenter = panBarX + Math.floor(panBarW / 2);
    const panOffset = Math.round(pan * (panBarW / 2 - 1));
    if (panOffset > 0) {
      d.fillRect(panCenter, 35, panOffset, 4, WHITE);
    } else if (panOffset < 0) {
      d.fillRect(panCenter + panOffset, 35, -panOffset, 4, WHITE);
    } else {
      d.vline(panCenter, 35, 4, WHITE);
    }
    d.text(4, 43, pan === 0 ? 'Center' : pan > 0 ? `R${Math.round(pan * 100)}` : `L${Math.round(-pan * 100)}`, WHITE);

    // Mute/Solo status
    d.text(4, 54, ch.muted ? '[MUTED]' : ch.solo ? '[SOLO]' : '', WHITE);
  }
}
