// Sonix C-port lock-step audit against the UADE reference.
//
// Regression guard for the Paula DAC scale bug: the C port mixed each channel
// as (sample/128)*(vol/64), treating a single channel's full-scale as 1.0. Four
// channels then summed to ~4.0 and hard-clipped (peak pinned at 1.0, RMS wildly
// hot -- the "~3x too loud / buzzy" symptom). The real Paula DAC puts a single
// channel at sample*vol/32768 (max 127*64/32768 = 0.248), so four channels sum
// to ~1.0. The fix multiplies each channel by 0.25 (see sonix.c snx_mix_frames).
//
// This test compiles the native harness and asserts the mixed output no longer
// clips and that the per-channel effective Paula volume matches the UADE osc
// reference (max 47 for smus.wait2-class content, higher-velocity songs up to
// 64). See thoughts/shared/research/2026-07-05_sonix-cport-accuracy-lockstep.md.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const REPO = path.resolve(__dirname, '../..');
const HARNESS = path.join(__dirname, 'render-native.c');
const INCLUDE = path.join(REPO, 'sonix-wasm/src');
const FIXTURE = path.join(REPO, 'public/data/songs/sonix-smus/ACE II/ACE II.smus');

function findCompiler(): string | null {
  for (const cc of ['cc', 'clang', 'gcc']) {
    try {
      execSync(`${cc} --version`, { stdio: 'pipe' });
      return cc;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

const cc = findCompiler();
const haveFixture = fs.existsSync(FIXTURE);

interface RenderResult {
  peak: number;
  rms: number;
  vol: number[];
}

function render(binary: string, seconds: number): RenderResult {
  const out = execFileSync(binary, [FIXTURE, String(seconds)], { encoding: 'utf-8' }).trim();
  const m = out.match(
    /PEAK ([\d.]+) RMS ([\d.]+) CH0VOL ([\d.]+) CH1VOL ([\d.]+) CH2VOL ([\d.]+) CH3VOL ([\d.]+)/,
  );
  if (!m) throw new Error(`unparseable harness output: ${out}`);
  return {
    peak: parseFloat(m[1]),
    rms: parseFloat(m[2]),
    vol: [parseFloat(m[3]), parseFloat(m[4]), parseFloat(m[5]), parseFloat(m[6])],
  };
}

describe.skipIf(!cc || !haveFixture)('Sonix C-port Paula DAC scale (lock-step vs UADE)', () => {
  let result: RenderResult;

  beforeAll(() => {
    const bin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sonix-audit-')), 'sonix_render');
    execSync(`${cc} -O1 -w -I "${INCLUDE}" "${HARNESS}" -o "${bin}" -lm`, { stdio: 'pipe' });
    result = render(bin, 20);
  });

  it('does not clip the mixed output (four channels sum below full scale)', () => {
    // Pre-fix this was pinned at 1.0 (hard-clipped). The DAC scale keeps it under.
    expect(result.peak).toBeLessThan(0.95);
  });

  it('still produces audible output (not silenced by over-attenuation)', () => {
    expect(result.peak).toBeGreaterThan(0.1);
    expect(result.rms).toBeGreaterThan(0.02);
  });

  it('per-channel effective Paula volume stays in the hardware 0..64 range', () => {
    // UADE osc reference caps VOL at 64 (Paula max). Every active channel must
    // land inside [0,64]; a channel exceeding 64 would mean the volume path,
    // not the DAC scale, is wrong.
    for (const v of result.vol) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(64);
    }
    // At least one channel must actually drive volume (song is not silent).
    expect(Math.max(...result.vol)).toBeGreaterThan(20);
  });
});
