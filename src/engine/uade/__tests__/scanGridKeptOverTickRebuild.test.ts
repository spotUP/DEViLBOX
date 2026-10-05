/**
 * A UADE import on the generic enhanced-scan route keeps its scan grid.
 *
 * Once the tick snapshot ring filled from the player's real tick
 * (2026-10-05), a never-before-run rebuild on this route replaced scan grids
 * with tick-rebuilt ones: anthrox.fc went from ~1580 grid notes to an empty
 * one-pattern grid (13 of 50 corpus songs went empty). Drives the real
 * worklet and WASM through parseUADEFile; only UADEEngine.getInstance is a
 * shim that forwards to the worklet the way UADEEngine does.
 */
import { describe, it, expect, vi } from 'vitest';
import { startWorklet, songBuffer } from '@/engine/__tests__/workletHarness';
import { UADEEngine } from '@engine/uade/UADEEngine';
import { parseUADEFile } from '@lib/import/formats/UADEParser';

describe('generic UADE scan grid', { timeout: 300_000 }, () => {
  it('anthrox.fc imports with its scan grid notes on every channel', async () => {
    const name = 'anthrox.fc';
    const { send, posted } = await startWorklet('uade', 'UADE', async (c) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c));
    // When the parser stops capture, count what the ring held first.
    let ringAtStop = -1;
    let stopped: Promise<void> = Promise.resolve();
    const engine = {
      ready: async () => {}, addCompanionFile: async () => {},
      enableTickSnapshots: (enable: boolean) => {
        if (enable) { void send({ type: 'enableTickSnapshots', enable }); return; }
        stopped = engine.getTickSnapshots().then((s) => { ringAtStop = s.length; return send({ type: 'enableTickSnapshots', enable }); });
      },
      resetTickSnapshots: () => { void send({ type: 'resetTickSnapshots' }); },
      getTickSnapshots: async () => {
        await send({ type: 'getTickSnapshots', requestId: 1 });
        const r = posted.filter((m) => m.type === 'tickSnapshotsResult').pop() as { snapshots?: unknown[] } | undefined;
        return r?.snapshots ?? [];
      },
      load: async (buffer: ArrayBuffer, filenameHint: string, skipScan: boolean, subsong: number, scanTimeoutSec?: number) => {
        await send({ type: 'load', buffer, filenameHint, skipScan, subsong, scanTimeoutSec });
        const d = posted.find((m) => m.type === 'loaded') as Record<string, unknown>;
        return { ...d, startSubsong: d.startSubsong ?? 0 };
      },
    };
    const spy = vi.spyOn(UADEEngine, 'getInstance').mockReturnValue(engine as unknown as UADEEngine);
    try {
      const song = await parseUADEFile(songBuffer('public/data/songs/formats/' + name), name);
      const perChannel = [0, 0, 0, 0];
      for (const p of song.patterns) p.channels.forEach((c, ch) => {
        for (const r of c.rows) if (r.note > 0 && r.note < 97) perChannel[ch]++;
      });
      expect(perChannel.every((n) => n > 100), perChannel.join('/')).toBe(true);
      // Sentinel: the ring was full of player ticks, so keeping the scan
      // grid is the parser's choice, not an empty ring.
      await stopped;
      expect(ringAtStop).toBeGreaterThan(100);
    } finally {
      spy.mockRestore();
    }
  });
});
