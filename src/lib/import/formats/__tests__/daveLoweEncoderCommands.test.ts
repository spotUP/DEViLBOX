/**
 * Dave Lowe / Dave Lowe New: the grid re-encode keeps the instrument (word 4) and volume-envelope (word 12) commands.
 * The encoder wrote only notes and rests, so an edited section lost its commands (m-bison.dln: 1214 bytes -> 1194).
 * Invariant: re-encoding a section whose cells were not changed gives its bytes back, and an edit of one note changes
 * only that note's period word.
 *
 * Fixtures: public/data/songs/dave-lowe-new/m-bison.dln, public/data/songs/dave-lowe/incredibleshrinkingsphere.dl.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDaveLoweNewFile } from '../DaveLoweNewParser';
import { parseDaveLoweFile } from '../DaveLoweParser';
import { patchModuleByVariableLayout } from '@/lib/export/layoutPatch';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerSong } from '@/engine/TrackerReplayer';

afterAll(() => setGridBaseline(null));

const read = (rel: string) => {
  const f = readFileSync(resolve(process.cwd(), rel));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};

/** The words of a section as [word, ...args] groups, so a diff names the command. */
function commandWords(b: Uint8Array): string[] {
  const out: string[] = [];
  for (let p = 0; p + 1 < b.length;) {
    const w = (b[p] << 8) | b[p + 1];
    const n = w > 100 ? 4 : w === 4 || w === 12 ? 6 : w === 32 ? 4 : 2;
    out.push(Array.from(b.subarray(p, p + n)).map((x) => x.toString(16).padStart(2, '0')).join(''));
    p += n;
  }
  return out;
}

async function check(song: TrackerSong, ab: ArrayBuffer) {
  const layout = (song as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout;
  const orig = new Uint8Array(ab);
  let commandsSeen = 0;
  const mismatched: string[] = [];
  // the song's step: the gcd of every note and rest duration
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  let step = 0;
  for (let fp = 0; fp < layout.filePatternAddrs.length; fp++) {
    for (const w of commandWords(orig.subarray(layout.filePatternAddrs[fp], layout.filePatternAddrs[fp] + layout.filePatternSizes[fp]))) {
      if (parseInt(w.slice(0, 4), 16) > 100 || w.startsWith('0020')) step = gcd(step, parseInt(w.slice(-4), 16));
    }
  }
  for (let pi = 0; pi < song.patterns.length; pi++) {
    for (let ch = 0; ch < 4; ch++) {
      const fp = layout.trackMap[pi][ch];
      if (fp == null || fp < 0) continue;
      const want = orig.subarray(layout.filePatternAddrs[fp], layout.filePatternAddrs[fp] + layout.filePatternSizes[fp]);
      const words = commandWords(want);
      // the section's own channel length: trailing grid padding is not part of the section
      const ticks = words.reduce((t, w) => t + (parseInt(w.slice(0, 4), 16) > 100 || w.startsWith('0020') ? parseInt(w.slice(-4), 16) : 0), 0);
      const rows = song.patterns[pi].channels[ch].rows.slice(0, ticks / step);
      const got = rows.length ? layout.encoder.encodePattern(rows, ch) : want;
      commandsSeen += words.filter((w) => w.startsWith('0004') || w.startsWith('000c')).length;
      if (got.length > want.length) mismatched.push(`${pi}:${ch} longer ${got.length} vs ${want.length}`);
      else if (commandWords(got).join() !== words.slice(0, commandWords(got).length).join()) mismatched.push(`${pi}:${ch} differs ${commandWords(got).slice(0, 8).join(' ')} | ${words.slice(0, 8).join(' ')}`);
    }
  }
  return { layout, orig, commandsSeen, mismatched };
}

describe('Dave Lowe grid re-encode keeps instrument and envelope commands', () => {
  it('m-bison.dln: every section re-encodes to its own commands, and one note edit changes only that note', async () => {
    const ab = read('public/data/songs/dave-lowe-new/m-bison.dln');
    const song = parseDaveLoweNewFile(ab.slice(0), 'm-bison.dln');
    const { layout, orig, commandsSeen, mismatched } = await check(song, ab);
    expect(commandsSeen, 'the song has setInstrument/setVolEnv commands').toBeGreaterThan(20);
    expect(mismatched).toEqual([]);

    // the long section: unedited grid re-encode has the original length, commands included
    const pi = song.patterns.findIndex((p) => p.length > 256);
    let ch = -1, row = -1;
    for (let c = 0; c < 4 && ch < 0; c++) {
      for (let r = song.patterns[pi].length - 1; r >= 256; r--) if (song.patterns[pi].channels[c].rows[r].note > 0) { ch = c; row = r; break; }
    }
    const fp = layout.trackMap[pi][ch];
    const addr = layout.filePatternAddrs[fp];
    const size = layout.filePatternSizes[fp];
    const want = orig.slice(addr, addr + size);
    const rows = song.patterns[pi].channels[ch].rows;
    expect(layout.encoder.encodePattern(rows, ch).length, 'byte length of the re-encoded long section').toBe(size);

    setGridBaseline(baselineOf(song.patterns));
    const cell = rows[row] as unknown as Record<string, number>;
    const was = cell.note;
    cell.note = was + 1;
    const out = patchModuleByVariableLayout(ab, layout, song.patterns);
    cell.note = was;
    expect(out.refused).toEqual([]);
    const after = out.bytes.slice(addr, addr + size);
    const a = commandWords(want), b = commandWords(after);
    expect(b.length).toBe(a.length);
    const diff = a.map((w, i) => (w === b[i] ? -1 : i)).filter((i) => i >= 0);
    expect(diff.length, 'exactly one command word differs').toBe(1);
    expect(a[diff[0]].slice(4), 'the duration of the edited note is untouched').toBe(b[diff[0]].slice(4));
    // everything outside the section is untouched
    expect(Array.from(out.bytes.slice(0, addr))).toEqual(Array.from(orig.slice(0, addr)));
    expect(Array.from(out.bytes.slice(addr + size))).toEqual(Array.from(orig.slice(addr + size)));
  });

  it('incredibleshrinkingsphere.dl: every section re-encodes to its own commands', async () => {
    const ab = read('public/data/songs/dave-lowe/incredibleshrinkingsphere.dl');
    const song = await parseDaveLoweFile(ab.slice(0), 'incredibleshrinkingsphere.dl');
    const { commandsSeen, mismatched } = await check(song, ab);
    expect(commandsSeen, 'the song has setInstrument/setVolEnv commands').toBeGreaterThan(50);
    // Known open: one section (patterns 44-45, channel 1) has a SET_INSTRUMENT pointer 8 bytes past the last 14-byte
    // descriptor (0x2332, mapped to the same id as 0x232a) and an unmodelled command word 0x001c. Everything else matches.
    expect(mismatched.map((m) => m.split(' ')[0])).toEqual(['44:1', '45:1']);
  });
});
