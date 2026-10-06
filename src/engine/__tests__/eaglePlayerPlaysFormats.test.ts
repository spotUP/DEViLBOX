/**
 * Every format in eaglePlayerFormats.ts plays on EaglePlayerEngine - UADE's
 * own sound core `score` driving the format's eagleplayer on the shared
 * Musashi host (eagleplayer-wasm, musashi-host/) - and sounds like UADE.
 *
 * Six formats (Anders 0land, Ben Daglish, Core Design, Dave Lowe, Dave Lowe
 * New, Wally Beben) had transpiled-to-C scaffolds that trapped in
 * player_load: their players patch and call 68k code inside the module,
 * which only a CPU can run. Here the real players run, through the ABI UADE
 * uses. Per format:
 *  - the real worklet + WASM render the corpus song for 30 s in a worker
 *    with a deadline (a 68k loop that never returns must fail the test, not
 *    hang the run), audibly and without errors;
 *  - the 100 ms loudness envelope of the mono sum correlates > 0.95 with
 *    UADE's render of the same file (UADE renders mono: panning 1.0), up to
 *    the player's own song end. Ben Daglish's "motorhead" scored 0.66 before
 *    the host followed Paula's audio state machine (DMA off does not stop a
 *    channel; the start interrupt comes a line later) - its audio handler
 *    stopped every note the moment it started;
 *  - the default load (parseModuleToSong) of each switched format carries
 *    the module as eaglePlayerFileData and the router plays it on
 *    EaglePlayer, not UADE.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { ROOT, loadSharedWorkletScripts, startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { EAGLE_PLAYER_FORMATS, eaglePlayerModuleName, type EaglePlayerFormat } from '../eagleplayer/eaglePlayerFormats';
import type { EaglePlayerPosition } from '../eagleplayer/EaglePlayerEngine';
import { renderFileToSamples } from '../../../tools/uade-audit/uadeRenderCore';
import { monoEnvelope, correlation, comparedWindows } from '../../../tools/eagleplayer/eagleCompare';

const WORKER = resolve(ROOT, 'src/engine/__tests__/eaglePlayerRender.worker.ts');
const SECONDS = 30;
/** 30 s of audio renders in about a second; a hang never finishes. */
const DEADLINE_MS = 30_000;

type Done = { type: 'done'; blocks: number; peak: number; rms: number; audibleBlocks: number; envelope: number[]; songEndAt: number; loaded: boolean; errors: string[] };
type Result = Done | { type: 'hung'; lastBlock: number };

function renderInWorker(fmt: EaglePlayerFormat): Promise<Result> {
  const worker = new Worker(WORKER, {
    workerData: { song: fmt.corpus, player: fmt.player, moduleName: eaglePlayerModuleName(fmt, basename(fmt.corpus)), seconds: SECONDS, companions: fmt.companions ?? [] },
  });
  let lastBlock = -1;
  return new Promise((done, fail) => {
    const deadline = setTimeout(() => { void worker.terminate(); done({ type: 'hung', lastBlock }); }, DEADLINE_MS);
    worker.on('message', (m: Result | { type: 'progress'; block: number }) => {
      if (m.type === 'progress') { lastBlock = m.block; return; }
      clearTimeout(deadline);
      void worker.terminate();
      done(m);
    });
    worker.on('error', (e) => { clearTimeout(deadline); void worker.terminate(); fail(e); });
  });
}

const FORMATS = Object.values(EAGLE_PLAYER_FORMATS);

/** The corpus song's companion files, as the companion resolver hands them over. */
function companionsOf(fmt: EaglePlayerFormat): Map<string, ArrayBuffer> | undefined {
  if (!fmt.companions?.length) return undefined;
  return new Map(fmt.companions.map((c) => [basename(c), songBuffer(c)]));
}

