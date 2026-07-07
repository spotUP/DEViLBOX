// src/lib/export/nativeExportRouter.ts
/**
 * nativeExportRouter — single source of truth for "export the loaded song to its
 * native format, with edits preserved".
 *
 * Historically this dispatch logic existed in THREE places that drifted apart:
 *   - `useExportDialog.handleExportNative` (UI, the most complete)
 *   - `writeHandlers.exportNative` (MCP, a stale copy missing ~16 branches AND the
 *     chip-RAM readback fallback — so MCP export of an edited chip-RAM format
 *     returned the UN-edited original bytes)
 *   - `FT2Toolbar` Cinter save special-case
 *
 * They now all funnel through {@link exportNativeSong}. The router owns:
 *   - the named-format branches (JamCracker, SMON, SynTracker magic-dispatch,
 *     plain-MOD bake, FC, SidMon2, PumaTracker, OctaMED, PreTracker, HVL/AHX,
 *     DIGI, OKT, KT, IS10, AdPlug, Symphonie, Cinter, …)
 *   - the SINGLE `layoutFormatId → {module, fn, ext}` dynamic-import map
 *   - the Cinter save-vs-export decision (via {@link ExportNativeOptions.cinterMode})
 *   - the chip-RAM readback fallback (captures live pattern edits)
 *   - the raw original-bytes fallback, LAST, and only when there is no chip-RAM layout
 *
 * Callers keep only their own concerns: the UI does the blob download + toasts,
 * MCP does base64 + optional server-side outputPath.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';

// ── Public types ─────────────────────────────────────────────────────────────

export interface NativeExportCompanion {
  /** Suggested filename for the companion (e.g. the Cinter `.raw` sample blob). */
  name: string;
  data: Uint8Array;
}

export interface NativeExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
  /** Extra files that must be written alongside the primary one (e.g. Cinter `.raw`). */
  companions?: NativeExportCompanion[];
}

export type CinterExportMode = 'export' | 'save';

export interface ExportNativeOptions {
  /**
   * Which Cinter output to produce when the loaded song is a Cinter MOD.
   * - `'export'` (default): the compact one-way crunched `.cinter4` (+ optional
   *   `.raw` companion) — used by the Export dialog and the MCP `export_native` tool.
   * - `'save'`: a re-loadable full `.mod` with the Cinter voices baked as PCM —
   *   used by the FT2 toolbar's format-aware Save.
   */
  cinterMode?: CinterExportMode;
}

// ── layoutFormatId → dedicated exporter (the single dispatch map) ──────────────

export interface LayoutExporterEntry {
  /** Module file under `src/lib/export/` (no extension). */
  module: string;
  /** Named export in that module. */
  fn: string;
  /**
   * Extension for exporters that return raw bytes (`Uint8Array`/`ArrayBuffer`).
   * Omit for exporters that return a self-naming `{ data, filename, warnings }`.
   */
  ext?: string;
}

/**
 * Every format whose export is keyed purely on `uadePatternLayout.formatId`
 * (i.e. not on the coarse `song.format` tag). Exported so the round-trip harness
 * can assert each module import resolves and its `fn` exists.
 */
