/**
 * The keyboard, through the path a key takes (owner, 2026-10-07: "note pitch don't change when I press
 * different keys", "one octave high", "short bleeps"; the first K2 tests fed the preview the song's own
 * note value and measured six ticks, so none of that could show):
 *
 *   file -> parseModuleToSong (the real import path, which flattens synth instruments to Samplers unless
 *   the format keeps its keyboard voice) -> the instrument's synth class -> triggerAttack('C2' ...) with
 *   the note NAME a key produces (useNoteInput: `${note}${octave}`) -> the engine's real message -> the
 *   replayer worklet -> audio.
 *
 * Per format: the import keeps the replayer's synth for the instrument; three different keys give three
 * different pitches a semitone/octave apart as the keys are; a held key sounds for the instrument's own
 * envelope (no truncation by the preview) and key-up silences it.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, ROOT, type WorkletProc } from './workletHarness';
import { renderTicks, rmsPerTick, fundamentalHz, FPT } from './keyboardPreviewHarness';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { useFormatStore } from '@/stores/useFormatStore';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { pinEditPathEngine } from './helpers/pinEditPathEngine';

// Edit-path test: guards the engine that takes the edit, whatever the playback verdicts make the default.
pinEditPathEngine('robhubbard', 'soundmaster', 'hippel', 'sidmon2', 'instereo1', 'soundmon');

vi.mock('@/utils/audio-context', async (orig) => {
  const actual = await orig<typeof import('@/utils/audio-context')>();
  const gain = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
  return { ...actual, getDevilboxAudioContext: () => ({ createGain: gain }) };
});

const corpus = (n: string) => {
  const f = readFileSync(resolve(ROOT, 'public/data/songs', n));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};
const emscriptenTransform = (c: string) => c
  .replace(/import\.meta\.url/g, "'.'").replace(/export\s+default\s+\w+;?/g, '')
  .replace(/self\.location\.href/g, "'.'")
  .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
  .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
  .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
  .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');

interface Inst { id: number; davidWhittaker?: unknown; synthType?: string; metadata?: unknown; digMug?: unknown; inStereo2?: unknown; tfmx?: unknown }
interface Keyed { triggerAttack(note: string | number, time?: number, velocity?: number): void; triggerRelease(): void; setInstrument?(c: unknown): Promise<void> }

/** The real engine class with its worklet node replaced by the harness: its own methods build the messages. */
function engineOver<T extends object>(Cls: { prototype: T; getInstance: () => T }, send: (m: unknown) => void): T {
  const fake = Object.create(Cls.prototype) as Record<string, unknown>;
  fake.workletNode = { port: { postMessage: (m: unknown) => send(m) } };
  fake.output = { connect() {}, disconnect() {} };
  fake.ready = async () => {};
  fake.sendMessage = (m: unknown) => send(m);
  vi.spyOn(Cls as unknown as { getInstance: () => T }, 'getInstance').mockReturnValue(fake as T);
  return fake as T;
}

interface Format {
  name: string;
  song: string;
  companion?: string;
  synthType: string;
  worklet: [string, string];
  /** The instrument id of a tonal synth instrument of the song, and how to build its synth. */
  pick: (insts: Inst[]) => Inst | undefined;
  /** False when the corpus has no instrument of the format that sustains (they run through their own envelope and end); the hold test needs one. */
  sustains?: boolean;
  /** An instrument that sustains while a key is down, when `pick`'s is percussive or modulated. */
  holdPick?: (insts: Inst[]) => Inst | undefined;
  make: (inst: Inst, send: (m: unknown) => void) => Promise<Keyed>;
}

