/**
 * The one input for module and MIDI export (plan 2026-10-07-one-load-save-
 * export-path, U3b).
 *
 * Every exporter here reads `liveTrackerSong()` - the song as the stores hold
 * it at call time, edits included - and nothing else: callers pass options
 * (format, name, channel limit, scope), never song data. The Export panels, the
 * FT2 Save, the OctaMED button, the Cinter export and the MCP tools all call
 * these, so they cannot disagree about what the song is. (Before, the panels
 * read store arrays, OctaMED hand-built a song from four stores, the MIDI
 * panel exported every pattern in storage order with automation while MCP
 * exported the order list without.) Native-format export has had its one
 * router (nativeExportRouter.exportNativeSong, live song when given null)
 * since before this unit.
 */
import { liveTrackerSong } from '@/lib/song/liveSong';
import { useProjectStore } from '@/stores/useProjectStore';
import { FurnaceDispatchPlatform } from '@/engine/furnace-dispatch/platforms';
import { exportFurnaceModule, type FurnaceModuleResult } from './FurnaceModuleExporter';
import { exportFurnaceAyScramble, ayScrambleTempoWarning, type AyScrambleTarget, type FurnaceAyScrambleResult } from './FurnaceExporter';
import { exportWithOpenMPT, type OpenMPTExportOptions, type OpenMPTExportResult } from './OpenMPTExporter';
import { exportSongToMOD, type ModExportResult } from './modExport';
import type { ExportNativeOptions, NativeExportResult } from './nativeExportRouter';
import { exportPatternToMIDI, exportSongToMIDI } from './midiExport';
import type { MIDIExportOptions } from './midiTypes';
import type { TadBuildResult } from './tad/tadProjectBuilder';

/** MOD / XM / IT / S3M through OpenMPT, from the live song. */
export async function exportModuleFile(
  options: Pick<OpenMPTExportOptions, 'format'> & Partial<Omit<OpenMPTExportOptions, 'format'>>,
): Promise<OpenMPTExportResult> {
  const song = liveTrackerSong();
  return exportWithOpenMPT(song.patterns, song.instruments, song.songPositions, {
    moduleName: song.name,
    initialBPM: song.initialBPM,
    initialSpeed: song.initialSpeed,
    ...options,
  });
}

/**
 * The song's own native format (the format it was loaded in, edits included),
 * from the stores. The one door to the native export router: callers pass
 * options, never a song. Null when nothing can be exported.
 */
export async function exportNativeFile(options: ExportNativeOptions = {}): Promise<NativeExportResult | null> {
  const { exportNativeSong } = await import('./nativeExportRouter');
  return exportNativeSong(null, options);
}

/**
 * Is there a Native export for the song the stores hold? Asked of the router's own exporter table: nothing is
 * serialized, so a dialog can ask on open and on every edit.
 */
export async function nativeExportAvailableForLiveSong(): Promise<boolean> {
  const { nativeExportAvailable } = await import('./nativeExportRouter');
  return nativeExportAvailable(null);
}

/** The ProTracker MOD writer with synth voices baked to samples, from the live song. */
export async function exportBakedMod(options: { channelCount?: 4 | 6 | 8; moduleName?: string } = {}): Promise<ModExportResult> {
  return exportSongToMOD(liveTrackerSong(), { ...options, bakeSynths: true });
}

export interface MidiFileOptions extends Partial<MIDIExportOptions> {
  scope: 'song' | 'pattern';
  /** scope 'pattern': default is the selected pattern. */
  patternIndex?: number;
  includeAutomation?: boolean;
}

export interface MidiFileResult {
  data: Uint8Array;
  scope: 'song' | 'pattern';
  /** Name of the exported pattern, or the song. */
  name: string;
  patternIndex?: number;
}

