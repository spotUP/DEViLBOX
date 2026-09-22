import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Phase 2 of thoughts/shared/plans/2026-09-22-responsive-mobile.md.
 *
 * A drag surface that only listens for `onMouseDown` works with a finger only
 * by accident, through the browser's mouse-event compatibility layer, which
 * fires after a delay, does not fire at all once the page starts scrolling,
 * and never sends the `pointercancel` that tells a held control to let go.
 *
 * `src/components/controls/Fader.tsx` is the reference shape: element-level
 * `onPointerDown`/`Move`/`Up`/`Cancel`, `setPointerCapture`, and
 * `touchAction: 'none'`.
 *
 * This is a RATCHET. The allowlist below is the set of files that still listen
 * for the mouse alone; it may only ever shrink. It started at 43 files and is
 * now empty, so the ratchet is fully closed: any file that reintroduces a
 * mouse-only drag surface fails here.
 */

const ROOT = process.cwd();

/** Files that still have no pointer or touch path. */
const MOUSE_ONLY_ALLOWLIST: readonly string[] = [
  // Empty. Phase 2 converted all 43 files that were on it. A new entry here
  // means a drag surface shipped without a touch path — write it on the
  // pointer shape instead.
];

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function mouseOnlyFiles(): string[] {
  const found: string[] = [];
  for (const file of collectSourceFiles(join(ROOT, 'src'))) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('onMouseDown')) continue;
    if (source.includes('onPointerDown') || source.includes('onTouchStart')) continue;
    found.push(relative(ROOT, file).split(sep).join('/'));
  }
  return found.sort();
}

describe('drag surfaces listen for a pointer, not only a mouse', () => {
  it('no file outside the shrinking allowlist is mouse-only', () => {
    const offenders = mouseOnlyFiles().filter((f) => !MOUSE_ONLY_ALLOWLIST.includes(f));
    expect(
      offenders,
      'A drag surface listens for onMouseDown with no pointer or touch path. ' +
        'On a touchscreen it then depends on the browser\'s mouse-compatibility ' +
        'events, which arrive late, stop once the page scrolls, and never send ' +
        'pointercancel. Copy the shape in src/components/controls/Fader.tsx:\n' +
        offenders.join('\n')
    ).toEqual([]);
  });

  it('the allowlist has no stale entries — a converted file must be removed from it', () => {
    const stillMouseOnly = new Set(mouseOnlyFiles());
    const stale = MOUSE_ONLY_ALLOWLIST.filter((f) => !stillMouseOnly.has(f));
    expect(
      stale,
      'These files were converted (or deleted) but are still on the allowlist. ' +
        'The ratchet only works if it tightens:\n' + stale.join('\n')
    ).toEqual([]);
  });

  it('the reference implementations stay on the pointer shape', () => {
    for (const ref of [
      'src/components/controls/Fader.tsx',
      'src/components/controls/Knob.tsx',
      'src/components/transport/DJPitchSlider.tsx',
      'src/components/dj/DeckPitchSlider.tsx',
    ]) {
      const source = readFileSync(join(ROOT, ref), 'utf8');
      expect(source, `${ref} lost onPointerDown`).toContain('onPointerDown');
      expect(source, `${ref} lost pointer capture`).toContain('setPointerCapture');
      expect(source, `${ref} lost its pointercancel release`).toContain('onPointerCancel');
      expect(source, `${ref} lost touchAction: none`).toContain("touchAction: 'none'");
      expect(source, `${ref} went back to onMouseDown`).not.toContain('onMouseDown={');
    }
  });
});
