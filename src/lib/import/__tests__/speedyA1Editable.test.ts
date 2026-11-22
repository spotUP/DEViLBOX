/**
 * Speedy A1 System (digital voyage.sas) is editable: the grid is the order list, every played file pattern's carrier
 * rows encode back to its 48 bytes, an unedited export is byte-identical, and an edited note cell changes exactly the
 * note byte that played it, through the export router the live edit uses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSpeedyA1File, isSpeedyA1Format, SA1_PERIODS, speedyA1GridNote } from '@/lib/import/formats/SpeedyA1SystemParser';
import { exportSpeedyA1 } from '@/lib/export/SpeedyA1Exporter';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { encodeRobHubbardPattern } from '@/engine/uade/encoders/RobHubbardEncoder';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const NAME = 'digital voyage.sas';
const raw = readFileSync(`public/data/songs/speedy-a1-system/${NAME}`);
const bytes = new Uint8Array(raw);
const load = () => parseSpeedyA1File(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);
const bytesOf = (note: number) => SA1_PERIODS.map((_, b) => b).filter((b) => speedyA1GridNote(b) === note);

describe('Speedy A1 System grid and export', () => {
  it('takes the speed from the header: ticks per row = header long + 1', () => {
    expect(load().initialSpeed).toBe(3);
  });

  it('recognises the module', () => {
    expect(isSpeedyA1Format(bytes)).toBe(true);
  });

  it('every played pattern encodes back to its file bytes', () => {
    const layout = load().uadeVariableLayout!;
    expect(layout.formatId).toBe('sonicArrangerSas');
    expect(layout.numFilePatterns).toBeGreaterThan(0);
    layout.blockRows!.forEach((rows, i) => {
      const addr = layout.filePatternAddrs[i];
      expect(Array.from(encodeRobHubbardPattern(rows))).toEqual(Array.from(bytes.subarray(addr, addr + layout.filePatternSizes[i])));
    });
  });

  it('note cells name note bytes', () => {
    const song = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    expect(nb.length).toBeGreaterThan(20);
    for (const n of nb) {
      expect(song.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note);
      expect(speedyA1GridNote(bytes[n.offset])).toBe(n.note);
    }
  });

  it('an unedited song exports byte-identical', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportSpeedyA1(song);
    expect(diffAt(r.data, bytes)).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('an edited note changes only its note byte, through the export router, and reloads', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const nbs = song.uadeVariableLayout!.noteBytes!;
    const x = nbs.find((y) => bytesOf(y.note + 1).length === 1 && nbs.filter((z) => z.offset === y.offset).length === 1)!;
    expect(x).toBeDefined();
    song.patterns[x.pattern].channels[x.channel].rows[x.row].note = x.note + 1;
    const out = await exportNativeSong(song, {});
    expect(out).not.toBeNull();
    const data = out!.data instanceof Blob ? new Uint8Array(await out!.data.arrayBuffer()) : new Uint8Array(out!.data as unknown as Uint8Array);
    expect(diffAt(data, bytes)).toEqual([x.offset]);
    expect(data[x.offset]).toBe(bytesOf(x.note + 1)[0]);
    const re = parseSpeedyA1File(data.slice().buffer as ArrayBuffer, NAME);
    expect(re.patterns[x.pattern].channels[x.channel].rows[x.row].note).toBe(x.note + 1);
  });

  it('period slides 0x50/0x51 show as 2xx/1xx and an edited amount reaches the file', async () => {
    const song = load();
    const cols = song.uadeVariableLayout!.columnBytes!.filter((c) => c.fields.includes('effTyp'));
    expect(cols.length).toBeGreaterThan(50);
    for (const c of cols) {
      const cell = song.patterns[c.pattern].channels[c.channel].rows[c.row];
      expect(cell.effTyp).toBe(bytes[c.offset - 2] === 0x50 ? 2 : 1);
      expect(cell.eff).toBe(bytes[c.offset]);
    }
    setGridBaseline(baselineOf(song.patterns));
    const c = cols.find((y) => bytes[y.offset - 2] === 0x50)!;
    // a file cell played several times: every grid cell of it carries the edit
    for (const z of cols.filter((q) => q.offset === c.offset)) song.patterns[z.pattern].channels[z.channel].rows[z.row].eff = 7;
    const r = await exportSpeedyA1(song);
    expect(r.warnings).toEqual([]);
    expect(diffAt(r.data, bytes)).toEqual([c.offset]);
    expect(r.data[c.offset]).toBe(7);
    const re = parseSpeedyA1File(r.data.slice().buffer as ArrayBuffer, NAME);
    expect(re.patterns[c.pattern].channels[c.channel].rows[c.row].eff).toBe(7);
  });

  it('envelope byte shows as the hex volume field (attack high, release low) and an edit changes only that byte', async () => {
    const song = load();
    expect(song.patterns[0].channels[0].channelMeta?.volumeHex).toBe(true);
    const env = song.uadeVariableLayout!.columnBytes!.filter((c) => c.fields[0] === 'volume');
    expect(env.length).toBeGreaterThan(50);
    for (const c of env) expect(song.patterns[c.pattern].channels[c.channel].rows[c.row].volume).toBe(bytes[c.offset]);
    expect(env.some((c) => bytes[c.offset] !== 0)).toBe(true);
    setGridBaseline(baselineOf(song.patterns));
    const e = env.find((y) => env.filter((z) => z.offset === y.offset).length === 1)!;
    song.patterns[e.pattern].channels[e.channel].rows[e.row].volume = 0x5a;
    const r = await exportSpeedyA1(song);
    expect(r.warnings).toEqual([]);
    expect(diffAt(r.data, bytes)).toEqual(bytes[e.offset] === 0x5a ? [] : [e.offset]);
    expect(r.data[e.offset]).toBe(0x5a);
    const re = parseSpeedyA1File(r.data.slice().buffer as ArrayBuffer, NAME);
    expect(re.patterns[e.pattern].channels[e.channel].rows[e.row].volume).toBe(0x5a);
  });
});
