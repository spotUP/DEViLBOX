import { readFileSync } from 'node:fs';
import { FX_PRESETS } from '../src/constants/fxPresets';
const DIRS: Record<string, [string, string]> = {
  CabinetSim: ['cabinet-sim', 'CabinetSim'],
  MultibandGate: ['multiband-gate', 'MultibandGate'], MultibandLimiter: ['multiband-limiter', 'MultibandLimiter'], MultibandClipper: ['multiband-clipper', 'MultibandClipper'],
  EQ8Band: ['eq8', 'EQ8Band'], BassEnhancer: ['bass-enhancer', 'BassEnhancer'], Clipper: ['clipper', 'Clipper'],
  DynamicEQ: ['dynamic-eq', 'DynamicEQ'], GOTTComp: ['gott-comp', 'GOTTComp'], Maximizer: ['maximizer', 'Maximizer'],
  MultibandComp: ['multiband-comp', 'MultibandComp'], MultibandEnhancer: ['multiband-enhancer', 'MultibandEnhancer'],
  ResonanceTamer: ['resonance-tamer', 'ResonanceTamer'], TransientDesigner: ['transient-designer', 'TransientDesigner'], Exciter: ['exciter', 'Exciter'],
};
async function load(dir: string, stem: string) {
  const js = readFileSync(`public/${dir}/${stem}.js`, 'utf8');
  const fname = js.match(/var (create\w+)\s*=/)![1];
  const factory = new Function(`${js}\nreturn ${fname};`)();
  let memory: WebAssembly.Memory | null = null;
  const inst0 = WebAssembly.instantiate;
  (WebAssembly as any).instantiate = async (a: any, b: any) => { const r: any = await inst0(a, b); memory = Object.values(r.instance.exports).find(v => v instanceof WebAssembly.Memory) as any; return r; };
  const v = Object.getOwnPropertyDescriptor(process, 'versions')!; Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  try { const m = await factory({ wasmBinary: readFileSync(`public/${dir}/${stem}.wasm`) }); return { m, heap: () => new Float32Array(memory!.buffer) }; }
  finally { (WebAssembly as any).instantiate = inst0; Object.defineProperty(process, 'versions', v); }
}
const FREQS = [40, 60, 100, 150, 250, 500, 1000, 3000, 8000];
function goertzel(y: Float32Array, f: number): number {
  const w = 2 * Math.PI * f / 48000, c = 2 * Math.cos(w); let s1 = 0, s2 = 0;
  for (const v of y) { const s0 = v + c * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) * 2 / y.length;
}
async function probe(type: string, params: Record<string, unknown>, label: string) {
  const [dir, stem] = DIRS[type];
  const { m, heap } = await load(dir, stem);
  const missing: string[] = [];
  let run: (iL: number, iR: number, oL: number, oR: number, n: number) => void;
  if (m.ResonanceTamerEffect) {
    const fx = new m.ResonanceTamerEffect(); fx.initialize(48000);
    const ch = params.character === 'warm' ? 0.5 : params.character === 'bright' ? 1 : 0;
    fx.setParameter(0, Number(params.amount ?? 0.35)); fx.setParameter(1, ch); fx.setParameter(2, Number(params.mix ?? 1));
    run = (a, b, c, d, n) => fx.process(a, b, c, d, n);
  } else {
    const create = Object.keys(m).find(k => /_create$/.test(k))!; const prefix = create.slice(1, -'_create'.length);
    const h = m[create](48000);
    for (const [k, val] of Object.entries(params)) {
      if (typeof val !== 'number') { missing.push(`${k}(non-number)`); continue; }
      const setter = `_${prefix}_set_${k}`;
      if (m[setter]) m[setter](h, val); else missing.push(k);
    }
    run = (a, b, c, d, n) => m[`_${prefix}_process`](h, a, b, c, d, n);
  }
  const n = 96000; const bytes = n * 4; const A = 0.05;
  const iL = m._malloc(bytes), iR = m._malloc(bytes), oL = m._malloc(bytes), oR = m._malloc(bytes);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = 0; for (const f of FREQS) v += A * Math.sin(2 * Math.PI * f * i / 48000 + f); x[i] = v; }
  heap().set(x, iL >> 2); heap().set(x, iR >> 2);
  for (let off = 0; off < n; off += 128) run(iL + off * 4, iR + off * 4, oL + off * 4, oR + off * 4, 128);
  const y = heap().slice((oL >> 2) + n / 2, (oL >> 2) + n);
  const row = FREQS.map(f => `${f}:${(20 * Math.log10(goertzel(y, f) / A)).toFixed(1)}`);
  console.log(`${label.padEnd(20)} ${row.join(' ')}${missing.length ? '  NO SETTER: ' + missing.join(',') : ''}`);
}
(async () => {
  if (process.argv[2] === '--neutral') {
    await probe('MultibandComp', { low_ratio: 1, mid_ratio: 1, high_ratio: 1 }, 'MultibandComp ratio 1');
    await probe('MultibandGate', { lowThresh: -80, midThresh: -80, highThresh: -80 }, 'MultibandGate open');
    await probe('MultibandLimiter', { lowCeil: 0, midCeil: 0, highCeil: 0 }, 'MultibandLimiter 0 dB');
    await probe('MultibandClipper', { lowCeil: 0, midCeil: 0, highCeil: 0 }, 'MultibandClipper 0 dB');
    return;
  }
  if (process.argv[2] === '--defaults') {
    for (const t of process.argv.slice(3)) await probe(t, {}, t + ' (defaults)');
    return;
  }
  const names = process.argv.slice(2);
  for (const p of FX_PRESETS.filter(p => names.includes(p.name))) {
    console.log(`== ${p.name}`);
    for (const e of p.effects) if (DIRS[e.type]) await probe(e.type, e.parameters as any, e.type); else console.log(`${e.type.padEnd(34)} (not probed: ${e.category})`);
  }
})();
export {};