export const LAYOUT_EXPORTERS: Record<string, LayoutExporterEntry> = {
  musicLine: { module: 'MusicLineExporter', fn: 'exportMusicLineFile', ext: 'ml' },
  musicAssembler: { module: 'MusicAssemblerExporter', fn: 'exportAsMusicAssembler' },
  futurePlayer: { module: 'FuturePlayerExporter', fn: 'exportAsFuturePlayer' },
  digitalSymphony: { module: 'DigitalSymphonyExporter', fn: 'exportDigitalSymphony', ext: 'dsym' },
  amosMusicBank: { module: 'AMOSMusicBankExporter', fn: 'exportAMOSMusicBank', ext: 'abk' },
  hippelCoSo: { module: 'HippelCoSoExporter', fn: 'exportAsHippelCoSo' },
  inStereo2: { module: 'InStereo2Exporter', fn: 'exportInStereo2' },
  deltaMusic1: { module: 'DeltaMusic1Exporter', fn: 'exportDeltaMusic1' },
  deltaMusic2: { module: 'DeltaMusic2Exporter', fn: 'exportDeltaMusic2' },
  digitalMugician: { module: 'DigitalMugicianExporter', fn: 'exportDigitalMugician' },
  sidmon1: { module: 'SidMon1Exporter', fn: 'exportSidMon1' },
  sonicArranger: { module: 'SonicArrangerExporter', fn: 'exportSonicArranger' },
  tfmx: { module: 'TFMXExporter', fn: 'exportTFMX' },
  fredEditor: { module: 'FredEditorExporter', fn: 'exportFredEditor' },
  soundfx: { module: 'SoundFXExporter', fn: 'exportSoundFX' },
  tcbTracker: { module: 'TCBTrackerExporter', fn: 'exportTCBTracker' },
  gameMusicCreator: { module: 'GameMusicCreatorExporter', fn: 'exportGameMusicCreator' },
  quadraComposer: { module: 'QuadraComposerExporter', fn: 'exportQuadraComposer' },
  activisionPro: { module: 'ActivisionProExporter', fn: 'exportActivisionPro' },
  digiBoosterPro: { module: 'DigiBoosterProExporter', fn: 'exportDigiBoosterPro' },
  faceTheMusic: { module: 'FaceTheMusicExporter', fn: 'exportFaceTheMusic' },
  sawteeth: { module: 'SawteethExporter', fn: 'exportSawteeth' },
  earAche: { module: 'EarAcheExporter', fn: 'exportEarAche' },
  iffSmus: { module: 'IffSmusExporter', fn: 'exportIffSmus' },
  actionamics: { module: 'ActionamicsExporter', fn: 'exportActionamics' },
  soundFactory: { module: 'SoundFactoryExporter', fn: 'exportSoundFactory' },
  synthesis: { module: 'SynthesisExporter', fn: 'exportSynthesis' },
  soundControl: { module: 'SoundControlExporter', fn: 'exportSoundControl' },
  c67: { module: 'CDFM67Exporter', fn: 'exportCDFM67' },
  zoundMonitor: { module: 'ZoundMonitorExporter', fn: 'exportZoundMonitor' },
  chuckBiscuits: { module: 'ChuckBiscuitsExporter', fn: 'exportChuckBiscuits' },
  composer667: { module: 'Composer667Exporter', fn: 'exportComposer667' },
  kris: { module: 'KRISExporter', fn: 'exportKRIS' },
  nru: { module: 'NRUExporter', fn: 'exportNRU' },
  ims: { module: 'IMSExporter', fn: 'exportIMS' },
  stp: { module: 'STPExporter', fn: 'exportSTP' },
  unic: { module: 'UNICExporter', fn: 'exportUNIC' },
  dsm_dyn: { module: 'DSMDynExporter', fn: 'exportDSMDyn' },
  scumm: { module: 'SCUMMExporter', fn: 'exportSCUMM' },
  xmf: { module: 'XMFExporter', fn: 'exportXMF' },
};

// ── Internal working shape (data may still be a Blob until normalized) ─────────

type RawExportResult = {
  data: Blob | Uint8Array | ArrayBuffer;
  filename: string;
  warnings: string[];
  companions?: NativeExportCompanion[];
};

async function toUint8(data: Blob | Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await data.arrayBuffer());
}

async function normalize(raw: RawExportResult): Promise<NativeExportResult> {
  const out: NativeExportResult = {
    data: await toUint8(raw.data),
    filename: raw.filename,
    warnings: raw.warnings,
  };
  if (raw.companions && raw.companions.length > 0) out.companions = raw.companions;
  return out;
}

// ── Public entry point ─────────────────────────────────────────────────────────

/**
 * Export `song` (or, when `null`, whatever the stores currently hold) to its
 * native format. Returns `null` when nothing can be exported — callers craft
 * their own "no song" / "no exporter" message.
 */
export async function exportNativeSong(
  song: TrackerSong | null,
  opts: ExportNativeOptions = {},
): Promise<NativeExportResult | null> {
  const cinterMode: CinterExportMode = opts.cinterMode ?? 'export';

  // FT2 toolbar Save: always the baked, re-loadable Cinter .mod, from live stores.
  if (cinterMode === 'save') {
    const raw = await exportCinterSaveFromStores();
    return raw ? normalize(raw) : null;
  }

  // No replayer song: a Cinter MOD is still a native Cinter export; otherwise try to
  // reconstruct a song from the format store (hively/klystrack/jamcracker) so callers
  // that never triggered playback still export.
  let resolvedSong = song;
  if (!resolvedSong) {
    if (await isCinterLoaded()) {
      const raw = await exportCinterCrunchedFromStores();
      return raw ? normalize(raw) : null;
    }
    resolvedSong = await reconstructSongFromFormatStore();
    if (!resolvedSong) return null;
  }

  const raw = await dispatchNativeExport(resolvedSong);
  return raw ? normalize(raw) : null;
}

