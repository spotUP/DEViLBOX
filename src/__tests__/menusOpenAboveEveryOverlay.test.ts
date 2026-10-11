/**
 * Owner 2026-10-11: "the style list in the style: dropdown renders behind the
 * auto dj dialog", "i cant select anything in the beat juggle select". Menus
 * opened at z-index 100; the Auto DJ panel sits at 99989 over a click-catching
 * backdrop at 99988, so every select inside it opened behind both.
 * An open menu must be the topmost layer, above any overlay in the app.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MENU_Z_INDEX } from '@/components/common/ContextMenu';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sources(p);
    return /\.(tsx?|css)$/.test(name) ? [p] : [];
  });
}

describe('an open menu', () => {
  it('opens above every overlay the app declares', () => {
    let highest = 0;
    let where = '';
    for (const file of sources(join(process.cwd(), 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/z-\[(\d+)\]|zIndex:\s*(\d+)|zIndex=\{(\d+)\}/g)) {
        const z = Number(m[1] ?? m[2] ?? m[3]);
        if (z > highest && z !== MENU_Z_INDEX) { highest = z; where = file; }
      }
    }
    expect(MENU_Z_INDEX, `an overlay at z ${highest} (${where}) covers open menus`).toBeGreaterThan(highest);
  });
});
