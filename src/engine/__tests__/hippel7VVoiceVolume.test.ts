/**
 * A Hippel 7V grid shows what the ear hears: a voice turned down for a step,
 * and the volume sequence each note really plays.
 *
 * `lethalxcess-intro.hip7` was judged "Incorrect Pattern Data" (jukebox
 * 2026-10-02 21:25) while `ghostbattle_gameover.hip7` was "Good". Headless,
 * both songs' play positions landed in the grid's cells step for step and
 * row for row, with no pattern breaks; the one measured difference was the
 * track table's fourth byte per voice: a `0xFx` voice-volume command.
 * lethalxcess has 245 of 1449 voice-steps at 36 % or less that still carry
 * notes, ghostbattle none. The grid drew those notes and said nothing about
 * the volume, so they looked wrong.
 *
 * The same pass makes instrument numbers 1-based like CoSo's: the raw volume
 * sequence index was shown as the instrument number, so every cell named the
 * sequence before the one it plays, and sequence 0 showed as no instrument.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const QUIET = 'public/data/songs/hippel-7v/lethalxcess-intro.hip7';
const GOOD = 'public/data/songs/formats/ghostbattle_gameover.hip7';

function file(rel: string): ArrayBuffer {
  const b = readFileSync(resolve(ROOT, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];

/** The track table and subsong-0 step range, read from the header directly. */
function trackTable(b: Uint8Array) {
  let h = -1;
  for (let i = 0; i + 5 <= b.length; i += 2) if (b[i] === 0x54 && b[i + 1] === 0x46 && b[i + 2] === 0x4d && b[i + 3] === 0x58 && b[i + 4] === 0) { h = i; break; }
  const nSnd = u16(b, h + 4) + 1, nVol = u16(b, h + 6) + 1, nPat = u16(b, h + 8) + 1, nSteps = u16(b, h + 0xa) + 1;
  const patterns = h + 0x20 + nSnd * 64 + nVol * 64;
  const tracks = patterns + nPat * 64;
  const songs = tracks + nSteps * 28;
  return { patterns, tracks, first: u16(b, songs), last: u16(b, songs + 2), nVol };
}

