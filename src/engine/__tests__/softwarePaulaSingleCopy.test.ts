/**
 * Every software-Paula replayer builds the ONE Paula in
 * tools/asm68k-to-c/runtime/paula_soft.c.
 *
 * There used to be fourteen engine-local copies with five behaviours: some
 * applied AUDxLC/AUDxLEN writes at once (PumaTracker started a sample, wrote
 * its LEN=1 silent repeat, and every note was cut to 2 bytes), some never
 * looped, some restarted a running channel on every DMACON set. A fix landed
 * in one copy and the rest kept the bug. This pins the single copy: no engine
 * directory carries a paula_soft.c/.h, and every CMake build that compiles a
 * Paula compiles the runtime's.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './workletHarness';

const tracked = execFileSync('git', ['ls-files', '--', ':(glob)*-wasm/**'], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 256 << 20,
}).split('\n');
const engineDirs = (f: string) => /^[^/]+-wasm\//.test(f);

describe('software Paula has one source', () => {
  it('no engine directory carries its own paula_soft.c or paula_soft.h', () => {
    expect(tracked.filter((f) => engineDirs(f) && /(^|\/)paula_soft\.[ch]$/.test(f))).toEqual([]);
  });

  it('every engine CMake that builds a Paula builds the runtime one', () => {
    const cmakes = [
      ...tracked.filter((f) => engineDirs(f) && /CMakeLists[^/]*\.txt$/.test(f) && !f.includes('/build')),
      // the shared 68000 host: StoneTracker and every eagleplayer format
      'musashi-host/MusashiHost.cmake',
    ];
    const building = cmakes.filter((f) => readFileSync(resolve(ROOT, f), 'utf8').includes('paula_soft.c'));
    // the engines that drive a software Paula: the transpiled replayers, the
    // hand-written C ones (Fred, SidMon 1, Steve Turner, StarTrekker AM) and
    // the Musashi host (six transpiled scaffolds moved onto it, 2026-10-05)
    expect(building.length).toBeGreaterThanOrEqual(10);
    expect(building).toContain('musashi-host/MusashiHost.cmake');
    for (const f of building) {
      const text = readFileSync(resolve(ROOT, f), 'utf8');
      const sources = text.match(/\S*paula_soft\.c/g) ?? [];
      for (const s of sources) expect(s, f).toMatch(/^\$\{(PAULA_RUNTIME_DIR|RUNTIME_DIR)\}\/paula_soft\.c$/);
      expect(text, f).toMatch(/tools\/asm68k-to-c\/runtime/);
    }
  });

  it('engines on the Musashi host take their Paula from it', () => {
    for (const f of ['stonetracker-wasm/CMakeLists.txt', 'eagleplayer-wasm/CMakeLists.txt']) {
      const text = readFileSync(resolve(ROOT, f), 'utf8');
      expect(text, f).toMatch(/musashi-host\/MusashiHost\.cmake/);
      expect(text, f).not.toMatch(/paula_soft/);
    }
  });
});
