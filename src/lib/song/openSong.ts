/**
 * openSong - THE way a song file is opened.
 *
 * One door for every opener that has a file in hand: MCP load_file, the
 * jukebox, the tour, the embed, the SID info dialog, the file browser. It owns
 * what those used to do each their own way (plan 2026-10-07-one-load-save-
 * export-path, U2.2):
 *
 *   - what the file IS (classifySong: the one place that routes a song file),
 *   - fetching it and the partner files of a multi-file format,
 *   - the outgoing song leaving first (withSongLoad / unloadSong, U2.1),
 *   - the lifecycle phase published to useSongLoadStore (U6: the status bar
 *     shows it, the loading panel and its Cancel button read the same store),
 *   - questions: a headless origin raises none (format-compatibility dialogs
 *     are suppressed, the Modland contribution prompt is not raised),
 *   - starting playback per origin (owner decision D2),
 *   - the result: what loaded, what engine plays it, which editor it opened in.
 *
 * The branch bodies (module import, SunVox, V2M, AdPlug, GoatTracker, MIDI,
 * .dbx) still live in UnifiedFileLoader and are called from here; the dialog
 * step in front of this call is U2.3.
 */
import type { UADEMetadata } from '@engine/uade/UADEEngine';
import {
  isSongFormat, isAudioFile, loadSongFile, loadV2MFile, loadAdPlugFile, importModuleFile,
  type FileLoadOptions, type FileLoadResult,
} from '@/lib/file/UnifiedFileLoader';
import { isAdPlugWasmFormat } from '@/lib/import/adplugFormats';
import { detectFormatFromContent, isSupportedByHeader } from '@/lib/import/FormatRegistry';
import { suppressFormatChecks, restoreFormatChecks } from '@/lib/formatCompatibility';
import { directoryOfFile, gatherCompanions } from '@/lib/import/companionFetch';
import { withSongLoad } from '@/lib/song/songLifecycle';
import { useSongLoadStore, setSongLoadPhase, type OpenPhase } from '@/stores/useSongLoadStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';

export type { OpenPhase };

/** What a source is. `file` and `bytes` are in hand; `modland` and `url` are fetched here, with their companions. */
export type SongSourceRef =
  | { kind: 'file'; file: File; companions?: Map<string, ArrayBuffer> }
  | { kind: 'bytes'; name: string; bytes: ArrayBuffer; companions?: Map<string, ArrayBuffer> }
  | { kind: 'modland'; path: string }
  /** A song served by this app (bundled library); partner files are resolved beside it. */
  | { kind: 'url'; url: string; name?: string; bytes?: ArrayBuffer };

export type OpenOrigin = 'drop' | 'filebrowser' | 'dialog' | 'mcp' | 'jukebox' | 'tour'
  | 'embed' | 'hvsc' | 'modland' | 'restore' | 'tab' | 'sync' | 'dj' | 'preview';

export interface OpenOptions {
  origin: OpenOrigin;
  subsong?: number;
  /** Only the editor exists in U2.2; decks and previews arrive with U2.5 / U2.6. */
  target?: 'editor';
  /** Start playback after the load. Default: the origin's rule (START_BY_ORIGIN). */
  start?: false | 'song' | 'pattern';
  /** May this load raise questions (import dialog, contribution prompt)? Default: false for headless origins. */
  interactive?: boolean;
  useLibopenmpt?: boolean;
  uadeMetadata?: UADEMetadata;
  midiOptions?: FileLoadOptions['midiOptions'];
  /** TD-3 pattern files: replace or append. */
  td3?: { replacePatterns?: boolean; preserveInstruments?: boolean };
  /** A newer open cancels an older one; checked between phases. */
  signal?: AbortSignal;
  onProgress?: (p: { phase: OpenPhase }) => void;
}

export type OpenResult =
  | { ok: true; name: string; message: string; engine: string; editorMode: string; kind: SongKind; started: boolean; companions: number;
      /** The importer already told the user (toast); callers must not announce it again. */
      notified: boolean }
  | { ok: false; error: string };

