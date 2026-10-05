/**
 * Formats whose engine runs the tune's own player program have nothing to
 * edit and open in the scope view (editor mode 'sc68'), each labelled as
 * itself (owner, 2026-10-05). ASAP, AY and QSF opened as an empty classic
 * grid; the scope view called every one of them "SC68".
 */
import { describe, it, expect } from 'vitest';
import { useFormatStore } from '@/stores/useFormatStore';
import { scopeFormatLabel } from '@/lib/tracker/scopeFormatLabel';

const bytes = () => new ArrayBuffer(16);

describe('player-program formats open in the scope view', () => {
  for (const [field, format] of [
    ['sndhFileData', 'SNDH'], ['sc68FileData', 'SC68'], ['asapFileData', 'SAP'],
    ['ayFileData', 'AY'], ['qsfFileData', 'QSF'],
  ] as const) {
    it(`${format}: scope view, labelled ${format}`, () => {
      useFormatStore.getState().applyEditorMode({ [field]: bytes() });
      const st = useFormatStore.getState();
      expect(st.editorMode).toBe('sc68');
      expect(scopeFormatLabel(st)?.format).toBe(format);
    });
  }

  it('a plain module stays in the classic grid', () => {
    useFormatStore.getState().applyEditorMode({});
    expect(useFormatStore.getState().editorMode).toBe('classic');
    expect(scopeFormatLabel(useFormatStore.getState())).toBeNull();
  });
});
