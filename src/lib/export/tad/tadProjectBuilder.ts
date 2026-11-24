// Several Furnace SNES songs -> one Terrific Audio Driver project: every plain subsong is a TAD
// song, every `sfx:` subsong a sound effect. Compiles through the vendored tad-compiler (WASM) and
// bundles an editable project, assembler exports, .spc previews and a README into one zip.
import JSZip from 'jszip';
import type { FurnaceNativeData, FurnaceModuleSample } from '@/types/tracker';
import type { FurnaceSNESConfig } from '@/types/instrument/furnace';
import type { FurnaceWavetable } from '@/lib/import/formats/FurnaceSongParser';
import {
  writeTadSong, writeTadSfx, tadSfxName, mergeTadSamples, widenTadPitches, TAD_SFX_FILE,
  type TadInstrumentInput, type TadSampleFile, type TadSongInput,
} from './tadSongWriter';
import { openTadSession, type CreateTadCompiler } from './tadCompilerWasm';
import { injectTadPlayerRom, type TadPlayerRomMeta } from './tadPlayerRom';
import { createWavFile } from '@/lib/import/InstrumentConverter';
import { resample, readWavPcm16 } from '@/lib/export/neogeo/neoGeoCompose';
import { TAD_AUDIO_RAM_BYTES, tadAudioRamBudget, tadAudioRamFromLog, tadAudioRamWarning, type TadAudioRamParts } from './tadAudioRam';

/** One Furnace instrument in either shape (parsed module or store config) -> writer input. */
export function tadInstrumentFromFurnace(name: string, f: {
  snes?: FurnaceSNESConfig;
  amiga?: { initSample?: number; useNoteMap?: boolean; noteMap?: ({ freq: number; map: number } | { sample: number; frequency: number })[]; useWave?: boolean; waveLen?: number };
  macros?: ReadonlyArray<{ code?: number; data?: ArrayLike<number>; loop?: number; release?: number; speed?: number; delay?: number; mode?: number }>;
}): TadInstrumentInput {
  return {
    name,
    snes: f.snes,
    initSample: f.amiga?.initSample,
    useNoteMap: f.amiga?.useNoteMap,
    // Parsed modules carry {freq, map}; the instrument store converts to {frequency, sample}.
    noteMap: f.amiga?.noteMap?.map((n) => ('map' in n ? n : { freq: n.frequency, map: n.sample })),
    useWave: f.amiga?.useWave,
    waveLen: f.amiga?.waveLen,
    macros: f.macros?.map((m) => ({ code: m.code, data: m.data ?? [], loop: m.loop, release: m.release, speed: m.speed, delay: m.delay, mode: m.mode })),
  };
}

export interface TadBuildFile {
  title: string;
  native: FurnaceNativeData;
  instruments: TadInstrumentInput[];
  samples: FurnaceModuleSample[];
  wavetables?: FurnaceWavetable[];
  /** Shown by the DEViLBOX player ROM. */
  author?: string;
  comment?: string;
}

export interface TadBuildResult {
  zip: Uint8Array;
  /** Writer and compiler warnings, each prefixed with its song. Nothing is dropped silently. */
  warnings: string[];
  /** Compiler sizes (bytes), null when the project did not check. */
  ram: { common: number; songs: { name: string; bytes: number }[] } | null;
  /** The shared Audio-RAM calculation's input: from the compiler's sizes, or from its "too large" log when the check failed. */
  audioRam: TadAudioRamParts | null;
  /** `check` passed. When false the zip holds the project and the compiler log only. */
  ok: boolean;
  songs: string[];
  soundEffects: string[];
  /** The DEViLBOX LoROM player ROM (build/player.sfc) with the songs injected; absent when the build or injection failed. */
  playerRom?: Uint8Array;
}

// TAD names must not start with a digit.
const ident = (s: string) => {
  const n = s.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'song';
  return /^\d/.test(n) ? `song_${n}` : n;
};
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const PROJECT = 'project.terrificaudio';
const AUDIO_RAM_BYTES = TAD_AUDIO_RAM_BYTES;

/** Project JSON for several songs, the sound effects (export order) and the samples. */
export function tadProjectJson(songs: { name: string; source: string }[], samples: TadSampleFile[], sfxNames: string[] = []): string {
  return JSON.stringify({
    _about: { file_type: 'Terrific Audio Driver project file', version: '0.4.2' },
    brr_samples: samples.map((s) => s.entry),
    songs,
    ...(sfxNames.length ? { default_sfx_flags: { one_channel: true, interruptible: true }, sound_effect_file: TAD_SFX_FILE } : {}),
    sound_effects: sfxNames,
  }, null, 2);
}

