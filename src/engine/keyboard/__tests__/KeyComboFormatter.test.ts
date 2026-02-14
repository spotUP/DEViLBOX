import { describe, it, expect } from 'vitest';
import { KeyComboFormatter } from '../KeyComboFormatter';
import type { NormalizedKeyEvent } from '../types';

describe('KeyComboFormatter', () => {
  it('formats simple key', () => {
    const event: NormalizedKeyEvent = {
      key: 'a',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('A');
  });

  it('formats Ctrl+key', () => {
    const event: NormalizedKeyEvent = {
      key: 'c',
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('Ctrl+C');
  });

  it('formats Alt+key', () => {
    const event: NormalizedKeyEvent = {
      key: 's',
      ctrl: false,
      alt: true,
      shift: false,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('Alt+S');
  });

  it('formats Shift+key', () => {
    const event: NormalizedKeyEvent = {
      key: 'F5',
      ctrl: false,
      alt: false,
      shift: true,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('Shift+F5');
  });

  it('formats complex combo Ctrl+Shift+Alt+key', () => {
    const event: NormalizedKeyEvent = {
      key: 'Delete',
      ctrl: true,
      alt: true,
      shift: true,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('Ctrl+Shift+Alt+Delete');
  });

  it('normalizes key names', () => {
    const event: NormalizedKeyEvent = {
      key: ' ',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('Space');
  });

  it('handles ArrowUp, ArrowDown, etc.', () => {
    const event: NormalizedKeyEvent = {
      key: 'ArrowUp',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('ArrowUp');
  });
});
