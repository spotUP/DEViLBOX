/**
 * Owner rule (2026-10-07): never invent instrument names. If the original
 * file stores no name, the instrument name is ''. Every slot the file has is
 * kept (empty ones too); an empty slot keeps whatever name the file stores.
 *
 * This parses corpus songs through every native parser the registry routes to
 * and fails when an instrument is named by a generated pattern ("Sample 3",
 * "Synth 2", "DW Inst 1" ...) that the file bytes do not contain.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { FORMAT_REGISTRY, detectFormatFromContent } from '../FormatRegistry';
import { parseS3MFile } from '../formats/S3MParser';
import { parseSTMFile } from '../formats/STMParser';
import { parse669File } from '../formats/Format669Parser';
import { parseMODFile } from '../formats/MODParser';
import { parseXMFile } from '../formats/XMParser';
import { parseITFile } from '../formats/ITParser';
import { parseMTMFile } from '../formats/MTMParser';

const ROOT = resolve(__dirname, '../../../../public/data/songs');
const PER_FORMAT = 2;
const MAX_BYTES = 1_500_000;

/** Generated-looking names: a generic word (optionally prefixed by a format tag) and a number, or just the word. */
export const GENERATED_NAME =
  /^(?:[A-Za-z0-9+.]+ ){0,2}(?:synth|inst|instr|instrument|sample|smp|voice|wave|waveform|patch|tone|ins|sound|sfx|pcm|chip|preset|timbre)[ _#-]*(?:0x)?[0-9a-f]{0,4}$/i;

export function isGeneratedName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (!GENERATED_NAME.test(n)) return false;
  // A bare generic word is generated; a word plus digits is generated; hex-only tails need a digit.
  return /^(?:[A-Za-z0-9+.]+ ){0,2}[A-Za-z]+[ _#-]*$/.test(n) || /\d/.test(n);
}

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.size > 64 && st.size <= MAX_BYTES) out.push(p);
  }
}

interface Pick { path: string; key: string; module: string; parseFn: string; bytes: Uint8Array }

function pickCorpus(): Pick[] {
  const files: string[] = [];
  walk(ROOT, files);
  const perKey = new Map<string, number>();
  const picks: Pick[] = [];
  const nativeKeys = new Set(FORMAT_REGISTRY.filter((f) => f.nativeParser).map((f) => f.key));
  for (const path of files) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const bytes = new Uint8Array(readFileSync(path));
    let fmt;
    try { fmt = detectFormatFromContent(name, bytes); } catch { continue; }
    if (!fmt || !fmt.nativeParser || !nativeKeys.has(fmt.key)) continue;
    const n = perKey.get(fmt.key) ?? 0;
    if (n >= PER_FORMAT) continue;
    perKey.set(fmt.key, n + 1);
    picks.push({ path, key: fmt.key, module: fmt.nativeParser.module, parseFn: fmt.nativeParser.parseFn, bytes });
  }
  return picks;
}

