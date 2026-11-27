/**
 * CustomMadeParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isCustomMadeFormat, parseCustomMadeFile } from '../formats/CustomMadeParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../public/data/songs');
const FILE1 = resolve(REF, 'delitracker-custom/bards tale.cus');
const FILE2 = resolve(REF, 'delitracker-custom/neuromancer.cus');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isCustomMadeFormat', () => {
  it('detects action fighter.cus without filename (binary-only)', () => {
    expect(isCustomMadeFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects terramex.cus without filename (binary-only)', () => {
    expect(isCustomMadeFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects a zeroed buffer', () => {
    expect(isCustomMadeFormat(new ArrayBuffer(4000))).toBe(false);
  });
});

describe('parseCustomMadeFile — action fighter.cus', () => {
  it('parses without throwing', async () => {
    await expect(parseCustomMadeFile(loadBuf(FILE1), 'action fighter.cus')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseCustomMadeFile(loadBuf(FILE1), 'action fighter.cus');
    const report = analyzeFormat(song, 'action fighter.cus');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseCustomMadeFile — terramex.cus', () => {
  it('parses without throwing', async () => {
    await expect(parseCustomMadeFile(loadBuf(FILE2), 'terramex.cus')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseCustomMadeFile(loadBuf(FILE2), 'terramex.cus');
    const report = analyzeFormat(song, 'terramex.cus');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseCustomMadeFile — suffix-named .cm', () => {
  const CM = resolve(REF, 'custommade/the viking child crack.cm');
  it('detects the suffix name and parses natively with notes in the grid', async () => {
    expect(isCustomMadeFormat(loadBuf(CM), 'the viking child crack.cm')).toBe(true);
    const song = await parseCustomMadeFile(loadBuf(CM), 'the viking child crack.cm');
    expect(song.name).not.toMatch(/\.cm$/i);
    const notes = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.note > 0);
    expect(notes.length).toBeGreaterThan(0);
  });
});

describe('Custom Made note on an empty row', () => {
  it('lands in the song bytes at that row and leaves every other row alone; an unedited export is byte-identical', async () => {
    const { patchModuleByLayout } = await import('@/lib/export/layoutPatch');
    const { setGridBaseline, baselineOf } = await import('@/lib/song/gridBaseline');
    const buf = loadBuf(resolve(REF, 'custommade/cm.viking_child'));
    const song = await parseCustomMadeFile(buf, 'cm.viking_child');
    setGridBaseline(baselineOf(song.patterns));
    const same = patchModuleByLayout(song.uadeEditableFileData!, song.uadePatternLayout!, song.patterns);
    expect(Buffer.from(same.bytes).equals(Buffer.from(buf))).toBe(true);

    // First blank row directly under a note, on a voice with notes.
    let target: { p: number; ch: number; r: number } | null = null;
    for (let p = 0; p < song.patterns.length && !target; p++) {
      for (let ch = 0; ch < 4 && !target; ch++) {
        const rows = song.patterns[p].channels[ch].rows;
        for (let r = 1; r < 63; r++) if (rows[r - 1].note > 0 && rows[r].note === 0 && rows[r + 1].note === 0) { target = { p, ch, r }; break; }
      }
    }
    expect(target).not.toBeNull();
    const { p, ch, r } = target!;
    const note = song.patterns[p].channels[ch].rows[r - 1].note;
    // Same pitch as the row above can't tell a new event from the hold: pick another playable one.
    const other = song.patterns.flatMap((q) => q.channels.flatMap((c) => c.rows)).find((c) => c.note > 0 && c.note !== note)!.note;
    const edited = song.patterns.map((pt, pi) => pi !== p ? pt : { ...pt, channels: pt.channels.map((c, ci) => ci !== ch ? c : { ...c, rows: c.rows.map((cell, ri) => ri === r ? { ...cell, note: other } : cell) }) });
    const out = patchModuleByLayout(song.uadeEditableFileData!, song.uadePatternLayout!, edited);
    expect(out.unplaced).toEqual([]);
    setGridBaseline(null);
    const back = await parseCustomMadeFile(out.bytes.buffer.slice(out.bytes.byteOffset, out.bytes.byteOffset + out.bytes.byteLength) as ArrayBuffer, 'cm.viking_child');
    expect(back.patterns[p].channels[ch].rows[r].note).toBe(other);
    // The track is shared by every repeat of it (propagateSharedCells), so the new event shows at each repeat; every other row is untouched.
    const changed: string[] = [];
    for (let pi = 0; pi < song.patterns.length; pi++) for (let ci = 0; ci < 4; ci++) for (let ri = 0; ri < 64; ri++) {
      if (back.patterns[pi].channels[ci].rows[ri].note !== song.patterns[pi].channels[ci].rows[ri].note) changed.push(`${pi}:${ci}:${ri}`);
    }
    expect(changed).toContain(`${p}:${ch}:${r}`);
    expect(changed.every((k) => k.split(':')[1] === String(ch) && +k.split(':')[2] === r || back.patterns[+k.split(':')[0]].channels[ch].rows[+k.split(':')[2]].note === other)).toBe(true);
    expect(changed.every((k) => k.split(':')[1] === String(ch))).toBe(true);
  });
});
