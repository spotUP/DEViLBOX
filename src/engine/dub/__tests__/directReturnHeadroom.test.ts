/**
 * "Dub bus clips and distorts most of the time" (X10), and where it came from.
 *
 * A generated layer that connects straight to `this.return_` bypasses the bus's
 * input clip and its sidechain — whatever gain it is given lands on the output
 * more or less as written. `slamSpring` had TWO such paths, at `target * 2.0`
 * and `target * 1.5`, both starting in the same instant. Measured 2026-09-21 at
 * a master peak of **1.072** against a 0.492 programme baseline: over full
 * scale from one move.
 *
 * It also understates itself. The shang node is fed by BOTH `bp` and `bright`,
 * so their outputs sum into the same gain, and `bright` is a peaking filter at
 * +9 dB. The written multiplier is a floor, not a ceiling.
 *
 * Paths into the SPRING are deliberately not covered: they are bounded by the
 * spring's own wet level and by the tank's response, which is why
 * `shangToSpring` at 3.0 and the kick impulse at 10.0 are fine where the same
 * numbers on a return path would not be.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'DubBus.ts'), 'utf8');

/**
 * Gain nodes that connect to `this.return_`, with the multiplier they were
 * given. Read from the source, because the alternative is firing every move
 * against a live AudioContext and judging by a meter that moves with the song.
 */
function directReturnGains(): Array<{ name: string; factor: number }> {
  const out: Array<{ name: string; factor: number }> = [];
  for (const m of SRC.matchAll(/(\w+)\.gain\.value\s*=\s*[\w.]+\s*\*\s*([0-9.]+)\s*;/g)) {
    const [, name, factor] = m;
    // Only those that reach the output directly.
    if (new RegExp(`${name}\\.connect\\(this\\.return_\\)`).test(SRC)) {
      out.push({ name, factor: Number(factor) });
    }
  }
  return out;
}

describe('nothing reaches the return above unity', () => {
  it('finds the direct-to-return paths at all', () => {
    // Guards against a regex that silently matches nothing and passes.
    expect(directReturnGains().length).toBeGreaterThan(0);
  });

  it('keeps every direct-to-return gain under 1', () => {
    const over = directReturnGains().filter(g => g.factor >= 1);
    expect(over, `over unity: ${over.map(g => `${g.name}=${g.factor}`).join(', ')}`)
      .toEqual([]);
  });

  it('keeps the two slam layers summing below full scale', () => {
    // They start in the same instant, so each one being under unity on its own
    // is not enough — the onset sums.
    const byName = Object.fromEntries(directReturnGains().map(g => [g.name, g.factor]));
    const thump = byName.thumpToReturn;
    const shang = byName.shangToReturn;
    expect(thump, 'thumpToReturn not found').toBeGreaterThan(0);
    expect(shang, 'shangToReturn not found').toBeGreaterThan(0);
    expect(thump + shang).toBeLessThan(1.5);
  });
});