/** Owner decision D2: drop and file browser load without playing; jukebox, tour and embed play. */
export const START_BY_ORIGIN: Record<OpenOrigin, false | 'song'> = {
  drop: false, filebrowser: false, dialog: false, mcp: false, hvsc: false, modland: false,
  restore: false, tab: false, sync: false, dj: false, preview: false,
  jukebox: 'song', tour: 'song', embed: 'song',
};

/** Origins where a person is at a dialog and may be asked something. */
const INTERACTIVE_ORIGINS: ReadonlySet<OpenOrigin> = new Set(['drop', 'filebrowser', 'dialog']);

export type SongKind = 'v2m' | 'goatTracker' | 'adplug' | 'sunvox' | 'td3' | 'project' | 'module' | 'header';

/**
 * What a file is, or null when it is not a song. THE routing rule for song
 * files: the extension settles most, content settles the collisions (.sng is
 * GoatTracker or AdPlug, .dtm Digital Tracker or AdPlug, .imf Imago Orpheus
 * or id Software, .pmd PiyoPiyo or PMD98), and an extensionless Amiga rip is
 * known by its header.
 */
export async function classifySong(file: File): Promise<SongKind | null> {
  const filename = file.name.toLowerCase();
  if (filename.endsWith('.v2m')) return 'v2m';

  const byContent = (filename.endsWith('.sng') || isAdPlugWasmFormat(filename) || filename.endsWith('.pmd'))
    ? detectFormatFromContent(filename, new Uint8Array(await file.arrayBuffer()))
    : null;
  if (byContent?.key === 'goatTracker') return 'goatTracker';
  if (isAdPlugWasmFormat(filename) && (byContent?.key ?? 'adplug') === 'adplug') return 'adplug';

  if (isSongFormat(filename)) {
    if (filename.endsWith('.sqs') || filename.endsWith('.seq')) return 'td3';
    if (filename.endsWith('.sunvox')) return 'sunvox';
    if (filename.endsWith('.dbx') || filename.endsWith('.mid') || filename.endsWith('.midi')) return 'project';
    return 'module';
  }

  // Not a song by name. Instruments, DB303 XML and audio samples are the
  // loader's; anything else may still be a song by its header.
  if (filename.endsWith('.dbi') || filename.endsWith('.sunsynth') || filename.endsWith('.xml') || isAudioFile(filename)) {
    return null;
  }
  try {
    if (isSupportedByHeader(new Uint8Array(await file.arrayBuffer()))) return 'header';
  } catch { /* unreadable: not a song */ }
  return null;
}