describe.each(FORMATS)('$label on the Musashi host', (fmt) => {
  let r: Result;
  beforeAll(async () => { r = await renderInWorker(fmt); }, DEADLINE_MS + 10_000);

  it(`plays 30 s of ${basename(fmt.corpus)} and every render call returns`, () => {
    expect(r, r.type === 'hung' ? `render never returned (hung in block ${r.lastBlock})` : '').toMatchObject({ type: 'done' });
    if (r.type !== 'done') return;
    expect(r.errors).toEqual([]);
    expect(r.loaded, 'the eagleplayer accepted the module').toBe(true);
    expect(r.blocks).toBe(Math.ceil((48000 * SECONDS) / 128));
    expect(r.peak, 'the song is audible').toBeGreaterThan(0.05);
    expect(r.rms, 'and plays at a real level').toBeGreaterThan(0.02);
  });

  it('sounds like UADE: loudness envelope correlation > 0.95 up to the song end', async () => {
    if (r.type !== 'done') throw new Error('render did not finish');
    const name = eaglePlayerModuleName(fmt, basename(fmt.corpus));
    // UADE gets the same companion files (the app's companion resolver passes them to both).
    const companions = (fmt.companions ?? []).map((c) => ({ name: basename(c), data: new Uint8Array(readFileSync(resolve(ROOT, c))) }));
    const uade = await renderFileToSamples(new Uint8Array(readFileSync(resolve(ROOT, fmt.corpus))), name, { sampleRate: 48000, seconds: SECONDS, companions });
    const ref = monoEnvelope(uade.samples, 48000);
    // After the player's song end UADE's frontend moves on to another
    // subsong (its policy, not the player's); compare the song itself.
    const windows = comparedWindows(SECONDS, r.songEndAt);
    const c = correlation(r.envelope.slice(0, windows), ref.slice(0, windows));
    expect(c, `${fmt.label}: envelope correlation ${c.toFixed(4)} over ${windows / 10} s`).toBeGreaterThan(0.95);
  }, 60_000);
});

describe('mixer mask and per-voice outputs', () => {
  const rmsOf = (bufs: Float32Array[]) => Math.sqrt(bufs.reduce((s, b) => s + b.reduce((t, v) => t + v * v, 0), 0) / bufs.reduce((n, b) => n + b.length, 0));

  async function render(mask: number | null, seconds: number) {
    loadSharedWorkletScripts();
    const fmt = EAGLE_PLAYER_FORMATS.WallyBeben;
    const { proc, send } = await startWorklet('eagleplayer', 'EaglePlayer');
    await send({ type: 'loadModule', moduleData: songBuffer(fmt.corpus), playerData: songBuffer(`public/eagleplayer/players/${fmt.player}`), moduleName: eaglePlayerModuleName(fmt, basename(fmt.corpus)) });
    await send({ type: 'dubChannelEnable', channel: 0 });
    await send({ type: 'dubChannelEnable', channel: 1 });
    if (mask !== null) await send({ type: 'setMuteMask', mask });
    await send({ type: 'play' });
    const main: Float32Array[] = [], dub0: Float32Array[] = [], dub1: Float32Array[] = [];
    for (let b = 0; b < Math.ceil((48000 * seconds) / 128); b++) {
      const out = stereoOutputs(7);
      proc.process([], out);
      main.push(out[0][0], out[0][1]); dub0.push(out[5][0]); dub1.push(out[6][0]);
    }
    return { main: rmsOf(main), dub0: rmsOf(dub0), dub1: rmsOf(dub1) };
  }

  it('bit set = voice audible: mask 0 silences the mix and every voice send', async () => {
    const all = await render(null, 4);
    expect(all.main).toBeGreaterThan(0.02);
    expect(all.dub0 + all.dub1, 'voices 0 and 1 have their own outputs').toBeGreaterThan(0.01);
    const none = await render(0, 4);
    expect(none.main).toBe(0);
    expect(none.dub0 + none.dub1).toBe(0);
    const onlyV0 = await render(0b0001, 4);
    expect(onlyV0.dub1, 'a muted voice sends nothing').toBe(0);
    expect(onlyV0.dub0).toBeCloseTo(all.dub0, 6);
  }, 60_000);
});