const FORMATS: Format[] = [
  {
    name: 'Digital Mugician believe.dmu', song: 'digital-mugician/believe.dmu', synthType: 'DigMugSynth', worklet: ['digmug', 'DigMug'],
    pick: (i) => i.find((x) => x.synthType === 'DigMugSynth' && x.id === 11),
    make: async (inst, send) => {
      const { DigMugEngine } = await import('@/engine/digmug/DigMugEngine');
      engineOver(DigMugEngine as never, send);
      const { DigMugSynth } = await import('@/engine/digmug/DigMugSynth');
      const s = new DigMugSynth();
      await s.setInstrument(inst.digMug as never);
      return s as unknown as Keyed;
    },
  },
  {
    name: 'Digital Mugician cockwise.mug', song: 'formats/cockwise.mug', synthType: 'DigMugSynth', worklet: ['digmug', 'DigMug'], sustains: false,
    pick: (i) => i.find((x) => x.synthType === 'DigMugSynth' && x.id === 3),
    make: async (inst, send) => {
      const { DigMugEngine } = await import('@/engine/digmug/DigMugEngine');
      engineOver(DigMugEngine as never, send);
      const { DigMugSynth } = await import('@/engine/digmug/DigMugSynth');
      const s = new DigMugSynth();
      await s.setInstrument(inst.digMug as never);
      return s as unknown as Keyed;
    },
  },
  {
    name: 'Delta Music 1 crusaders1.dm', song: 'formats/crusaders1.dm', synthType: 'DeltaMusic1Synth', worklet: ['deltamusic1', 'DeltaMusic1'],
    pick: (i) => i.find((x) => x.synthType === 'DeltaMusic1Synth' && x.id === 3),
    make: async (inst, send) => {
      const { DeltaMusic1Engine } = await import('@/engine/deltamusic1/DeltaMusic1Engine');
      engineOver(DeltaMusic1Engine as never, send);
      const { DeltaMusic1Synth } = await import('@/engine/deltamusic1/DeltaMusic1Synth');
      const s = new DeltaMusic1Synth();
      s.setInstrumentNumber(inst.id);
      return s as unknown as Keyed;
    },
  },
  {
    name: 'Delta Music 2 anthrox_intro.dm2', song: 'formats/anthrox_intro.dm2', synthType: 'DeltaMusic2Synth', worklet: ['deltamusic2', 'DeltaMusic2'],
    pick: (i) => i.find((x) => x.synthType === 'DeltaMusic2Synth' && x.id === 3),
    make: async (inst, send) => {
      const { DeltaMusic2Engine } = await import('@/engine/deltamusic2/DeltaMusic2Engine');
      engineOver(DeltaMusic2Engine as never, send);
      const { DeltaMusic2Synth } = await import('@/engine/deltamusic2/DeltaMusic2Synth');
      const s = new DeltaMusic2Synth();
      s.setInstrumentNumber(inst.id);
      return s as unknown as Keyed;
    },
  },
  {
    name: 'InStereo! 1.0 fantasi8.is', song: 'instereo!/fantasi8.is', synthType: 'InStereo1Synth', worklet: ['instereo1', 'InStereo1'],
    pick: (i) => i.find((x) => x.synthType === 'InStereo1Synth' && x.id === 9),
    holdPick: (i) => i.find((x) => x.synthType === 'InStereo1Synth' && x.id === 13),
    make: async (inst, send) => {
      const { InStereo1Engine } = await import('@/engine/instereo1/InStereo1Engine');
      engineOver(InStereo1Engine as never, send);
      const { InStereo1Synth } = await import('@/engine/instereo1/InStereo1Synth');
      const s = new InStereo1Synth();
      s.setInstrumentNumber(inst.id);
      return s as unknown as Keyed;
    },
  },
  {
    name: 'StarTrekker AM amsyntdemo.mod', song: 'startrekker-am/amsyntdemo.mod', companion: 'startrekker-am/amsyntdemo.mod.nt', synthType: 'StartrekkerAMSynth', worklet: ['startrekker-am', 'StartrekkerAM'],
    pick: (i) => i.find((x) => x.synthType === 'StartrekkerAMSynth' && x.id === 1),
    make: async (inst, send) => {
      const { StartrekkerAMEngine } = await import('@/engine/startrekker-am/StartrekkerAMEngine');
      engineOver(StartrekkerAMEngine as never, send);
      const { StartrekkerAMSynth } = await import('@/engine/startrekker-am/StartrekkerAMSynth');
      const s = new StartrekkerAMSynth();
      s.setInstrumentNumber(inst.id);
      return s as unknown as Keyed;
    },
  },
  {
    name: 'InStereo! 2.0 stereo_feeling.is20', sustains: false, song: 'formats/stereo_feeling.is20', synthType: 'InStereo2Synth', worklet: ['instereo2', 'InStereo2'],
    pick: (i) => i.find((x) => x.synthType === 'InStereo2Synth' && x.id === 6),
    make: async (inst, send) => {
      const { InStereo2Engine } = await import('@/engine/instereo2/InStereo2Engine');
      engineOver(InStereo2Engine as never, send);
      const { InStereo2Synth } = await import('@/engine/instereo2/InStereo2Synth');
      const s = new InStereo2Synth();
      s.setInstrumentNumber((inst.inStereo2 as { instrumentNumber: number }).instrumentNumber);
      return s as unknown as Keyed;
    },
  },
  {
    name: 'David Whittaker apb.dw', sustains: false, song: 'formats/apb.dw', synthType: 'DavidWhittakerSynth', worklet: ['davidwhittaker', 'DavidWhittaker'],
    pick: (i) => i.find((x) => x.synthType === 'DavidWhittakerSynth' && x.id === 8),
    make: async (inst, send) => {
      const { DavidWhittakerEngine } = await import('@/engine/davidwhittaker/DavidWhittakerEngine');
      engineOver(DavidWhittakerEngine as never, send);
      const { DavidWhittakerSynth } = await import('@/engine/davidwhittaker/DavidWhittakerSynth');
      const s = new DavidWhittakerSynth();
      await s.setInstrument(inst.davidWhittaker as never);
      return s as unknown as Keyed;
    },
  },
  {
    name: 'Steve Turner paradroid90.jpo', song: 'steve-turner/paradroid90.jpo', synthType: 'SteveTurnerSynth', worklet: ['steveturner', 'SteveTurner'],
    pick: (i) => i.find((x) => x.synthType === 'SteveTurnerSynth' && x.id === 14),
    make: async (inst, send) => {
      const { SteveTurnerEngine } = await import('@/engine/steveturner/SteveTurnerEngine');
      const fake = engineOver(SteveTurnerEngine as never, send) as unknown as Record<string, unknown>;
      fake._initPromise = Promise.resolve();
      const { SteveTurnerSynth } = await import('@/engine/steveturner/SteveTurnerSynth');
      const s = new SteveTurnerSynth();
      s.setInstrumentIndex(inst.id - 1);
      return s as unknown as Keyed;
    },
  },
  {
    name: 'TFMX Professional hbtitle', sustains: false, song: 'tfmx/mdat.hbtitle', companion: 'tfmx/smpl.hbtitle', synthType: 'TFMXSynth', worklet: ['tfmx', 'TFMX'],
    pick: (i) => i.find((x) => x.synthType === 'TFMXSynth' && x.id === 9),
    make: async (inst, send) => {
      const { TFMXEngine } = await import('@/engine/tfmx/TFMXEngine');
      engineOver(TFMXEngine as never, send);
      const { TFMXSynth } = await import('@/engine/tfmx/TFMXSynth');
      const s = new TFMXSynth();
      s.setMacroIndex((inst.metadata as { tfmxMacroIndex: number }).tfmxMacroIndex);
      return s as unknown as Keyed;
    },
  },
];