interface Piece { name: string; mml: string; kind: 'song' | 'sfx'; samples: TadSampleFile[]; warnings: string[]; file: number }

/** Rename `samples` so files cannot collide; identical data (content compare) shares one sample. */
function unifySamples(pieces: Piece[], canon: Map<string, TadSampleFile>): void {
  for (const p of pieces) {
    const rename = new Map<string, string>();
    for (const s of p.samples) {
      const found = [...canon.values()].find((c) => sameBytes(c.data, s.data));
      let name: string;
      if (!found) {
        name = canon.has(s.name) ? `f${p.file}_${s.name}` : s.name;
        const path = s.path.replace(/[^/]+(\.\w+)$/, `${name}$1`);
        canon.set(name, { ...s, name, path, entry: { ...s.entry, name, source: { ...(s.entry.source as object), source: path } } });
      } else {
        name = found.name;
        canon.set(name, { ...found, entry: { ...found.entry, pitches: widenTadPitches(found.entry.pitches, s.entry.pitches) } });
      }
      rename.set(s.name, name);
    }
    // Instrument definition lines are `@<id> <sample> ...`; selection lines `@<id>` have no sample.
    p.mml = p.mml.replace(/^(@\d+ )(\S+)/gm, (m, a: string, n: string) => (rename.has(n) ? a + rename.get(n) : m));
  }
}

function readme(r: TadBuildResult, log: string): string {
  return [
    'DEViLBOX export for the Terrific Audio Driver (TAD) v0.4.2, SNES.',
    '',
    'project/   Editable TAD project: project.terrificaudio, song MML, sound-effects.txt, samples/. Open it in the TAD GUI.',
    'build/     Compiled audio data per assembler (ca65, 64tass, asar, pvsneslib) and memory map (lorom, hirom).',
    '           Each folder holds the assembly file, the .bin it includes and the song/sound effect enums.',
    '           ca65 segment BANK1 and 64tass section AudioBank1 are defaults: rename them to match your linker script.',
    'build/player.sfc     DEViLBOX player ROM (LoROM, 256 KiB): plays song 1 on boot and shows title, author, timer and channel levels.',
    '                     Left/right: previous/next song. A or Start: pause/play. Untested on hardware.',
    'build/soundtest.sfc  TAD sound-test ROM with the same data. It opens on song 0, which is silent: press right for song 1,',
    '                     then B to play it; Start pauses. Up/down picks an item, left/right changes its value, A or B runs it.',
    'preview/   One .spc per song (sound effects included). Not for shipping.',
    '',
    'Known difference: TAD keys a note off one tick before the next unslurred note (KEY_OFF_TICK_DELAY);',
    'Furnace sounds the old note to the last tick. Slow-release sounds get a 1-tick release gap before each note.',
    '',
    `Songs: ${r.songs.join(', ') || 'none'}`,
    `Sound effects: ${r.soundEffects.join(', ') || 'none'}`,
    `Compiler check: ${r.ok ? 'passed' : 'FAILED'}`,
    r.ram ? `Audio RAM (${AUDIO_RAM_BYTES} bytes total): common data ${r.ram.common} bytes; ${r.ram.songs.map((s) => `${s.name} ${s.bytes} bytes`).join('; ')}` : 'Audio RAM: not measured (check failed)',
    '',
    `Warnings (${r.warnings.length}):`,
    ...r.warnings.map((w) => `- ${w}`),
    '',
    'Compiler log:',
    log,
  ].join('\n');
}

/** Lowest rate a sample is resampled to when the samples do not fit Audio-RAM. */
const MIN_SAMPLE_RATE = 4000;
const brrBytes = (frames: number) => Math.ceil(frames / 16) * 9;

/** SNES DSP BRR decode (fullsnes "BRR Samples"): 9-byte blocks of 16 nibbles, shift range and one of four filters. */
function decodeBrr(brr: Uint8Array): Int16Array {
  const out = new Int16Array(Math.floor(brr.length / 9) * 16);
  let old = 0, older = 0, o = 0;
  for (let b = 0; b + 9 <= brr.length; b += 9) {
    const shift = brr[b] >> 4, filter = (brr[b] >> 2) & 3;
    for (let i = 0; i < 16; i++) {
      const byte = brr[b + 1 + (i >> 1)];
      const nib = (((i & 1) ? byte & 15 : byte >> 4) << 28) >> 28;
      let v = shift <= 12 ? (nib << shift) >> 1 : nib < 0 ? -2048 : 0;
      if (filter === 1) v += old + (-old >> 4);
      else if (filter === 2) v += old * 2 + ((-old * 3) >> 5) - older + (older >> 4);
      else if (filter === 3) v += old * 2 + ((-old * 13) >> 6) - older + ((older * 3) >> 4);
      v = Math.max(-32768, Math.min(32767, v));
      const s16 = ((v * 2) << 16) >> 16;
      out[o++] = s16;
      older = old; old = s16 >> 1;
    }
  }
  return out;
}

