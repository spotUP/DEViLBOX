/**
 * p4-poke.ts — Probe P4: byte-poke render-compare (the decisive score-region
 * confirmation, replacing the tracer which cannot map relocated hunk
 * executables back to file offsets — see p3-trace.ts).
 *
 * Renders mule.src baseline, then re-renders with a single byte poked in the
 * recovered score region, and reports the audible difference. Expected:
 *   note / instrument / transpose pokes  -> audio CHANGES
 *   workspace poke (cleared at init)     -> audio IDENTICAL (control)
 *
 * Pokes are hunk1-relative (mule coords); file offset = 0x248 + h1off.
 *
 * Usage: npx tsx tools/suntronic-re/p4-poke.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CORPUS_DIR,
  loadInstrCompanions,
  parseHunks,
  renderWithCompanions,
  rms,
} from './suntronicLib';

interface Poke {
  label: string;
  h1off: number;
  newByte: number;
  expectChange: boolean;
}

const SECONDS = 3;

function diffStats(a: Float32Array, b: Float32Array): { maxAbs: number; rmsDiff: number } {
  const n = Math.min(a.length, b.length);
  let maxAbs = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > maxAbs) maxAbs = d;
    acc += d * d;
  }
  return { maxAbs, rmsDiff: Math.sqrt(acc / n) };
}

async function main(): Promise<void> {
  const name = 'mule.src';
  const orig = readFileSync(join(CORPUS_DIR, name));
  const hf = parseHunks(orig);
  const h1FileOff = hf.hunks[1].fileOffset;
  const h1 = hf.hunks[1].data;

  const pokes: Poke[] = [
    // track0 @0x1EB3 begins b8 44 99 40 ... (note 0xB8, instr 0x44)
    { label: 'note byte 0x1EB3 (0xB8 -> 0xC4, pitch shift)', h1off: 0x1eb3, newByte: 0xc4, expectChange: true },
    { label: 'instrument byte 0x1EB4 (0x44 -> 0x41, synth instr 4 -> 1)', h1off: 0x1eb4, newByte: 0x41, expectChange: true },
    // seq[0] @0x1626 transposes at +0x10..0x13; voice0 (track 0x1EB3 — has
    // notes) transpose +12. NOTE first attempt poked voice1's transpose
    // (0x1637) and correctly produced NO change: voice1's track 0x1E5B is a
    // mute track (91 00 = DMA flags off, then empty rows) — silent voice,
    // transpose inert. That null result itself confirms the per-voice
    // sequence-entry structure.
    { label: 'transpose byte 0x1636 (seq[0] voice0, 0 -> 12)', h1off: 0x1636, newByte: 0x0c, expectChange: true },
    // control: workspace (cleared to zero by init loop at 0x1C2) — must be inert
    { label: 'CONTROL workspace byte 0x1000 (cleared at init)', h1off: 0x1000, newByte: 0x5a, expectChange: false },
  ];

  const companions = loadInstrCompanions();
  const opts = { sampleRate: 44100, seconds: SECONDS };

  const base = await renderWithCompanions(orig, name, companions, opts);
  console.log(`[p4] baseline: frames=${base.frames} rms=${rms(base.samples).toFixed(5)}`);
  if (rms(base.samples) < 1e-4) throw new Error('baseline render is silent — cannot compare');

  let pass = 0;
  for (const p of pokes) {
    const mut = Buffer.from(orig);
    const fileOff = h1FileOff + p.h1off;
    const before = mut[fileOff];
    mut[fileOff] = p.newByte;
    const res = await renderWithCompanions(mut, name, companions, opts);
    const { maxAbs, rmsDiff } = diffStats(base.samples, res.samples);
    const changed = maxAbs > 1e-3;
    const ok = changed === p.expectChange;
    if (ok) pass++;
    console.log(
      `[p4] ${ok ? 'PASS' : 'FAIL'} ${p.label}: file 0x${fileOff.toString(16)} ` +
      `${before.toString(16)}->${p.newByte.toString(16)} maxAbs=${maxAbs.toFixed(5)} rmsDiff=${rmsDiff.toFixed(6)} ` +
      `(expected ${p.expectChange ? 'CHANGE' : 'no change'})`,
    );
    void h1;
  }
  console.log(`[p4] ${pass}/${pokes.length} pokes behaved as predicted`);
  process.exit(pass === pokes.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
