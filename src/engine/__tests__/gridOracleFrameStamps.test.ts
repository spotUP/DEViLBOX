/**
 * The Paula log stamps each write with the EMULATED output frame, not the drain chunk.
 * UADE's core runs ahead in bursts, so the chunk whose render drained a write can be several
 * chunks later than the write itself, and a cycle-level change elsewhere moves a write across a
 * burst edge. Frame stamps are burst-independent: the same write sequence drained in different
 * chunk sizes carries identical frames.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { openUade, PaulaSession, PAULA_CHUNK, oracleStats, type PaulaWrite } from './gridOracle';

const FILE = 'public/data/songs/ben-daglish/motorhead-titleandingame.bd';

/** Writes with their emulated frame, drained after every `chunksPerDrain` renders (the output chunk the drain saw is returned too). */
async function frames(chunksPerDrain: number): Promise<{ stamps: string[]; drainChunks: number[] }> {
  const uade = await openUade();
  const s = new PaulaSession(uade, new Uint8Array(readFileSync(FILE)), 'motorhead-titleandingame.bd');
  const pL = uade._malloc(PAULA_CHUNK * 4);
  const pR = uade._malloc(PAULA_CHUNK * 4);
  const stamps: string[] = [];
  const drainChunks: number[] = [];
  const take = (ws: PaulaWrite[], chunk: number) => {
    for (const w of ws) if (w.voice < 4) { stamps.push(`${w.frame}:${w.voice}:${w.reg}:${w.value}`); drainChunks.push(chunk); }
  };
  take(s.drain(), 0);
  for (let c = 1; c <= 300; c++) {
    if (uade._uade_wasm_render(pL, pR, PAULA_CHUNK) <= 0) break;
    if (c % chunksPerDrain === 0) take(s.drain(), c);
  }
  take(s.drain(), 300);
  s.close();
  return { stamps, drainChunks };
}

describe('Paula log frame stamps', () => {
  it('are the same however the log is drained (emulated time, not drain chunk)', async () => {
    const before = oracleStats.writes;
    const a = await frames(1);
    const b = await frames(7);
    expect(oracleStats.writes - before, 'the log ran').toBeGreaterThan(0);
    expect(a.stamps.length).toBeGreaterThan(50);
    // The drain chunk is not an invariant: the same writes were drained in different chunks under the two schedules.
    expect(b.drainChunks).not.toEqual(a.drainChunks);
    expect(b.stamps).toEqual(a.stamps);
  }, 120000);
});