/** 16-bit PCM of an exported sample. BRR has no rate of its own: it counts as 32 kHz, the rate its TAD tuning refers to. */
function samplePcm(s: TadSampleFile): { data: Int16Array; rate: number } {
  return s.path.endsWith('.brr') ? { data: decodeBrr(s.data), rate: 32000 } : readWavPcm16(s.data);
}

/**
 * WAV sample resampled to about `rate` Hz, the way an SNES port fits its samples: the loop keeps a whole number of
 * 16-sample BRR blocks (the exact ratio comes from the loop length), data past the loop end is dropped, and the
 * TAD tuning frequency (pitch at 32 kHz) scales by the same ratio so every note keeps its pitch.
 */
export function resampleTadSample(s: TadSampleFile, rate: number): { file: TadSampleFile; rate: number; from: number } {
  const { data: pcm, rate: from } = samplePcm(s);
  const src = s.entry.source as { loop_point?: number };
  const loop = src.loop_point;
  let ratio = from / rate;
  let loopLen = 0;
  if (loop !== undefined) {
    loopLen = Math.max(16, Math.round((pcm.length - loop) / ratio / 16) * 16);
    ratio = (pcm.length - loop) / loopLen;
  }
  const to = from / ratio;
  const out = resample(pcm, from, to);
  let body: Int16Array, pre = 0, loopPoint: number | undefined;
  if (loop !== undefined) {
    const start = Math.round(loop / ratio);
    pre = (16 - (start % 16)) % 16;
    body = out.subarray(0, start + loopLen);
    loopPoint = pre + start;
  } else body = out;
  const padded = new Int16Array(Math.ceil((pre + body.length) / 16) * 16 || 16);
  padded.set(body.subarray(0, padded.length - pre), pre);
  const pitches = s.entry.pitches as { frequency: number };
  // A resampled BRR sample goes back as WAV: the compiler encodes it again (gaussian check setting kept).
  const path = s.path.replace(/\.brr$/, '.wav');
  const entry = { ...s.entry, source: { ...src, type: 'wav', source: path, ...(loopPoint !== undefined ? { loop_point: loopPoint } : {}) }, pitches: { ...pitches, frequency: pitches.frequency * ratio } };
  return { file: { ...s, path, data: new Uint8Array(createWavFile(padded, Math.round(to))), entry }, rate: Math.round(to), from };
}

/** Bytes the compiler says the project is over: "too large by N bytes" or "common audio data is too large (X bytes, max: M)". */
function overBytes(msg: string): number | null {
  const by = /too large by (\d+) bytes/.exec(msg);
  if (by) return Number(by[1]);
  const common = /common audio data is too large \((\d+) bytes, max: (\d+)\)/.exec(msg);
  return common ? Number(common[1]) - Number(common[2]) : null;
}

/**
 * When the project is too large for Audio-RAM: first lower the echo delay (the echo buffer is the one block the export
 * can shrink without touching sound data), then resample the largest WAV samples to lower rates, largest first, until
 * the compiler accepts it or every sample is at MIN_SAMPLE_RATE.
 */
