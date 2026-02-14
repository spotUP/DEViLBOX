import { describe, it, expect } from 'vitest';
import { KeyComboFormatter } from '../KeyComboFormatter';
import { NormalizedKeyEvent } from '../types';

describe('KeyComboFormatter', () => {
  it('formats single key', () => {
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

  it('formats Ctrl+Shift+key', () => {
    const event: NormalizedKeyEvent = {
      key: 'f',
      ctrl: true,
      alt: false,
      shift: true,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('Ctrl+Shift+F');
  });

  it('formats Ctrl+Alt+key', () => {
    const event: NormalizedKeyEvent = {
      key: 'x',
      ctrl: true,
      alt: true,
      shift: false,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('Ctrl+Alt+X');
  });

  it('uses Cmd instead of Ctrl on Mac when meta is true', () => {
    const event: NormalizedKeyEvent = {
      key: 'c',
      ctrl: true,
      alt: false,
      shift: false,
      meta: true,
    };
    expect(KeyComboFormatter.format(event, true)).toBe('Cmd+C');
  });

  it('preserves special key names', () => {
    const event: NormalizedKeyEvent = {
      key: 'Enter',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('Enter');
  });
});