// UADE's scan needs a browser (an AudioContext); a format whose native parser
// draws no grid hands the grid to it. Stand in for it with a song shaped as
// UADEParser's classic path builds it (buildClassicSong: format 'UADE',
// patterns tagged sourceFormat 'UADE', a UADESynth carrying the file) so the
// route's retargeting is what is tested.
vi.mock('@lib/import/formats/UADEParser', () => ({
  parseUADEFile: vi.fn(async (buf: ArrayBuffer, name: string) => ({
    name, format: 'UADE',
    patterns: [{ id: 'p0', name: 'p0', length: 1, importMetadata: { sourceFormat: 'UADE', sourceFile: name, importedAt: '', originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 1 },
      channels: [{ id: 'c0', name: 'c0', rows: [{ note: 49, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }] }] }],
    instruments: [{ id: 1, name: 'UADE', type: 'synth', synthType: 'UADESynth', effects: [], volume: 0, pan: 0, uade: { type: 'uade', filename: name, fileData: buf, subsongCount: 1, currentSubsong: 0 } }],
    songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buf.slice(0), uadeEditableFileName: name,
  })),
}));

describe('the default load plays on EaglePlayer', () => {
  beforeAll(async () => { await import('@/lib/import/parseModuleToSong'); }, 240_000);

  it.each(FORMATS.filter((f) => f.isDefault))('$label: parseModuleToSong carries the module, the router picks EaglePlayer', async (fmt) => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { playingEngineFor } = await import('../replayer/NativeEngineRouting');
    const bytes = readFileSync(resolve(ROOT, fmt.corpus));
    const song = await parseModuleToSong(new File([new Uint8Array(bytes)], basename(fmt.corpus)), 0, undefined, undefined, companionsOf(fmt));
    expect(song.eaglePlayerId).toBe(fmt.id);
    expect(song.eaglePlayerFileData?.byteLength).toBe(bytes.length);
    expect(song.uadeEditableFileData, 'UADE does not play it').toBeUndefined();
    expect(song.instruments.some((i) => i.synthType === 'UADESynth' || i.synthType === 'UADEEditableSynth')).toBe(false);
    expect(playingEngineFor(song)).toBe('EaglePlayer');
    // Playback hands a song tagged 'UADE' to UADE's opaque player and never
    // starts its engine (usePatternPlayback): primemover 07.hot and dynamite
    // dux.core, whose grid UADE's scan draws, were silent in the app.
    expect(song.format, 'not tagged as a UADE song').not.toBe('UADE');
    expect(song.patterns.filter((p) => p.importMetadata?.sourceFormat === 'UADE').map((p) => p.id), 'no pattern tagged UADE').toEqual([]);
    expect(song.instruments.some((i) => i.uade), 'no instrument carries a UADE player config').toBe(false);
  }, 60_000);

  // The app's path after the import: the format store takes the song, the
  // replayer plays liveTrackerSong(), playback picks its branch from the
  // stores, startNativeEngines loads the engine with the descriptor's args.
  // primemover 07.hot and dynamite dux.core (grid from UADE's scan) were
  // silent in the app while the engine tests passed.
  it.each(['Anders0land', 'CoreDesign', 'SoundPlayer', 'MIDILoriciel'])('%s: the song reaches the engine through the stores (module, name, companions) and plays', async (id) => {
    const fmt = EAGLE_PLAYER_FORMATS[id];
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { useFormatStore } = await import('@/stores/useFormatStore');
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    const { WASM_ENGINES, playsAsOpaqueUADE } = await import('../replayer/wasmEngineRegistry');
    const { playingEngineFor } = await import('../replayer/NativeEngineRouting');
    const bytes = readFileSync(resolve(ROOT, fmt.corpus));
    const song = await parseModuleToSong(new File([new Uint8Array(bytes)], basename(fmt.corpus)), 0, undefined, undefined, companionsOf(fmt));
    useFormatStore.getState().applyEditorMode(song);
    useInstrumentStore.setState({ instruments: song.instruments });
    // A grid still tagged 'UADE' (a project saved before the import retagged
    // it) must not send playback down the opaque-UADE branch either.
    expect(playsAsOpaqueUADE('UADE', useFormatStore.getState() as unknown as Record<string, unknown>, song.instruments), 'playback starts the song engine').toBe(false);
    const live = liveTrackerSong();
    expect(playingEngineFor(live)).toBe('EaglePlayer');
    const desc = WASM_ENGINES.find((d) => d.key === 'EaglePlayer')!;
    const data = live[desc.fileDataKey] as ArrayBuffer;
    expect(data.byteLength, 'the module bytes the engine gets').toBe(bytes.length);
    const args = desc.getLoadArgs!(live);
    expect(args[0]).toBe(id);
    expect(args[3] instanceof Map ? [...(args[3] as Map<string, ArrayBuffer>).keys()] : [], 'the companion files ride to the engine')
      .toEqual((fmt.companions ?? []).map((c) => basename(c)));
    // EaglePlayerEngine.loadTune over the real worklet, with the route's args.
    const { engine, send, run, posted, level } = await engineOnWorklet(fmt);
    await engine.loadTune(data.slice(0), ...(args as [string, string, number | undefined, Map<string, ArrayBuffer> | undefined]));
    await send({ type: 'play' });
    expect(posted.filter((m) => m.type === 'error').map((m) => m.message)).toEqual([]);
    expect(posted.some((m) => m.type === 'moduleLoaded')).toBe(true);
    run(3);
    expect(level(), `${fmt.label} plays (rms of 3 s)`).toBeGreaterThan(0.02);
  }, 120_000);

  it('Ben Daglish stays on BdEngine until the owner moves it (heldBecause)', async () => {
    expect(EAGLE_PLAYER_FORMATS.BenDaglish.isDefault).toBe(false);
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { playingEngineFor } = await import('../replayer/NativeEngineRouting');
    const song = await parseModuleToSong(new File([new Uint8Array(readFileSync(resolve(ROOT, EAGLE_PLAYER_FORMATS.BenDaglish.corpus)))], 'mickey_mouse.bd'));
    expect(playingEngineFor(song)).toBe('BenDaglish');
  }, 60_000);
});

