// @vitest-environment node
/**
 * MMD3 (route 'med-module'): a cell edit made while the song plays is heard. The module patched by patchMedModule is hot-reloaded
 * into the real chiptune3 worklet + libopenmpt wasm. Reference = the same hot reload with the UNCHANGED bytes (a reload is not
 * bit-exact with uninterrupted play). The edited cell is picked from libopenmpt's own position reports, after the reload point.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { patchMedModule } from '@/lib/export/MEDExporter';

type Proc = {
  handleMessage_: (m: { data: { cmd: string; val?: unknown } }) => void;
  process: (i: unknown[], o: Float32Array[][], p: unknown) => boolean;
  modulePtr: number;
};
type Wasm = {
  _openmpt_module_get_current_order: (m: number) => number;
  _openmpt_module_get_current_pattern: (m: number) => number;
  _openmpt_module_get_current_row: (m: number) => number;
  _openmpt_module_get_pattern_row_channel_command: (m: number, p: number, r: number, c: number, cmd: number) => number;
};
const SR = 48000;
const NAME = 'bounty hunter - outro (remixed).mmd3';

const loadWorklet = async (): Promise<{ Ctor: new (o: unknown) => Proc; wasm: Wasm }> => {
  const g = globalThis as Record<string, unknown>;
  let Ctor!: new (o: unknown) => Proc;
  g.AudioWorkletProcessor = class { port = { postMessage: () => {}, onmessage: null }; };
  g.registerProcessor = (_n: string, c: unknown) => { Ctor = c as typeof Ctor; };
  g.sampleRate = SR;
  g.currentTime = 0;
  const workletPath: string = '../../../../public/chiptune3/chiptune3.worklet.js';
  await import(/* @vite-ignore */ workletPath);
  for (let i = 0; i < 100 && !g.__libopenmpt; i++) await new Promise((r) => setTimeout(r, 100));
  return { Ctor, wasm: g.__libopenmpt as Wasm };
};

const ab = (b: Uint8Array | ArrayBuffer): ArrayBuffer => (b instanceof ArrayBuffer ? b.slice(0) : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);

describe('MMD3 live edit while playing', () => {
  it('a patched cell is heard after hot reload, against the same reload with unchanged bytes', async () => {
    const { Ctor, wasm } = await loadWorklet();
    const raw = readFileSync(join(process.cwd(), 'public/data/songs/formats', NAME));
    const orig = ab(raw);
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], NAME));

    // Walk the song on libopenmpt, record (pattern,row) visited per 128-frame block over 6 s.
    const out = [[new Float32Array(128), new Float32Array(128)]];
    const probe = new Ctor({});
    probe.handleMessage_({ data: { cmd: 'play', val: orig.slice(0) } });
    const seen = new Map<string, number>();
    for (let b = 0; b < (6 * SR) / 128; b++) {
      probe.process([], out, {});
      const k = `${wasm._openmpt_module_get_current_pattern(probe.modulePtr)}:${wasm._openmpt_module_get_current_row(probe.modulePtr)}`;
      if (!seen.has(k)) seen.set(k, b);
    }
    probe.handleMessage_({ data: { cmd: 'stop' } });
    // Candidates: note cells at positions libopenmpt first reaches between 3 s and 5 s (after the reload point).
    const cands: { p: number; c: number; r: number }[] = [];
    for (const [k, b] of seen) {
      const t = (b * 128) / SR;
      if (t < 3 || t > 5) continue;
      const [p, r] = k.split(':').map(Number);
      song.patterns[p]?.channels.forEach((ch, c) => { if (ch.rows[r]?.note > 0 && ch.rows[r].note < 97) cands.push({ p, c, r }); });
    }
    expect(cands.length, 'played note cells').toBeGreaterThan(0);
    const T = 7;
    const render = (module: ArrayBuffer | null, from: ArrayBuffer, seconds: number, reloadAtSec: number): Float32Array => {
      const p = new Ctor({});
      p.handleMessage_({ data: { cmd: 'play', val: from.slice(0) } });
      const o = [[new Float32Array(128), new Float32Array(128)]];
      const n = (seconds * SR) / 128;
      const res = new Float32Array(n * 128);
      for (let b = 0; b < n; b++) {
        if (module && b === Math.round((reloadAtSec * SR) / 128)) p.handleMessage_({ data: { cmd: 'hotReload', val: module.slice(0) } });
        p.process([], o, {});
        res.set(o[0][0], b * 128);
      }
      p.handleMessage_({ data: { cmd: 'stop' } });
      return res;
    };
    const diff = (a: Float32Array, b: Float32Array) => {
      let n = 0, first = -1;
      for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) { n++; if (first < 0) first = i; }
      return { n, firstSec: first < 0 ? -1 : first / SR };
    };
    const plainOrig = render(null, orig, T, 0);
    // The cell must be audible: the module patched from the start sounds different from the unpatched one.
    let cell = cands[0], edited = orig, oracle = { n: 0, firstSec: -1 };
    for (const cd of cands) {
      const row = song.patterns[cd.p].channels[cd.c].rows[cd.r];
      const was = row.note;
      row.note = was + 2;
      const bytes = ab(patchMedModule(song)!);
      row.note = was;
      oracle = diff(plainOrig, render(null, bytes, T, 0));
      if (oracle.n > 0) { cell = cd; edited = bytes; break; }
    }
    expect(Buffer.from(edited).equals(Buffer.from(orig)), 'an audible cell exists').toBe(false);
    const live = diff(render(orig, orig, T, 1), render(edited, orig, T, 1));
    const msg = `cell ${JSON.stringify(cell)} of ${cands.length} candidates; patched-from-start vs plain: ${JSON.stringify(oracle)}; reload edited vs reload unchanged: ${JSON.stringify(live)}`;
    console.log(msg);
    expect(oracle.n, msg).toBeGreaterThan(0);
    expect(live.n, msg).toBeGreaterThan(0);
    // The edit is first heard at the edited cell, not before it.
    expect(live.firstSec, msg).toBeGreaterThanOrEqual(3);
  }, 120000);
});
