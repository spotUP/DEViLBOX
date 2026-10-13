/**
 * NUADE-PREVIEW: a key on a song instrument sounds when the song plays on nuade, and is not doubled when it plays on the
 * format's own replayer.
 *
 * SoundMon and SidMon II song instruments play keys through the format's song replayer (soundmon.c sm_preview_note_on,
 * sidmon2.c sd2_preview_note_on), which runs on the module that replayer has loaded. A song on nuade is never loaded
 * into that replayer, so the keys had nothing to play and were silent. Measured per format and per engine:
 *
 *   file -> parseModuleToSong with the format's engine pinned (nuade, or the format's own replayer) -> the song's
 *   instrument config -> the synth InstrumentFactory builds for it (SoundMonSynth.setSlot, SidMonSynth.setSongSlot) ->
 *   triggerAttack with the note name a key produces (useNoteInput) -> the engine's real messages -> the replayer's real
 *   worklet (+ wasm) -> audio, and the audio graph between the engine output and the synth output.
 *
 *   - nuade: the key sounds; nothing plays while no key is down (the replayer's copy is a keyboard copy, never the
 *     song); a second key does not load the module again.
 *   - own replayer (the song loaded into it, as playback does): the key sounds on the song's module, no keyboard copy is
 *     loaded, and the synth adds no path of its own from the engine output to the master (the engine output already
 *     reaches it, so a second path would double the song); also after a key on a nuade song, once playback loads a
 *     song into the replayer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, ROOT, type WorkletProc } from './workletHarness';
import { renderTicks, rmsPerTick, exposeHeapTransform } from './keyboardPreviewHarness';

/** A gain node that records what it is connected to, and its gain. */
interface FakeNode { gain: { value: number }; targets: Set<FakeNode>; connect(n: FakeNode): void; disconnect(n?: FakeNode): void; context: { createGain(): FakeNode } }
const fakeContext = { createGain: (): FakeNode => fakeGain() };
function fakeGain(): FakeNode {
  const n: FakeNode = {
    gain: { value: 1 }, targets: new Set(), context: fakeContext,
    connect(t) { n.targets.add(t); },
    disconnect(t) { if (t) n.targets.delete(t); else n.targets.clear(); },
  };
  return n;
}
/** Gain along every path from `from` to `to` (0 when there is none). */
function pathGain(from: FakeNode, to: FakeNode, seen = new Set<FakeNode>()): number {
  if (from === to) return 1;
  if (seen.has(from)) return 0;
  seen.add(from);
  let sum = 0;
  for (const t of from.targets) sum += t.gain.value * pathGain(t, to, seen);
  return sum;
}

vi.mock('@/utils/audio-context', async (orig) => {
  const actual = await orig<typeof import('@/utils/audio-context')>();
  return { ...actual, getDevilboxAudioContext: () => fakeContext };
});

// SidMon's free-standing per-note engine (not under test: song instruments play on the SidMon II replayer).
vi.mock('@/engine/sidmon/SidMonEngine', () => ({
  SidMonEngine: { getInstance: () => ({ output: fakeGain(), ready: async () => {}, sendMessage() {} }) },
}));

const emscriptenTransform = (c: string) => c
  .replace(/import\.meta\.url/g, "'.'").replace(/export\s+default\s+\w+;?/g, '')
  .replace(/self\.location\.href/g, "'.'")
  .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
  .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
  .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
  .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');

type Msg = { type?: string; [k: string]: unknown };
interface Keyed { output: FakeNode; triggerAttack(note: string, time?: number, velocity?: number): void; triggerRelease(): void }
interface Case {
  id: string; prefKey: string; file: string; synthType: string; worklet: [string, string, (c: string) => string];
  fileDataKey: 'soundMonFileData' | 'sd2FileData';
  /** The real engine class with its worklet node replaced by the harness (its own methods build the messages). */
  engine: () => Promise<{ prototype: object; getInstance: () => unknown }>;
  /** The synth as InstrumentFactory builds it for the instrument config. */
  synth: (config: { id: number; sidMon?: { songSlot?: number } }) => Promise<Keyed>;
}

const CASES: Case[] = [
  {
    id: 'soundmon', prefKey: 'soundmon', file: 'public/data/songs/formats/antidust.bp3', synthType: 'SoundMonSynth',
    worklet: ['soundmon', 'SoundMon', emscriptenTransform], fileDataKey: 'soundMonFileData',
    engine: async () => (await import('@/engine/soundmon/SoundMonEngine')).SoundMonEngine as never,
    synth: async (config) => {
      const { SoundMonSynth } = await import('@/engine/soundmon/SoundMonSynth');
      const s = new SoundMonSynth();
      s.setSlot(config.id); // InstrumentFactory 'SoundMonSynth'
      return s as unknown as Keyed;
    },
  },
  {
    id: 'sidmon2', prefKey: 'sidmon2', file: 'public/data/songs/formats/bruno_time.sid2', synthType: 'SidMonSynth',
    worklet: ['sidmon2', 'Sd2', exposeHeapTransform], fileDataKey: 'sd2FileData',
    engine: async () => (await import('@/engine/sidmon2/Sd2Engine')).Sd2Engine as never,
    synth: async (config) => {
      const { SidMonSynth } = await import('@/engine/sidmon/SidMonSynth');
      const s = new SidMonSynth();
      s.setSongSlot(config.sidMon?.songSlot ?? 0); // InstrumentFactory 'SidMonSynth'
      return s as unknown as Keyed;
    },
  },
];

