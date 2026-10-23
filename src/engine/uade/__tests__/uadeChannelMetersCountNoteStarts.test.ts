/**
 * Fashion Tracker's channel meters flashed on a fraction of its notes: UADE
 * reported only Paula volume every 50 ms, and a note retriggered at an
 * unchanged volume (or shorter than 50 ms) moves no level. The core now
 * counts note starts per channel on every player tick, with the detector the
 * pattern grid uses, and the meters flash on every rise of that count.
 * Real worklet and WASM, real song, the production ChannelMeterFeed.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from '@/engine/__tests__/workletHarness';
import { ChannelMeterFeed } from '@/engine/tone/channelMeterFeed';

describe('UADE channel meters', { timeout: 120_000 }, () => {
  it('flash on more Fashion Tracker notes than the level-jump rule saw', async () => {
    const { proc, send, posted } = await startWorklet('uade', 'UADE', async (c) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c), 'UADE', true);
    await send({ type: 'load', buffer: songBuffer('public/data/songs/fashion-tracker/ivory tover ii.ex'), filenameHint: 'ex.ivory tover ii', skipScan: true, subsong: 0 });
    await send({ type: 'play' });
    const counted = [0, 0, 0, 0]; const byLevel = [0, 0, 0, 0];
    const sinkOf = (hits: number[]) => ({ updateRealtimeChannelLevels() {}, triggerChannelMeter(i: number) { hits[i]++; } });
    const countedFeed = new ChannelMeterFeed(); const levelFeed = new ChannelMeterFeed();
    for (let q = 0; q < (48000 * 20) / 128; q++) {
      (globalThis as { __workletClock?: number }).__workletClock = (q * 128) / 48000;
      proc.process([], stereoOutputs(37));
      while (posted.length) {
        const m = posted.shift() as { type?: string; levels?: Float32Array; noteStarts?: number[]; audioTime?: number };
        if (m.type !== 'chLevels') continue;
        // The block the levels were read after: the engine holds the report until it is heard.
        expect(m.audioTime).toBe((q * 128) / 48000);
        countedFeed.feedCounted(sinkOf(counted), m.levels!, m.noteStarts!);
        levelFeed.feed(sinkOf(byLevel), m.levels!);
      }
    }
    // The first pattern alone holds 4 notes on channel 2 (grid read with parseFashionTrackerFile).
    expect(counted[2]).toBeGreaterThanOrEqual(4);
    expect(counted[2]).toBeGreaterThan(byLevel[2]);
    expect(counted.reduce((a, b) => a + b, 0)).toBeGreaterThan(byLevel.reduce((a, b) => a + b, 0));
  });

  it('post the block a note starts in, not the next 20 Hz report', async () => {
    const { proc, send, posted } = await startWorklet('uade', 'UADE', async (c) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c), 'UADE', true);
    await send({ type: 'load', buffer: songBuffer('public/data/songs/fashion-tracker/ivory tover ii.ex'), filenameHint: 'ex.ivory tover ii', skipScan: true, subsong: 0 });
    await send({ type: 'play' });
    const wasm = (proc as unknown as { _wasm: { _malloc(n: number): number; _uade_wasm_get_note_start_counts(p: number): void; HEAPU8: Uint8Array } })._wasm;
    const buf = wasm._malloc(16);
    let prev = [0, 0, 0, 0]; let starts = 0;
    for (let q = 0; q < (48000 * 20) / 128; q++) {
      (globalThis as { __workletClock?: number }).__workletClock = (q * 128) / 48000;
      proc.process([], stereoOutputs(37));
      wasm._uade_wasm_get_note_start_counts(buf);
      const now = Array.from(new Uint32Array(wasm.HEAPU8.buffer, buf, 4));
      const reports = posted.splice(0).filter((m) => (m as { type?: string }).type === 'chLevels') as { noteStarts?: number[] }[];
      if (now.some((n, i) => n !== prev[i])) {
        starts++;
        // The count the core reached this block is posted this block.
        expect(reports.map((m) => m.noteStarts)).toContainEqual(now);
      }
      prev = now;
    }
    // Sparse opening: channel 3 only starts its run of notes after 15 s.
    expect(starts).toBeGreaterThan(10);
  });
  it('count a note in the tick it is written, not at the next tick poll', async () => {
    // The tick snapshots poll Paula at the player tick overflow, before that
    // tick's handler runs, so they see a note one tick after it was written.
    // The meter count is taken at the register write: it must already have
    // risen before the block of the poll that flags the note. Counting at the
    // tick poll (the old way) rose in the poll's own block, about 20 ms late.
    const { proc, send } = await startWorklet('uade', 'UADE', async (c) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c), 'UADE', true);
    await send({ type: 'load', buffer: songBuffer('public/data/songs/fashion-tracker/ivory tover ii.ex'), filenameHint: 'ex.ivory tover ii', skipScan: true, subsong: 0 });
    await send({ type: 'play' });
    const wasm = (proc as unknown as { _wasm: { _malloc(n: number): number; _uade_wasm_get_note_start_counts(p: number): void; _uade_wasm_enable_tick_snapshots(on: number): void; _uade_wasm_get_tick_snapshots(p: number, max: number): number; HEAPU8: Uint8Array } })._wasm;
    const counts = wasm._malloc(16); const snaps = wasm._malloc(64 * 13 * 4);
    wasm._uade_wasm_enable_tick_snapshots(1);
    let prev = [0, 0, 0, 0];
    // Block of the previous tick poll per channel, and whether the count rose since.
    let lastPollBlock = -1; const roseSincePoll = [false, false, false, false];
    let flagged = 0; let early = 0;
    for (let q = 0; q < (48000 * 20) / 128; q++) {
      (globalThis as { __workletClock?: number }).__workletClock = (q * 128) / 48000;
      proc.process([], stereoOutputs(37));
      const n = wasm._uade_wasm_get_tick_snapshots(snaps, 64);
      const words = new Uint32Array(wasm.HEAPU8.buffer, snaps, n * 13);
      wasm._uade_wasm_get_note_start_counts(counts);
      const now = Array.from(new Uint32Array(wasm.HEAPU8.buffer, counts, 4));
      if (n > 0 && lastPollBlock >= 0) {
        for (let ch = 0; ch < 4; ch++) {
          if (!(words[(n - 1) * 13 + 1 + ch * 3 + 2] & 1)) continue;
          flagged++;
          if (roseSincePoll[ch]) early++;
        }
      }
      if (n > 0) { lastPollBlock = q; roseSincePoll.fill(false); }
      // A rise in this block belongs to the handler that follows this block's poll.
      now.forEach((c, ch) => { if (c !== prev[ch]) roseSincePoll[ch] = true; });
      prev = now;
    }
    // Counting at the poll can never rise before it (measured 0 of 14). Counted
    // at the write, a note rises in an earlier block whenever the write and the
    // poll fall in different render calls (measured 8 of 14); the emulator
    // renders in bursts, so the rest share one call and block order cannot
    // tell them apart.
    expect(flagged).toBeGreaterThan(10);
    expect(early).toBeGreaterThanOrEqual(Math.ceil(flagged / 3));
  });
});