describe('a Hippel 7V grid', { timeout: 60000 }, () => {
  it('shows a voice turned down for a step in row 0 of its volume column', async () => {
    const { parseJochenHippel7VFile, tfmx7VVoiceVolumeColumn } = await import('@lib/import/formats/JochenHippel7VParser');
    for (const [rel, expectQuiet] of [[QUIET, true], [GOOD, false]] as const) {
      const ab = file(rel);
      const b = new Uint8Array(ab);
      const song = parseJochenHippel7VFile(ab, rel.split('/').pop()!);
      const tt = trackTable(b);
      let shown = 0, quiet = 0, commands = 0;
      for (let p = 0; p < song.patterns.length; p++) {
        const stepOff = tt.tracks + (tt.first + p) * 28;
        for (let v = 0; v < 7; v++) {
          const cmd = b[stepOff + v * 4 + 3];
          const rows = song.patterns[p].channels[v].rows;
          // Every other row shows no volume: the command is the step's, not a note's.
          expect(rows.slice(1).every((c) => c.volume === 0)).toBe(true);
          expect(rows[0].volume, `${rel} step ${p} voice ${v} cmd ${cmd}`).toBe(tfmx7VVoiceVolumeColumn(cmd));
          if (cmd >> 4 === 0x0f) {
            commands++;
            if (rows[0].volume >= 0x10) shown++;
            if (rows[0].volume <= 0x10 + 23 && rows.some((c) => c.note > 0)) quiet++;
          }
        }
      }
      expect(shown).toBe(commands);
      // Measured 245 quiet voice-steps with notes in lethalxcess, 0 in ghostbattle.
      if (expectQuiet) expect(quiet).toBeGreaterThan(200); else expect(quiet).toBe(0);
    }
  });

  it('maps every voice-volume command through the column and back', async () => {
    const { tfmx7VVoiceVolumeColumn, tfmx7VVoiceVolumeCommand } = await import('@lib/import/formats/JochenHippel7VParser');
    for (let v2 = 0; v2 < 16; v2++) {
      const cmd = 0xf0 | v2;
      const col = tfmx7VVoiceVolumeColumn(cmd);
      expect(col).toBeGreaterThanOrEqual(0x10);
      expect(col).toBeLessThanOrEqual(0x50);
      expect(tfmx7VVoiceVolumeCommand(col, cmd), `cmd ${cmd.toString(16)}`).toBe(cmd);
      expect(tfmx7VVoiceVolumeCommand(col, 0)).toBe(cmd);
    }
    // 0xF0 is full volume; 0xFF is the decoder's 6 %.
    expect(tfmx7VVoiceVolumeColumn(0xf0)).toBe(0x50);
    expect(tfmx7VVoiceVolumeColumn(0xff)).toBe(0x10 + 4);
    // No volume shown for a rate command, and a volume typed over one is refused.
    expect(tfmx7VVoiceVolumeColumn(0xd4)).toBe(0);
    expect(tfmx7VVoiceVolumeCommand(0x30, 0xd4)).toBeNull();
    // Clearing the column removes the command.
    expect(tfmx7VVoiceVolumeCommand(0, 0xf8)).toBe(0);
  });

  it('writes a volume edit into the step command and nothing else', async () => {
    const { parseJochenHippel7VFile } = await import('@lib/import/formats/JochenHippel7VParser');
    const { rebuildHippelModule } = await import('../hippel/rebuildHippelModule');
    const ab = file(QUIET);
    const song = parseJochenHippel7VFile(ab, 'lethalxcess-intro.hip7');
    const original = new Uint8Array(ab);
    // A step with a voice at 6 % (0xFF) that has notes in it.
    const tt = trackTable(original);
    let p = -1, v = -1;
    for (let i = 0; i < song.patterns.length && p < 0; i++) {
      for (let ch = 0; ch < 7; ch++) {
        if (original[tt.tracks + (tt.first + i) * 28 + ch * 4 + 3] === 0xff && song.patterns[i].channels[ch].rows.some((c) => c.note > 0)) { p = i; v = ch; break; }
      }
    }
    expect(p).toBeGreaterThanOrEqual(0);
    const cmdOff = tt.tracks + (tt.first + p) * 28 + v * 4 + 3;
    const cell = song.patterns[p].channels[v].rows[0];
    expect(cell.volume).toBe(0x14);
    cell.volume = 0x50;
    const out = rebuildHippelModule(ab, song.patterns, song.instruments.length)!;
    expect(out.refused).toEqual([]);
    expect(out.written).toBe(1);
    const changed: number[] = [];
    for (let i = 0; i < original.length; i++) if (out.bytes[i] !== original[i]) changed.push(i);
    expect(changed).toEqual([cmdOff]);
    expect(out.bytes[cmdOff]).toBe(0xf0);
    const again = parseJochenHippel7VFile(out.bytes.buffer as ArrayBuffer, 'x.hip7');
    expect(again.patterns[p].channels[v].rows[0].volume).toBe(0x50);
    // A volume on any other row has no bytes behind it and is refused.
    const fresh = parseJochenHippel7VFile(ab, 'lethalxcess-intro.hip7');
    fresh.patterns[p].channels[v].rows[5].volume = 0x30;
    const refused = rebuildHippelModule(ab, fresh.patterns, fresh.instruments.length)!;
    expect(refused.written).toBe(0);
    expect(refused.refused).toEqual([`${p}:${v}:5`]);
  });

  it('numbers instruments from 1, the volume sequence plus one, as CoSo does', async () => {
    const { parseJochenHippel7VFile } = await import('@lib/import/formats/JochenHippel7VParser');
    const { rebuildHippelModule } = await import('../hippel/rebuildHippelModule');
    const ab = file(GOOD);
    const b = new Uint8Array(ab);
    const song = parseJochenHippel7VFile(ab, 'ghostbattle_gameover.hip7');
    const tt = trackTable(b);
    let checked = 0;
    for (let p = 0; p < song.patterns.length && checked < 200; p++) {
      const stepOff = tt.tracks + (tt.first + p) * 28;
      for (let v = 0; v < 7; v++) {
        const pt = b[stepOff + v * 4], st = (b[stepOff + v * 4 + 2] << 24) >> 24;
        for (let r = 0; r < 32; r++) {
          const note = b[tt.patterns + pt * 64 + r * 2], info = b[tt.patterns + pt * 64 + r * 2 + 1];
          if ((note & 0x7f) <= 1 || (note & 0x80)) continue;
          const seq = ((info & 0x1f) + st) & 0xff;
          expect(song.patterns[p].channels[v].rows[r].instrument, `step ${p} voice ${v} row ${r}`).toBe(seq + 1 <= tt.nVol ? seq + 1 : 0);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    // Sequence 0 is an instrument too: it shows as 1, not as nothing.
    expect(song.patterns.some((pat) => pat.channels.some((ch) => ch.rows.some((c) => c.note > 0 && c.instrument === 1)))).toBe(true);
    // Picking instrument N on a note writes sequence N-1 with the transpose undone.
    const p = 0, v = 0;
    const r = song.patterns[p].channels[v].rows.findIndex((c) => c.note > 0 && c.instrument > 0);
    expect(r).toBeGreaterThanOrEqual(0);
    const stepOff = tt.tracks + (tt.first + p) * 28;
    const st = (b[stepOff + v * 4 + 2] << 24) >> 24;
    const target = Math.max(1, Math.min(tt.nVol, st + 3));
    song.patterns[p].channels[v].rows[r].instrument = target;
    const out = rebuildHippelModule(ab, song.patterns, song.instruments.length)!;
    expect(out.refused).toEqual([]);
    const off = tt.patterns + b[stepOff + v * 4] * 64 + r * 2 + 1;
    expect(out.bytes[off] & 0x1f).toBe(((target - 1) - st) & 0x1f);
    expect(parseJochenHippel7VFile(out.bytes.buffer as ArrayBuffer, 'x.hip7').patterns[p].channels[v].rows[r].instrument).toBe(target);
  });
});
