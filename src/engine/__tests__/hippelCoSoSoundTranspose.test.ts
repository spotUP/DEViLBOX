/**
 * A Hippel CoSo step's third byte is a sound transpose: the replayer plays
 * envelope (info & 31) + transpose. The grid showed the info byte alone, so a
 * voice that played instrument 6 showed instrument 1. The cell now shows the
 * played instrument, and writing it back stays byte exact.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeCoSoGrid, parseHippelCoSoFile } from '@lib/import/formats/HippelCoSoParser';

const REL = 'public/data/songs/formats/prehistoric_tale.hipc';
const file = () => new Uint8Array(readFileSync(resolve(__dirname, '../../../', REL)));
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

describe('Hippel CoSo grid instrument', () => {
  it('shows the envelope the replayer plays: info byte plus the step sound transpose', async () => {
    const buf = file();
    const song = await parseHippelCoSoFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'x.hipc');
    const n = song.instruments.length;
    const patternsOff = u32(buf, 12), songsOff = u32(buf, 20), tracksOff = u32(buf, 16);
    const first = (buf[songsOff] << 8) | buf[songsOff + 1];
    const last = (buf[songsOff + 2] << 8) | buf[songsOff + 3];
    const steps = last - first + 1;
    const pointer = tracksOff + first * 12;
    const { rows, spans } = decodeCoSoGrid(buf, patternsOff, pointer, steps, n);
    let checked = 0, transposed = 0;
    const cur = [0, 0, 0, 0];
    for (let s = 0; s < steps; s++) for (let ch = 0; ch < 4; ch++) {
      const t = buf[pointer + s * 12 + ch * 3 + 2];
      if (t <= 127) cur[ch] = t;
      rows[s][ch].forEach((cell, r) => {
        const sp = spans[s][ch][r];
        if (!sp || cell.note === 0) return;
        const env = ((buf[sp.offset + 1] & 31) + cur[ch]) & 0xFF;
        expect(cell.instrument).toBe(env < n ? env + 1 : 1);
        checked++;
        if (cur[ch] > 0) transposed++;
        // Writing the shown cell back reproduces the info byte (the note byte
        // of an out-of-table note is clamped by the display, a separate matter).
        const out = sp.encode({ ...cell }, buf);
        if (out) expect(out[1]).toBe(buf[sp.offset + 1]);
      });
    }
    expect(checked).toBeGreaterThan(0);
    expect(transposed, 'fixture has a sound-transposed note').toBeGreaterThan(0);
  });
});
