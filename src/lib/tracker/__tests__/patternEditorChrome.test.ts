import { describe, it, expect } from 'vitest';
import { recordModeBorderClass } from '../patternEditorChrome';

/**
 * LOW: FT2 frames the pattern view in red while edit (record) mode is active.
 * DEViLBOX previously only showed a toolbar dot, so it was easy to type into the
 * grid without noticing edits were being written. The border class is the single
 * source of truth for that framing.
 */
describe('recordModeBorderClass (LOW: record-mode framing)', () => {
  it('returns the red inset ring while recording', () => {
    expect(recordModeBorderClass(true)).toBe('ring-1 ring-inset ring-accent-error');
  });

  it('returns no class while not recording so layout is unchanged', () => {
    expect(recordModeBorderClass(false)).toBe('');
  });

  it('uses the error accent token, never a hardcoded colour', () => {
    // Guards against regressing to a raw Tailwind colour like ring-red-500.
    const cls = recordModeBorderClass(true);
    expect(cls).toContain('ring-accent-error');
    expect(cls).not.toMatch(/red-\d/);
  });
});
