/**
 * P14f: the format editors have ONE cursor and a keyboard that needs no focus (owner 2026-10-07, amanda.ahx).
 *
 *  - after clicking the REC button, keys write a note at the shared cursor (before: the canvas took keys only when focused)
 *  - Tab moves the cursor channel the canvas draws (before: the window handler moved the tracker store while the canvas
 *    kept its own cursor)
 *  - the same in a second canvas mode, and text inputs still capture typing
 *  - the window handler leaves the cursor keys to the format keyboard in every canvas-owned mode
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useCursorStore } from '@stores/useCursorStore';
import { useEditorStore } from '@stores/useEditorStore';
import { attachFormatKeyboard, type FormatKeyHost, type FormatCursor, type FormatSelection } from '@/components/tracker/formatKeyboard';
import { formatModeOwnsEditKey, ENTRY_OWNER } from '@/lib/tracker/formatModeKeyOwnership';
import { HIVELY_COLUMNS } from '@/components/hively/hivelyAdapter';
import { KLYS_COLUMNS } from '@/components/klystrack/klysAdapter';
import type { ColumnDef, FormatChannel } from '@/components/shared/format-editor-types';

interface Written { ch: number; row: number; key: string; value: number }

function makeHost(columns: ColumnDef[]): { host: FormatKeyHost; written: Written[] } {
  const written: Written[] = [];
  const channels: FormatChannel[] = [0, 1, 2].map((i) => ({ label: `CH${i}`, patternLength: 16, rows: [] }));
  let selection: FormatSelection | null = null;
  const host: FormatKeyHost = {
    columns, channels,
    isPlaying: () => false,
    playbackRow: () => 0,
    // the canvas reads and writes the same store the window handler does
    getCursor: (): FormatCursor => {
      const c = useCursorStore.getState().cursor;
      return { channelIndex: c.channelIndex, rowIndex: c.rowIndex, columnIndex: c.formatColumnIndex ?? 0 };
    },
    setCursor: (u) => useCursorStore.getState().setFormatCursor(u(host.getCursor())),
    getSelection: () => selection,
    setSelection: (n) => { selection = typeof n === 'function' ? n(selection) : n; },
    onCellChange: (ch, row, key, value) => { written.push({ ch, row, key, value }); },
    copy: () => {}, clearSelection: () => {}, paste: () => {}, transpose: () => {},
    hexTyped: { current: null }, heldArrow: { current: null }, arrowRaf: { current: 0 },
  };
  return { host, written };
}

const press = (target: Element, key: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

let detach: () => void = () => {};
let recButton: HTMLButtonElement;

beforeEach(() => {
  useCursorStore.getState().setFormatCursor({ channelIndex: 0, rowIndex: 0, columnIndex: 0 });
  useEditorStore.setState({ recordMode: true, editStep: 1, currentOctave: 3 });
  recButton = document.createElement('button');
  document.body.appendChild(recButton);
});
afterEach(() => { detach(); recButton.remove(); document.body.innerHTML = ''; });

for (const [mode, columns] of [['hively', HIVELY_COLUMNS], ['klystrack', KLYS_COLUMNS]] as const) {
  describe(`${mode} canvas`, () => {
    it('after clicking REC a typed note is written at the shared cursor, with no click on the grid', () => {
      const { host, written } = makeHost(columns);
      detach = attachFormatKeyboard(() => host);
      useCursorStore.getState().setFormatCursor({ channelIndex: 1, rowIndex: 3, columnIndex: 0 });
      recButton.click();
      recButton.focus();
      expect(document.activeElement).toBe(recButton);
      press(recButton, 'z');
      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({ ch: 1, row: 3 });
      // edit step moved the ONE cursor, which the window handler and the canvas both read
      expect(useCursorStore.getState().cursor.rowIndex).toBe(4);
    });

    it('Tab before the grid is clicked moves the cursor channel the canvas draws', () => {
      const { host } = makeHost(columns);
      detach = attachFormatKeyboard(() => host);
      press(recButton, 'Tab');
      expect(host.getCursor().channelIndex).toBe(1);
      press(recButton, 'Tab');
      expect(useCursorStore.getState().cursor.channelIndex).toBe(2);
      press(recButton, 'Tab');
      expect(host.getCursor().channelIndex).toBe(2); // clamped to the format's own channels
    });

    it('typing in a text input still goes to the input, not the song', () => {
      const { host, written } = makeHost(columns);
      detach = attachFormatKeyboard(() => host);
      const input = document.createElement('input');
      document.body.appendChild(input);
      press(input, 'z');
      press(input, 'Tab');
      const marked = document.createElement('div');
      marked.setAttribute('data-captures-typing', '');
      document.body.appendChild(marked);
      press(marked, 'z');
      expect(written).toHaveLength(0);
      expect(host.getCursor().channelIndex).toBe(0);
    });
  });
}

describe('the window handler leaves the cursor keys to the format keyboard', () => {
  it('in every canvas-owned mode, and not in classic', () => {
    const k = (key: string) => ({ key, ctrlOrMeta: false, shift: false, alt: false });
    const canvasModes = Object.entries(ENTRY_OWNER).filter(([, o]) => o === 'canvas').map(([m]) => m);
    expect(canvasModes.length).toBe(7);
    for (const m of canvasModes) {
      for (const key of ['Tab', 'ArrowDown', 'ArrowLeft', 'PageDown', 'Home']) expect(formatModeOwnsEditKey(m, k(key)), `${m} ${key}`).toBe(true);
      expect(formatModeOwnsEditKey(m, k('z')), `${m} note key stays a jam`).toBe(false);
    }
    expect(formatModeOwnsEditKey('classic', k('Tab'))).toBe(false);
    expect(formatModeOwnsEditKey('tfmx', k('Tab'))).toBe(false);
  });
});
