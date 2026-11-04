/**
 * David Whittaker grid notes are named by the pitch the replayer plays (the byte through the variant's period table,
 * scaled by the sample's fine_tune_period), not by a fixed byte + 25. Driven through parseDavidWhittakerFile, the
 * import entry point; the walk only locates the cell the note byte lands in.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { walkDavidWhittaker, DW_WALK, type DwWalkEvent } from '@/lib/import/formats/DavidWhittakerWasmExtractor';
import { parseDavidWhittakerFile } from '@/lib/import/formats/DavidWhittakerParser';
import { dwNoteToByte, dwWalkTransposes } from '@/lib/import/formats/davidWhittakerPitch';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';

let restoreFetch = () => {};
beforeAll(() => { restoreFetch = installDwNodeFetch(); });
afterAll(() => restoreFetch());

const load = (rel: string): ArrayBuffer => {
  const f = readFileSync(resolve(process.cwd(), 'public/data/songs', rel));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};

async function check(rel: string, pick: (e: DwWalkEvent, ftp: number) => boolean, want: number): Promise<void> {
  const ab = load(rel);
  const walk = await walkDavidWhittaker(ab.slice(0));
  const ev = walk.events.find((e) => e.kind === DW_WALK.note && pick(e, walk.layout.pitch.samples[e.a]?.fineTunePeriod ?? 0));
  expect(ev, `${rel}: the note byte is in the song`).toBeDefined();
  if (!ev) return;
  const song = await parseDavidWhittakerFile(ab.slice(0), rel.split('/').pop() ?? rel);
  const cell = song.patterns[Math.floor(ev.tick / 64)].channels[ev.channel].rows[ev.tick % 64];
  expect(cell.note, `${rel}: byte ${ev.b} with sample ${ev.a} at tick ${ev.tick}`).toBe(want);
  // The reverse map gives the byte back, so an unedited note exports unchanged.
  expect(dwNoteToByte(walk.layout.pitch, want, ev.a, dwWalkTransposes(walk).get(ev))).toBe(ev.b);
}

describe('David Whittaker grid notes: named by the pitch the replayer plays', { timeout: 120000 }, () => {
  it('garfield2+.dw: byte 48 with sample 1 shows note 45 (byte + 25 would show 73)', async () => {
    await check('david-whittaker/garfield2+.dw', (e) => e.b === 48 && e.a === 1, 45);
  });
  it('apb.dw: byte 28 with a fine_tune_period 421 sample shows note 17 (byte + 25 would show 53)', async () => {
    await check('formats/apb.dw', (e, ftp) => e.b === 28 && ftp === 421, 17);
  });
});