let restoreFetch = () => {};
beforeAll(() => { restoreFetch = installDwNodeFetch(); });
afterAll(() => restoreFetch());

describe.each(FORMATS)('$name: the keyboard, through the real import and key path', (f) => {
  // The sound of a key is made by two asynchronous steps the old test covered with a guessed 30 ms sleep that a
  // loaded machine overruns (the first note-on of the StarTrekker AM worklet instantiates a second WASM instance;
  // the Steve Turner synth loads its preview module in an unawaited promise chain): so the test waits for each
  // step. (1) The synth's note message reaching the engine, (2) the worklet having handled every message sent.
  let sent: unknown[] = [];
  let pending: Promise<void>[] = [];
  const settled = async () => { while (pending.length) { const p = pending; pending = []; await Promise.all(p); } };
  const isNoteMessage = (m: unknown) => ['noteOn', 'keyNote'].includes((m as { type?: string }).type ?? '');
  const keyDown = async (synth: Keyed, key: string): Promise<void> => {
    const from = sent.length;
    synth.triggerAttack(key, 0, 1);
    const deadline = Date.now() + 15000;
    while (!sent.slice(from).some(isNoteMessage)) {
      if (Date.now() > deadline) throw new Error(`${f.name}: key ${key} never reached the engine as a note message`);
      await new Promise((r) => setTimeout(r, 1));
    }
    await settled();
  };
  async function setup(hold = false): Promise<{ synth: Keyed; proc: WorkletProc; inst: Inst }> {
    pending = []; sent = [];
    const song = await parseModuleToSong(new File([corpus(f.song)], f.song.split('/').pop()!), 0, undefined, undefined,
      f.companion ? new Map([[f.companion.split('/').pop()!, corpus(f.companion)]]) : undefined);
    const inst = (hold && f.holdPick ? f.holdPick : f.pick)(song.instruments as unknown as Inst[]);
    expect(inst, `the import keeps a ${f.synthType} instrument (not flattened to a Sampler)`).toBeTruthy();
    // the engine's loaded-song state the synth reads (applySong does this on a real load)
    useFormatStore.setState({ ...(Object.fromEntries(Object.entries(song).filter(([k]) => /FileData$|NtData$|SmplData$/.test(k))) as object) } as never);
    const w = await startWorklet(f.worklet[0], f.worklet[1], emscriptenTransform);
    const synth = await f.make(inst!, (m) => { sent.push(m); pending.push(w.send(m)); });
    return { synth, proc: w.proc, inst: inst! };
  }
  const versionsOff = async <T,>(fn: () => Promise<T> | T): Promise<T> => {
    const v = Object.getOwnPropertyDescriptor(process, 'versions')!;
    Object.defineProperty(process, 'versions', { value: {}, configurable: true });
    try { return await fn(); } finally { Object.defineProperty(process, 'versions', v); }
  };

  it('three keys (C2, D2, C3) give three pitches a tone and an octave apart; a held key keeps sounding; key-up silences', async () => {
    const { synth, proc } = await setup();
    const hz: number[] = [];
    for (const key of ['C2', 'D2', 'C3']) {
      await versionsOff(() => keyDown(synth, key));
      const out = renderTicks(proc, 8, 0);
      const level = rmsPerTick(out, 8);
      expect(Math.max(...level), `${f.name} key ${key} sounds`).toBeGreaterThan(0.005);
      hz.push(fundamentalHz(out.subarray(2 * FPT, 8 * FPT), 30, 4000));
      synth.triggerRelease();
      await settled();
      renderTicks(proc, 4, 0);
    }
    expect(hz.every((h) => h > 0), `pitches ${hz.join(', ')}`).toBe(true);
    const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
    expect(Math.abs(cents(hz[1], hz[0]) - 200), `C2 to D2 is a tone (${hz[0].toFixed(1)} -> ${hz[1].toFixed(1)} Hz)`).toBeLessThan(60);
    expect(Math.abs(cents(hz[2], hz[0]) - 1200), `C2 to C3 is an octave (${hz[0].toFixed(1)} -> ${hz[2].toFixed(1)} Hz)`).toBeLessThan(60);
  });

  it.runIf(f.sustains !== false)('a key held for 2.4 s keeps sounding (the instrument sustains while the key is down) and key-up lets the release end it', async () => {
    const { synth, proc } = await setup(true);
    await versionsOff(() => keyDown(synth, 'C2'));
    const held = rmsPerTick(renderTicks(proc, 120, 0), 120);
    const peak = Math.max(...held);
    expect(Math.max(...held.slice(60, 120)), `${f.name}: still sounding between 1.2 s and 2.4 s of a held key (peak ${peak.toFixed(3)})`).toBeGreaterThan(Math.max(0.001, peak * 0.05));
    synth.triggerRelease();
    await settled();
    const after = rmsPerTick(renderTicks(proc, 250, 0), 250);
    expect(after[249], `${f.name}: quiet 5 s after key-up (peak ${peak.toFixed(3)})`).toBeLessThan(peak * 0.1);
  });
});
