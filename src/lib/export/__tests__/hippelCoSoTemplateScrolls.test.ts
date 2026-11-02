/**
 * The playhead of a New Song in Hippel CoSo jumped between position 0 and 1 and never scrolled.
 *
 * The exporter wrote every empty row as the byte pair FE 00. In the COSO replayer (nuade's hippel.c, step_voice)
 * FE is "set row speed": it reads its parameter and goes on to the next byte in the same step, so it takes no time.
 * A pattern of nothing but FE 00 rows took no time at all, every voice ran through the whole song in one step, the
 * player reported a loop on nearly every step and its row count (the grid follow's source) never passed 1. An empty
 * row is FD 00, "wait": the voice holds what it plays for one step. These tests run the real nuade player.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EMPTY_CELL } from '@/types/tracker';
import { NuadeHeadless } from '@/engine/nuade/nuadeHeadless';
import { exportAsHippelCoSo } from '../HippelCoSoExporter';
import { parseAs, readFixture } from './exporterHarness.shared';

const RATE = 48000;

/** The highest grid row the nuade player reports over `seconds` of play (rows count from the song start or last loop). */
async function highestRowPlayed(bytes: Uint8Array, seconds: number): Promise<number> {
  const nu = await NuadeHeadless.create(RATE);
  nu.open(bytes, 'template.hipc', 'hippel');
  expect(nu.start(0)).toBe(true);
  let highest = -1;
  const block = RATE / 50;
  let frame = 0;
  for (let i = 0; i < seconds * 50; i++) {
    frame += nu.render(block).frames;
    const s = nu.snapshot(frame);
    if (s) highest = Math.max(highest, s.row);
  }
  nu.close();
  return highest;
}

describe('Hippel CoSo New Song: the playhead scrolls through the song', () => {
  it('an all-empty song exported from scratch plays one row per step (the template generator path)', async () => {
    const fixture = 'public/data/songs/formats/prehistoric_tale.hipc';
    const song = await parseAs(fixture, readFixture(fixture));
    for (const p of song.patterns) for (const ch of p.channels) ch.rows = ch.rows.map(() => ({ ...EMPTY_CELL }));
    const out = await exportAsHippelCoSo(song);
    const bytes = new Uint8Array(await (out.data as Blob).arrayBuffer());
    // 10 s at 50 ticks a second and speed 6 is about 83 rows.
    expect(await highestRowPlayed(bytes, 10)).toBeGreaterThan(64);
  }, 60_000);

  it('the shipped template plays one row per step', async () => {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/templates/hippelCoSo.hipc')));
    expect(await highestRowPlayed(bytes, 10)).toBeGreaterThan(64);
  }, 60_000);
});
