/**
 * Typing in the jukebox filter played notes: the filter is typed straight into
 * the song list (a div, not an <input>), and the note-entry, shortcut and
 * router checks each had their own list of text fields without it. One shared
 * check now covers fields and any surface marked data-captures-typing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isTextEntryTarget } from '../isTextEntryTarget';

describe('typing does not play notes', () => {
  it('a surface marked data-captures-typing, and anything inside it, is a text-entry target', () => {
    const list = document.createElement('div');
    list.setAttribute('data-captures-typing', '');
    const row = document.createElement('span');
    list.appendChild(row);
    expect(isTextEntryTarget(list)).toBe(true);
    expect(isTextEntryTarget(row)).toBe(true);
  });

  it('native fields still count, plain elements do not', () => {
    expect(isTextEntryTarget(document.createElement('input'))).toBe(true);
    expect(isTextEntryTarget(document.createElement('textarea'))).toBe(true);
    expect(isTextEntryTarget(document.createElement('div'))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });

  it('a focused slider or checkbox is not a text field, so tracker keys still reach the tracker', () => {
    // A clicked master volume slider kept focus; PageDown/arrows meant for the
    // pattern went to the slider and pulled the master down to -36 dB.
    for (const type of ['range', 'checkbox', 'radio', 'button', 'color']) {
      const el = document.createElement('input');
      el.type = type;
      expect(isTextEntryTarget(el), type).toBe(false);
    }
    for (const type of ['text', 'number', 'search']) {
      const el = document.createElement('input');
      el.type = type;
      expect(isTextEntryTarget(el), type).toBe(true);
    }
  });

  it('the jukebox list is marked, and note entry uses the shared check', () => {
    const root = join(__dirname, '../../../..');
    expect(readFileSync(join(root, 'src/components/jukebox/JukeboxPanel.tsx'), 'utf8')).toContain('data-captures-typing');
    for (const f of ['src/hooks/tracker/useTrackerInput.ts', 'src/hooks/useGlobalKeyboardHandler.ts', 'src/engine/keyboard/KeyboardRouter.ts']) {
      expect(readFileSync(join(root, f), 'utf8'), f).toContain('isTextEntryTarget(');
    }
  });
});
