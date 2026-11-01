/**
 * The Activision Pro module as a model is exact: decoding every track into
 * events and encoding them again reproduces every file byte for byte, and each
 * event's canonical encoding is the bytes the file holds (so an edited event
 * is written the way the player reads it). The old codec round-tripped one
 * made-up "note and instrument" byte per row and was wrong about what a track
 * is (an event stream with durations, not a column of cells).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodeActivisionProModule, encodeActivisionProModule, encodeAvpEvent, decodeAvpEvent } from '../ActivisionProModule';
import { parseActivisionProFile } from '../ActivisionProParser';
import { xmEffectToString } from '@/lib/xmConversions';
import { AVP_FX_MIN, AVP_FX_MAX } from '../activisionProEffectGlyphs';

const ROOT = join(process.cwd(), 'public/data/songs');
function corpus(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(ROOT)) {
    try { for (const f of readdirSync(join(ROOT, dir))) if (f.toLowerCase().endsWith('.avp')) out.push(join(ROOT, dir, f)); } catch { /* not a directory */ }
  }
  return out;
}

describe('Activision Pro module codec', () => {
  const files = corpus();
  it('finds the corpus', () => { expect(files.length).toBeGreaterThanOrEqual(2); });

  for (const f of files) {
    it(`decode then encode is byte-exact: ${f.slice(ROOT.length + 1)}`, () => {
      const bytes = new Uint8Array(readFileSync(f));
      const m = decodeActivisionProModule(bytes)!;
      expect(m).toBeTruthy();
      const events = m.tracks.reduce((n, t) => n + (t ? t.events.length : 0), 0);
      expect(events).toBeGreaterThan(200);
      const again = encodeActivisionProModule(m);
      expect(again.length).toBe(bytes.length);
      expect(again.every((b, i) => b === bytes[i])).toBe(true);
    });

    it(`every event's canonical encoding is its source bytes: ${f.slice(ROOT.length + 1)}`, () => {
      const m = decodeActivisionProModule(new Uint8Array(readFileSync(f)))!;
      const version = m.info.parseTrackVersion;
      for (const t of m.tracks) for (const e of t?.events ?? []) {
        expect(encodeAvpEvent(version, e), `track at ${t!.fileOffset}`).toEqual(e.bytes);
        const d = decodeAvpEvent(version, e.bytes, 0)!;
        expect(d.event.duration).toBe(e.duration);
      }
    });
  }

  it('an edit that grows the full track region moves the data behind it and re-points the code', () => {
    const bytes = new Uint8Array(readFileSync(files[0]));
    const m = decodeActivisionProModule(bytes)!;
    const e = m.tracks.find((t) => t && t.events.some((x) => x.ops.length === 0))!.events.find((x) => x.ops.length === 0)!;
    e.ops.push({ kind: 'instrument', value: 3, code: 0 });
    const out = encodeActivisionProModule(m);
    expect(out.length).toBeGreaterThan(bytes.length);
    const back = decodeActivisionProModule(out)!;
    expect(back).toBeTruthy();
    // Every section behind the track region moved by the growth, the sample data with it.
    expect(back.info.sampleDataOffset).toBeGreaterThanOrEqual(m.info.sampleDataOffset);
    expect(out.subarray(back.info.sampleDataOffset)).toEqual(bytes.subarray(m.info.sampleDataOffset));
    expect(back.info.sampleDataOffset - m.info.sampleDataOffset).toBe(out.length - bytes.length);
  });

  it('the parsed song carries its module and shows operations as private effects', () => {
    const bytes = new Uint8Array(readFileSync(files[0]));
    const song = parseActivisionProFile(bytes, 'g.avp')!;
    expect(song.activisionProFileData!.byteLength).toBe(bytes.length);
    let fx = 0;
    for (const p of song.patterns) for (const c of p.channels) for (const r of c.rows) {
      if (r.effTyp >= AVP_FX_MIN && r.effTyp <= AVP_FX_MAX) {
        fx++;
        expect(xmEffectToString(r.effTyp, r.eff)).toMatch(/^[A-Z][0-9A-F]{2}$/);
      }
    }
    expect(fx, 'portamento / hold operations shown').toBeGreaterThan(0);
  });
});