function latin1(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

const modules = import.meta.glob('../formats/*.ts');
const parserModules = import.meta.glob('../parsers/*.ts');

async function load(modPath: string): Promise<Record<string, unknown> | null> {
  const base = modPath.replace(/^.*\//, '');
  for (const [k, v] of [...Object.entries(modules), ...Object.entries(parserModules)]) {
    if (k.endsWith(`/${base}.ts`)) return (await v()) as Record<string, unknown>;
  }
  return null;
}

describe('no parser invents an instrument name', () => {
  it('guard recognises generated patterns and keeps authored text', () => {
    for (const bad of ['Sample 3', 'Synth 12', 'Inst 01', 'DW Inst 4', 'Instrument 7', 'Sample', 'CORE Sample 5', 'Instrument 0x0A']) {
      expect(isGeneratedName(bad), bad).toBe(true);
    }
    for (const ok of ['', 'bassdrum', 'greetings to all', 'Sample Kick', 'Lead 2']) {
      expect(isGeneratedName(ok), ok).toBe(false);
    }
  });

  it('every instrument name in the corpus is stored in its file or empty', async () => {
    const picks = pickCorpus();
    expect(picks.length).toBeGreaterThan(40);
    const offenders = new Map<string, string>();
    const counts = new Map<string, number>();
    let parsed = 0;
    for (const p of picks) {
      const mod = await load(p.module);
      const fn = mod?.[p.parseFn] as ((b: ArrayBuffer | Uint8Array, n: string) => unknown) | undefined;
      if (!fn) continue;
      const fileName = p.path.slice(p.path.lastIndexOf('/') + 1);
      type SongLike = { instruments?: Array<{ name?: string }> };
      let song: SongLike | null = null as SongLike | null;
      for (const arg of [p.bytes, p.bytes.buffer.slice(p.bytes.byteOffset, p.bytes.byteOffset + p.bytes.byteLength)]) {
        try { song = (await fn(arg as Uint8Array, fileName)) as SongLike; if (song?.instruments) break; } catch { /* try other arg form */ }
      }
      if (!song?.instruments) continue;
      parsed++;
      const text = latin1(p.bytes);
      for (const inst of song.instruments) {
        const name = inst.name ?? '';
        if (isGeneratedName(name) && !text.includes(name.trim())) {
          counts.set(p.key, (counts.get(p.key) ?? 0) + 1);
          if (!offenders.has(p.key)) offenders.set(p.key, `${p.key}: ${JSON.stringify(name)} (${fileName}), ${p.module.replace(/^.*\//, '')}`);
        }
      }
    }
    expect(parsed).toBeGreaterThan(30);
    expect([...offenders.entries()].map(([k, v]) => `${v} x${counts.get(k)}`), 'invented names (one line per format)').toEqual([]);
  }, 120_000);
});

describe('every instrument slot the file has is kept, empty ones included', () => {
  const FORMATS = resolve(ROOT, 'formats');
  const ab = (name: string): ArrayBuffer => {
    const b = readFileSync(join(FORMATS, name));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  const sixtyNine = (song: { instruments: unknown[] }) => song.instruments.length;

  it.each(['andante.s3m', 'nightmare on acid.s3m'])('%s: one instrument per header slot, ids 1..N in order', (f) => {
    const buf = ab(f);
    const slots = new DataView(buf).getUint16(0x22, true);
    const song = parseS3MFile(buf, f);
    expect(song.instruments.length).toBe(slots);
    expect(song.instruments.map((i) => i.id)).toEqual(Array.from({ length: slots }, (_, i) => i + 1));
  });

  it('shortsong1.mod: all 31 sample slots, unnamed ones empty', async () => {
    const buf = ab('shortsong1.mod');
    const song = await parseMODFile(buf, 'shortsong1.mod');
    expect(song.instruments.length).toBe(31);
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < 31; i++) {
      let stored = '';
      for (let c = 0; c < 22; c++) { const ch = bytes[20 + i * 30 + c]; if (!ch) break; stored += String.fromCharCode(ch); }
      expect(song.instruments[i].name, `slot ${i + 1}`).toBe(stored.trim());
    }
  });

  it('slideshow i.stm: all 31 sample slots', async () => {
    const song = await parseSTMFile(ab('slideshow i.stm'), 'slideshow i.stm');
    expect(song.instruments.length).toBe(31);
  });

  it('fonetag.669: one instrument per header sample', async () => {
    const buf = ab('fonetag.669');
    const song = await parse669File(buf, 'fonetag.669');
    expect(sixtyNine(song)).toBe(new Uint8Array(buf)[0x6e]);
  });

  it('flo boarding - level 1.xm: one instrument per header slot', async () => {
    const buf = ab('flo boarding - level 1.xm');
    const slots = new DataView(buf).getUint16(0x48, true);
    const song = await parseXMFile(buf, 'flo boarding - level 1.xm');
    expect(song.instruments.length).toBeGreaterThanOrEqual(slots);
  });

  it('absm chain mod.it: one instrument per header sample', () => {
    const buf = ab('absm chain mod.it');
    const dv = new DataView(buf);
    const song = parseITFile(buf, 'absm chain mod.it');
    expect(song.instruments.length).toBeGreaterThanOrEqual(Math.max(dv.getUint16(0x22, true), dv.getUint16(0x24, true)));
  });

  it('anonymous in 4ce.mtm: one instrument per header sample', async () => {
    const buf = ab('anonymous in 4ce.mtm');
    const song = await parseMTMFile(buf, 'anonymous in 4ce.mtm');
    expect(song.instruments.length).toBe(new Uint8Array(buf)[0x1e]);
  });
});
