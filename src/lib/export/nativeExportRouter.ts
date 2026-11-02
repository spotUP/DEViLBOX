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
import '@lib/formats/EditableFormatRegistry.builtins';
import { getLayoutExporters, songFormatId, songLayoutFormatId, type LayoutExporterEntry } from '@lib/formats/EditableFormatRegistry';
import { lowOctaveExportRefusal } from '@/lib/tracker/noteValue';

export type { LayoutExporterEntry };

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

/**
 * Every format whose export is keyed purely on `uadePatternLayout.formatId`
 * (i.e. not on the coarse `song.format` tag). Sourced from the single
 * {@link EditableFormatRegistry} — the descriptors flagged `exporter.byLayout`.
 * Exported (unchanged shape) so the round-trip harness can assert each module
 * import resolves and its `fn` exists.
 */
export const LAYOUT_EXPORTERS: Record<string, LayoutExporterEntry> = getLayoutExporters();

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

  const resolved = await resolveNativeExportSong(song);
  if (!resolved) return null;
  if (resolved === 'cinter') {
    const raw = await exportCinterCrunchedFromStores();
    return raw ? normalize(raw) : null;
  }
  const resolvedSong = resolved;

  const raw = await dispatchNativeExport(resolvedSong);
  return raw ? normalize(raw) : null;
}

/**
 * The song an export works on: the replayer's `song`, or (null) the one the stores hold, with the module bytes the
 * exporters read put back under their names. `'cinter'` when no song exists but a Cinter MOD is loaded (its export
 * reads the stores directly). Builds the song; never serializes it. Shared by the export and the availability question.
 */
async function resolveNativeExportSong(song: TrackerSong | null): Promise<TrackerSong | 'cinter' | null> {
  // No replayer song: a Cinter MOD is still a native Cinter export; otherwise try to
  // reconstruct a song from the format store (hively/klystrack/jamcracker) so callers
  // that never triggered playback still export.
  let resolvedSong = song;
  if (!resolvedSong) {
    if (await isCinterLoaded()) return 'cinter';
    resolvedSong = await reconstructSongFromFormatStore();
    if (!resolvedSong) return null;
  }

  // The replayer song can lack uadeEditableFileData when the format never loaded into a
  // player (e.g. MaxTrax: UADE can't play it, so the editable bytes live only in the store).
  // Backfill from the store so magic-dispatched exporters (SynTracker, MaxTrax) still fire.
  if (!resolvedSong.uadeEditableFileData) {
    const { useFormatStore } = await import('@stores/useFormatStore');
    const fmtData = useFormatStore.getState().uadeEditableFileData;
    if (fmtData) {
      resolvedSong = { ...resolvedSong, uadeEditableFileData: fmtData } as TrackerSong;
    }
  }
  // A song played by nuade holds its module in nuadeFileData; the fields its own route kept it in (named by playOnNuade) are
  // what the format's exporter reads: Hippel CoSo on nuade had no hippelFileData and fell through to a from-scratch CoSo
  // writer (2489 bytes for a 24340-byte module, refused by nuade). Put the module back under those names.
  if (resolvedSong.nuadeFileData && resolvedSong.nuadeModuleFields?.length) {
    const restored: Record<string, unknown> = {};
    for (const field of resolvedSong.nuadeModuleFields) {
      if (!(resolvedSong as unknown as Record<string, unknown>)[field]) restored[field] = resolvedSong.nuadeFileData;
    }
    if (restored.uadeEditableFileData && !resolvedSong.uadeEditableFileName) restored.uadeEditableFileName = resolvedSong.nuadeFileName;
    resolvedSong = { ...resolvedSong, ...restored } as TrackerSong;
  }
  // A song played by nuade or EaglePlayer holds its module in that engine's field, not in uadeEditableFileData, and the
  // exporters read the module from uadeEditableFileData (Rob Hubbard wrote a 2080-byte ProTracker fallback for a 24590-byte
  // module, which nuade then refused to open). The bytes are the same module: hand them over under the name exporters read.
  if (!resolvedSong.uadeEditableFileData && (resolvedSong.nuadeFileData || resolvedSong.eaglePlayerFileData)) {
    resolvedSong = {
      ...resolvedSong,
      uadeEditableFileData: (resolvedSong.nuadeFileData ?? resolvedSong.eaglePlayerFileData) as ArrayBuffer,
      uadeEditableFileName: resolvedSong.nuadeFileName ?? resolvedSong.eaglePlayerFileName,
    } as TrackerSong;
  }
  // MaxTrax is native-played (not UADE-routed), so its bytes live in maxTraxFileData.
  if (!resolvedSong.maxTraxFileData) {
    const { useFormatStore } = await import('@stores/useFormatStore');
    const fmtData = useFormatStore.getState().maxTraxFileData;
    if (fmtData) {
      resolvedSong = { ...resolvedSong, maxTraxFileData: fmtData } as TrackerSong;
    }
  }
  return resolvedSong;
}