// ── Cinter paths (operate on the live stores, not a replayer song) ─────────────

async function isCinterLoaded(): Promise<boolean> {
  const { useInstrumentStore } = await import('@stores');
  return useInstrumentStore.getState().instruments.some(
    (i) => (i.parameters as Record<string, unknown> | undefined)?.cinter === 1,
  );
}

/** Baked full re-loadable .mod (FT2 toolbar Save). Cinter voices kept as PCM. */
async function exportCinterSaveFromStores(): Promise<RawExportResult | null> {
  const { useTrackerStore, useTransportStore, useProjectStore, useInstrumentStore } = await import('@stores');
  const { exportCinterModFile } = await import('./Cinter4ModSave');
  const trackerState = useTrackerStore.getState();
  const { bpm, speed } = useTransportStore.getState();
  const moduleName = useProjectStore.getState().metadata?.name || 'song';
  const res = await exportCinterModFile(
    trackerState.patterns,
    useInstrumentStore.getState().instruments,
    trackerState.patternOrder,
    { stripCinter: false, moduleName, bpm, speed },
  );
  return { data: res.data, filename: res.filename, warnings: [] };
}

/** Crunched one-way .cinter4 (+ .raw companion) — Export dialog / MCP. */
async function exportCinterCrunchedFromStores(): Promise<RawExportResult | null> {
  const { useTrackerStore, useTransportStore, useProjectStore, useInstrumentStore } = await import('@stores');
  const { exportCinterCrunched } = await import('./Cinter4ModSave');
  const { getOriginalModuleDataForExport, base64ToBuffer } = await import('./exporters');
  const trackerState = useTrackerStore.getState();
  const { bpm, speed } = useTransportStore.getState();
  const moduleName = useProjectStore.getState().metadata?.name || 'cinter';
  const omd = getOriginalModuleDataForExport();
  const originalModBytes = omd?.format === 'MOD' ? new Uint8Array(base64ToBuffer(omd.base64)) : undefined;
  const c = await exportCinterCrunched(
    trackerState.patterns,
    useInstrumentStore.getState().instruments,
    trackerState.patternOrder,
    { moduleName, bpm, speed, originalModBytes },
  );
  const warnings = c.errors.length > 0
    ? [`${c.errors.length} unsupported-command warning(s) during Cinter crunch`]
    : [];
  const companions: NativeExportCompanion[] | undefined = c.rawSamples.length > 0
    ? [{ name: c.filename.replace(/\.cinter4$/, '.raw'), data: c.rawSamples }]
    : undefined;
  return { data: c.songdata, filename: c.filename, warnings, companions };
}

/**
 * When no replayer song exists but the format store holds a hively/klystrack/
 * jamcracker session, rebuild a minimal `TrackerSong` from the stores so the
 * dedicated serializers can run (parity with the former MCP-only reconstruction).
 */
async function reconstructSongFromFormatStore(): Promise<TrackerSong | null> {
  const { useFormatStore } = await import('@stores/useFormatStore');
  const fmt = useFormatStore.getState();
  if (!(fmt.editorMode === 'hively' || fmt.editorMode === 'klystrack' || fmt.editorMode === 'jamcracker')) {
    return null;
  }
  const { useTrackerStore, useTransportStore, useProjectStore, useInstrumentStore } = await import('@stores');
  const trackerState = useTrackerStore.getState();
  const transportState = useTransportStore.getState();
  const metadata = useProjectStore.getState().metadata;
  const format = (fmt.editorMode === 'hively' ? (fmt.hivelyMeta?.version === 0 ? 'AHX' : 'HVL')
    : fmt.editorMode === 'klystrack' ? 'KT'
      : 'JamCracker') as TrackerSong['format'];
  return {
    name: metadata?.name ?? 'Untitled',
    format,
    patterns: trackerState.patterns,
    instruments: useInstrumentStore.getState().instruments,
    songPositions: trackerState.patternOrder ?? trackerState.patterns.map((_: unknown, i: number) => i),
    songLength: trackerState.patternOrder?.length ?? trackerState.patterns.length,
    restartPosition: 0,
    numChannels: trackerState.patterns[0]?.channels?.length ?? 4,
    initialSpeed: transportState.speed ?? 6,
    initialBPM: transportState.bpm ?? 125,
    hivelyNative: fmt.hivelyNative ?? undefined,
    hivelyFileData: fmt.hivelyFileData ?? undefined,
    hivelyMeta: fmt.hivelyMeta ?? undefined,
    klysNative: fmt.klysNative ?? undefined,
    klysFileData: fmt.klysFileData ?? undefined,
    jamCrackerFileData: fmt.jamCrackerFileData ?? undefined,
  } as TrackerSong;
}

