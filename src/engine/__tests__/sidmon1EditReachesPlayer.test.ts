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
  _player_get_paula_period(ch: number): number;
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
    const raw = readFileSync(join(__dirname, '../../../public/data/songs/sidmon-1/anarchy.sid1'));
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
    const live = { getSong: () => liveTrackerSong(), syncCellToWasmSequencer() {}, setChannelMuteMask() {}, isPlaying: () => false } as never;
    vi.spyOn(ts, 'getTrackerReplayer').mockReturnValue(live);
    vi.spyOn(ts, 'peekTrackerReplayer').mockReturnValue(live); // the store peeks (05c130258)

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

  // The effect column. The replayer (sidmon1.c, the row switch) reads effect 2 as the speed, any effect but 0, 2, 3
  // as a bend whose speed is the parameter byte. The proof the replayer plays the edited effect is its own
  // behaviour: when voice v consumes each row (a speed change moves every later row) and the Paula period it
  // writes each tick (a bend moves it). The stored bytes are what the engine posted; the reloaded module is the
  // song's carried bytes parsed again and played.
  it('an effect edit (bend parameter, Fxx speed, clear) reaches the replayer rows and the reloaded module', { timeout: 120000 }, async () => {
    loadSharedWorkletScripts();
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { parseSidMon1File } = await import('@/lib/import/formats/SidMon1Parser');
    const raw = readFileSync(join(__dirname, '../../../public/data/songs/sidmon-1/anarchy.sid1'));
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const song = await parseModuleToSong(new File([ab], 'anarchy.sid1'), 0);
    const { useFormatStore } = await import('@stores/useFormatStore');
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    useTrackerStore.getState().loadPatterns(structuredClone(song.patterns));
    useFormatStore.getState().applyEditorMode(song as never);
    const layout = useFormatStore.getState().uadePatternLayout!;
    const rowOf = (p: number, r: number, ch: number) => (layout.getCellFileOffset!(p, r, ch) - layout.patternDataFileOffset) / 5;
    const byteAt = (row: number, k: number) => raw[layout.patternDataFileOffset + row * 5 + k];

    const { SidMon1ReplayerEngine } = await import('@/engine/sidmon1/SidMon1ReplayerEngine');
    const posted: { type: string; index: number; bytes: Uint8Array }[] = [];
    const fake = Object.create(SidMon1ReplayerEngine.prototype) as { workletNode: unknown };
    fake.workletNode = { port: { postMessage: (m: { type: string; index: number; bytes: Uint8Array }) => posted.push(m) } };
    vi.spyOn(SidMon1ReplayerEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(SidMon1ReplayerEngine, 'getInstance').mockReturnValue(fake as never);
    const ts = await import('@engine/TrackerReplayer');
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    const live = { getSong: () => liveTrackerSong(), syncCellToWasmSequencer() {}, setChannelMuteMask() {}, isPlaying: () => false } as never;
    vi.spyOn(ts, 'getTrackerReplayer').mockReturnValue(live);
    vi.spyOn(ts, 'peekTrackerReplayer').mockReturnValue(live);

    // Per voice: the tick each row is first consumed, and the Paula period every tick.
    const TICKS = 1500;
    const trace = async (bytes: ArrayBuffer, rows: { type: string; index: number; bytes: Uint8Array }[]) => {
      const { proc, send } = await startWorklet('sidmon1', 'SidMon1Replayer');
      await send({ type: 'loadModule', moduleData: bytes.slice(0) });
      await send({ type: 'resume' });
      for (const m of rows) await send(m);
      const m = proc.module as unknown as Mod;
      const out = m._malloc(960 * 2 * 4);
      const consumed: string[][] = [[], [], [], []];
      const seen = [0, 0, 0, 0];
      const period: number[][] = [[], [], [], []];
      for (let tick = 0; tick < TICKS; tick++) {
        m._player_render(out, 960);
        for (let v = 0; v < 4; v++) {
          period[v].push(m._player_get_paula_period(v));
          const n = m._player_get_voice_rows_consumed(v);
          if (n !== seen[v]) { seen[v] = n; consumed[v].push(`${tick}:${m._player_get_voice_consumed(v)}`); }
        }
      }
      return { consumed, period: period.map((p) => p.join(',')) };
    };
    const base = await trace(ab, []);
    const consumedRows = base.consumed.map((l) => new Set(l.map((e) => Number(e.split(':')[1]))));

    // Candidate rows the unedited replayer reaches, found from the parsed grid (first cell of each module row).
    type Hit = { p: number; r: number; ch: number; row: number };
    const hits = { bend: [] as Hit[], plain: [] as Hit[] };
    const firstSeen = new Set<number>();
    for (let p = 0; p < song.patterns.length; p++) for (let ch = 0; ch < 4; ch++) {
      song.patterns[p].channels[ch].rows.forEach((cell, r) => {
        if (layout.getCellFileOffset!(p, r, ch) < 0) return;
        const row = rowOf(p, r, ch);
        if (firstSeen.has(row) || !consumedRows[ch].has(row) || cell.note <= 0) return;
        firstSeen.add(row);
        if (cell.effTyp === 0x03 && byteAt(row, 2) > 3 && byteAt(row, 3) >= 8 && byteAt(row, 2) - byteAt(row, 0) >= 6) hits.bend.push({ p, r, ch, row });
        else if (cell.effTyp === 0 && byteAt(row, 2) === 0 && byteAt(row, 3) === 0) hits.plain.push({ p, r, ch, row });
      });
    }
    expect(hits.bend.length, 'a bend row the replayer reaches, whose target note is well above its own note (the replayer only bends up: a target below ends the bend on the first tick whatever the speed)').toBeGreaterThan(1);
    expect(hits.plain.length, 'a plain note row the replayer reaches').toBeGreaterThan(0);

    const edit = async (h: Hit, patch: { effTyp: number; eff: number }) => {
      const n = posted.length;
      useTrackerStore.setState({ currentPatternIndex: h.p });
      useTrackerStore.getState().setCell(h.ch, h.r, patch);
      await vi.waitFor(() => expect(posted.length).toBeGreaterThan(n));
      return posted.slice(n);
    };
    const cases: { name: string; h: Hit; patch: { effTyp: number; eff: number }; stored: [number, number] }[] = [];
    const bendA = hits.bend[0], bendC = hits.bend[1], plain = hits.plain[0];
    // the slowest bend (parameter 1) against the song's fast one: the period then moves over many ticks
    cases.push({ name: 'bend parameter', h: bendA, patch: { effTyp: 0x03, eff: 1 }, stored: [byteAt(bendA.row, 2), 1] });
    cases.push({ name: 'Fxx speed', h: plain, patch: { effTyp: 0x0f, eff: 1 }, stored: [2, 1] });
    cases.push({ name: 'clear', h: bendC, patch: { effTyp: 0, eff: 0 }, stored: [0, 0] });

    const all: { type: string; index: number; bytes: Uint8Array }[] = [];
    for (const c of cases) {
      const rows = await edit(c.h, c.patch);
      expect(rows.map((r) => r.index), `${c.name}: the row the cell shows`).toEqual([c.h.row]);
      expect([rows[0].bytes[2], rows[0].bytes[3]], `${c.name}: the stored effect and parameter bytes`).toEqual(c.stored);
      all.push(...rows);
      const t = await trace(ab, rows);
      expect(`${t.consumed.join('|')}#${t.period.join('|')}`, `${c.name}: the replayer plays something different from the unedited song`)
        .not.toEqual(`${base.consumed.join('|')}#${base.period.join('|')}`);
      if (c.name === 'bend parameter' || c.name === 'clear') expect(t.period[c.h.ch], `${c.name}: the voice's Paula period moved`).not.toEqual(base.period[c.h.ch]);
      if (c.name === 'Fxx speed') expect(t.consumed.map((l) => l.join(',')), 'a speed change moves when rows are consumed').not.toEqual(base.consumed.map((l) => l.join(',')));
    }

    // The reload: the module the song carries holds all three, re-parses to them, and plays as the posted rows do.
    const carried = new Uint8Array(useFormatStore.getState().sidmon1WasmFileData!);
    const back = parseSidMon1File(carried.buffer.slice(0) as ArrayBuffer, 'anarchy.sid1');
    for (const c of cases) {
      const cell = back.patterns[c.h.p].channels[c.h.ch].rows[c.h.r];
      expect([cell.effTyp, cell.eff], `${c.name}: the reloaded module shows the edited cell`).toEqual([c.patch.effTyp, c.patch.eff]);
    }
    const viaPosted = await trace(ab, all);
    const viaReload = await trace(carried.buffer.slice(0) as ArrayBuffer, []);
    expect(viaReload).toEqual(viaPosted);
  });
});
