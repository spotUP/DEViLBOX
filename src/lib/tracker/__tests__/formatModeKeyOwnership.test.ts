import { describe, it, expect } from 'vitest';
import {
  formatModeOwnsEditKey,
  type FormatKeyDescriptor,
} from '../formatModeKeyOwnership';

const key = (
  k: string,
  mods: Partial<Omit<FormatKeyDescriptor, 'key'>> = {},
): FormatKeyDescriptor => ({
  key: k,
  ctrlOrMeta: false,
  shift: false,
  alt: false,
  ...mods,
});

/**
 * LOW: in a non-classic (format) editor mode the format handler owns the
 * clipboard/history keys but only preventDefaults — the event still reaches the
 * classic window handler in useTrackerInput. Without delegation, Ctrl+C/X/V/A
 * and F3/F4/F5 mutated the tracker store a second time (double paste / stray
 * cut). This decider is the single delegation boundary.
 */
describe('formatModeOwnsEditKey (LOW: format-mode double-handling)', () => {
  it('owns nothing in classic mode — classic handler runs normally', () => {
    expect(formatModeOwnsEditKey('classic', key('c', { ctrlOrMeta: true }))).toBe(false);
    expect(formatModeOwnsEditKey('classic', key('F4'))).toBe(false);
    expect(formatModeOwnsEditKey('classic', key('ArrowUp', { ctrlOrMeta: true }))).toBe(false);
  });

  it('delegates the clipboard chords Ctrl+C/X/V that previously double-fired', () => {
    expect(formatModeOwnsEditKey('hively', key('c', { ctrlOrMeta: true }))).toBe(true);
    expect(formatModeOwnsEditKey('hively', key('x', { ctrlOrMeta: true }))).toBe(true);
    expect(formatModeOwnsEditKey('hively', key('v', { ctrlOrMeta: true }))).toBe(true);
  });

  it('delegates Ctrl+A select-all and the F3/F4/F5 clipboard keys', () => {
    expect(formatModeOwnsEditKey('furnace', key('a', { ctrlOrMeta: true }))).toBe(true);
    expect(formatModeOwnsEditKey('furnace', key('F3'))).toBe(true);
    expect(formatModeOwnsEditKey('furnace', key('F4'))).toBe(true);
    expect(formatModeOwnsEditKey('furnace', key('F5'))).toBe(true);
  });

  it('still delegates the already-handled undo/redo and transpose keys', () => {
    expect(formatModeOwnsEditKey('hively', key('z', { ctrlOrMeta: true }))).toBe(true);
    expect(formatModeOwnsEditKey('hively', key('z', { ctrlOrMeta: true, shift: true }))).toBe(true);
    expect(formatModeOwnsEditKey('hively', key('y', { ctrlOrMeta: true }))).toBe(true);
    expect(formatModeOwnsEditKey('hively', key('ArrowUp', { ctrlOrMeta: true }))).toBe(true);
    expect(formatModeOwnsEditKey('hively', key('ArrowDown', { ctrlOrMeta: true }))).toBe(true);
  });

  it('leaves Ctrl+Shift+C to the classic handler (format handler requires no shift)', () => {
    expect(formatModeOwnsEditKey('hively', key('c', { ctrlOrMeta: true, shift: true }))).toBe(false);
  });

  it('does not delegate an Alt chord — those are not owned', () => {
    expect(formatModeOwnsEditKey('hively', key('c', { ctrlOrMeta: true, alt: true }))).toBe(false);
    expect(formatModeOwnsEditKey('hively', key('z', { ctrlOrMeta: true, alt: true }))).toBe(false);
  });

  it('does not delegate a bare clipboard letter without Ctrl/Cmd (note entry)', () => {
    expect(formatModeOwnsEditKey('hively', key('c'))).toBe(false);
    expect(formatModeOwnsEditKey('hively', key('v'))).toBe(false);
    expect(formatModeOwnsEditKey('hively', key('a'))).toBe(false);
  });
});
