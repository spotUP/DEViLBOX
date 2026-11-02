/**
 * N12i: a note typed on the blank Hippel CoSo New Song template did not sound.
 *
 * CoSo plays on nuade, whose player (third-party/nuade/players/hippel/hippel.c, uade_module_valid) counts the
 * subsongs as the 6-byte entries between the song table (header long 0x14) and the sample table (0x18), less one:
 * real COSO files close the song table with an all-zero entry. The from-scratch writer wrote one entry and no end
 * entry, so the template had 0 subsongs, nuade refused it ("not a valid Jochen Hippel COSO module") and nothing played.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EMPTY_CELL } from '@/types/tracker';
import { exportAsHippelCoSo } from '../HippelCoSoExporter';
import { parseAs, readFixture } from './exporterHarness.shared';

/** The subsong count the nuade / UADE COSO player reads from a module (0 or less: the player refuses it). */
function playerSubsongCount(b: Uint8Array): number {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const songs = dv.getUint32(0x14);
  const sampleTable = dv.getUint32(0x18);
  return ((sampleTable - songs) / 6 | 0) - 1;
}

describe('Hippel CoSo blank template plays on nuade', () => {
  it('the exporter writes a song table the player accepts when every cell is cleared (the template generator path)', async () => {
    const fixture = 'public/data/songs/formats/prehistoric_tale.hipc';
    const song = await parseAs(fixture, readFixture(fixture));
    for (const p of song.patterns) for (const ch of p.channels) ch.rows = ch.rows.map(() => ({ ...EMPTY_CELL }));
    const out = await exportAsHippelCoSo(song);
    const bytes = new Uint8Array(await (out.data as Blob).arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('COSO');
    expect(playerSubsongCount(bytes)).toBe(1);
    // The entry after the one subsong is the all-zero end entry real files carry.
    const songs = new DataView(bytes.buffer).getUint32(0x14);
    expect(Array.from(bytes.slice(songs + 6, songs + 12))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('the shipped template has one subsong the player opens', () => {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/templates/hippelCoSo.hipc')));
    expect(playerSubsongCount(bytes)).toBe(1);
  });
});
