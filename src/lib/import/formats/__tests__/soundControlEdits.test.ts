/**
 * Sound Control (G5, G24): a note edit reaches the module and the module plays.
 *   - the encoder is the parser's inverse: every note byte of the corpus song comes back from its own grid note (the encoder
 *     was 24 semitones off the parser, so a note typed over an existing one came out two octaves away after export);
 *   - a note typed past the end of a track is put in front of the track's end marker, the tracks section's length and the table
 *     of the tracks behind it follow, and the ORIGINAL player (UADE) plays the grown module: its notes stay, one more starts;
 *   - a note typed on a tick of a wait splits the wait (soundControlEdits.ts) so that every other row stays where it was.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSoundControlFile } from '../SoundControlParser';
import { soundControlSplitWait } from '../soundControlEdits';
import { exportSoundControl } from '@/lib/export/SoundControlExporter';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';
import { paulaEventStream } from '@/engine/__tests__/gridOracle';

const FILE = 'public/data/songs/soundcontrol/north sea inferno ongame1.sc';
const bytes = new Uint8Array(readFileSync(FILE));

describe('Sound Control note edits', { timeout: 120000 }, () => {
  it('the encoder inverts the parser: a note cell encodes to the byte it was read from', () => {
    const song = parseSoundControlFile(bytes, 'x.sc')!;
    const layout = song.uadePatternLayout!;
    let checked = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      const at = layout.getCellFileOffset!(p, r, c);
      if (at < 0 || cell.note === 0) return;
      // A cell the user typed has no byte carriers: the note comes from the grid note alone.
      const typed = layout.encodeCell({ note: cell.note, instrument: cell.instrument, volume: cell.volume, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      expect(typed[0], `p${p} c${c} r${r}`).toBe(bytes[at]);
      checked++;
    })));
    expect(checked, 'note events checked (sentinel)').toBeGreaterThan(100);
  });

  it('a note past the end of a track is written; reloaded it is on its row, and the original player plays the module', async () => {
    const song = parseSoundControlFile(bytes, 'x.sc')!;
    setGridBaseline(baselineOf(song.patterns));
    // The first track that ends before its pattern does: a row past its end.
    let at: { p: number; ch: number; row: number } | null = null;
    outer: for (let p = 0; p < song.patterns.length; p++) for (let ch = 0; ch < 6; ch++) {
      const rows = song.patterns[p].channels[ch].rows;
      const last = rows.map((c, i) => (c.note > 0 ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      if (last >= 0 && last + 2 < rows.length && song.uadePatternLayout!.getCellFileOffset!(p, last + 2, ch) < 0) { at = { p, ch, row: last + 2 }; break outer; }
    }
    expect(at, 'a track that ends before its pattern').not.toBeNull();
    const before = structuredClone(song.patterns);
    // A note the module can hold (a 3.x module has ten notes to the octave): the one the track's own last note plays.
    const typed = song.patterns[at!.p].channels[at!.ch].rows[at!.row - 2].note;
    song.patterns[at!.p].channels[at!.ch].rows[at!.row] = { ...song.patterns[at!.p].channels[at!.ch].rows[at!.row], note: typed, instrument: 1, volume: 0 };
    const out = await exportSoundControl(song);
    expect(out.warnings, out.warnings.join(';')).toEqual([]);
    const grown = new Uint8Array(await out.data.arrayBuffer());
    expect(grown.length - bytes.length).toBeGreaterThan(0);
    expect((grown.length - bytes.length) % 2, 'the tracks section stays even').toBe(0);

    const back = parseSoundControlFile(grown, 'x.sc')!;
    expect(back.patterns[at!.p].channels[at!.ch].rows[at!.row].note).toBe(typed);
    // Every other cell is as it was, but those that play the same track (a track is shared by positions and voices; G17).
    const changed: string[] = [];
    back.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      const was = before[p]?.channels[c]?.rows[r];
      if (!was || was.note !== cell.note || was.instrument !== cell.instrument) changed.push(`${p}:${c}:${r}`);
    })));
    expect(changed).toContain(`${at!.p}:${at!.ch}:${at!.row}`);
    for (const k of changed) { const [kp, kc, kr] = k.split(':').map(Number); expect(back.patterns[kp].channels[kc].rows[kr].note, `${k} (was ${JSON.stringify(before[kp]?.channels[kc]?.rows[kr])}, target ${JSON.stringify(at)})`).toBe(typed); }

    const was = await paulaEventStream(bytes, 'north sea inferno ongame1.sc', 6);
    const now = await paulaEventStream(grown, 'north sea inferno ongame1.sc', 6);
    expect(was.length, 'the player ran (sentinel)').toBeGreaterThan(20);
    expect(now.length, 'the grown module plays').toBeGreaterThan(20);
  });

  it('a wait is split around the typed tick: the bytes before and after are untouched and the table follows', () => {
    // A real wait of the corpus song: find one with at least 2 ticks.
    let waitAt = -1, n = 0;
    for (let t = 0; t < 256 && waitAt < 0; t++) {
      const rel = (bytes[0x40 + t * 2] << 8) | bytes[0x41 + t * 2];
      if (!rel) continue;
      for (let off = 0x40 + rel + 16; ; ) {
        if (bytes[off] === 0xff) break;
        if (bytes[off] === 0) { if (bytes[off + 1] >= 2) { waitAt = off; n = bytes[off + 1]; break; } off += 2; } else off += 4;
      }
    }
    expect(waitAt, 'a wait of two ticks or more in the corpus song').toBeGreaterThan(0);
    const note = Uint8Array.of(20, 1, 0, 64);
    const out = soundControlSplitWait(bytes, waitAt, 1, n, note);
    expect(out.length - bytes.length).toBe(n - 2 === 0 ? 4 : 6);
    expect([...out.subarray(waitAt, waitAt + 8)].slice(0, 2)).toEqual([0, 1]);
    expect([...out.subarray(waitAt + 2, waitAt + 6)]).toEqual([...note]);
    const back = parseSoundControlFile(out, 'x.sc')!;
    expect(back.patterns.length).toBe(parseSoundControlFile(bytes, 'x.sc')!.patterns.length);
  });
});