/**
 * EaglePlayerEngine over the real worklet: the engine's message handling
 * runs (createNode with a stand-in AudioWorkletNode whose port is the
 * worklet's), so what the grid and the subsong model get is what the engine
 * makes of the player's own reports.
 */
async function engineOnWorklet(fmt: EaglePlayerFormat) {
  loadSharedWorkletScripts();
  const { proc, send, posted } = await startWorklet('eagleplayer', 'EaglePlayer');
  const { EaglePlayerEngine } = await import('../eagleplayer/EaglePlayerEngine');
  const port: { onmessage: ((e: { data: unknown }) => void) | null; postMessage(m: { type?: string }): void } = {
    onmessage: null,
    postMessage(m) { if (m.type !== 'init') void send(m); },
  };
  (proc as unknown as { port: { postMessage(m: unknown): void } }).port.postMessage = (m) => { posted.push(m as never); port.onmessage?.({ data: m }); };
  (globalThis as Record<string, unknown>).AudioWorkletNode = class { port = port; connect() {} };
  const engine = Object.create(EaglePlayerEngine.prototype) as import('../eagleplayer/EaglePlayerEngine').EaglePlayerEngine;
  Object.assign(engine, {
    _songEndCallback: null, _positionCallbacks: new Set(), _grid: null,
    subsongRequests: new (await import('@engine/wasm/subsongRequests')).SubsongRequests(),
    audioContext: {}, output: {}, _initPromise: Promise.resolve(),
  });
  (engine as unknown as { createNode(): void }).createNode();
  // EaglePlayerEngine.fetchPlayer reads public/ through fetch: served from disk while it loads.
  const loadTune = engine.loadTune.bind(engine);
  engine.loadTune = async (...a: Parameters<typeof loadTune>) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => new Response(songBuffer(`public/eagleplayer/players/${decodeURIComponent(String(url).split('/').pop()!)}`))) as unknown as typeof fetch;
    try { return await loadTune(...a); } finally { globalThis.fetch = realFetch; }
  };
  const load = async (subsong?: number) => {
    await engine.loadTune(songBuffer(fmt.corpus), fmt.id, basename(fmt.corpus), subsong, companionsOf(fmt));
    await send({ type: 'play' });
  };
  let sum = 0, n = 0;
  const run = (seconds: number) => {
    for (let b = 0; b < Math.ceil((48000 * seconds) / 128); b++) {
      const out = stereoOutputs(5);
      proc.process([], out);
      for (const ch of out[0]) for (const v of ch) { sum += v * v; n++; }
    }
  };
  const level = () => Math.sqrt(sum / Math.max(1, n));
  return { engine, load, run, send, posted, level };
}

