/**
 * liveTrackerSong - the current song as the engines and encoders take it (a
 * TrackerSong), read from the stores at call time.
 *
 * snapshotSong is the SERIALISABLE song (for saves); this is the LIVE one -
 * sample buffers intact, native engine bytes as buffers - for encoders. The
 * native export read the replayer's copy of the song instead, which is only
 * rebuilt when playback starts: edit a pattern, export without playing, and
 * the export missed the edit (2026-09-29 audit). The router's own store
 * rebuild covered three editor modes only.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import { FILE_DATA_FIELDS } from '@engine/formatFileDataFields';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useEditorStore } from '@/stores/useEditorStore';
import { resolveMaxTraxLoadBytes } from '@/lib/import/formats/maxtrax/maxtraxFormat';

/** The format a song plays as: its import tag, else what its editor mode implies. */
/**
 * The loaded song's format, the one rule: the pattern's sourceFormat, else
 * the parser's format recorded at apply time, else the editor mode's. The
 * playback hook used to derive its own (sourceFormat or MOD/XM) and passed it
 * over this one, so every engine gated on a format list (ASAP, AY, PiyoPiyo,
 * PMD, MDX...) stayed off (2026-10-05 broken-formats sweep).
 */
export function liveSongFormat(sourceFormat?: string): TrackerFormat {
  const tracker = useTrackerStore.getState();
  return formatOf(useFormatStore.getState(), sourceFormat ?? (tracker.patterns[0]?.importMetadata?.sourceFormat as string | undefined));
}

function formatOf(fmt: ReturnType<typeof useFormatStore.getState>, sourceFormat: string | undefined): TrackerFormat {
  if (sourceFormat) return sourceFormat as TrackerFormat;
  if (fmt.songFormat) return fmt.songFormat as TrackerFormat;
  switch (fmt.editorMode) {
    case 'hively': return (fmt.hivelyMeta?.version === 0 ? 'AHX' : 'HVL') as TrackerFormat;
    case 'klystrack': return 'KT' as TrackerFormat;
    case 'jamcracker': return 'JamCracker' as TrackerFormat;
    default: return (fmt.channelTrackTables && fmt.channelTrackTables.length > 0 ? 'MOD' : 'XM') as TrackerFormat;
  }
}

/**
 * The current song. `overrides` are playback's choices (the effective order,
 * the looped pattern, the module's initial tempo) laid over it.
 */
export function liveTrackerSong(overrides: Partial<TrackerSong> = {}): TrackerSong {
  const tracker = useTrackerStore.getState();
  const transport = useTransportStore.getState();
  const fmt = useFormatStore.getState();
  const order = tracker.patternOrder?.length ? tracker.patternOrder : tracker.patterns.map((_, i) => i);
  const modData = tracker.patterns[0]?.importMetadata?.modData;

  const song: Record<string, unknown> = {
    name: useProjectStore.getState().metadata?.name ?? 'Untitled',
    format: formatOf(fmt, tracker.patterns[0]?.importMetadata?.sourceFormat as string | undefined),
    patterns: tracker.patterns,
    instruments: useInstrumentStore.getState().instruments,
    songPositions: order,
    songLength: order.length,
    restartPosition: modData?.restartPosition ?? 0,
    numChannels: tracker.patterns[0]?.channels?.length ?? 4,
    initialSpeed: transport.speed ?? 6,
    initialBPM: transport.bpm ?? 125,
    linearPeriods: useEditorStore.getState().linearPeriods,
    // Native models and per-format metadata the store holds beside the bytes.
    hivelyNative: fmt.hivelyNative ?? undefined,
    hivelyMeta: fmt.hivelyMeta ?? undefined,
    klysNative: fmt.klysNative ?? undefined,
    furnaceNative: fmt.furnaceNative ?? undefined,
    furnaceActiveSubsong: fmt.furnaceActiveSubsong ?? undefined,
    channelTrackTables: fmt.channelTrackTables ?? undefined,
    channelSpeeds: fmt.channelSpeeds ?? undefined,
    channelGrooves: fmt.channelGrooves ?? undefined,
    sonixSidecarFiles: fmt.sonixSidecarFiles ?? undefined,
    uadeEditableFileName: fmt.uadeEditableFileName ?? undefined,
    maxTraxFileName: fmt.maxTraxFileName ?? undefined,
    adplugFileName: fmt.adplugFileName ?? undefined,
    asapFilename: fmt.asapFilename ?? undefined,
    adplugTicksPerRow: fmt.adplugTicksPerRow ?? undefined,
    c64MemPatches: fmt.c64MemPatches ?? undefined,
    sunTronicCompanionPcm: fmt.sunTronicCompanionPcm ?? undefined,
    uadePatternLayout: fmt.uadePatternLayout ?? undefined,
    nativeSamplePlayback: fmt.nativeSamplePlayback || undefined,
    tfmxTimingTable: fmt.tfmxTimingTable ?? undefined,
    sndhSubtune: fmt.sndhSubtune ?? undefined,
    gmeTrack: fmt.gmeTrack ?? undefined,
    asapSong: fmt.asapSong ?? undefined,
  };
  // Every native engine binary, from the one list that names them.
  const store = fmt as unknown as Record<string, unknown>;
  for (const field of FILE_DATA_FIELDS) {
    const value = store[field];
    if (value != null) song[field] = value;
  }
  // MaxTrax: the edited model re-encoded, not the bytes as loaded.
  const maxTrax = resolveMaxTraxLoadBytes(fmt.maxTraxData, fmt.maxTraxFileData);
  if (maxTrax) song.maxTraxFileData = maxTrax;
  // Furnace timing, carried on the first pattern's import metadata.
  const furnaceData = tracker.patterns[0]?.importMetadata?.furnaceData;
  if (furnaceData) {
    song.speed2 = furnaceData.speed2;
    song.hz = furnaceData.hz;
    song.virtualTempoN = furnaceData.virtualTempoN;
    song.virtualTempoD = furnaceData.virtualTempoD;
    song.compatFlags = furnaceData.compatFlags;
    song.grooves = furnaceData.grooves;
  }
  return { ...(song as unknown as TrackerSong), ...overrides };
}
