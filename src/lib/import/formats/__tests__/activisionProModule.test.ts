/**
 * The Activision Pro module as a model is exact: decoding every track into
 * events and encoding them again reproduces every file byte for byte, and each
 * event's canonical encoding is the bytes the file holds (so an edited event
 * is written the way the player reads it). The old codec round-tripped one
 * made-up "note and instrument" byte per row and was wrong about what a track
 * is (an event stream with durations, not a column of cells).
 */
import { describe, it, expect } from 'vitest';
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

  it('an edit that changes a track length is refused, not relocated', () => {
    const m = decodeActivisionProModule(new Uint8Array(readFileSync(files[0])))!;
    const e = m.tracks.find((t) => t && t.events.some((x) => x.ops.length === 0))!.events.find((x) => x.ops.length === 0)!;
    e.ops.push({ kind: 'instrument', value: 3, code: 0 });
    expect(() => encodeActivisionProModule(m)).toThrow(/length/);
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
