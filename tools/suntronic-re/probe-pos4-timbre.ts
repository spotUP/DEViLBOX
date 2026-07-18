/**
 * probe-pos4-timbre.ts — hunt the "effects missing on 2nd loop, pos 4" glitch
 * in the REAL render path (accumulating synth feedback), which the bare-player
 * PER/VOL oracle cannot see. Renders the whole song (2 loops) and compares each
 * voice's RMS + peak in the loop-1 pos-4 window vs the loop-2 pos-4 window. A
 * voice whose energy collapses on loop 2 is the dead/dry note.
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-pos4-timbre.ts [song]
 */
import { renderSunTronicNative } from './native-mix';

const VBLANK = 882.759; // PAL vblank in 44100-samples
const name = process.argv[2] ?? 'ready';

function windowStats(ch: Float32Array, tickStart: number, tickEnd: number) {
  const a = Math.floor(tickStart * VBLANK);
  const b = Math.min(ch.length, Math.floor(tickEnd * VBLANK));
  let sum = 0, peak = 0, nz = 0;
  for (let i = a; i < b; i++) {
    const s = ch[i];
    sum += s * s;
    const abs = Math.abs(s);
    if (abs > peak) peak = abs;
    if (s !== 0) nz++;
  }
  const n = b - a;
  return { rms: Math.sqrt(sum / n), peak, nzFrac: nz / n };
}

const mix = renderSunTronicNative(name, { seconds: 65 });
console.log(`rendered ${mix.frames} samples (${(mix.frames / mix.sampleRate).toFixed(1)}s)`);
// loop wraps at tick 2555 (probe-poswrap). pos 4 window = ticks 315..394 into each loop.
const windows: Array<[string, number, number]> = [
  ['loop1 pos4', 315, 394],
  ['loop2 pos4', 315 + 2555, 394 + 2555],
  ['loop1 pos3', 235, 314],
  ['loop2 pos3', 235 + 2555, 314 + 2555],
  ['loop1 pos5', 395, 474],
  ['loop2 pos5', 395 + 2555, 474 + 2555],
];
console.log('window      | v | rms      peak     nz%');
for (const [label, a, b] of windows) {
  for (let v = 0; v < 4; v++) {
    const s = windowStats(mix.ch[v], a, b);
    console.log(
      `${label.padEnd(11)} | ${v} | ${s.rms.toFixed(4).padStart(7)}  ${s.peak.toFixed(4).padStart(6)}  ${(s.nzFrac * 100).toFixed(0).padStart(3)}`,
    );
  }
}
