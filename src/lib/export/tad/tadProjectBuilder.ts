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

/** One Furnace instrument in either shape (parsed module or store config) -> writer input. */
export function tadInstrumentFromFurnace(name: string, f: {
  snes?: FurnaceSNESConfig;
  amiga?: { initSample?: number; useNoteMap?: boolean; noteMap?: ({ freq: number; map: number } | { sample: number; frequency: number })[]; useWave?: boolean; waveLen?: number };
  macros?: ReadonlyArray<{ length?: number; data?: ArrayLike<number> }>;
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
    hasMacros: f.macros?.some((m) => (m.length ?? m.data?.length ?? 0) > 0),
  };
}

export interface TadBuildFile {
  title: string;
  native: FurnaceNativeData;
  instruments: TadInstrumentInput[];
  samples: FurnaceModuleSample[];
  wavetables?: FurnaceWavetable[];
}

export interface TadBuildResult {
  zip: Uint8Array;
  /** Writer and compiler warnings, each prefixed with its song. Nothing is dropped silently. */
  warnings: string[];
  /** Compiler sizes (bytes), null when the project did not check. */
  ram: { common: number; songs: { name: string; bytes: number }[] } | null;
  /** `check` passed. When false the zip holds the project and the compiler log only. */
  ok: boolean;
  songs: string[];
  soundEffects: string[];
}

// TAD names must not start with a digit.
const ident = (s: string) => {
  const n = s.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'song';
  return /^\d/.test(n) ? `song_${n}` : n;
};
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const PROJECT = 'project.terrificaudio';
const AUDIO_RAM_BYTES = 65536;

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
    'preview/   One .spc per song (sound effects included). Not for shipping.',
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

export async function buildTadProject(files: TadBuildFile[], create: CreateTadCompiler, locateFile?: (f: string) => string): Promise<TadBuildResult> {
  const warnings: string[] = [];
  const pieces: Piece[] = [];
  const usedNames = new Set<string>();
  const unique = (base: string) => { let n = base, i = 2; while (usedNames.has(n)) n = `${base}_${i++}`; usedNames.add(n); return n; };

  files.forEach((f, fi) => {
    const input: Omit<TadSongInput, 'subsong'> = { native: f.native, instruments: f.instruments, samples: f.samples, wavetables: f.wavetables, title: f.title };
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

  const songs = pieces.filter((p) => p.kind === 'song');
  const sfx = pieces.filter((p) => p.kind === 'sfx');
  const project: Record<string, Uint8Array | string> = {
    [PROJECT]: tadProjectJson(songs.map((p) => ({ name: p.name, source: `songs/${p.name}.mml` })), samples, sfx.map((p) => p.name)),
  };
  for (const p of songs) project[`songs/${p.name}.mml`] = p.mml;
  if (sfx.length) project[TAD_SFX_FILE] = sfx.map((p) => p.mml).join('\n');
  for (const s of samples) project[s.path] = s.data;

  const result: TadBuildResult = { zip: new Uint8Array(), warnings, ram: null, ok: false, songs: songs.map((p) => p.name), soundEffects: sfx.map((p) => p.name) };
  const zip = new JSZip();
  for (const [path, data] of Object.entries(project)) zip.file(`project/${path}`, data);

  const tad = await openTadSession(project, create, locateFile);
  const pf = `/p/${PROJECT}`;
  const check = tad.run(['check', pf]);
  let log = `check: exit ${check.code}\n${check.log}`;
  result.ok = check.code === 0;
  if (!result.ok) warnings.push(`The TAD compiler rejected the project: ${check.log.split('\n').slice(0, 5).join(' | ')}`);
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
    if (ram.common + biggest > AUDIO_RAM_BYTES) warnings.push(`Common data plus the largest song is ${ram.common + biggest} bytes, over the ${AUDIO_RAM_BYTES} byte audio RAM.`);

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
      }
    }
  }
  zip.file('README.txt', readme(result, log));
  result.zip = await zip.generateAsync({ type: 'uint8array' });
  return result;
}
