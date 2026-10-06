/**
 * The synth editors' module panels lost their translucency: the panel
 * background was the opaque darkened brand colour, so the editor background
 * no longer showed through (owner, on the Fred Editor synth modules).
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInstrumentColors } from '../useInstrumentColors';

describe('synth module panels', () => {
  it('paint a translucent wash of the accent, not an opaque colour', () => {
    const { result } = renderHook(() => useInstrumentColors('#ff8800'));
    const bg = String(result.current.panelStyle.backgroundColor);
    expect(bg).toMatch(/^#[0-9a-f]{8}$/i);
    expect(parseInt(bg.slice(7, 9), 16)).toBeLessThan(0x40);
  });
});