// ── The dedicated-serializer dispatch (formerly duplicated in UI + MCP) ────────

function isSynTracker(song: TrackerSong): boolean {
  const d = song.uadeEditableFileData;
  if (!d || new Uint8Array(d).length < 16) return false;
  return String.fromCharCode(...new Uint8Array(d).slice(0, 16)) === 'SYNTRACKER-SONG:';
}

async function dispatchNativeExport(song: TrackerSong): Promise<RawExportResult | null> {
  const format = song.format as string;
  const layoutFormatId = song.uadePatternLayout?.formatId || song.uadeVariableLayout?.formatId || '';
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  let result: RawExportResult | null = null;

  if (format === 'JamCracker') {
    const { exportAsJamCracker } = await import('./JamCrackerExporter');
    result = await exportAsJamCracker(song);
  } else if (format === 'SMON') {
    const { exportAsSoundMon } = await import('./SoundMonExporter');
    result = await exportAsSoundMon(song);
  } else if (isSynTracker(song)) {
    // SynTracker keeps format 'MOD' for UADE routing; dispatch on its magic so it
    // doesn't fall through to the MOD exporter. exportSynTrackerFile writes the
    // edited cells back into a copy of the original module (byte-exact for unedited).
    const { exportSynTrackerFile } = await import('./SynTrackerExporter');
    result = { data: exportSynTrackerFile(song), filename: `${baseName}.synmod`, warnings: [] };
  } else if (format === 'MOD' && !layoutFormatId) {
    const { exportSongToMOD } = await import('./modExport');
    const modResult = await exportSongToMOD(song, { bakeSynths: true });
    result = { data: modResult.blob, filename: modResult.filename, warnings: modResult.warnings };
  } else if (format === 'FC') {
    const { exportFC } = await import('./FCExporter');
    result = { data: exportFC(song), filename: `${baseName}.fc`, warnings: [] };
  } else if (format === 'SidMon2') {
    const { exportSidMon2File } = await import('./SidMon2Exporter');
    result = { data: await exportSidMon2File(song), filename: `${baseName}.sd2`, warnings: [] };
  } else if (format === 'PumaTracker') {
    const { exportPumaTrackerFile } = await import('./PumaTrackerExporter');
    result = { data: exportPumaTrackerFile(song), filename: `${baseName}.puma`, warnings: [] };
  } else if (format === 'OctaMED') {
    const { exportMED } = await import('./MEDExporter');
    result = { data: exportMED(song), filename: `${baseName}.mmd0`, warnings: [] };
  } else if (format === 'PreTracker') {
    const { exportAsPreTracker } = await import('./PreTrackerExporter');
    result = await exportAsPreTracker(baseName);
  } else if (format === 'HVL' || format === 'AHX' || layoutFormatId === 'hivelyHVL' || layoutFormatId === 'hivelyAHX') {
    const { exportAsHively } = await import('./HivelyExporter');
    const { useFormatStore } = await import('@stores/useFormatStore');
    const hvlFmt = (format === 'AHX' || layoutFormatId === 'hivelyAHX') ? 'ahx' : 'hvl';
    result = exportAsHively(song, { format: hvlFmt, nativeOverride: useFormatStore.getState().hivelyNative });
  } else if (format === 'DIGI' || layoutFormatId === 'digiBooster') {
    const { exportDigiBooster } = await import('./DigiBoosterExporter');
    result = { data: exportDigiBooster(song), filename: `${baseName}.dbm`, warnings: [] };
  } else if (format === 'OKT' || layoutFormatId === 'oktalyzer') {
    const { exportOktalyzer } = await import('./OktalyzerExporter');
    result = { data: exportOktalyzer(song), filename: `${baseName}.okt`, warnings: [] };
  } else if (format === 'KT' || layoutFormatId === 'klystrack') {
    const { exportAsKlystrack } = await import('./KlysExporter');
    result = await exportAsKlystrack(song);
  } else if (format === 'IS10' || layoutFormatId === 'inStereo1') {
    const { exportInStereo1 } = await import('./InStereo1Exporter');
    result = await exportInStereo1(song);
  } else if (format === 'AdPlug') {
    const { exportAdPlug } = await import('./AdPlugExporter');
    result = exportAdPlug(song, 'rad');
  } else if (layoutFormatId === 'symphoniePro' || song.symphonieFileData) {
    const { exportSymphonieProFile } = await import('./SymphonieProExporter');
    result = { data: exportSymphonieProFile(song), filename: `${baseName}.symmod`, warnings: [] };
  } else {
    const entry = LAYOUT_EXPORTERS[layoutFormatId];
    if (entry) {
      const mod = await import(/* @vite-ignore */ `./${entry.module}`);
      const exportFn = mod[entry.fn] as (s: TrackerSong) => unknown;
      result = normalizeLayoutOutput(await exportFn(song), baseName, entry.ext);
    }
  }

  // Chip-RAM readback — captures live pattern edits for any running UADE format.
  // Only when a chip-RAM layout exists AND UADE is live; NEVER return raw bytes here.
  if (!result && layoutFormatId) {
    result = await readbackFromChipRam(song, baseName);
  }

  // Raw original bytes — LAST, and only when there is no editable chip-RAM layout
  // (so an edited layout format can never silently export its un-edited original).
  if (!result && !layoutFormatId) {
    result = await rawOriginalBytes(baseName);
  }

  return result;
}