describe('a key on a song instrument, with the song on nuade or on its own replayer', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  for (const c of CASES) {
    for (const on of ['nuade', 'own'] as const) {
      it(`${c.id} on ${on === 'nuade' ? 'nuade' : 'its own replayer'}: the key sounds${on === 'nuade' ? ', and only while it is down' : ', on the song module, through no second path'}`, async () => {
        const { NUADE_FORMATS } = await import('@/engine/nuade/nuadeFormats');
        const { useSettingsStore } = await import('@/stores/useSettingsStore');
        useSettingsStore.getState().setFormatEngine(c.prefKey as never, on === 'nuade' ? 'nuade' : NUADE_FORMATS[c.id]!.legacyEngine);

        const bytes = readFileSync(resolve(ROOT, c.file));
        const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
        const song = await parseModuleToSong(new File([bytes], c.file.split('/').pop()!)) as unknown as Record<string, unknown> & { instruments: Array<{ id: number; synthType?: string; sidMon?: { songSlot?: number } }> };
        expect(!!song.nuadeFileData, 'the song plays on the engine pinned').toBe(on === 'nuade');
        const inst = song.instruments.find((i) => i.synthType === c.synthType && (c.id !== 'sidmon2' || (i.sidMon?.songSlot ?? 0) > 0));
        expect(inst, `the import keeps a ${c.synthType} song instrument`).toBeTruthy();
        // What applySong puts in the format store on a real load.
        const { useFormatStore } = await import('@/stores/useFormatStore');
        useFormatStore.setState({ nuadeFileData: null, ...Object.fromEntries(Object.entries(song).filter(([k]) => /FileData$/.test(k))) } as never);

        // The replayer's real worklet behind the real engine class.
        const w = await startWorklet(c.worklet[0], c.worklet[1], c.worklet[2]);
        const sent: Msg[] = [];
        let pending: Promise<void>[] = [];
        const settled = async () => { for (let i = 0; i < 50; i++) { await new Promise((r) => setTimeout(r, 1)); const p = pending; pending = []; await Promise.all(p); } };
        const Cls = await c.engine();
        const engine = Object.create(Cls.prototype) as Record<string, unknown>;
        const output = fakeGain();
        engine.workletNode = { port: { postMessage: (m: Msg) => { sent.push(m); pending.push(w.send(m)); } } };
        engine.output = output;
        engine.audioContext = fakeContext;
        engine.ready = async () => {};
        engine._initPromise = Promise.resolve();
        vi.spyOn(Cls, 'getInstance').mockReturnValue(engine);

        if (on === 'own') {
          // Playback loads the song into its replayer (startNativeEngines -> loadTune).
          await (engine as unknown as { loadTune(b: ArrayBuffer): Promise<void> }).loadTune((song[c.fileDataKey] as ArrayBuffer).slice(0));
          await settled();
        }
        const fromKey = sent.length;
        const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
        Object.defineProperty(process, 'versions', { value: {}, configurable: true });
        const synth = await c.synth(inst!);
        const silentBefore = on === 'nuade' ? Math.max(...rmsPerTick(renderTicks(w.proc as WorkletProc, 10, 0), 10)) : 0;
        try {
          synth.triggerAttack('C3', 0, 1);
          await settled();
        } finally { Object.defineProperty(process, 'versions', versions); }
        const level = Math.max(...rmsPerTick(renderTicks(w.proc as WorkletProc, 10, 0), 10));
        synth.triggerRelease();
        await settled();
        const loads = sent.slice(fromKey).filter((m) => m.type === 'loadModule');
        console.info(`[keyboardPreviewOnNuade] ${c.id} on ${on}: key level ${level.toFixed(4)}, loads ${loads.length}, engine->synth output gain ${pathGain(output, synth.output).toFixed(2)}`);

        expect(level, `${c.id}: the key sounds`).toBeGreaterThan(0.005);
        if (on === 'nuade') {
          expect(silentBefore, 'nothing plays before a key: the replayer holds no song').toBe(0);
          expect(loads, 'one keyboard copy of the song module').toHaveLength(1);
          // Released, the copy plays nothing (it never plays the song alongside nuade).
          expect(Math.max(...rmsPerTick(renderTicks(w.proc as WorkletProc, 400, 0), 400).slice(300)), 'silent after the key is released').toBeLessThan(0.0005);
          synth.triggerAttack('D3', 0, 1);
          await settled();
          expect(sent.slice(fromKey).filter((m) => m.type === 'loadModule'), 'a second key does not load the module again').toHaveLength(1);
          synth.triggerRelease();
        } else {
          expect(loads, 'no keyboard copy: the key plays the song module the replayer holds').toHaveLength(0);
        }
        // The synth's output reaches the master through the instrument chain. Whether the engine output reaches it too
        // depends on the synth: SoundMonSynth's output IS the engine output (as before); SidMonSynth may only add a
        // path while the song is not on this replayer (on its own replayer the engine output is routed to the master
        // by NativeEngineRouting, so a path into the synth would double the song).
        if (c.id === 'sidmon2') expect(pathGain(output, synth.output), 'engine output into the synth output').toBe(on === 'nuade' ? 1 : 0);
        else expect(synth.output).toBe(output);
        if (on === 'nuade' && c.id === 'sidmon2') {
          // The engine switched back: playback loads the song into this replayer, whose output then reaches the master.
          await (engine as unknown as { loadTune(b: ArrayBuffer): Promise<void> }).loadTune((song[c.fileDataKey] as ArrayBuffer).slice(0));
          expect(pathGain(output, synth.output), 'the keyboard path closes once the replayer plays the song').toBe(0);
        }
        await settled();
      }, 60_000);
    }
  }
});
