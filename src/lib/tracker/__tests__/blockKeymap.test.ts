import { describe, it, expect } from 'vitest';
import { resolveFt2BlockKey, type BlockKeyInput } from '../blockKeymap';

const base: BlockKeyInput = {
  key: 't',
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  isIT: false,
};

describe('resolveFt2BlockKey — FT2 Alt block shortcuts', () => {
  it('Alt+T transposes up (+1)', () => {
    expect(resolveFt2BlockKey({ ...base, key: 't', shiftKey: false }))
      .toEqual({ kind: 'transpose', semitones: 1 });
  });

  // Regression: this branch was previously UNREACHABLE because the Alt+T case
  // did not exclude Shift. Alt+Shift+T must reach transpose-down.
  it('Alt+Shift+T transposes down (-1) — the formerly dead branch', () => {
    expect(resolveFt2BlockKey({ ...base, key: 't', shiftKey: true }))
      .toEqual({ kind: 'transpose', semitones: -1 });
  });

  it('maps mark/copy/paste/cut/reverse', () => {
    expect(resolveFt2BlockKey({ ...base, key: 'b' })).toEqual({ kind: 'markStart' });
    expect(resolveFt2BlockKey({ ...base, key: 'e' })).toEqual({ kind: 'markEnd' });
    expect(resolveFt2BlockKey({ ...base, key: 'c' })).toEqual({ kind: 'copy' });
    expect(resolveFt2BlockKey({ ...base, key: 'v' })).toEqual({ kind: 'paste' });
    expect(resolveFt2BlockKey({ ...base, key: 'p' })).toEqual({ kind: 'paste' });
    expect(resolveFt2BlockKey({ ...base, key: 'x' })).toEqual({ kind: 'cut' });
    expect(resolveFt2BlockKey({ ...base, key: 'r' })).toEqual({ kind: 'reverse' });
  });

  it('is suppressed in IT mode (IT owns its own Alt map)', () => {
    expect(resolveFt2BlockKey({ ...base, key: 'c', isIT: true })).toBeNull();
    expect(resolveFt2BlockKey({ ...base, key: 't', isIT: true })).toBeNull();
  });

  it('requires Alt and rejects Ctrl/Meta', () => {
    expect(resolveFt2BlockKey({ ...base, key: 'c', altKey: false })).toBeNull();
    expect(resolveFt2BlockKey({ ...base, key: 'c', ctrlKey: true })).toBeNull();
    expect(resolveFt2BlockKey({ ...base, key: 'c', metaKey: true })).toBeNull();
  });

  it('rejects Shift on non-transpose keys (Shift is reserved elsewhere)', () => {
    expect(resolveFt2BlockKey({ ...base, key: 'c', shiftKey: true })).toBeNull();
    expect(resolveFt2BlockKey({ ...base, key: 'r', shiftKey: true })).toBeNull();
  });

  it('returns null for unmapped keys (e.g. Alt+D duplicate is not an FT2 keyboard op)', () => {
    expect(resolveFt2BlockKey({ ...base, key: 'd' })).toBeNull();
    expect(resolveFt2BlockKey({ ...base, key: 'q' })).toBeNull();
  });
});
