/**
 * probe-fidelity-ceiling.ts — Gate E port, Phase 1 decisive experiment.
 *
 * The committed vblank single-clock fix (SunTronicNativeRender stepVblank) was
 * INERT on corpus fidelity (analgestic2 v0/v3 stayed 0.69/0.69). Before building
 * any per-vblank-period port, discriminate the ACTUAL ceiling:
 *
 *   - If voiceFidelity keeps climbing toward ~1.0 as maxLag grows, the residual
 *     is PURE PHASE DRIFT — the port (make vInc track the true per-vblank period)
 *     is the right fix and can reach the 0.90 flip threshold.
 *   - If voiceFidelity PLATEAUS below 0.90 no matter how wide maxLag, there is a
 *     TIMBRE ceiling independent of phase — a phase port alone can NEVER hit 0.90,
 *     and the port must first close a waveform/kernel gap.
 *
 * One measurement decides which problem the multi-session port actually is.
 *
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-fidelity-ceiling.ts
 */
import { renderSunTronicNative, voiceFidelity } from './native-mix';
import { renderUADEPerVoice } from './audio-oracle';

const SONGS = ['ballblaser.src', 'analgestic2.src', 'bluesong.src'];
const LAGS = [640, 1500, 3000, 6000, 12000, 24000, 48000];
const SECONDS = 8;

function rms(a: Float32Array): number {
  let s = 0;
  for (const x of a) s += x * x;
  return Math.sqrt(s / a.length);
}

async function main(): Promise<void> {
  for (const name of SONGS) {
    console.log(`\n=== ${name} (${SECONDS}s) — voiceFidelity vs maxLag ===`);
    let native, oracle;
    try {
      native = renderSunTronicNative(name, { seconds: SECONDS });
      oracle = await renderUADEPerVoice(name, { seconds: SECONDS });
    } catch (e) {
      console.log(`  BROKEN: ${(e as Error).message.slice(0, 100)}`);
      continue;
    }
    console.log(`  lag:      ${LAGS.map((l) => String(l).padStart(6)).join(' ')}`);
    for (let v = 0; v < 4; v++) {
      const nv = native.ch[v];
      const ov = oracle.ch[v];
      if (!nv || !ov) { console.log(`  v${v}: —`); continue; }
      if (rms(nv) < 0.002 || rms(ov) < 0.002) { console.log(`  v${v}: SILENT (n=${rms(nv).toFixed(4)} o=${rms(ov).toFixed(4)})`); continue; }
      const row = LAGS.map((lag) => {
        const { median } = voiceFidelity(nv, ov, { maxLag: lag });
        return median.toFixed(2).padStart(6);
      });
      // Verdict: does widening maxLag lift it toward 1.0 (phase) or plateau <0.90 (timbre)?
      const first = voiceFidelity(nv, ov, { maxLag: LAGS[0] }).median;
      const last = voiceFidelity(nv, ov, { maxLag: LAGS[LAGS.length - 1] }).median;
      const lift = last - first;
      const verdict = last >= 0.9 ? 'PHASE (recoverable)' : lift > 0.15 ? 'PHASE-DRIFT, timbre-capped ' + last.toFixed(2) : 'TIMBRE-CAPPED ' + last.toFixed(2);
      console.log(`  v${v}: ${row.join(' ')}   ${verdict}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