/**
 * Is there a Native export for this song (null: the one the stores hold)? Answered by the same table and the same
 * fallback preconditions the export dispatches with, without serializing anything. True also when the export would
 * refuse the song (a note the format cannot hold): the option stays and the refusal is shown when it is chosen.
 */
export async function nativeExportAvailable(song: TrackerSong | null): Promise<boolean> {
  const resolved = await resolveNativeExportSong(song);
  if (!resolved) return false;
  if (resolved === 'cinter') return true;
  if (selectNativeExporter(resolved)) return true;
  if (layoutPatchSource(resolved)) return true;
  if (songLayoutFormatId(resolved)) return (await chipRamModuleSize(resolved)) > 0;
  return rawOriginalAvailable();
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
  const { useTransportStore, useProjectStore } = await import('@stores');
  const { exportCinterModFile } = await import('./Cinter4ModSave');
  const { bpm, speed } = useTransportStore.getState();
  const moduleName = useProjectStore.getState().metadata?.name || 'song';
  const res = await exportCinterModFile({ stripCinter: false, moduleName, bpm, speed });
  return { data: res.data, filename: res.filename, warnings: [] };
}

/** Crunched one-way .cinter4 (+ .raw companion) — Export dialog / MCP. */
async function exportCinterCrunchedFromStores(): Promise<RawExportResult | null> {
  const { useTransportStore, useProjectStore } = await import('@stores');
  const { exportCinterCrunched } = await import('./Cinter4ModSave');
  const { getOriginalModuleDataForExport, base64ToBuffer } = await import('./exporters');
  const { bpm, speed } = useTransportStore.getState();
  const moduleName = useProjectStore.getState().metadata?.name || 'cinter';
  const omd = getOriginalModuleDataForExport();
  const originalModBytes = omd?.format === 'MOD' ? new Uint8Array(base64ToBuffer(omd.base64)) : undefined;
  const c = await exportCinterCrunched({ moduleName, bpm, speed, originalModBytes });
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
/** The current song, live from the stores (the one builder encoders use). */
async function reconstructSongFromFormatStore(): Promise<TrackerSong | null> {
  const { liveTrackerSong } = await import('@/lib/song/liveSong');
  return liveTrackerSong();
}

// ── The dedicated-serializer dispatch (formerly duplicated in UI + MCP) ────────

function isSynTracker(song: TrackerSong): boolean {
  const d = song.uadeEditableFileData;
  if (!d || new Uint8Array(d).length < 16) return false;
  return String.fromCharCode(...new Uint8Array(d).slice(0, 16)) === 'SYNTRACKER-SONG:';
}

function isMaxTrax(song: TrackerSong): boolean {
  const d = song.maxTraxFileData;
  if (!d || new Uint8Array(d).length < 4) return false;
  const b = new Uint8Array(d);
  return b[0] === 0x4d && b[1] === 0x58 && b[2] === 0x54 && b[3] === 0x58; // 'MXTX'
}

/** One dedicated serializer: which songs it takes, and how it writes them. The ONE table both the export and
 *  the question "is there a Native export for this song?" read, so the two cannot drift. Order matters: first match wins. */
interface NativeExporterEntry {
  id: string;
  matches: (song: TrackerSong) => boolean;
  run: (song: TrackerSong, baseName: string) => Promise<RawExportResult | null>;
}

const songIds = (song: TrackerSong) => ({
  format: song.format as string,
  layoutFormatId: songLayoutFormatId(song),
  formatId: songFormatId(song),
});

const NATIVE_EXPORTERS: NativeExporterEntry[] = [
  { id: 'jamcracker', matches: (s) => songIds(s).format === 'JamCracker',
    run: async (s) => { const { exportAsJamCracker } = await import('./JamCrackerExporter'); return exportAsJamCracker(s); } },
  // The parser reports format 'MOD' (so UADE routes it); the layout names the format.
  { id: 'soundMon', matches: (s) => songIds(s).format === 'SMON' || songIds(s).layoutFormatId === 'soundMon',
    run: async (s) => { const { exportAsSoundMon } = await import('./SoundMonExporter'); return exportAsSoundMon(s); } },
  // SynTracker keeps format 'MOD' for UADE routing; dispatch on its magic so it doesn't fall through to the MOD exporter.
  // exportSynTrackerFile writes the edited cells back into a copy of the original module (byte-exact for unedited).
  { id: 'synTracker', matches: isSynTracker,
    run: async (s, baseName) => { const { exportSynTrackerFile } = await import('./SynTrackerExporter'); return { data: exportSynTrackerFile(s), filename: `${baseName}.synmod`, warnings: [] }; } },
  // MaxTrax keeps format 'MOD'; dispatch on the MXTX magic. Use the live edited MaxTraxData from the store when present
  // (preserves edits); fall back to re-parsing the original bytes only when no edited model exists.
  { id: 'maxTrax', matches: isMaxTrax,
    run: async (s, baseName) => {
      const { encodeMaxTrax, parseMaxTrax } = await import('@lib/import/formats/maxtrax/maxtraxFormat');
      const { useFormatStore } = await import('@stores/useFormatStore');
      const live = useFormatStore.getState().maxTraxData;
      const data = live ?? parseMaxTrax(new Uint8Array(s.maxTraxFileData!));
      return { data: encodeMaxTrax(data), filename: `${baseName}.mxtx`, warnings: [] };
    } },
  // Fred Editor keeps format 'MOD'; its module (with the grid's edits) is the export.
  { id: 'fredEditor', matches: (s) => songIds(s).formatId === 'fredEditor',
    run: async (s) => { const { exportFredEditor } = await import('./FredEditorExporter'); return exportFredEditor(s); } },
  // MONOTONE: its module (with the grid's edits) is the export.
  { id: 'monotone', matches: (s) => songIds(s).format === 'MON' && !!s.monotoneFileData,
    run: async (s) => { const { exportMonotone } = await import('./MonotoneExporter'); return exportMonotone(s); } },
  // ANSI music: channel 0 written as one BASIC PLAY block (no original bytes needed).
  { id: 'ansiMusic', matches: (s) => songIds(s).format === 'AnsiMusic',
    run: async (s) => { const { exportAnsiMusic } = await import('./AnsiMusicExporter'); return exportAnsiMusic(s); } },
  // Sawteeth: the parser sets no chip-RAM layout, so LAYOUT_EXPORTERS (keyed by layout id) never reached it.
  { id: 'sawteeth', matches: (s) => songIds(s).format === 'SAW',
    run: async (s) => { const { exportSawteeth } = await import('./SawteethExporter'); return exportSawteeth(s); } },
  { id: 'actionamics', matches: (s) => songIds(s).formatId === 'actionamics',
    run: async (s) => { const { exportActionamics } = await import('./ActionamicsExporter'); return exportActionamics(s); } },
  { id: 'activisionPro', matches: (s) => songIds(s).formatId === 'activisionPro',
    run: async (s) => { const { exportActivisionPro } = await import('./ActivisionProExporter'); return exportActivisionPro(s); } },
  { id: 'tfmMusicMaker', matches: (s) => !!s.tfmFileData,
    run: async (s) => { const { exportTfmMusicMaker } = await import('./TfmMusicMakerExporter'); return exportTfmMusicMaker(s); } },
  // Digital Sound Studio keeps format 'MOD' (no chip-RAM layout: its samples are native Sampler instruments); the grid's edits are the export.
  { id: 'dss', matches: (s) => !!s.dssFileData,
    run: async (s) => {
      const { exportDssEdited } = await import('./DSSExporter');
      const out = await exportDssEdited(s);
      return { data: out.data, filename: out.filename, warnings: out.warnings };
    } },
  { id: 'mod', matches: (s) => songIds(s).format === 'MOD' && !songIds(s).layoutFormatId,
    run: async (s) => {
      const { exportSongToMOD } = await import('./modExport');
      const modResult = await exportSongToMOD(s, { bakeSynths: true });
      return { data: modResult.blob, filename: modResult.filename, warnings: modResult.warnings };
    } },
  { id: 'fc', matches: (s) => songIds(s).format === 'FC',
    run: async (s, baseName) => { const { exportFC } = await import('./FCExporter'); return { data: exportFC(s), filename: `${baseName}.fc`, warnings: [] }; } },
  { id: 'sidMon2', matches: (s) => { const i = songIds(s); return i.format === 'SIDMON2' || i.format === 'SidMon2' || i.layoutFormatId === 'sidMon2'; },
    run: async (s, baseName) => { const { exportSidMon2File } = await import('./SidMon2Exporter'); return { data: await exportSidMon2File(s), filename: `${baseName}.sd2`, warnings: [] }; } },
  // PumaTrackerParser keeps format 'MOD'; its variable layout id names the format.
  { id: 'pumaTracker', matches: (s) => songIds(s).format === 'PumaTracker' || songIds(s).layoutFormatId === 'pumaTracker',
    run: async (s, baseName) => { const { exportPumaTrackerFile } = await import('./PumaTrackerExporter'); return { data: exportPumaTrackerFile(s), filename: `${baseName}.puma`, warnings: [] }; } },
  { id: 'med', matches: (s) => songIds(s).format === 'MED',
    run: async (s, baseName) => { const { exportMED } = await import('./MEDExporter'); return { data: exportMED(s), filename: `${baseName}.mmd0`, warnings: [] }; } },
  { id: 'preTracker', matches: (s) => songIds(s).format === 'PreTracker',
    run: async (_s, baseName) => { const { exportAsPreTracker } = await import('./PreTrackerExporter'); return exportAsPreTracker(baseName); } },
  { id: 'hively', matches: (s) => { const i = songIds(s); return i.format === 'HVL' || i.format === 'AHX' || i.layoutFormatId === 'hivelyHVL' || i.layoutFormatId === 'hivelyAHX'; },
    run: async (s) => {
      const { exportAsHively } = await import('./HivelyExporter');
      const { useFormatStore } = await import('@stores/useFormatStore');
      const i = songIds(s);
      const hvlFmt = (i.format === 'AHX' || i.layoutFormatId === 'hivelyAHX') ? 'ahx' : 'hvl';
      return exportAsHively(s, { format: hvlFmt, nativeOverride: useFormatStore.getState().hivelyNative });
    } },
  { id: 'digiBooster', matches: (s) => songIds(s).format === 'DIGI' || songIds(s).layoutFormatId === 'digiBooster',
    run: async (s, baseName) => { const { exportDigiBooster } = await import('./DigiBoosterExporter'); return { data: exportDigiBooster(s), filename: `${baseName}.dbm`, warnings: [] }; } },
  { id: 'oktalyzer', matches: (s) => songIds(s).format === 'OKT' || songIds(s).layoutFormatId === 'oktalyzer',
    run: async (s, baseName) => { const { exportOktalyzer } = await import('./OktalyzerExporter'); return { data: exportOktalyzer(s), filename: `${baseName}.okt`, warnings: [] }; } },
  { id: 'klystrack', matches: (s) => songIds(s).format === 'KT' || songIds(s).layoutFormatId === 'klystrack',
    run: async (s) => { const { exportAsKlystrack } = await import('./KlysExporter'); return exportAsKlystrack(s); } },
  { id: 'inStereo1', matches: (s) => songIds(s).format === 'IS10' || songIds(s).layoutFormatId === 'inStereo1',
    run: async (s) => { const { exportInStereo1 } = await import('./InStereo1Exporter'); return exportInStereo1(s); } },
  { id: 'adPlug', matches: (s) => songIds(s).format === 'AdPlug',
    run: async (s) => { const { exportAdPlug } = await import('./AdPlugExporter'); return exportAdPlug(s, 'rad'); } },
  // The module as loaded with the grid's edits patched in - the same bytes the TFMX decoder plays. Byte-exact where nothing was
  // edited, and it keeps the samples the from-scratch CoSo serializer cannot rebuild. CoSo goes through hippelCoSoModule, which
  // lays the module out again from the grid when an edit has no room in place (a block shared by several steps or voices).
  { id: 'hippel', matches: (s) => !!s.hippelFileData && (songIds(s).layoutFormatId === 'hippelCoSo' || songIds(s).layoutFormatId === 'tfmx7v'),
    run: async (s, baseName) => {
      if (songIds(s).layoutFormatId === 'hippelCoSo') {
        const { hippelCoSoModule } = await import('./HippelCoSoExporter');
        const module = hippelCoSoModule(s);
        return module ? { data: module.bytes, filename: `${baseName}.hipc`, warnings: module.warnings } : null;
      }
      const { rebuildHippelSong, hippelRefusedWarnings } = await import('@engine/hippel/rebuildHippelModule');
      const rebuilt = rebuildHippelSong(s);
      if (!rebuilt) return null;
      const warnings = hippelRefusedWarnings(rebuilt.refused);
      return { data: rebuilt.bytes, filename: `${baseName}.hip7`, warnings };
    } },
  { id: 'symphoniePro', matches: (s) => songIds(s).layoutFormatId === 'symphoniePro' || !!s.symphonieFileData,
    run: async (s, baseName) => { const { exportSymphonieProFile } = await import('./SymphonieProExporter'); return { data: exportSymphonieProFile(s), filename: `${baseName}.symmod`, warnings: [] }; } },
  // Every format flagged `exporter.byLayout` in the EditableFormatRegistry.
  { id: 'layoutExporter', matches: (s) => !!LAYOUT_EXPORTERS[songIds(s).layoutFormatId],
    run: async (s, baseName) => {
      const entry = LAYOUT_EXPORTERS[songIds(s).layoutFormatId];
      const mod = await import(/* @vite-ignore */ `./${entry.module}`);
      const exportFn = mod[entry.fn] as (song: TrackerSong) => unknown;
      return normalizeLayoutOutput(await exportFn(s), baseName, entry.ext);
    } },
];

/** The dedicated serializer a song takes, or null. Pure: it never serializes. */
export function selectNativeExporter(song: TrackerSong): { id: string } | null {
  return NATIVE_EXPORTERS.find((e) => e.matches(song)) ?? null;
}

/** The module a layout-only format is patched from (the fallback below), or null when it has no such layout. */
function layoutPatchSource(song: TrackerSong): ArrayBuffer | Uint8Array | null {
  const layoutFormatId = songLayoutFormatId(song);
  if (!layoutFormatId || !song.uadePatternLayout?.encodeCell || song.uadePatternLayout.writeCell) return null;
  return (song.uadeEditableFileData ?? song.eaglePlayerFileData ?? song.nuadeFileData ?? null) as ArrayBuffer | Uint8Array | null;
}

/** Size of the module the live UADE chip RAM holds for this song; 0 when no engine runs or the size is unknown. */
async function chipRamModuleSize(song: TrackerSong): Promise<number> {
  const { UADEEngine } = await import('@engine/uade/UADEEngine');
  if (!UADEEngine.hasInstance()) return 0;
  const { useFormatStore } = await import('@stores/useFormatStore');
  const moduleSize = useFormatStore.getState().uadeEditableFileData?.byteLength ?? 0;
  if (moduleSize > 0) return moduleSize;
  return (song.instruments || []).find((i) => i.uadeChipRam)?.uadeChipRam?.moduleSize ?? 0;
}

/** True when the format store holds the original module bytes (the last fallback). */
async function rawOriginalAvailable(): Promise<boolean> {
  const { useFormatStore } = await import('@stores/useFormatStore');
  const fmt = useFormatStore.getState();
  return !!(fmt.uadeEditableFileData || fmt.libopenmptFileData);
}

async function dispatchNativeExport(song: TrackerSong): Promise<RawExportResult | null> {
  const { format, layoutFormatId } = songIds(song);
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');

  // The octave below C-0 (noteValue.ts) is held only by the writers that name notes by the pitch their player
  // plays: Hippel (TFMX/7V and CoSo, patched in place; an unplayable note comes back in `refused`) and Future
  // Player. Every other native writer would drop such a note or write it an octave off: refuse the song instead.
  const holdsLowOctave = (!!song.hippelFileData && (layoutFormatId === 'hippelCoSo' || layoutFormatId === 'tfmx7v'))
    || layoutFormatId === 'futurePlayer';
  if (!holdsLowOctave) {
    const refusal = lowOctaveExportRefusal(song.patterns ?? [], layoutFormatId || format || 'This format');
    if (refusal) throw new Error(refusal);
  }

  const exporter = NATIVE_EXPORTERS.find((e) => e.matches(song));
  let result: RawExportResult | null = exporter ? await exporter.run(song, baseName) : null;

  // A format with a fixed cell layout and no exporter of its own (Dave Lowe, Sound Player ...): the module the song was loaded from with
  // each edited cell's bytes written where the layout puts it - the file Stop and Play would load, and the one a reload reads.
  if (!result) {
    const source = layoutPatchSource(song);
    if (source) {
      const { patchModuleByLayout } = await import('./layoutPatch');
      const patched = patchModuleByLayout(source, song.uadePatternLayout!, song.patterns);
      const ext = (song.uadeEditableFileName ?? '').split('.').pop() || 'bin';
      result = {
        data: patched.bytes,
        filename: `${baseName}.${ext}`,
        warnings: patched.unplaced.length > 0
          ? [`${patched.unplaced.length} note(s) typed on rows the module has no place for were not saved (pattern:channel:row ${patched.unplaced.slice(0, 8).map((u) => `${u.pattern}:${u.channel}:${u.row}`).join(', ')})`]
          : [],
      };
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
    const r = raw as {
      data: Blob | Uint8Array | ArrayBuffer;
      filename: string;
      warnings?: string[];
      companions?: NativeExportCompanion[];
    };
    const out: RawExportResult = { data: r.data, filename: r.filename, warnings: r.warnings ?? [] };
    if (r.companions && r.companions.length > 0) out.companions = r.companions;
    return out;
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
    const fmtFileName = useFormatStore.getState().uadeEditableFileName;
    const moduleSize = await chipRamModuleSize(song);
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
