/**
 * ready-diff.ts — measure-first probe for the "ready plays very wrong native,
 * perfect in UADE" bug. Renders `ready` (extensionless V1.3) both ways, reports
 * per-voice timbre fidelity + peak + timbre type, and writes native/oracle WAVs
 * (per voice AND mixed L/R) so the divergence can be located by voice.
 *
 * Run: SCRATCH=/tmp/ready npx tsx tools/suntronic-re/ready-diff.ts
 */
import { mkdirSync } from 'fs';
import { join } from 'path';
import { renderSunTronicNative, voiceFidelity } from './native-mix';
import { renderUADEPerVoice, peak, writeMonoWav } from './audio-oracle';

async function main(): Promise<void> {
  const outDir = process.env.SCRATCH ?? '/tmp/ready';
  mkdirSync(outDir, { recursive: true });
  const seconds = Number(process.env.SECONDS ?? 12);
  const name = process.env.SONG ?? 'ready';

  const native = renderSunTronicNative(name, { seconds });
  const oracle = await renderUADEPerVoice(name, { seconds });

  console.log(`\n=== ${name} — native vs UADE oracle (${seconds}s) ===`);
  console.log(`native SR=${native.sampleRate} oracle SR=${oracle.sampleRate}`);
  for (let v = 0; v < 4; v++) {
    const nv = native.ch[v];
    const ov = oracle.ch[v];
    const fid = voiceFidelity(nv, ov);
    const inf = native.info[v];
    const tag = inf.dominantOff <= -2
      ? `SAMPLED slot${-2 - inf.dominantOff}`
      : inf.dominantOff < 0
        ? 'idle'
        : `off${inf.dominantOff} synthType${inf.synthType}`;
    const flag = inf.silent && peak(ov) > 0.01 ? '  <-- NATIVE SILENT (oracle has energy)' : '';
    console.log(
      `  voice ${v}: fid=${fid.median.toFixed(3)} (${fid.windows} win)` +
      ` ${tag} active=${(inf.activeFrac * 100).toFixed(0)}%` +
      ` nPeak=${peak(nv).toFixed(3)} oPeak=${peak(ov).toFixed(3)}${flag}`,
    );
    writeMonoWav(join(outDir, `native-v${v}.wav`), nv, native.sampleRate);
    writeMonoWav(join(outDir, `oracle-v${v}.wav`), ov, oracle.sampleRate);
  }
  // Mixed L/R (Paula law 0+3->L, 1+2->R) for both, mono-summed for a quick listen.
  const mix = (ch: Float32Array[]): Float32Array => {
    const n = Math.min(...ch.map((c) => c.length));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = (ch[0][i] + ch[1][i] + ch[2][i] + ch[3][i]) * 0.5;
    return out;
  };
  writeMonoWav(join(outDir, 'native-mix.wav'), mix(native.ch), native.sampleRate);
  writeMonoWav(join(outDir, 'oracle-mix.wav'), mix(oracle.ch), oracle.sampleRate);
  console.log(`\nwavs -> ${outDir}/{native,oracle}-v{0..3}.wav + {native,oracle}-mix.wav`);
}

main().catch((e) => { console.error(e); process.exit(1); });
