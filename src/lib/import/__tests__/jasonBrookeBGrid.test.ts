/**
 * Jason Brooke version B (the early driver, jb_b.c: Pac-Land, Feud, World Darts) imports as an editable grid: pattern
 * blocks encode back to their bytes, an unedited export is byte-identical, a one-cell note edit changes only the note
 * byte of the event that played it, and the grid is what parseModuleToSong returns. sjs.jb (Scott Johnston) is neither
 * version A nor B: it keeps the placeholder and its edits stay refused.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJasonBrookeFile } from '@/lib/import/formats/JasonBrookeParser';
import { jasonBrookeBTables } from '@/lib/import/formats/JasonBrookeGrid';
import { exportJasonBrooke } from '@/lib/export/JasonBrookeExporter';
import { encodeRobHubbardPattern } from '@/engine/uade/encoders/RobHubbardEncoder';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const read = (path: string) => {
  const raw = readFileSync(path);
  return { bytes: new Uint8Array(raw), buf: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer };
};
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe.each(['pacland.jb', 'world darts.jb', 'feud pal.jb'])('Jason Brooke version B grid: %s', (name) => {
  const { bytes, buf } = read(`public/data/songs/jason-brooke/${name}`);
  const load = () => parseJasonBrookeFile(buf.slice(0), name);

  it('finds the tables and decodes notes', () => {
    expect(jasonBrookeBTables(bytes)).not.toBeNull();
    const song = load();
    expect(song.uadeVariableLayout?.formatId).toBe('jasonBrooke');
    // pacland song 0 leaves voice 3 silent (the C walker gives the same), so count voices with notes
    const voiced = song.patterns[0].channels.filter((ch) => ch.rows.some((r) => r.note > 0)).length;
    expect(voiced).toBeGreaterThanOrEqual(3);
  });

  it('every pattern block encodes back to its file bytes and note cells name note bytes', () => {
    const song = load();
    const layout = song.uadeVariableLayout!;
    layout.blockRows!.forEach((rows, i) => {
      const addr = layout.filePatternAddrs[i];
      expect(Array.from(encodeRobHubbardPattern(rows))).toEqual(Array.from(bytes.subarray(addr, addr + layout.filePatternSizes[i])));
    });
    for (const n of layout.noteBytes!) {
      expect(bytes[n.offset]).toBeLessThan(0x80);
      expect(song.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note);
    }
  });

  it('an unedited song exports byte-identical; a one-cell edit lands on its note byte only', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const same = await exportJasonBrooke(song);
    expect(diffAt(same.data, bytes)).toEqual([]);
    expect(same.warnings).toEqual([]);
    const x = song.uadeVariableLayout!.noteBytes!.find((y) => bytes[y.offset] < 0x7f)!;
    song.patterns[x.pattern].channels[x.channel].rows[x.row].note = x.note + 1;
    const out = await exportJasonBrooke(song);
    expect(diffAt(out.data, bytes)).toEqual([x.offset]);
    expect(out.data[x.offset]).toBe(bytes[x.offset] + 1);
    const re = parseJasonBrookeFile(out.data.slice().buffer as ArrayBuffer, name);
    expect(re.patterns[x.pattern].channels[x.channel].rows[x.row].note).toBe(x.note + 1);
  });
});

describe('Jason Brooke reachability and the non-driver placeholder', () => {
  it('parseModuleToSong returns the version B grid', async () => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { bytes } = read('public/data/songs/jason-brooke/pacland.jb');
    const song = await parseModuleToSong(new File([bytes], 'pacland.jb'));
    expect(song.uadeVariableLayout?.formatId).toBe('jasonBrooke');
    expect(song.patterns[0].channels[0].rows.some((r) => r.note > 0)).toBe(true);
  });

  it('sjs.jb (not a driver module) keeps the placeholder; a note edit is not written', async () => {
    const { bytes, buf } = read('public/data/songs/formats/Scott Johnston/sjs.jb');
    const song = parseJasonBrookeFile(buf, 'sjs.jb');
    expect(song.uadeVariableLayout).toBeUndefined();
    setGridBaseline(baselineOf(song.patterns));
    song.patterns[0].channels[0].rows[0] = { ...song.patterns[0].channels[0].rows[0], note: 49, instrument: 1 };
    const out = await exportJasonBrooke(song);
    expect(out.warnings.join(' ')).toMatch(/edits are refused/);
    expect(Buffer.from(out.data).equals(bytes)).toBe(true);
  });
});
