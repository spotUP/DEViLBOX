// Render test-data/audio/dry-guitar.wav through the SwedishChainsaw WASM (scratch tool).
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { it } from 'vitest';
import { loadWasmEffect } from './wasmEffectHarness';

function readWav(p: string) {
  const b = readFileSync(p); let o = 12; let fmt: any; let data: Buffer | null = null;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') data = b.subarray(o + 8, o + 8 + sz); o += 8 + sz + (sz & 1); }
  const n = data!.length / (fmt.bits / 8) / fmt.ch; const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = data!.readInt16LE(i * fmt.ch * 2) / 32768;
  return { sr: fmt.sr, x };
}
function writeWav(p: string, sr: number, x: Float32Array) {
  const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(x.length * 2, 40); for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2); writeFileSync(p, b);
}
const hasPresets = Boolean(process.env.PRESETS);
const presets: Record<string, number[]> = hasPresets ? JSON.parse(process.env.PRESETS!) : {};
const seconds = Number(process.env.SECONDS ?? 20);
it('render', { skip: !hasPresets, timeout: 120000 }, async () => {
  const { sr, x: full } = readWav('test-data/audio/dry-guitar.wav');
  const start = sr * Number(process.env.START ?? 0);
  const x = full.subarray(start, Math.min(full.length, start + sr * seconds));
  mkdirSync('test-data/audio/renders', { recursive: true });
  for (const [name, p] of Object.entries(presets)) {
    const { m, heap } = await loadWasmEffect('swedishchainsaw', 'SwedishChainsaw');
    const fx = new (m as any).SwedishChainsaw(); fx.initialize(sr); p.forEach((v, i) => fx.setParameter(i, v));
    const B = 128, iL = m._malloc(B * 4), iR = m._malloc(B * 4), oL = m._malloc(B * 4), oR = m._malloc(B * 4);
    const y = new Float32Array(x.length); let inSq = 0, outSq = 0;
    for (let off = 0; off + B <= x.length; off += B) { const blk = x.subarray(off, off + B); heap().set(blk, iL >> 2); heap().set(blk, iR >> 2);
      fx.process(iL, iR, oL, oR, B); const o = heap().subarray(oL >> 2, (oL >> 2) + B); y.set(o, off);
      for (let i = 0; i < B; i++) { inSq += blk[i] ** 2; outSq += o[i] ** 2; } }
    const file = `test-data/audio/renders/chainsaw-${name}.wav`; writeWav(file, sr, y);
    console.log(name.padEnd(20), 'in', (10 * Math.log10(inSq / x.length)).toFixed(1), 'out', (10 * Math.log10(outSq / x.length)).toFixed(1), 'dBFS  ->', file);
  }
});