describe('the grid follows the player', () => {
  it('maps player ticks onto the grid: speed ticks per row, patterns in order, looping from the restart', async () => {
    const { tickGridPosition } = await import('@/lib/tracker/tickGridPosition');
    const grid = { speed: 6, songPositions: [0, 1, 0], patternLengths: [4, 2], loopFrom: 1 };
    expect(tickGridPosition(0, grid)).toEqual({ songPos: 0, row: 0 });
    expect(tickGridPosition(5, grid)).toEqual({ songPos: 0, row: 0 });
    expect(tickGridPosition(6 * 3, grid)).toEqual({ songPos: 0, row: 3 });
    expect(tickGridPosition(6 * 4, grid)).toEqual({ songPos: 1, row: 0 });
    expect(tickGridPosition(6 * 9, grid)).toEqual({ songPos: 2, row: 3 });
    // 10 rows played: the loop (positions 1..2, 6 rows) starts again.
    expect(tickGridPosition(6 * 10, grid)).toEqual({ songPos: 1, row: 0 });
    expect(tickGridPosition(6 * 14, grid)).toEqual({ songPos: 2, row: 2 });
    // UADE's scan grid (no loop) holds its last row.
    expect(tickGridPosition(6 * 99, { ...grid, loopFrom: undefined })).toEqual({ songPos: 2, row: 3 });
  });

  it('Wally Beben: the engine reports the player position each tick, at the player rate, and the grid moves with it', async () => {
    const fmt = EAGLE_PLAYER_FORMATS.WallyBeben;
    const { engine, load, run } = await engineOnWorklet(fmt);
    // wicked.wb's grid: speed 1 (a row per player tick), patterns of 8 rows.
    engine.setGrid({ initialSpeed: 1, restartPosition: 0, songPositions: [0, 1, 2], patterns: [{ length: 8 }, { length: 8 }, { length: 8 }] as never });
    const seen: Array<{ songPos: number; row: number; ticks: number }> = [];
    engine.onPositionUpdate((p: EaglePlayerPosition) => seen.push(p));
    await load();
    run(2);
    const last = seen[seen.length - 1];
    // score runs the player at 50 Hz (CIA-A timer B): 2 s = 100 ticks.
    expect(last.ticks).toBeGreaterThanOrEqual(98);
    expect(last.ticks).toBeLessThanOrEqual(101);
    expect(new Set(seen.map((p) => p.songPos)), 'the grid moves through the order').toEqual(new Set([0, 1, 2]));
    expect(last).toMatchObject({ songPos: (Math.floor(last.ticks / 8)) % 3, row: last.ticks % 8 });
  }, 60_000);

  it('the route hands the playing song\'s grid to the engine (onStarted)', async () => {
    const { WASM_ENGINES } = await import('../replayer/wasmEngineRegistry');
    const desc = WASM_ENGINES.find((d) => d.key === 'EaglePlayer')!;
    let grid: unknown = null;
    desc.onStarted!({ setGrid: (s: unknown) => { grid = s; } } as never, { initialSpeed: 3, songPositions: [0], patterns: [{ length: 64 }], restartPosition: 0 } as never);
    expect(grid).toMatchObject({ initialSpeed: 3 });
  });
});

