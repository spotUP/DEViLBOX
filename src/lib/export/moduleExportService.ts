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
import { exportWithOpenMPT, type OpenMPTExportOptions, type OpenMPTExportResult } from './OpenMPTExporter';
import { exportSongToMOD, type ModExportResult } from './modExport';
import type { ExportNativeOptions, NativeExportResult } from './nativeExportRouter';
import { exportPatternToMIDI, exportSongToMIDI } from './midiExport';
import type { MIDIExportOptions } from './midiTypes';

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
