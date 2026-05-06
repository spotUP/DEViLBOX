/**
 * BrowseScreen — MK2 display for file/instrument browsing.
 *
 * Left screen:  Scrollable list of instruments
 * Right screen: Selected instrument detail (synth type, name)
 *
 * Activated by the Browse button.
 * Encoder scrolls the list, push confirms/loads.
 */

import { MK2Display } from '../MK2Display';
import type { MK2Screen, MK2ScreenContext } from './MK2ScreenManager';
import { useInstrumentStore } from '@/stores/useInstrumentStore';

export class BrowseScreen implements MK2Screen {

  render(left: MK2Display, right: MK2Display, ctx: MK2ScreenContext): void {
    this.renderInstrumentList(left, ctx.browseScrollPos);
    this.renderDetail(right, ctx.browseScrollPos);
  }

  softLabels(): string[] {
    return ['INST', 'FILE', '', '', '', '', '', 'LOAD'];
  }

  private renderInstrumentList(d: MK2Display, scrollPos: number): void {
    const { W, WHITE, BLACK } = MK2Display;
    const instruments = useInstrumentStore.getState().instruments;

    const contentY = 10;
    const rowH = 8;
    const visibleRows = 6; // fits in content area

    for (let i = 0; i < visibleRows; i++) {
      const idx = scrollPos + i;
      if (idx >= instruments.length) break;

      const inst = instruments[idx];
      const y = contentY + i * rowH;
      const isSelected = idx === scrollPos; // first visible = cursor for now

      if (isSelected) {
        d.fillRect(0, y, W, rowH, WHITE);
        d.text(2, y + 1, `${inst.id}`.padStart(2, '0'), BLACK, WHITE);
        d.text(20, y + 1, inst.name.substring(0, 18), BLACK, WHITE);
      } else {
        d.text(2, y + 1, `${inst.id}`.padStart(2, '0'), WHITE);
        d.text(20, y + 1, inst.name.substring(0, 18), WHITE);
      }
    }

    // Scrollbar
    if (instruments.length > visibleRows) {
      const barH = Math.max(4, Math.round((visibleRows / instruments.length) * (visibleRows * rowH)));
      const barY = contentY + Math.round((scrollPos / Math.max(1, instruments.length - visibleRows)) * (visibleRows * rowH - barH));
      d.fillRect(W - 3, barY, 2, barH, WHITE);
    }
  }

  private renderDetail(d: MK2Display, scrollPos: number): void {
    const { W, WHITE, BLACK } = MK2Display;
    const instruments = useInstrumentStore.getState().instruments;
    const inst = instruments[scrollPos];

    if (!inst) {
      d.text(4, 20, 'NO INSTRUMENTS', WHITE);
      return;
    }

    // Header
    d.fillRect(0, 0, W, 10, WHITE);
    d.text(2, 2, 'BROWSE', BLACK, WHITE);

    // Instrument details
    d.text(4, 14, inst.name.substring(0, 20), WHITE, BLACK, 2);
    d.text(4, 34, `Type: ${inst.synthType}`, WHITE);
    d.text(4, 44, `ID: ${inst.id}`, WHITE);

    if (inst.sample?.url) {
      d.text(4, 54, 'Has sample', WHITE);
    }
  }
}
