/**
 * SidMon II keyboard: a key on a song instrument runs the module's own replayer
 * voice (Sd2Engine.noteOn -> sd2_note_on), not the generic per-note voice or a
 * Sampler. Reachability: the product's entry point is SidMonSynth.triggerAttack;
 * the Sd2Engine it reaches is replaced by a recorder that forwards the message to
 * the real replayer worklet, so what is measured is what the key plays.
 */
import { describe, it, expect, vi } from 'vitest';
import { startWorklet, songBuffer } from './workletHarness';
import { exposeHeapTransform, renderTicks, fundamentalHz, rmsPerTick, totalRms, db, FPT } from './keyboardPreviewHarness';
import { parseSidMon2File } from '@/lib/import/formats/SidMon2Parser';
import { dedicatedEngineSynthType } from '@/lib/import/parsers/withFallback';

const calls: Array<{ instrument: number; note: number; velocity: number }> = [];
let forward: ((m: { instrument: number; note: number; velocity: number }) => void) | null = null;
vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({ createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }) }),
  noteToMidi: (n: string) => ({ C4: 60 } as Record<string, number>)[n] ?? 60,
}));
vi.mock('@/engine/sidmon/SidMonEngine', () => ({
  SidMonEngine: { getInstance: () => ({ output: { connect() {} }, ready: async () => {}, sendMessage() {} }) },
}));
vi.mock('@/engine/sidmon2/Sd2Engine', () => ({
  Sd2Engine: { getInstance: () => ({
    ready: async () => {},
    noteOn: (instrument: number, note: number, velocity: number) => { calls.push({ instrument, note, velocity }); forward?.({ instrument, note, velocity }); },
    noteOff: () => {},
  }) },
}));
import { SidMonSynth } from '@/engine/sidmon/SidMonSynth';

describe('SidMon II keys play the replayer voice of the song instrument', () => {
  const buf = songBuffer('public/data/songs/formats/bruno_time.sid2');

  it('bruno_time.sid2: a typed key reaches sd2_note_on for the instrument and note of the grid cell, at the song pitch and level', async () => {
    const song = await parseSidMon2File(buf.slice(0), 'bruno_time.sid2');
    const cell = song.patterns[song.songPositions[0]].channels[0].rows[0];
    expect(cell.note).toBeGreaterThan(0);
    const inst = song.instruments.find((i) => i.id === cell.instrument)!;
    expect(inst.synthType).toBe('SidMonSynth');
    // The instrument keeps its voice on a dedicated-engine song (not flattened to Sampler).
    expect(dedicatedEngineSynthType(inst as never)).toBe('SidMonSynth');

    const ticks = 4 * song.initialSpeed - 1;
    const sw = await startWorklet('sidmon2', 'Sd2', exposeHeapTransform);
    await sw.send({ type: 'loadModule', moduleData: buf.slice(0) });
    for (let c = 1; c < 4; c++) await sw.send({ type: 'setChannelGain', channel: c, gain: 0 });
    const songOut = renderTicks(sw.proc, ticks + 20, 0);
    let on = 0; while (on < songOut.length && Math.abs(songOut[on]) < 1e-4) on++;
    const s = songOut.subarray(on, on + ticks * FPT);

    const pw = await startWorklet('sidmon2', 'Sd2', exposeHeapTransform);
    await pw.send({ type: 'loadModule', moduleData: buf.slice(0) });
    forward = (m) => { void pw.send({ type: 'noteOn', ...m }); };
    const synth = new SidMonSynth();
    synth.setSongSlot(inst.sidMon!.songSlot!);
    synth.triggerAttack(cell.note + 11, undefined, 1);
    await new Promise((r) => setTimeout(r, 20));
    forward = null;

    expect(calls.at(-1)).toMatchObject({ instrument: cell.instrument - 1, note: cell.note - 12 });
    const p = renderTicks(pw.proc, ticks, 0);
    const fs = fundamentalHz(s.subarray(0, 8 * FPT)), fp = fundamentalHz(p.subarray(0, 8 * FPT));
    expect(fs).toBeGreaterThan(0);
    expect(Math.abs(1200 * Math.log2(fp / fs)), `pitch ${fp} vs song ${fs}`).toBeLessThan(40);
    expect(Math.abs(db(totalRms(rmsPerTick(p, ticks)), totalRms(rmsPerTick(s, ticks)))), 'level').toBeLessThan(1.5);
  });

  it('a free-standing SidMon instrument (no module slot) never touches the module replayer', () => {
    calls.length = 0;
    const synth = new SidMonSynth();
    synth.triggerAttack(60, undefined, 1);
    expect(calls).toHaveLength(0);
  });
});
