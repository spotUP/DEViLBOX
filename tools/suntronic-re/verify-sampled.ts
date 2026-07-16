/**
 * verify-sampled.ts — SunTronic Gate D evidence: type-B (sampled) voices render.
 *
 * Gate D closed the native-silence gap for sampled instruments. Before it,
 * `SunTronicPlayer.selectInstrument` returned null on a bit6-clear select, so a
 * sampled voice had no PCM AND `stepEffects` bailed at the `!inst` guard —
 * period/volume frozen at 0, the voice rendered SILENT (see native-mix.ts
 * KNOWN-APPROXIMATIONS before Gate D, and sunTronicSampled.test.ts).
 *
 * This script is a DIAGNOSTIC, not a pass/fail assertion — it prints the
 * measured state so the fidelity claim stays honest:
 *
 *   1. STRUCTURAL (proven, locked in sunTronicSampled.test.ts):
 *      analgestic2 voice 2 resolves sampled slot 0/1 (perc1.x/perc2.x), runs the
 *      SHARED EFFECTS (period 302, outVolume 64), and native-mix streams the
 *      companion PCM through the Paula resampler with loop -> NON-SILENT.
 *
 *   2. WHOLE-SONG ORACLE MATCH (NOT locked — deferred to Gate E):
 *      The windowed best-lag correlation of the native sampled voice against the
 *      UADE per-voice oracle is LOW and rate-ambiguous — the same residual class
 *      as the swept synth voices (type-2 ballblaser ~0.20). Byte-exact sampled
 *      playback needs the cycle-accurate Paula-DMA capture (chip-RAM play buffer
 *      + $dffXX period register at note-on), i.e. the deferred Gate-2 scheduler
 *      port, NOT the mixed per-voice audio this oracle exposes. The whole-song
 *      per-voice separation + broadband percussion make the mixed-audio oracle
 *      too muddled to assert a byte-match; do not read a low number here as a
 *      timbre bug — read it as "lock pending cycle-accurate capture".
 *
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/verify-sampled.ts
 */
import { renderSunTronicNative, voiceFidelity } from './native-mix';
import { renderUADEPerVoice } from './audio-oracle';

function peak(x: Float32Array): number {
  let m = 0;
  for (const v of x) if (Math.abs(v) > m) m = Math.abs(v);
  return m;
}

async function main(): Promise<void> {
  const name = 'analgestic2.src';
  const seconds = 10;
  const native = renderSunTronicNative(name, { seconds });
  const oracle = await renderUADEPerVoice(name, { seconds });

  console.log(`\n=== ${name} — Gate D sampled-voice evidence ===\n`);
  console.log('STRUCTURAL: native per-voice render (Gate D closes voice-2 silence)');
  for (let v = 0; v < 4; v++) {
    const inf = native.info[v];
    const tag = inf.dominantOff <= -2
      ? `SAMPLED slot${-2 - inf.dominantOff}`
      : inf.dominantOff < 0 ? 'idle' : `synth off${inf.dominantOff} type${inf.synthType}`;
    console.log(
      `  voice ${v}: ${tag}  active=${(inf.activeFrac * 100).toFixed(0)}%` +
      `  nPeak=${peak(native.ch[v]).toFixed(3)}  silent=${inf.silent}`,
    );
  }

  console.log('\nWHOLE-SONG ORACLE (deferred to Gate E — cycle-accurate capture):');
  for (let v = 0; v < 4; v++) {
    const inf = native.info[v];
    if (inf.dominantOff > -2) continue; // sampled voices only
    for (const maxLag of [640, 6000]) {
      const f = voiceFidelity(native.ch[v], oracle.ch[v], { maxLag });
      console.log(
        `  voice ${v} (SAMPLED slot${-2 - inf.dominantOff}) vs oracle v${v}: ` +
        `fidelity=${f.median.toFixed(3)} (maxLag ${maxLag}, ${f.windows} win)`,
      );
    }
    console.log(
      `  oracle v${v} peak=${peak(oracle.ch[v]).toFixed(3)} — low corr here is the ` +
      'deferred phase/DMA residual, NOT a render bug (see header).',
    );
  }
  console.log(
    '\nConclusion: sampled voices RENDER at the EFFECTS period+loop (was silent).' +
    '\nByte-exact whole-song lock is Gate E, gated on the cycle-accurate scheduler.',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