async function acquire(src: SongSourceRef): Promise<{ file: File; companions?: Map<string, ArrayBuffer> }> {
  switch (src.kind) {
    case 'file':
      return { file: src.file, companions: src.companions };
    case 'bytes':
      return { file: new File([src.bytes], src.name, { type: 'application/octet-stream' }), companions: src.companions };
    case 'modland': {
      const { downloadModlandFile, downloadUADECompanions } = await import('@/lib/modlandApi');
      const bytes = await downloadModlandFile(src.path);
      setSongLoadPhase('companions');
      const found = await downloadUADECompanions(src.path, bytes);
      const name = src.path.split('/').pop() ?? 'song';
      return {
        file: new File([bytes], name, { type: 'application/octet-stream' }),
        companions: found.length ? new Map(found.map((c) => [c.filename, c.buffer])) : undefined,
      };
    }
    case 'url': {
      let bytes = src.bytes;
      if (!bytes) {
        const res = await fetch(src.url);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${src.url}`);
        bytes = await res.arrayBuffer();
      }
      const name = src.name ?? src.url.split('/').pop() ?? 'song';
      setSongLoadPhase('companions');
      const found = await gatherCompanions(name, directoryOfFile(src.url), bytes);
      return {
        file: new File([bytes], name, { type: 'application/octet-stream' }),
        companions: found.size ? found : undefined,
      };
    }
  }
}

function sourceName(src: SongSourceRef): string {
  switch (src.kind) {
    case 'file': return src.file.name;
    case 'bytes': return src.name;
    case 'modland': return src.path.split('/').pop() ?? 'song';
    case 'url': return src.name ?? src.url.split('/').pop() ?? 'song';
  }
}

/** Route an acquired file to its branch. The branch bodies live in UnifiedFileLoader. */
async function route(kind: SongKind, file: File, o: OpenOptions, companions?: Map<string, ArrayBuffer>): Promise<FileLoadResult> {
  const options: FileLoadOptions = {
    subsong: o.subsong,
    uadeMetadata: o.uadeMetadata,
    midiOptions: o.midiOptions,
    companionFiles: companions,
    replacePatterns: o.td3?.replacePatterns,
    preserveInstruments: o.td3?.preserveInstruments,
  };
  switch (kind) {
    case 'v2m': return loadV2MFile(file);
    case 'adplug': return loadAdPlugFile(file, companions);
    case 'goatTracker': return loadSongFile(file, options, await file.arrayBuffer());
    case 'module':
      // Read and imported exactly as the import dialog does it. libopenmpt on
      // unless the caller says no; native-only formats stay off it regardless.
      await importModuleFile(file, {
        ...(o.useLibopenmpt === false ? { useLibopenmpt: false } : {}),
        subsong: o.subsong ?? 0,
        uadeMetadata: o.uadeMetadata,
        companionFiles: companions,
        midiOptions: o.midiOptions,
      });
      return { success: true, message: `Loaded ${file.name}` };
    case 'header':
      return loadSongFile(file, options, await file.arrayBuffer());
    default:
      return loadSongFile(file, options);
  }
}

export async function openSong(src: SongSourceRef, o: OpenOptions): Promise<OpenResult> {
  const interactive = o.interactive ?? INTERACTIVE_ORIGINS.has(o.origin);
  const phase = (p: OpenPhase): void => {
    setSongLoadPhase(p);
    o.onProgress?.({ phase: p });
  };
  const aborted = (): boolean => o.signal?.aborted === true;
  if (!interactive) suppressFormatChecks(); // a headless open must never stop to ask
  try {
    let kind: SongKind | null = null;
    let started = false;
    let companionCount = 0;
    const start = o.start ?? START_BY_ORIGIN[o.origin];
    let name = sourceName(src);
    const loaded = await withSongLoad(name, async () => {
      // `cancel` is the hook for the loading panel's Cancel button (plan U6,
      // later phase): it will abort a controller whose signal arrives here.
      useSongLoadStore.setState({ interactive });
      phase('acquire');
      const { file, companions } = await acquire(src);
      name = file.name;
      companionCount = companions?.size ?? 0;
      useSongLoadStore.setState({ label: name });
      if (aborted()) throw new Error('Load cancelled');
      kind = await classifySong(file);
      if (!kind) return { success: false, error: `Unsupported file format: ${file.name}` } as FileLoadResult;
      phase('scan');
      const result = await route(kind, file, o, companions);
      // Wait for deferred state updates (loadInstruments uses queueMicrotask)
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      if (result.success === true && start) {
        phase('start');
        // The MCP play handler's rule: song mode does not loop, pattern mode does.
        const transport = useTransportStore.getState();
        transport.setIsLooping(start === 'pattern');
        await transport.play();
        started = true;
      }
      return result;
    });
    if (!loaded.success) return { ok: false, error: loaded.error };
    if (loaded.success !== true) return { ok: false, error: `${name} needs a confirmation step that a headless open cannot show` };

    const { playingEngineFromStores } = await import('@/engine/replayer/NativeEngineRouting');
    const format = useFormatStore.getState();
    return {
      ok: true,
      name,
      message: loaded.message,
      engine: playingEngineFromStores(
        format as unknown as Record<string, unknown>,
        useInstrumentStore.getState().instruments,
      ),
      editorMode: format.editorMode,
      kind: kind as unknown as SongKind,
      started,
      companions: companionCount,
      notified: kind === 'module' || kind === 'header',
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (!interactive) restoreFormatChecks();
  }
}
