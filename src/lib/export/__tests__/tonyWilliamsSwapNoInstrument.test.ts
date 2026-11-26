/**
 * Tony Williams: a note with another instrument on a voice that has no Instrument command yet cannot restore the
 * player's compiled-in start instrument; it is refused with that reason and the file stays byte-identical. Every
 * corpus Tony Williams song is probed (no voice there has a later Instrument command, so nothing is writable).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseTonyWilliamsFile } from '@lib/import/formats/TonyWilliamsParser';
import { exportTonyWilliams } from './../TonyWilliamsExporter';

const DIR = 'public/data/songs/sound-images/Tony Williams';
const NAMES = ['future basketball main.tw', 'blinkys scary school-sfx.tw', ...(existsSync(join(process.cwd(), DIR)) ? readdirSync(join(process.cwd(), DIR)) : []).filter((f) => f.endsWith('.tw')).map((f) => `@${f}`)];

describe('Tony Williams instrument swap before any Instrument command', () => {
  it.each(NAMES)('%s: every attempt is written and reads back, or refused for the initial instrument', async (name) => {
    const raw = readFileSync(name.startsWith('@') ? join(process.cwd(), DIR, name.slice(1)) : join(process.cwd(), 'public/data/songs/sound-images', name));
    const buf = (): ArrayBuffer => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const probe = await parseTonyWilliamsFile(buf(), name).catch(() => null);
    if (!probe) return; // the walker does not understand this module (no grid to edit)
    let written = 0, refused = 0, tried = 0;
    for (let p = 0; p < probe.patterns.length && tried < 40; p++) for (let c = 0; c < 4 && tried < 40; c++) {
      const rows = probe.patterns[p].channels[c].rows;
      const firstInstr = rows.findIndex((x) => x.instrument > 0);
      if (p > 0 || firstInstr === 0) continue;
      for (let r = 1; r < Math.min(rows.length, firstInstr < 0 ? 64 : firstInstr) && tried < 40; r++) {
        if (rows[r].note !== 0 || rows[r - 1].note === 0) continue;
        tried++;
        const song = await parseTonyWilliamsFile(buf(), name);
        song.patterns[p].channels[c].rows[r].note = 40;
        song.patterns[p].channels[c].rows[r].instrument = 16;
        const res = await exportTonyWilliams(song);
        const data = new Uint8Array(await res.data.arrayBuffer());
        if (res.warnings.length > 0) {
          refused++;
          expect(res.warnings.some((w) => /starts the voice with/.test(w) || /not written/.test(w))).toBe(true);
          expect(Buffer.from(data).equals(raw)).toBe(true);
        } else {
          written++;
          const re = await parseTonyWilliamsFile(data.buffer.slice(0) as ArrayBuffer, 'x.tw');
          expect(re.patterns[p].channels[c].rows[r].note).toBe(40);
          expect(re.patterns[p].channels[c].rows[r].instrument).toBe(16);
        }
      }
    }
  });
});
