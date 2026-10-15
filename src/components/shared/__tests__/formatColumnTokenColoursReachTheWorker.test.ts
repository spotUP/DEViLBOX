/**
 * FORMAT-COLUMN-TOKEN-COLOURS: a ColumnDef colour given as a design token (`var(--color-accent-primary)`) reached
 * the worker as neutral gray, because the spec converter only parsed hex. toColumnSpec is the one place column
 * specs are handed to the worker; it resolves tokens to their concrete value there.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { toColumnSpec, type ColumnDef } from '../format-editor-types';

const col = (color: string, emptyColor: string): ColumnDef => ({ key: 'cmd', label: 'Command', charWidth: 4, type: 'hex', color, emptyColor });
const rgb = (hex: number[]): number[] => hex.map((v) => v / 255);

afterEach(() => {
  document.documentElement.style.removeProperty('--color-test-token-a');
});

describe('format column colours', () => {
  it('renders a design-token colour as the token value, not gray', () => {
    document.documentElement.style.setProperty('--color-test-token-a', '#10b981');
    const spec = toColumnSpec(col('var(--color-test-token-a)', '#102030'));
    expect(spec.color).toEqual([...rgb([0x10, 0xb9, 0x81]), 1]);
    expect(spec.emptyColor).toEqual([...rgb([0x10, 0x20, 0x30]), 1]);
  });

  it('still reads hex colours and falls back to the resolver gray for an unreadable variable', () => {
    expect(toColumnSpec(col('#ff0000', '#00ff00')).color).toEqual([1, 0, 0, 1]);
    expect(toColumnSpec(col('var(--color-test-token-missing)', '#00ff00')).color).toEqual([...rgb([0x9c, 0xa3, 0xaf]), 1]);
  });
});
