import { readFileSync } from 'fs';
import { basename } from 'path';
import { periodToPtNote } from '../../src/lib/amiga/periodNotes';
import { loadUADEModule, refreshHeap, type UADEModule } from './uadeRenderCore';
import { parseDavidWhittakerFile } from '../../src/lib/import/formats/DavidWhittakerParser';
interface LogModule extends UADEModule {
  _uade_wasm_enable_paula_log(on: number): void;
  _uade_wasm_get_paula_log(outPtr: number, max: number): number;
  _uade_wasm_set_subsong(n: number): void;
  _uade_wasm_read_memory(a: number, p: number, n: number): number;
}
/** Chip-RAM address of the module and of its 4 channel structs (lea chan,a1 after the init's sf.b). */
function locate(mod: LogModule, data: Uint8Array): { pos: number } | null {
  let chan = -1; for (let i = 0x40; i < 0x200; i += 2) if (data[i] === 0x51 && data[i + 1] === 0xeb && data[i + 4] === 0x43 && data[i + 5] === 0xfa) { chan = i + 6 + ((data[i + 6] << 24 >> 16) | data[i + 7]); break; }
  if (chan < 0) return null;
  const RAM = 0x200000; const rp = mod._malloc(RAM); mod._uade_wasm_read_memory(0, rp, RAM); refreshHeap(mod);
  const ram = mod.HEAPU8.slice(rp, rp + RAM); mod._free(rp);
  outer: for (let a = 0; a < RAM - 64; a += 2) { for (let k = 0; k < 64; k++) if (ram[a + k] !== data[0x50 + k]) continue outer; return { pos: a - 0x50 + chan }; }
  return null;
}
function posLists(mod: LogModule, at: number): string { const p = mod._malloc(0xc0); mod._uade_wasm_read_memory(at, p, 0xc0); refreshHeap(mod); const m = mod.HEAPU8.slice(p, p + 0xc0); mod._free(p); return [0, 1, 2, 3].map((c) => (m[c * 0x30 + 8] << 8) | m[c * 0x30 + 9]).join(','); }
const SECS = 20;
async function paula(mod: LogModule, data: Uint8Array, name: string, sub: number): Promise<number[][]> {
  const ptr = mod._malloc(data.byteLength); refreshHeap(mod); mod.HEAPU8.set(data, ptr);
  const hintLen = name.length * 4 + 1; const hintPtr = mod._malloc(hintLen); mod.stringToUTF8(name, hintPtr, hintLen);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  const ret = mod._uade_wasm_load(ptr, data.byteLength, hintPtr);
  mod._free(ptr); mod._free(hintPtr);
  if (ret !== 0) throw new Error('refused');
  if (sub >= 0) mod._uade_wasm_set_subsong(sub);
  mod._uade_wasm_enable_paula_log(1);
  const chunk = 2048; const pL = mod._malloc(chunk * 4), pR = mod._malloc(chunk * 4); const logPtr = mod._malloc(512 * 12);
  const notes: number[][] = [[], [], [], []]; const armed = [-1, -1, -1, -1];
  const drain = () => { const n = mod._uade_wasm_get_paula_log(logPtr, 512); refreshHeap(mod);
    const u32 = new Uint32Array(mod.HEAPU8.buffer, logPtr, n * 3);
    for (let i = 0; i < n; i++) { const w = u32[i * 3]; const tick = u32[i * 3 + 2]; const ch = w >>> 24, reg = (w >>> 16) & 0xff, v = w & 0xffff;
      if (ch > 3) continue; if (reg === 0 || reg === 1) { armed[ch] = tick; continue; }
      if (reg !== 3 || v < 108 || v > 907 || armed[ch] !== tick) continue; armed[ch] = -1;
      const note = periodToPtNote(v); if (note > 0) notes[ch].push(note); } };
  // UADE advances to the next subsong when this one ends (one_subsong is not honoured by the wasm core):
  // stop logging the moment the player's channel structs point at another song's position lists.
  let loc: { pos: number } | null = null; let lists = '';
  for (let f = 0; f < 44100 * SECS;) { const got = mod._uade_wasm_render(pL, pR, chunk); if (got <= 0) break; f += chunk;
    if (!loc) { loc = locate(mod, data); if (loc) lists = posLists(mod, loc.pos); }
    else if (posLists(mod, loc.pos) !== lists) { if (process.env.SHOW) console.log(`      [subsong ended at ${(f / 44100).toFixed(1)}s]`); break; }
    drain(); }
  drain(); mod._uade_wasm_enable_paula_log(0); mod._free(pL); mod._free(pR); mod._free(logPtr); mod._uade_wasm_stop();
  return notes;
}
function grid(data: Uint8Array, name: string, si: number): number[][] {
  const song = parseDavidWhittakerFile(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, name, 0, si);
  const notes: number[][] = Array.from({ length: song.numChannels }, () => []);
  for (const p of song.songPositions) song.patterns[p]?.channels.forEach((c, ch) => { for (const r of c.rows) if (r.note > 0 && r.note < 97) notes[ch].push(r.note); });
  return notes;
}
const iv = (s0: number[]) => { const s = s0.filter((n, i) => i === 0 || n !== s0[i - 1]); return s.slice(1).map((n, i) => n - s[i]); };
function lcs(a: number[], b: number[]) { const dp = new Uint16Array(b.length + 1); for (let i = 1; i <= a.length; i++) { let prev = 0; for (let j = 1; j <= b.length; j++) { const t = dp[j]; dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]); prev = t; } } return dp[b.length]; }
const dd = (s0: number[]) => s0.filter((n, i) => i === 0 || n !== s0[i - 1]);
function score(a: number[], b: number[]) { const L = Number(process.env.PREFIX ?? 200); const ia = iv(a).slice(0, L), ib = iv(b).slice(0, L); const n = Math.min(ia.length, ib.length); return n < 3 ? 0 : lcs(ia, ib) / n; }
(async () => {
  const mod = (await loadUADEModule(false)) as LogModule; mod._uade_wasm_init(44100);
  const nSongs = Number(process.env.NSONGS ?? 0);
  for (const f of process.argv.slice(2)) {
    const data = new Uint8Array(readFileSync(f)); const name = basename(f).replace(/^.*__/, '');
    // load once to read meta
    await paula(mod, data, name, -1).catch(() => null);
    const ptr = mod._malloc(data.byteLength); refreshHeap(mod); mod.HEAPU8.set(data, ptr);
    const hp = mod._malloc(256); mod.stringToUTF8(name, hp, 256); mod._uade_wasm_load(ptr, data.byteLength, hp);
    const min = mod._uade_wasm_get_subsong_min(), max = mod._uade_wasm_get_subsong_max(); mod._uade_wasm_stop();
    let songs = 0; for (let i = 0; i < 64; i++) { const g = grid(data, name, i); if (i > 0 && JSON.stringify(g) === JSON.stringify(grid(data, name, i - 1))) break; songs++; }
    console.log(`${name}: uade subsongs ${min}..${max}; parsed songs ${songs}`);
    for (let i = 0; i < songs; i++) { const g = grid(data, name, i); console.log(`   s${i} grid events ${g.map((c) => c.length).join('/')}`); if (process.env.SHOW) g.forEach((c, ch) => console.log(`      c${ch}: ${c.slice(0, 30).map((n) => n - 36).join(' ')}`)); }
    const grids = Array.from({ length: songs }, (_, i) => grid(data, name, i));
    const subs = process.env.SUBS ? process.env.SUBS.split(',').map(Number) : Array.from({ length: max - min + 1 }, (_, i) => min + i);
    for (const s of subs) {
      const p = await paula(mod, data, name, s);
      const row: string[] = [];
      grids.forEach((g, gi) => { const sc = g.map((c) => c.length < 7 ? -1 : Math.max(...p.map((v) => score(c, v)))); row.push(`s${gi}:${sc.map((x) => x < 0 ? '--' : x.toFixed(2)).join('/')}`); });
      if (process.env.SHOW) p.forEach((v, ch) => console.log(`      v${ch}: ${v.slice(0, 30).join(' ')}`));
      console.log(`  uade ${s} paula ${p.map((v) => v.length).join('/')} | ${row.join(' ')}`);
    }
  }
})();
