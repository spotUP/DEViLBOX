import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be
 * removed is not a child of this node" — reported from an iPhone, 2026-09-22,
 * with AutomationParameterPicker at the top of the component stack.
 *
 * The grid container is React's: the visual background, the master dub lane
 * and one `AutomationParameterPicker` per channel are React children of it.
 * The OffscreenCanvas effect also appends a canvas to it imperatively, and on
 * the branch iOS takes it cleared "stale children" with
 * `while (container.firstChild) container.removeChild(container.firstChild)`.
 * That took React's nodes too, and the next unmount crashed the app.
 *
 * The effect may only remove what it created.
 */
const SRC = readFileSync(join(process.cwd(), 'src/components/tracker/PatternEditorCanvas.tsx'), 'utf-8');

describe('the imperative canvas only removes its own nodes', () => {
  it('never wipes every child of the container React renders into', () => {
    expect(SRC).not.toContain('while (container.firstChild)');
    expect(SRC).not.toMatch(/container\.removeChild\(container\.firstChild\)/);
  });

  it('removes exactly the canvases it tagged as its own', () => {
    expect(SRC).toContain("container.querySelectorAll('canvas[data-imperative-canvas]')");
  });

  it('every imperatively created canvas carries that tag', () => {
    const created = SRC.match(/document\.createElement\('canvas'\)/g) ?? [];
    const tagged = SRC.match(/canvas\.dataset\.imperativeCanvas = ''/g) ?? [];
    expect(
      tagged.length,
      'An untagged imperative canvas is invisible to the cleanup and will be ' +
        'left behind, stacking one canvas per effect run.'
    ).toBe(created.length);
  });
});