/** A Standard MIDI File of the live song (its order list) or of one pattern. */
export async function exportMidiFile(options: MidiFileOptions): Promise<MidiFileResult> {
  const song = liveTrackerSong();
  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  const { useAutomationStore } = await import('@/stores/useAutomationStore');
  const timeSignature: [number, number] = [4, 4];
  const { scope, patternIndex, includeAutomation = true, ...midiOptions } = options;
  const curves = includeAutomation ? useAutomationStore.getState().curves : [];
  if (scope === 'song') {
    const sequence = song.songPositions.map((i) => song.patterns[i]?.id).filter(Boolean) as string[];
    return {
      data: exportSongToMIDI(song.patterns, sequence, song.initialBPM, timeSignature, curves, { ...midiOptions, includeAutomation }),
      scope, name: song.name,
    };
  }
  const idx = patternIndex ?? useTrackerStore.getState().currentPatternIndex;
  const pattern = song.patterns[idx];
  if (!pattern) throw new Error(`Pattern ${idx} not found`);
  return {
    data: exportPatternToMIDI(pattern, song.initialBPM, timeSignature, { ...midiOptions, includeAutomation }),
    scope, name: pattern.name || 'pattern', patternIndex: idx,
  };
}

/** Neo Geo (YM2610) song as a Furnace .fur module, from the live song. Throws when the song holds something the module cannot. */
export function exportFurnaceModuleFile(): FurnaceModuleResult {
  const song = liveTrackerSong();
  // An imported extended-FM module (0xa6) keeps its 17-channel layout on export.
  const extendedFm = song.furnaceNative?.chipIds.includes(FurnaceDispatchPlatform.YM2610_EXT) ?? false;
  return exportFurnaceModule({ ...song, extendedFm });
}

/** AY-3-8910 song as a Furnace .fur for the BossGame Scramble player, from the live song. Warnings include the tempo check. */
export function exportFurnaceAyScrambleFile(target: AyScrambleTarget = 'arcade'): FurnaceAyScrambleResult {
  const song = liveTrackerSong();
  const result = exportFurnaceAyScramble(song, target);
  const tempo = ayScrambleTempoWarning(song.initialBPM, target);
  return tempo ? { ...result, warnings: [...result.warnings, tempo] } : result;
}

export interface ZxBeeperTapResult { tap: Uint8Array; seconds: number; rows: number; warnings: string[] }

/** ZX Spectrum 48K beeper .tap from the live song's pattern data (first four channels). */
export async function exportZxBeeperTapFile(title = 'devilbox'): Promise<ZxBeeperTapResult> {
  const song = liveTrackerSong();
  const [{ songToBeeperRows, encodeBeeperMusic }, { fetchZxBeeperPlayer, buildZx48Tap }] = await Promise.all([
    import('./zx/zxBeeperData'),
    import('./zx/zxTap'),
  ]);
  const player = await fetchZxBeeperPlayer();
  const data = songToBeeperRows(song, player.maxBytes);
  const tap = buildZx48Tap(player, (base) => encodeBeeperMusic(data.rows, base), title);
  const tempo = ayScrambleTempoWarning(song.initialBPM, 'zxbeeper');
  return { tap, seconds: data.seconds, rows: data.rows.length, warnings: tempo ? [...data.warnings, tempo] : data.warnings };
}

/** SNES Furnace song(s) -> Terrific Audio Driver project zip, from the live song. Instrument index = Furnace instrument index. */
export async function exportTadProjectFile(): Promise<TadBuildResult> {
  const song = liveTrackerSong();
  if (!song.furnaceNative) throw new Error('No Furnace song loaded.');
  const [{ buildTadProject, tadInstrumentFromFurnace }, compiler] = await Promise.all([
    import('./tad/tadProjectBuilder'),
    import(/* @vite-ignore */ `${import.meta.env.BASE_URL}tad/tad-compiler.js`),
  ]);
  const base = import.meta.env.BASE_URL;
  const meta = useProjectStore.getState().metadata;
  return buildTadProject(
    [{
      title: song.name || 'song',
      native: song.furnaceNative,
      instruments: song.instruments.map((i) => tadInstrumentFromFurnace(i.name, i.furnace ?? {})),
      samples: song.furnaceSamples ?? [],
      wavetables: song.furnaceWavetables?.map((w, n) => ({ name: `wave${n}`, ...w })),
      author: meta.author === 'Unknown' ? '' : meta.author,
      comment: meta.description,
    }],
    compiler.default,
    (f) => `${base}tad/${f}`,
    async (f) => new Uint8Array(await (await fetch(`${base}tad/${f}`)).arrayBuffer()),
  );
}
