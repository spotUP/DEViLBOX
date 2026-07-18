/**
 * ready-lagsweep.ts — discriminate phase-drift vs timbre bug on `ready`.
 * Sweeps maxLag; if a voice's fidelity climbs monotonically with the search
 * window it is accumulated Paula-DMA phase drift (deferred Gate-2). If it stays
 * flat/low the WAVEFORM itself is wrong = a real timbre bug to fix.
 */
import { renderSunTronicNative, voiceFidelity } from './native-mix';
import { renderUADEPerVoice } from './audio-oracle';

async function main(): Promise<void> {
  const name = process.env.SONG ?? 'ready';
  const seconds = Number(process.env.SECONDS ?? 12);
  const native = renderSunTronicNative(name, { seconds });
  const oracle = await renderUADEPerVoice(name, { seconds });
  const lags = [640, 1280, 2560, 5000, 10000, 20000];
  console.log(`\n=== ${name} maxLag sweep (timbre vs drift) ===`);
  for (let v = 0; v < 4; v++) {
    const row = lags.map((L) => voiceFidelity(native.ch[v], oracle.ch[v], { maxLag: L }).median.toFixed(3));
    console.log(`  voice ${v}: ` + lags.map((L, i) => `${L}=${row[i]}`).join('  '));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
