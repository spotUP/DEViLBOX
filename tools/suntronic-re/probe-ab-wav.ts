/**
 * probe-ab-wav.ts — render native vs UADE-oracle to two mono WAVs for an ear A/B.
 * Native SunTronic outputs to a separate AudioContext the in-app meter can't tap,
 * and UADE is offline-oracle-only (no live browser player), so the only honest
 * side-by-side is two rendered files. Run:
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-ab-wav.ts [song] [seconds]
 */
import { renderSunTronicNative } from './native-mix';
import { renderUADEPerVoice, writeMonoWav } from './audio-oracle';

function sumMono(chs: Float32Array[]): Float32Array {
  const n = Math.max(...chs.map((c) => c.length));
  const out = new Float32Array(n);
  for (const c of chs) for (let i = 0; i < c.length; i++) out[i] += c[i];
  // soft normalize to avoid clip on sum
  let pk = 0; for (const x of out) pk = Math.max(pk, Math.abs(x));
  if (pk > 1) for (let i = 0; i < n; i++) out[i] /= pk;
  return out;
}

async function main(): Promise<void> {
  const song = process.argv[2] || 'ballblaser.src';
  const seconds = Number(process.argv[3] || 8);
  const outDir = '/private/tmp/claude-501/-Users-spot-Code-DEViLBOX/70f95479-1b00-487b-a882-d4b7203ba577/scratchpad';
  const native = renderSunTronicNative(song, { seconds });
  const oracle = await renderUADEPerVoice(song, { seconds });
  const base = song.replace(/\.src$/, '');
  const nPath = `${outDir}/${base}_NATIVE.wav`;
  const uPath = `${outDir}/${base}_UADE.wav`;
  writeMonoWav(nPath, sumMono(native.ch), 44100);
  writeMonoWav(uPath, sumMono(oracle.ch), 44100);
  console.log('NATIVE:', nPath);
  console.log('UADE  :', uPath);
}
main().catch((e) => { console.error(e); process.exit(1); });
