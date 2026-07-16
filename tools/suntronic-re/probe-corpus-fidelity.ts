/**
 * probe-corpus-fidelity.ts — Gate E measurement: whole-corpus native-vs-UADE
 * timbre fidelity, per song. For each SunTronic module, render native + UADE
 * oracle, compute per-voice windowed best-lag correlation (voiceFidelity), and
 * report the per-song MIN active-voice fidelity (the weakest link gates the
 * default flip). Buckets songs so we can see how many are flip-ready (>=0.90),
 * borderline (0.70-0.90), and phase-drift/broken (<0.70).
 *
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-corpus-fidelity.ts [seconds] [limit]
 */
import { renderSunTronicNative, voiceFidelity } from './native-mix';
import { renderUADEPerVoice } from './audio-oracle';
import { listCorpusModules } from './suntronicLib';

const seconds = Number(process.argv[2] ?? 6);
const limit = process.argv[3] ? Number(process.argv[3]) : Infinity;

function peak(a: Float32Array): number {
  let m = 0;
  for (const s of a) if (Math.abs(s) > m) m = Math.abs(s);
  return m;
}

interface Row {
  name: string;
  minFid: number;
  perVoice: string;
  activeVoices: number;
}

async function main(): Promise<void> {
  const songs = listCorpusModules().filter((f) => /\.(src|pc)$/i.test(f)).slice(0, limit);
  const rows: Row[] = [];
  const broken: string[] = [];

  for (const name of songs) {
    let native, oracle;
    try {
      native = renderSunTronicNative(name, { seconds });
      oracle = await renderUADEPerVoice(name, { seconds });
    } catch (e) {
      broken.push(`${name}: ${(e as Error).message.slice(0, 80)}`);
      continue;
    }
    const fids: number[] = [];
    const parts: string[] = [];
    let active = 0;
    for (let v = 0; v < 4; v++) {
      const nv = native.ch[v];
      const ov = oracle.ch[v];
      // Only voices the ORACLE actually plays gate fidelity (idle voice = N/A).
      if (peak(ov) < 0.01) { parts.push(`v${v}:—`); continue; }
      active++;
      const fid = voiceFidelity(nv, ov).median;
      const silent = native.info[v].silent;
      fids.push(silent ? 0 : fid);
      parts.push(`v${v}:${silent ? 'SILENT' : fid.toFixed(2)}`);
    }
    const minFid = fids.length ? Math.min(...fids) : 1;
    rows.push({ name, minFid, perVoice: parts.join(' '), activeVoices: active });
  }

  rows.sort((a, b) => a.minFid - b.minFid);

  const ready = rows.filter((r) => r.minFid >= 0.9);
  const border = rows.filter((r) => r.minFid >= 0.7 && r.minFid < 0.9);
  const bad = rows.filter((r) => r.minFid < 0.7);

  console.log(`\n=== SunTronic corpus fidelity (${rows.length} rendered, ${seconds}s window) ===`);
  console.log(`  flip-ready (minFid>=0.90): ${ready.length}`);
  console.log(`  borderline (0.70-0.90):    ${border.length}`);
  console.log(`  phase-drift (<0.70):       ${bad.length}`);
  if (broken.length) console.log(`  render errors:             ${broken.length}`);

  console.log(`\n--- weakest 25 (min active-voice fidelity) ---`);
  for (const r of rows.slice(0, 25)) {
    console.log(`  ${r.minFid.toFixed(3)}  ${r.name.padEnd(24)} [${r.perVoice}]`);
  }
  if (broken.length) {
    console.log(`\n--- render errors ---`);
    for (const b of broken) console.log(`  ${b}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
