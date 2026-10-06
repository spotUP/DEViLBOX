/**
 * An edited SidMon 1 song plays the edit (owner, 2026-10-06).
 *
 * SidMon1Replayer had no `gridCellEdits`, so a grid edit fell through to
 * writeCellToChipRam (UADE chip RAM, where this song is not playing): the edit
 * was shown and never heard, and a reload played the original bytes.
 *
 * One reachability test: the store's real setCell on a parsed anarchy.sid1 ->
 * sendCellEditsToEngine -> the registry's gridCellEdits route -> the real
 * SidMon1ReplayerEngine.setCell -> 'setRow' to the real worklet and WASM. The
 * sentinel is the engine's setCell; the proof is the voice that consumes that
 * row sounding the edited note (the replayer's own note register), the render
 * differing from the unedited one, and the module a reload plays carrying it.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSharedWorkletScripts, startWorklet } from './workletHarness';
import { sm1IndexToXM } from '@/engine/uade/encoders/SidMon1Encoder';

const uadeWrites = vi.hoisted(() => [] as number[]);
vi.mock('@/engine/uade/UADEEngine', () => ({
  UADEEngine: { hasInstance: () => true, getInstance: () => ({ readMemory: async (_a: number, n: number) => new Uint8Array(n), writeMemory: async (a: number) => { uadeWrites.push(a); } }) },
}));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({}) }));

interface Mod {
  _malloc(n: number): number;
  _player_render(ptr: number, frames: number): number;
  _player_get_voice_consumed(v: number): number;
  _player_get_voice_rows_consumed(v: number): number;
  _player_get_voice_note(v: number): number;
}

async function play(bytes: ArrayBuffer, posted: { type: string; index: number; bytes: Uint8Array }[], row: number) {
  const { proc, send } = await startWorklet('sidmon1', 'SidMon1Replayer');
  await send({ type: 'loadModule', moduleData: bytes.slice(0) });
  await send({ type: 'resume' });
  for (const m of posted) await send(m);
  const m = proc.module as unknown as Mod;
  const out = m._malloc(960 * 2 * 4);
  const heap = () => new Float32Array((proc.module as unknown as { wasmMemory: WebAssembly.Memory }).wasmMemory.buffer, out, 960 * 2);
  let soundedNote = -1;
  let seen = 0;
  const audio: number[] = [];
  for (let tick = 0; tick < 6000 && (soundedNote < 0 || tick < 400); tick++) {
    m._player_render(out, 960);
    if (tick < 400) audio.push(...Array.from(heap()).filter((_, i) => i % 24 === 0));
    const n = m._player_get_voice_rows_consumed(0);
    if (n !== seen) {
      seen = n;
      if (soundedNote < 0 && m._player_get_voice_consumed(0) === row) soundedNote = sm1IndexToXM(m._player_get_voice_note(0));
    }
  }
  return { soundedNote, audio };
}

describe('an edited SidMon 1 song still plays, and plays the edit', () => {
  it('a grid edit reaches the replayer row it shows, and the reloaded module', { timeout: 60000 }, async () => {
    loadSharedWorkletScripts();
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const raw = readFileSync(join(__dirname, '../../../public/data/songs/formats/anarchy.sid1'));
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const song = await parseModuleToSong(new File([ab], 'anarchy.sid1'), 0);

    const { useFormatStore } = await import('@stores/useFormatStore');
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    useTrackerStore.getState().loadPatterns(structuredClone(song.patterns));
    useFormatStore.getState().applyEditorMode(song as never);
    const layout = useFormatStore.getState().uadePatternLayout!;

    // The first cell of voice 0 that shows a note, with the module row behind it.
    // (the first time voice 0 consumes that row, so no earlier cell of the voice shares it)
    let step = -1, g = -1;
    const moduleRowOf = (p: number, r: number) => (layout.getCellFileOffset!(p, r, 0) - layout.patternDataFileOffset) / 5;
    const earlier = new Set<number>();
    outer: for (let p = 0; p < song.patterns.length; p++) {
      for (let r = 0; r < song.patterns[p].channels[0].rows.length; r++) {
        if (layout.getCellFileOffset!(p, r, 0) < 0) continue;
        const row = moduleRowOf(p, r);
        if (song.patterns[p].channels[0].rows[r].note > 0 && !earlier.has(row)) { step = p; g = r; break outer; }
        earlier.add(row);
      }
    }
    expect(step, 'a note cell on voice 0').toBeGreaterThanOrEqual(0);
    const moduleRow = moduleRowOf(step, g);
    const was = song.patterns[step].channels[0].rows[g].note;
    const edited = was + 5;

    // The engine the registry resolves: the real class, its worklet the real one.
    const { SidMon1ReplayerEngine } = await import('@/engine/sidmon1/SidMon1ReplayerEngine');
    const posted: { type: string; index: number; bytes: Uint8Array }[] = [];
    const fake = Object.create(SidMon1ReplayerEngine.prototype) as { workletNode: unknown };
    fake.workletNode = { port: { postMessage: (m: { type: string; index: number; bytes: Uint8Array }) => posted.push(m) } };
    vi.spyOn(SidMon1ReplayerEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(SidMon1ReplayerEngine, 'getInstance').mockReturnValue(fake as never);
    const setCell = vi.spyOn(SidMon1ReplayerEngine.prototype, 'setCell');
    const ts = await import('@engine/TrackerReplayer');
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    vi.spyOn(ts, 'getTrackerReplayer').mockReturnValue({ getSong: () => liveTrackerSong(), syncCellToWasmSequencer() {}, setChannelMuteMask() {}, isPlaying: () => false } as never);

    useTrackerStore.setState({ currentPatternIndex: step });
    const before = await play(ab, [], moduleRow);
    expect(before.soundedNote, 'unedited: the grid shows what sounds').toBe(was);

    useTrackerStore.getState().setCell(0, g, { note: edited });
    await vi.waitFor(() => expect(setCell).toHaveBeenCalled()); // the sentinel: the engine's setCell ran
    expect(uadeWrites, 'no longer falls through to UADE chip RAM').toEqual([]);
    expect(posted.length).toBeGreaterThan(0);

    const after = await play(ab, posted, moduleRow);
    expect(after.soundedNote, 'the edited note is what sounds on that row and voice').toBe(edited);
    expect(after.audio.some((v) => Math.abs(v) > 0.001), 'and it still plays').toBe(true);
    expect(after.audio).not.toEqual(before.audio);

    // A reload (stop, play) loads the module the song carries: the edit is in it.
    const carried = new Uint8Array(useFormatStore.getState().sidmon1WasmFileData!);
    const reloaded = await play(carried.buffer.slice(0) as ArrayBuffer, [], moduleRow);
    expect(reloaded.soundedNote).toBe(edited);
  });
});
