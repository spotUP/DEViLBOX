import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const REPO = path.resolve(__dirname, '../..');
const INCLUDE = path.join(REPO, 'sonix-wasm/src');
const PROBE = path.join(__dirname, 'probe-synth-fields.c');
const FIXTURE = path.join(REPO, 'public/data/songs/sonix-smus/ACE II/ACE II.smus');

function cc(): string | null {
  for (const c of ['cc', 'clang', 'gcc']) { try { execSync(`${c} --version`, { stdio: 'pipe' }); return c; } catch { /* next */ } }
  return null;
}
const compiler = cc();
const haveFixture = fs.existsSync(FIXTURE);

describe.skipIf(!compiler || !haveFixture)('Sonix synth field parse', () => {
  let out = '';
  beforeAll(() => {
    const bin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sonix-fields-')), 'probe');
    execSync(`${compiler} -O1 -w -I "${INCLUDE}" "${PROBE}" -o "${bin}" -lm`, { stdio: 'pipe' });
    // Instrument index of a synth in ACE II — pick the first is_synth. Ace2leed is synth; find one by scanning.
    for (let i = 0; i < 12; i++) {
      const line = execFileSync(bin, [FIXTURE, String(i)], { encoding: 'utf-8' });
      if (line.startsWith('IS_SYNTH 1')) { out = line.trim(); break; }
    }
  });

  it('parses the LFO waveform table @0x144 (128 bytes loaded)', () => {
    expect(out).toMatch(/LFO_SET 1/);
  });
});
