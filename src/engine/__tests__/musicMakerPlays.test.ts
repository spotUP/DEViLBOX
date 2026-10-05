/**
 * MusicMaker V8 songs play on MusicMakerEngine, end to end.
 *
 * moveback.sdata (4-voice STD) and best of guitars.sdata (EXT, 7 voices)
 * go through the app's own path: companionResolver picks the partners,
 * parseModuleToSong routes them, NativeEngineRouting names the engine, and
 * the real worklet (public/musicmaker/MusicMaker.worklet.js) renders the
 * module MusicMakerEngine.loadTune builds from the song's file data.
 *
 * Before this engine UADE's 4V player played moveback with its packed
 * instruments read as raw samples and both UADE players refused best of
 * guitars (2026-10-05). The periods asserted below are the ones UADE's
 * MusicMaker4 / MusicMaker8 (the author's players) put on Paula, read with
 * the channel snapshot in a lock-step run.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { resolveCompanions } from '@lib/import/companionResolver';
import { musicMakerWorkletModule } from '@lib/import/formats/MusicMakerParser';
import { playingEngineFor } from '@/engine/replayer/NativeEngineRouting';

const ROOT = process.cwd();
const DIR = resolve(ROOT, 'public/data/songs/formats/MusicMaker V8 Old/- unknown');

type Voice = { cur: unknown; outPeriod: number; outVol: number };
type Proc = {
  handleMessage(d: unknown): Promise<void>;
  process(i: Float32Array[][], o: Float32Array[][]): boolean;
  runTick(): void;
  ticksPlayed: number;
  eventsApplied: number;
  voices: Voice[];
};

function newProcessor(): { proc: Proc; posted: { type?: string; kind?: string; voices?: number }[] } {
  let Processor!: new () => Proc;
  const posted: { type?: string; kind?: string; voices?: number }[] = [];
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: (m: { type?: string }) => posted.push(m), onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
    sampleRate: 44100, currentTime: 0,
  };
  new Function(...Object.keys(scope), readFileSync(resolve(ROOT, 'public/musicmaker/MusicMaker.worklet.js'), 'utf8'))(...Object.values(scope));
  return { proc: new Processor(), posted };
}

/** The song as the app loads it: the resolver's companions, read from disk. */
async function importSong(name: string): Promise<TrackerSong> {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const r = resolveCompanions(name, { siblings: readdirSync(DIR) });
  const companions = new Map<string, ArrayBuffer>();
  for (const c of r.companions) {
    const b = readFileSync(resolve(DIR, r.sources[c] ?? c));
    companions.set(c, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  }
  const file = new File([new Uint8Array(readFileSync(resolve(DIR, name)))], name);
  return parseModuleToSong(file, 0, undefined, undefined, companions);
}

function peak(proc: Proc, seconds: number): number {
  const l = new Float32Array(128), r = new Float32Array(128);
  let p = 0;
  for (let done = 0; done < 44100 * seconds; done += 128) {
    proc.process([], [[l, r]]);
    for (let i = 0; i < 128; i++) p = Math.max(p, Math.abs(l[i]), Math.abs(r[i]));
  }
  return p;
}

/** The distinct periods voice `v` plays over `ticks` ticks, while its sample runs. */
function periods(proc: Proc, v: number, ticks: number, count: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < ticks && out.length < count; t++) {
    proc.runTick();
    const voice = proc.voices[v];
    if (voice.cur && voice.outPeriod && voice.outPeriod !== out[out.length - 1]) out.push(voice.outPeriod);
  }
  return out;
}

// The route graph loads lazily and the cold import is slow; pay it once.
beforeAll(async () => { await import('@lib/import/parseModuleToSong'); }, 240_000);

describe('MusicMaker V8 songs play on MusicMakerEngine', () => {
  it('moveback.sdata: imported with its .ip, routed to the engine, the worklet plays it', async () => {
    const song = await importSong('moveback.sdata');
    expect(song.format).toBe('MusicMaker');
    expect(playingEngineFor(song)).toBe('MusicMaker');
    expect(song.numChannels).toBe(4);
    expect(song.songLength).toBe(43);
    const notes = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.note > 0 && c.note < 97);
    expect(notes.length).toBeGreaterThan(2000);

    const { proc, posted } = newProcessor();
    await proc.handleMessage({ type: 'loadModule', module: musicMakerWorkletModule(song.musicMakerFileData!) });
    expect(posted.at(-1)).toMatchObject({ type: 'moduleLoaded', kind: 'std', voices: 4 });
    expect(peak(proc, 3)).toBeGreaterThan(0.1);
    // Sentinels: the sequencer ran at the song's tick rate (speed 920 = 33.5 ticks/s).
    expect(proc.ticksPlayed).toBeGreaterThanOrEqual(100);
    expect(proc.eventsApplied).toBeGreaterThan(20);
    await proc.handleMessage({ type: 'setMuteMask', mask: 0 });
    expect(peak(proc, 0.5)).toBe(0);
  }, 120_000);

  it('moveback: the voices play the periods MusicMaker4 plays', async () => {
    const song = await importSong('moveback.sdata');
    const { proc } = newProcessor();
    await proc.handleMessage({ type: 'loadModule', module: musicMakerWorkletModule(song.musicMakerFileData!) });
    expect(periods(proc, 2, 600, 12)).toEqual([572, 180, 190, 214, 190, 160, 190, 160, 190, 160, 190, 160]);
  }, 120_000);

  it('best of guitars.sdata: an EXT song of seven voices plays, its envelope moving the pitch', async () => {
    const song = await importSong('best of guitars.sdata');
    expect(song.format).toBe('MusicMaker');
    expect(playingEngineFor(song)).toBe('MusicMaker');
    expect(song.numChannels).toBe(8);
    expect(song.songLength).toBe(37);

    const { proc, posted } = newProcessor();
    await proc.handleMessage({ type: 'loadModule', module: musicMakerWorkletModule(song.musicMakerFileData!) });
    expect(posted.at(-1)).toMatchObject({ type: 'moduleLoaded', kind: 'ext', voices: 8 });
    // The intro is quiet for three seconds; the band enters at 3.
    expect(peak(proc, 5)).toBeGreaterThan(0.1);
    expect(proc.ticksPlayed).toBeGreaterThanOrEqual(190);

    // Voice 3's guitar runs HULL table 1: MusicMaker8 puts these on Paula.
    const fresh = newProcessor().proc;
    await fresh.handleMessage({ type: 'loadModule', module: musicMakerWorkletModule(song.musicMakerFileData!) });
    expect(periods(fresh, 2, 900, 8)).toEqual([416, 422, 414, 426, 417, 438, 417, 426]);
  }, 120_000);

  it('names the missing instrument file instead of playing silence', async () => {
    const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
    const file = new File([new Uint8Array(readFileSync(resolve(DIR, 'moveback.sdata')))], 'moveback.sdata');
    await expect(parseModuleToSong(file, 0, undefined, undefined, new Map())).rejects.toThrow(/moveback\.ip/);
  }, 120_000);
});