describe('Activision Pro export rewrites the tracks from the grid', () => {
  it('a cleared grid exports a module that reads back with no cells and the same size', async () => {
    const { exportActivisionPro } = await import('@/lib/export/ActivisionProExporter');
    const src = new Uint8Array(readFileSync(join(ROOT, 'activision-pro/gettysburg.avp')));
    const song = parseActivisionProFile(src, 'gettysburg.avp')!;
    const nonEmpty = (s: typeof song) => s.patterns.reduce((n, p) => n + p.channels.reduce((m, c) => m + c.rows.filter((r) => r.note || r.instrument || r.effTyp || r.eff || r.volume).length, 0), 0);
    expect(nonEmpty(song)).toBeGreaterThan(0);
    const empty = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    for (const p of song.patterns) for (const c of p.channels) c.rows = c.rows.map(() => ({ ...empty }));
    const { data } = await exportActivisionPro(song);
    const out = new Uint8Array(await data.arrayBuffer());
    expect(out.length).toBe(src.length);
    const back = parseActivisionProFile(out, 'blank.avp');
    expect(back).not.toBeNull();
    expect(nonEmpty(back!)).toBe(0);
  });
});

describe('Activision Pro blank template: notes on every voice survive the native export', () => {
  // exportNativeSong imports the store graph lazily; under vitest the first cold
  // transform of that graph takes about a minute. Load it here so the test times
  // only its own work.
  beforeAll(async () => {
    await import('@stores/useFormatStore');
  }, 180_000);

  it('exports and re-imports notes on 4 voices, one starting with rests and one left empty', async () => {
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const src = new Uint8Array(readFileSync(join(process.cwd(), 'public/templates/activisionPro.avp')));
    const song = parseActivisionProFile(src, 'template.avp')!;
    expect(song).not.toBeNull();
    // Notes: voice 0 from row 0, voice 1 after rests, voice 2 sparse; the module's period table reaches notes 1 to 49, voice 3 empty.
    const plan: Record<number, [number, number][]> = {
      0: [[0, 49], [4, 46], [8, 42], [12, 38]],
      1: [[6, 40], [10, 44], [20, 47]],
      2: [[0, 37], [2, 38], [3, 39], [30, 30]],
    };
    const rows = Math.max(...Object.values(plan).flatMap((l) => l.map(([r]) => r))) + 1;
    song.patterns[0].channels.forEach((c) => { for (const r of c.rows.keys()) c.rows[r] = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }; });
    for (const p of song.patterns.slice(1)) for (const c of p.channels) c.rows = c.rows.map(() => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }));
    for (const [v, list] of Object.entries(plan)) for (const [row, note] of list) {
      song.patterns[0].channels[+v].rows[row] = { note, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    }
    const res = await exportNativeSong(song);
    expect(res).not.toBeNull();
    const out = res!.data;
    const back = parseActivisionProFile(out, 'back.avp')!;
    expect(back).not.toBeNull();
    for (let v = 0; v < 4; v++) {
      const got: [number, number][] = [];
      back.patterns[0].channels[v].rows.slice(0, rows + 8).forEach((cell, r) => { if (cell.note) got.push([r, cell.note]); });
      expect(got, `voice ${v}`).toEqual(plan[v] ?? []);
    }
    // The tracks needed more room than the template gave: the module grew, and the sample data came along intact.
    const a = decodeActivisionProModule(src)!, b = decodeActivisionProModule(out)!;
    expect(out.subarray(b.info.sampleDataOffset)).toEqual(src.subarray(a.info.sampleDataOffset));
  });
});
