/**
 * ready-full-mix.ts — render ready to full STEREO mix WAVs three ways is not
 * possible offline for the browser, so this produces the two offline references:
 *   ready.oracle.wav  — UADE per-voice summed via Paula stereo law
 *   ready.native.wav  — offline SunTronicNativeRender summed the same way
 * The browser capture (export_wav) is the third leg, compared in ready-3way.ts.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR, INSTR_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { renderSunTronicMix } from '../../src/engine/suntronic/SunTronicNativeRender';
import { renderUADEPerVoice, writeMonoWav } from './audio-oracle';

// Paula stereo law: L=(v0+v3)/2, R=(v1+v2)/2
function stereoMix(ch: Float32Array[]): { l: Float32Array; r: Float32Array } {
  const n = ch[0].length;
  const l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = (ch[0][i] + ch[3][i]) * 0.5; r[i] = (ch[1][i] + ch[2][i]) * 0.5; }
  return { l, r };
}
function writeStereoWav(path: string, l: Float32Array, r: Float32Array, sr: number): void {
  const n = l.length; const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const sl = Math.max(-1, Math.min(1, l[i])), sr2 = Math.max(-1, Math.min(1, r[i]));
    buf.writeInt16LE((sl * 32767) | 0, 44 + i * 4); buf.writeInt16LE((sr2 * 32767) | 0, 44 + i * 4 + 2);
  }
  writeFileSync(path, buf);
}
async function main() {
  const name = process.env.SONG ?? 'ready';
  const seconds = parseInt(process.env.SECS ?? '14', 10);
  const out = process.env.OUT ?? '/tmp';
  const oracle = await renderUADEPerVoice(name, { seconds });
  const om = stereoMix(oracle.ch);
  writeStereoWav(join(out, `${name}.oracle.wav`), om.l, om.r, oracle.sampleRate);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const slotPcm = score.instrumentNames.map((n: string) => { const p = join(INSTR_DIR, n); return existsSync(p) ? new Int8Array(readFileSync(p)) : null; });
  const m = renderSunTronicMix(score, slotPcm, { seconds });
  const nm = stereoMix(m.ch);
  writeStereoWav(join(out, `${name}.native.wav`), nm.l, nm.r, m.sampleRate ?? 44100);
  // peak/rms report
  const rep = (l: Float32Array, r: Float32Array, tag: string) => {
    let pk = 0, sum = 0; for (let i = 0; i < l.length; i++) { pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i])); sum += l[i] * l[i] + r[i] * r[i]; }
    console.log(`${tag}: peak=${pk.toFixed(4)} rms=${Math.sqrt(sum / (2 * l.length)).toFixed(4)} sr=${l === om.l ? oracle.sampleRate : (m.sampleRate ?? 44100)} frames=${l.length}`);
  };
  rep(om.l, om.r, 'oracle');
  rep(nm.l, nm.r, 'native');

  // Per-voice, per-1s-window RMS-envelope divergence to LOCATE "notes off".
  // A wrong NOTE shows as an RMS-envelope mismatch (voice present in one, absent
  // or different level in the other) that a phase-blind xcorr would miss.
  const sr = oracle.sampleRate;
  const win = sr; // 1-second windows
  const nWin = Math.floor(Math.min(oracle.ch[0].length, m.ch[0].length) / win);
  const wr = (a: Float32Array, s: number, e: number) => { let x = 0; for (let i = s; i < e; i++) x += a[i] * a[i]; return Math.sqrt(x / (e - s)); };
  console.log('\nsec | ' + [0, 1, 2, 3].map((v) => `v${v} orc/nat  ratio`).join('  |  '));
  for (let w = 0; w < nWin; w++) {
    const s = w * win, e = s + win;
    const cells = [0, 1, 2, 3].map((v) => {
      const o = wr(oracle.ch[v], s, e), n = wr(m.ch[v], s, e);
      const ratio = o > 1e-5 ? n / o : n > 1e-5 ? 99 : 1;
      const flag = (ratio < 0.5 || ratio > 2) ? ' <<' : '';
      return `${o.toFixed(3)}/${n.toFixed(3)} ${ratio.toFixed(2)}${flag}`;
    });
    console.log(`${String(w).padStart(3)} | ` + cells.join(' | '));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
