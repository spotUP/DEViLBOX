/**
 * A DeliTracker Custom song (.cus) imports with a grid that holds its notes.
 *
 * skyfox2.cus played but its grid was one note in one pattern: the format sat
 * on the scan CRASH list ("soft reset fails after scan -> stutter"), and even
 * when scanned the tick snapshot ring stayed empty, because UADE's tick hook
 * sat on CIA-A Timer A while the score runs every DTP_Interrupt player from
 * CIA-A Timer B. Measured 2026-10-05: scan + full reset + reload plays
 * sample-identical to a clean load, so the stutter premise is gone.
 *
 * Drives the real worklet and WASM through the import entry (parseUADEFile);
 * only UADEEngine.getInstance is replaced, by a shim that forwards the load to
 * the worklet the way UADEEngine does.
 */
import { describe, it, expect, vi } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs, type WorkletProc } from '@/engine/__tests__/workletHarness';
import { UADEEngine } from '@engine/uade/UADEEngine';
import { parseUADEFile } from '@lib/import/formats/UADEParser';

const DIR = 'public/data/songs/delitracker-custom/';
const transform = async (c: string) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c);

function capture(proc: WorkletProc, secs: number): Float32Array {
  const quanta = (48000 * secs) / 128;
  const left = new Float32Array(quanta * 128);
  for (let q = 0; q < quanta; q++) {
    const out = stereoOutputs(37);
    proc.process([], out);
    left.set(out[0][0], q * 128);
  }
  return left;
}

describe('DeliTracker Custom grid', { timeout: 300_000 }, () => {
  it('skyfox2.cus imports through the scan with hundreds of notes, and plays as if never scanned', async () => {
    const name = 'skyfox2.cus';
    const { proc, send, posted } = await startWorklet('uade', 'UADE', transform);
    const engine = {
      ready: async () => {}, enableTickSnapshots: () => {}, resetTickSnapshots: () => {},
      getTickSnapshots: async () => [], addCompanionFile: async () => {},
      load: async (buffer: ArrayBuffer, filenameHint: string, skipScan: boolean, subsong: number, scanTimeoutSec?: number) => {
        await send({ type: 'load', buffer, filenameHint, skipScan, subsong, scanTimeoutSec });
        const d = posted.find((m) => m.type === 'loaded') as Record<string, unknown>;
        return { ...d, startSubsong: d.startSubsong ?? 0 };
      },
    };
    const spy = vi.spyOn(UADEEngine, 'getInstance').mockReturnValue(engine as unknown as UADEEngine);
    try {
      const song = await parseUADEFile(songBuffer(DIR + name), name);
      const loaded = posted.find((m) => m.type === 'loaded') as { shortScanTicks?: unknown[] };
      // Sentinel: the scan ran and the player's ticks reached the ring.
      expect(loaded.shortScanTicks?.length ?? 0, 'no tick snapshots from the scan').toBeGreaterThan(1000);

      const perChannel = [0, 0, 0, 0];
      for (const p of song.patterns) p.channels.forEach((c, ch) => {
        for (const r of c.rows) if (r.note > 0 && r.note < 97) perChannel[ch]++;
      });
      const notes = perChannel.reduce((a, b) => a + b, 0);
      expect(notes, `grid notes per channel ${perChannel.join('/')}`).toBeGreaterThan(300);
      // Paula sounds voices 0-2 in this song; each must show notes.
      expect(perChannel.slice(0, 3).every((n) => n > 20), perChannel.join('/')).toBe(true);
    } finally {
      spy.mockRestore();
    }

    // Playback after the scan (full reset + reload) against a clean load.
    await send({ type: 'play' });
    const scanned = capture(proc, 5);
    const clean = await startWorklet('uade', 'UADE', transform);
    await clean.send({ type: 'load', buffer: songBuffer(DIR + name), filenameHint: name, skipScan: true, subsong: 0 });
    await clean.send({ type: 'play' });
    const reference = capture(clean.proc, 5);
    let maxDiff = 0, peak = 0;
    for (let i = 0; i < reference.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(reference[i] - scanned[i]));
      peak = Math.max(peak, Math.abs(reference[i]));
    }
    expect(peak).toBeGreaterThan(0.05);
    expect(maxDiff, 'playback after the scan differs from a clean load').toBe(0);
  });
});
