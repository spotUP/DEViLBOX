import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Proves sonix_song_render_synth_note renders a synth note through the real Sonix
// synth path AND that instrument params drive the output: baseVol=0 is silent,
// and a different base waveform yields different samples. Compiles the C probe
// natively (like the other sonix-audit tests) — runs locally, not push-gated CI.

const REPO = path.resolve(__dirname, '../..');
const INCLUDE = path.join(REPO, 'sonix-wasm/src');
const PROBE = path.join(__dirname, 'probe-render-note.c');

function cc(): string | null {
  for (const c of ['cc', 'clang', 'gcc']) {
    try {
      execSync(`${c} --version`, { stdio: 'pipe' });
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}
const compiler = cc();

interface Metrics {
  frames: number;
  rms: number;
  peak: number;
  fp: number;
}

describe.skipIf(!compiler)('Sonix render-one-note synth audition', () => {
  const results: Record<number, Metrics> = {};

  beforeAll(() => {
    const bin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sonix-render-')), 'probe');
    execSync(`${compiler} -O1 -w -I "${INCLUDE}" "${PROBE}" -o "${bin}" -lm`, { stdio: 'pipe' });
    for (const mode of [0, 1, 2]) {
      const line = execFileSync(bin, [String(mode)], { encoding: 'utf-8' }).trim();
      const m = line.match(/FRAMES (\d+) RMS ([\d.]+) PEAK ([\d.]+) FP (-?[\d.]+)/);
      if (!m) throw new Error(`unexpected probe output for mode ${mode}: ${line}`);
      results[mode] = {
        frames: Number(m[1]),
        rms: Number(m[2]),
        peak: Number(m[3]),
        fp: Number(m[4]),
      };
    }
  });

  it('renders a non-silent note through the synth path', () => {
    expect(results[0].frames).toBeGreaterThan(0);
    expect(results[0].rms).toBeGreaterThan(0.001);
    expect(results[0].peak).toBeGreaterThan(0.005);
  });

  it('respects baseVol — baseVol 0 is silent', () => {
    expect(results[1].rms).toBe(0);
    expect(results[1].peak).toBe(0);
    // The only change vs mode 0 is baseVol → energy must collapse.
    expect(results[0].rms).toBeGreaterThan(results[1].rms);
  });

  it('respects the base waveform — a different wave changes the output', () => {
    // mode 0 = sawtooth, mode 2 = square, same baseVol. Output must differ.
    expect(results[2].fp).not.toBeCloseTo(results[0].fp, 3);
    expect(Math.abs(results[2].rms - results[0].rms)).toBeGreaterThan(0.001);
  });
});