export async function buildTadProject(files: TadBuildFile[], create: CreateTadCompiler, locateFile?: (f: string) => string, loadAsset?: (f: string) => Promise<Uint8Array>): Promise<TadBuildResult> {
  let cap = 15;
  const rates = new Map<string, number>();
  for (;;) {
    const { result: r, samples, shrunk } = await buildTadProjectOnce(files, create, locateFile, cap, loadAsset, rates);
    if (r.ok) return r;
    const msg = r.warnings.join('\n');
    const over = overBytes(msg), buf = /echo buffer:\s+(\d+) bytes/.exec(msg);
    // compiler log: "echo buffer: N bytes" with 2048 bytes per 16 ms step
    const next = over !== null && buf ? Math.floor((Number(buf[1]) - over) / 2048) : -1;
    if (next >= 0 && next < cap) { cap = next; continue; }
    if (over === null) return r;
    // Greedy: take the sample with the most BRR bytes, lower its rate by a quarter, until the overshoot (plus a block of slack) is saved.
    let need = over + 64;
    const orig = new Map(samples.map((s) => [s.name, s]));
    const cur = new Map(shrunk.map((s) => {
      const { data, rate } = samplePcm(s);
      return [s.name, { rate, bytes: brrBytes(data.length) }];
    }));
    let changed = false;
    while (need > 0) {
      const [name, big] = [...cur].filter(([, c]) => c.rate > MIN_SAMPLE_RATE).sort((a, b) => b[1].bytes - a[1].bytes)[0] ?? [];
      if (!name || !big) break;
      const { file, rate } = resampleTadSample(orig.get(name)!, Math.max(MIN_SAMPLE_RATE, big.rate * 0.75));
      const bytes = brrBytes(samplePcm(file).data.length);
      need -= big.bytes - bytes;
      // Loop quantisation can hold the rate just above the floor: count that sample as done.
      cur.set(name, { rate: rate < big.rate ? rate : MIN_SAMPLE_RATE, bytes });
      if (rate < big.rate) { rates.set(name, rate); changed = true; }
    }
    if (!changed) return r;
  }
}