describe('subsongs on the runner', () => {
  it('Core Design: the engine reports the player\'s 34 subsongs; the one subsong switch starts another on the runner', async () => {
    const fmt = EAGLE_PLAYER_FORMATS.CoreDesign;
    const { useFormatStore } = await import('@/stores/useFormatStore');
    const { subsongStatus, switchSubsong } = await import('@/lib/tracker/subsongSwitch');
    const { engine, load, run } = await engineOnWorklet(fmt);
    await load();
    expect(useFormatStore.getState().nativeSubsongs).toMatchObject({ engine: 'EaglePlayer', count: 34, current: 0 });
    expect(subsongStatus(useFormatStore.getState())).toMatchObject({ source: 'native', count: 34, current: 0 });
    run(1);
    // The switch (FT2 toolbar 'Subsong', scope control) while playing goes
    // to the running engine; stand in for the route's running set.
    const routing = await import('../replayer/NativeEngineRouting');
    const running = vi.spyOn(routing, 'runningEngineInstance').mockResolvedValue(engine);
    const { useTransportStore } = await import('@/stores/useTransportStore');
    useTransportStore.setState({ isPlaying: true });
    const positions: number[] = [];
    engine.onPositionUpdate((p: EaglePlayerPosition) => positions.push(p.ticks));
    engine.setGrid({ initialSpeed: 6, restartPosition: 0, songPositions: [0], patterns: [{ length: 64 }] as never });
    await switchSubsong(3);
    running.mockRestore();
    useTransportStore.setState({ isPlaying: false });
    expect(useFormatStore.getState().nativeSubsongs).toMatchObject({ engine: 'EaglePlayer', current: 3 });
    // The start field follows: a reload (stop, play) starts subsong 3.
    expect(useFormatStore.getState().eaglePlayerSubsong).toBe(3);
    run(1);
    expect(positions[0], 'the position restarts with the subsong').toBeLessThan(5);
  }, 60_000);

  it('Core Design: at the player\'s song end (dynamite dux, 22.6 s) the next subsong starts, as UADE does', async () => {
    const fmt = EAGLE_PLAYER_FORMATS.CoreDesign;
    const { useFormatStore } = await import('@/stores/useFormatStore');
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    useSettingsStore.setState({ autoAdvanceSubsongs: true });
    const { load, run } = await engineOnWorklet(fmt);
    await load();
    expect(useFormatStore.getState().nativeSubsongs?.current).toBe(0);
    run(22);
    expect(useFormatStore.getState().nativeSubsongs?.current, 'still the first subsong before its end').toBe(0);
    run(2);
    await new Promise((r) => setTimeout(r, 0));
    expect(useFormatStore.getState().nativeSubsongs?.current, 'the next subsong after the song end').toBe(1);
  }, 60_000);

  it('the start field reaches the runner: the route loads the store\'s subsong', async () => {
    const { WASM_ENGINES } = await import('../replayer/wasmEngineRegistry');
    const desc = WASM_ENGINES.find((d) => d.key === 'EaglePlayer')!;
    expect(desc.getLoadArgs!({ eaglePlayerId: 'CoreDesign', eaglePlayerFileName: 'dynamite dux.core', eaglePlayerSubsong: 5 } as never).slice(0, 3)).toEqual(['CoreDesign', 'dynamite dux.core', 5]);
    const fmt = EAGLE_PLAYER_FORMATS.CoreDesign;
    const { useFormatStore } = await import('@/stores/useFormatStore');
    const { load } = await engineOnWorklet(fmt);
    await load(5);
    expect(useFormatStore.getState().nativeSubsongs).toMatchObject({ engine: 'EaglePlayer', current: 5 });
  }, 60_000);
});

describe('Paula as the players see it', () => {
  // Digital Sonix & Chrome (not routed: 0.89 against UADE, see the ledger)
  // starts each note with DMA off, period 1 and a write to AUDxDAT, then
  // busy-waits for the AUDx request that write raises (UAE AUDxDAT, state
  // 0 -> 2). The host ignored AUDxDAT: the player hung in its first note.
  it('AUDxDAT on an idle channel raises AUDx: Digital Sonix & Chrome gets past its first note', async () => {
    loadSharedWorkletScripts();
    const { proc, send, posted } = await startWorklet('eagleplayer', 'EaglePlayer');
    await send({
      type: 'loadModule',
      moduleData: songBuffer("public/data/songs/digital-sonix-and-chrome/dragon'sbreath ingame 1.dsc"),
      playerData: songBuffer('third-party/uade-3.05/players/DigitalSonixChrome'),
      moduleName: "dsc.dragon'sbreath ingame 1",
    });
    await send({ type: 'play' });
    expect(posted.filter((m) => m.type === 'error').map((m) => m.message)).toEqual([]);
    let sum = 0, n = 0;
    for (let b = 0; b < Math.ceil((48000 * 3) / 128); b++) {
      const out = stereoOutputs(5);
      proc.process([], out);
      for (const ch of out[0]) for (const v of ch) { sum += v * v; n++; }
    }
    expect(Math.sqrt(sum / n), 'rms of 3 s').toBeGreaterThan(0.02);
  }, 60_000);
});