function normalizeLayoutOutput(raw: unknown, baseName: string, ext?: string): RawExportResult | null {
  if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
    return { data: raw, filename: `${baseName}.${ext ?? 'bin'}`, warnings: [] };
  }
  if (raw && typeof raw === 'object' && 'data' in raw) {
    const r = raw as { data: Blob | Uint8Array | ArrayBuffer; filename: string; warnings?: string[] };
    return { data: r.data, filename: r.filename, warnings: r.warnings ?? [] };
  }
  return null;
}

async function readbackFromChipRam(song: TrackerSong, baseName: string): Promise<RawExportResult | null> {
  try {
    const { UADEChipEditor } = await import('@engine/uade/UADEChipEditor');
    const { UADEEngine } = await import('@engine/uade/UADEEngine');
    if (!UADEEngine.hasInstance()) return null;
    const chipEditor = new UADEChipEditor(UADEEngine.getInstance());
    const { useFormatStore } = await import('@stores/useFormatStore');
    const fmtData = useFormatStore.getState().uadeEditableFileData;
    const fmtFileName = useFormatStore.getState().uadeEditableFileName;
    let moduleSize = fmtData?.byteLength ?? 0;
    if (moduleSize === 0) {
      const chipInfo = (song.instruments || []).find((i) => i.uadeChipRam)?.uadeChipRam;
      moduleSize = chipInfo?.moduleSize ?? 0;
    }
    if (moduleSize <= 0) return null;
    const bytes = await chipEditor.readEditedModule(moduleSize);
    const ext = (fmtFileName || song.name || '').split('.').pop() || 'bin';
    return {
      data: new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength),
      filename: `${baseName}.${ext}`,
      warnings: ['Exported via chip RAM readback — edits to pattern data are included'],
    };
  } catch {
    // UADE engine not running / readback unavailable — fall through.
    return null;
  }
}

async function rawOriginalBytes(baseName: string): Promise<RawExportResult | null> {
  const { useFormatStore } = await import('@stores/useFormatStore');
  const fmt = useFormatStore.getState();
  const rawData = fmt.uadeEditableFileData || fmt.libopenmptFileData;
  if (!rawData) return null;
  const ext = (fmt.uadeEditableFileName || '').split('.').pop() || 'bin';
  return { data: new Uint8Array(rawData), filename: `${baseName}.${ext}`, warnings: [] };
}