async function buildTadProjectOnce(
  files: TadBuildFile[], create: CreateTadCompiler, locateFile: ((f: string) => string) | undefined, echoDelayCap: number,
  loadAsset: ((f: string) => Promise<Uint8Array>) | undefined, rates: ReadonlyMap<string, number>,
): Promise<{ result: TadBuildResult; samples: TadSampleFile[]; shrunk: TadSampleFile[] }> {
  const warnings: string[] = [];
  const pieces: Piece[] = [];
  const usedNames = new Set<string>();
  const unique = (base: string) => { let n = base, i = 2; while (usedNames.has(n)) n = `${base}_${i++}`; usedNames.add(n); return n; };

  files.forEach((f, fi) => {
    const input: Omit<TadSongInput, 'subsong'> = { native: f.native, instruments: f.instruments, samples: f.samples, wavetables: f.wavetables, title: f.title, echoDelayCap };
    f.native.subsongs.forEach((sub, si) => {
      if (tadSfxName(sub.name)) {
        const r = writeTadSfx({ ...input, subsong: si });
        // No notes: tad-compiler rejects the whole project ("No notes in sound effect"), so leave it out.
        if (!r.mml) { r.warnings.forEach((w) => warnings.push(`${r.name}: ${w} It was left out of the export.`)); return; }
        const name = unique(r.name);
        pieces.push({ name, kind: 'sfx', mml: r.mml.replace(/^=== \S+ ===/, `=== ${name} ===`), samples: r.samples, warnings: r.warnings, file: fi });
      } else {
        const r = writeTadSong({ ...input, subsong: si });
        const multi = f.native.subsongs.length > 1;
        const name = unique(ident(multi ? `${f.title}_${sub.name || si + 1}` : f.title));
        pieces.push({ name, kind: 'song', mml: r.mml, samples: r.samples, warnings: r.warnings, file: fi });
      }
    });
  });
  for (const p of pieces) p.warnings.forEach((w) => warnings.push(`${p.name}: ${w}`));

  // One file keeps the writer's own names (mergeTadSamples); several files are unified by content.
  let samples: TadSampleFile[];
  if (files.length === 1) samples = mergeTadSamples(pieces.map((p) => p.samples));
  else { const canon = new Map<string, TadSampleFile>(); unifySamples(pieces, canon); samples = [...canon.values()]; }
  const original = samples;
  samples = samples.map((s) => {
    const rate = rates.get(s.name);
    if (rate === undefined) return s;
    const r = resampleTadSample(s, rate);
    warnings.push(`Sample ${s.name}: resampled from ${r.from} Hz to ${r.rate} Hz (${samplePcm(s).data.length} -> ${samplePcm(r.file).data.length} frames) to fit the SNES Audio-RAM; pitch kept.`);
    return r.file;
  });

  const songs = pieces.filter((p) => p.kind === 'song');
  const sfx = pieces.filter((p) => p.kind === 'sfx');
  const project: Record<string, Uint8Array | string> = {
    [PROJECT]: tadProjectJson(songs.map((p) => ({ name: p.name, source: `songs/${p.name}.mml` })), samples, sfx.map((p) => p.name)),
  };
  for (const p of songs) project[`songs/${p.name}.mml`] = p.mml;
  if (sfx.length) project[TAD_SFX_FILE] = sfx.map((p) => p.mml).join('\n');
  for (const s of samples) project[s.path] = s.data;

  const result: TadBuildResult = { zip: new Uint8Array(), warnings, ram: null, audioRam: null, ok: false, songs: songs.map((p) => p.name), soundEffects: sfx.map((p) => p.name) };
  const zip = new JSZip();
  for (const [path, data] of Object.entries(project)) zip.file(`project/${path}`, data);

  const tad = await openTadSession(project, create, locateFile);
  const pf = `/p/${PROJECT}`;
  const check = tad.run(['check', pf]);
  let log = `check: exit ${check.code}\n${check.log}`;
  result.ok = check.code === 0;
  if (!result.ok) {
    warnings.push(`The TAD compiler rejected the project: ${check.log.split('\n').slice(0, 5).join(' | ')}`);
    result.audioRam = tadAudioRamFromLog(check.log);
    const over = result.audioRam && tadAudioRamWarning(tadAudioRamBudget(result.audioRam));
    if (over) warnings.push(over);
  }
  else {
    const run = (what: string, args: string[]) => {
      const r = tad.run(args);
      log += `\n${what}: exit ${r.code}\n${r.log}`;
      if (r.code !== 0) warnings.push(`${what} failed: ${r.log.split('\n')[0]}`);
      return r.code === 0;
    };
    const size = (path: string) => tad.read(path).length;
    const sfxFlag = sfx.length ? ['-s'] : [];
    for (const p of songs) if (run(`preview ${p.name}`, ['song2spc', ...sfxFlag, '-o', `/o/${p.name}.spc`, pf, p.name])) zip.file(`preview/${p.name}.spc`, tad.read(`/o/${p.name}.spc`));
    const ram = { common: 0, songs: [] as { name: string; bytes: number }[] };
    if (run('common data', ['common', '-o', '/o/common.bin', pf])) ram.common = size('/o/common.bin');
    for (const p of songs) if (run(`song data ${p.name}`, ['song', '-o', `/o/${p.name}.bin`, pf, p.name])) ram.songs.push({ name: p.name, bytes: size(`/o/${p.name}.bin`) });
    result.ram = ram;
    const biggest = Math.max(0, ...ram.songs.map((s) => s.bytes));
    result.audioRam = { commonBytes: ram.common, songBytes: biggest, echoBytes: tadAudioRamFromLog(check.log)?.echoBytes ?? null };
    const over = tadAudioRamWarning(tadAudioRamBudget(result.audioRam));
    if (over) warnings.push(over);

    const asm: { id: string; cmd: string; seg: string[]; ext: string }[] = [
      { id: 'ca65', cmd: 'ca65-export', seg: ['-s', 'BANK1'], ext: 'asm' },
      { id: '64tass', cmd: '64tass-export', seg: ['-s', 'AudioBank1'], ext: 'asm' },
      { id: 'asar', cmd: 'asar-export', seg: [], ext: 'asm' },
      { id: 'pvsneslib', cmd: 'pv-export', seg: [], ext: 'asm' },
    ];
    for (const a of asm) for (const map of ['lorom', 'hirom']) {
      const d = `${a.id}_${map}`;
      const out = { asm: `/o/${d}_audio.${a.ext}`, bin: `/o/${d}_audio.bin`, inc: `/o/${d}_audio.inc` };
      if (run(`${a.id} ${map} export`, [a.cmd, `--${map}`, ...a.seg, '-a', out.asm, '-b', out.bin, '-i', out.inc, pf])) {
        for (const f of Object.values(out)) zip.file(`build/${d}/${f.slice(3)}`, tad.read(f));
        if (d === 'ca65_lorom' && loadAsset) {
          const text = (p: string) => new TextDecoder().decode(tad.read(p));
          const exp = { bin: tad.read(out.bin), asm: text(out.asm), inc: text(out.inc) };
          const player = { titles: result.songs, author: files[0]?.author, comment: files[0]?.comment };
          for (const [rom, name] of [['player-devilbox-lorom', 'player'], ['player-lorom', 'soundtest']] as const) {
            try {
              const [base, meta] = await Promise.all([loadAsset(`${rom}.sfc`), loadAsset(`${rom}.json`)]);
              const sfc = injectTadPlayerRom(base, JSON.parse(new TextDecoder().decode(meta)) as TadPlayerRomMeta, exp, player);
              zip.file(`build/${name}.sfc`, sfc);
              if (name === 'player') result.playerRom = sfc;
            } catch (e) { warnings.push(`${name}.sfc not built: ${(e as Error).message}`); }
          }
        }
      }
    }
  }
  zip.file('README.txt', readme(result, log));
  result.zip = await zip.generateAsync({ type: 'uint8array' });
  return { result, samples: original, shrunk: samples };
}
