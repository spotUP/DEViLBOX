// Regression: Sonix per-channel mute must actually silence a channel.
//
// SonixEngine was registered as a bitmask-mute engine and the worklet stored the mask,
// but nothing applied it — sonix.c had only solo, no mute. This test proves the mute mask
// silences a channel's scope energy while leaving the others audible.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const REPO = path.resolve(__dirname, '../..');
const INCLUDE = path.join(REPO, 'sonix-wasm/src');
const PROBE = path.join(__dirname, 'probe-mute.c');
const FIXTURE = path.join(REPO, 'public/data/songs/sonix-smus/ACE II/ACE II.smus');

function findCompiler(): string | null {
  for (const c of ['cc', 'clang', 'gcc']) { try { execSync(`${c} --version`, { stdio: 'pipe' }); return c; } catch { /* next */ } }
  return null;
}
const cc = findCompiler();
const haveFixture = fs.existsSync(FIXTURE);

function energies(bin: string, maskHex: string): number[] {
  const out = execFileSync(bin, [FIXTURE, maskHex], { encoding: 'utf-8' }).trim();
  const m = out.match(/CH0 ([\d.]+) CH1 ([\d.]+) CH2 ([\d.]+) CH3 ([\d.]+)/);
  if (!m) throw new Error(`unparseable: ${out}`);
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
}

describe.skipIf(!cc || !haveFixture)('Sonix per-channel mute', () => {
  let bin = '';
  beforeAll(() => {
    bin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sonix-mute-')), 'probe');
    execSync(`${cc} -O1 -w -I "${INCLUDE}" "${PROBE}" -o "${bin}" -lm`, { stdio: 'pipe' });
  });

  it('silences channel 0 when masked out, leaving it audible when not', () => {
    const all = energies(bin, 'ffffffff');       // every channel audible
    const noCh0 = energies(bin, 'fffffffe');      // bit0=0 => channel 0 muted
    // Channel 0 carries real audio in ACE II when unmuted...
    expect(all[0]).toBeGreaterThan(0);
    // ...and is exactly silent when masked out.
    expect(noCh0[0]).toBe(0);
    // Muting channel 0 must not silence the other channels.
    expect(noCh0[1] + noCh0[2] + noCh0[3]).toBeGreaterThan(0);
  });
});
