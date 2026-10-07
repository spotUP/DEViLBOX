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
 * .dbx) still live in UnifiedFileLoader and are called from here.
 *
 * The import dialog is an optional step IN FRONT of this call (U2.3): an
 * interactive open prepares the file (prepareSong: read, classify, scan), asks
 * a person only when the file carries a real choice (importChoice, owner
 * decision D1), and then opens the prepared song. The dialog's preview is the
 * same prepareSong, and its Import hands the choices back; it writes no
 * settings (D4).
 */
import type { UADEMetadata } from '@engine/uade/UADEEngine';
import {
  isSongFormat, isAudioFile, loadSongFile, loadV2MFile, loadAdPlugFile, importModuleFile, prepareModuleFile,
  type FileLoadOptions, type FileLoadResult,
} from '@/lib/file/UnifiedFileLoader';
import type { ModuleInfo } from '@/lib/import/ModuleLoader';
import type { PrepareHooks } from '@/lib/import/prepareModuleImport';
import type { SIDHeaderInfo } from '@/lib/sid/SIDHeaderParser';
import { needsImportChoice } from '@/lib/song/importChoice';
import { askImportDialog, type ImportAnswer } from '@/lib/song/importRequest';
import { isAdPlugWasmFormat } from '@/lib/import/adplugFormats';
import { detectFormatFromContent, isSupportedByHeader } from '@/lib/import/FormatRegistry';
import { suppressFormatChecks, restoreFormatChecks } from '@/lib/formatCompatibility';
import { acquire, companionList } from './acquireSource';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { DeckId } from '@/engine/dj/DeckEngine';
import { withSongLoad } from '@/lib/song/songLifecycle';
import { applySong, type SongToApply, type SongSource } from '@/lib/song/applySong';
import { useSongLoadStore, setSongLoadPhase, throwIfSongLoadCancelled, type OpenPhase } from '@/stores/useSongLoadStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';

export type { OpenPhase };

/**
 * A song that was read, classified and (for a module) scanned: what the import
 * dialog previews and what an import applies. Made by prepareSong; openSong
 * takes it instead of reading the file again.
 */
export interface PreparedSong {
  kind: 'prepared';
  file: File;
  songKind: SongKind;
  companions?: Map<string, ArrayBuffer>;
  /** The module the import reads (UADE scan, header metadata or libopenmpt's); absent for formats the loader reads itself. */
  info?: ModuleInfo;
  uadeMetadata?: UADEMetadata;
  sidInfo?: SIDHeaderInfo | null;
}

/** What a source is. `file` and `bytes` are in hand; `modland` and `url` are fetched here, with their companions; `prepared` is already read. */
export type SongSourceRef =
  | PreparedSong
  | { kind: 'file'; file: File; companions?: Map<string, ArrayBuffer> }
  | { kind: 'bytes'; name: string; bytes: ArrayBuffer; companions?: Map<string, ArrayBuffer> }
  | { kind: 'modland'; path: string }
  /** A song served by this app (bundled library); partner files are resolved beside it. */
  | { kind: 'url'; url: string; name?: string; bytes?: ArrayBuffer };

export type OpenOrigin = 'drop' | 'filebrowser' | 'dialog' | 'mcp' | 'jukebox' | 'tour'
  | 'embed' | 'hvsc' | 'modland' | 'restore' | 'tab' | 'sync' | 'dj' | 'preview'
  | 'project' | 'revision' | 'export';

/** A DJ deck as the target of an open. `deck` is absent for a background render that loads to no deck. */
export interface DeckTarget { deck?: DeckId }

/** What a deck open hands back: the parsed song plus the bytes and partner files the render pipeline loads with. */
export interface DeckSong {
  ok: true;
  target: 'deck';
  deck?: DeckId;
  name: string;
  file: File;
  bytes: ArrayBuffer;
  song: TrackerSong;
  companions?: Map<string, ArrayBuffer>;
  /** The same partner files in the shape DJPipeline.loadOrEnqueue takes. */
  companionList?: Array<{ filename: string; buffer: ArrayBuffer }>;
}

export interface OpenOptions {
  origin: OpenOrigin;
  subsong?: number;
  /**
   * Where the song goes. The editor (default), or a DJ deck: a deck open reads
   * the source and its partner files, parses on the deck's own UADE engine and
   * hands back the song. It never unloads or applies to the editor.
   */
  target?: 'editor' | DeckTarget;
  /** Start playback after the load. Default: the origin's rule (START_BY_ORIGIN). */
  start?: false | 'song' | 'pattern';
  /** May this load raise questions (import dialog, contribution prompt)? Default: false for headless origins. */
  interactive?: boolean;
  useLibopenmpt?: boolean;
  uadeMetadata?: UADEMetadata;
  midiOptions?: FileLoadOptions['midiOptions'];
  /** TD-3 pattern files: replace or append. */
  td3?: { replacePatterns?: boolean; preserveInstruments?: boolean };
  /** Aborting it cancels the open (the loading panel's Cancel does the same); checked between phases. */
  signal?: AbortSignal;
  /** May the import dialog be shown for a file with a real choice (D1)? Default: `interactive`. loadFile turns it off: its callers want the song opened as is. */
  askForChoices?: boolean;
  /** Asks a person at an import dialog. Default: the one dialog in the tracker view (askImportDialog). */
  ask?: (prepared: PreparedSong) => Promise<ImportAnswer | null>;
  onProgress?: (p: { phase: OpenPhase }) => void;
}

export type OpenResult =
  | { ok: true; name: string; message: string; engine: string; editorMode: string; kind: SongKind | 'saved'; started: boolean; companions: number;
      /** The importer already told the user (toast); callers must not announce it again. */
      notified: boolean }
  /** `cancelled`: the person cancelled (the dialog or the loading panel); no error to show. */
  | { ok: false; error: string; cancelled?: true };

/** Owner decision D2: drop and file browser load without playing; jukebox, tour and embed play. */
export const START_BY_ORIGIN: Record<OpenOrigin, false | 'song'> = {
  drop: false, filebrowser: false, dialog: false, mcp: false, hvsc: false, modland: false,
  restore: false, tab: false, sync: false, dj: false, preview: false,
  project: false, revision: false, export: false,
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

function sourceName(src: SongSourceRef): string {
  switch (src.kind) {
    case 'prepared': return src.file.name;
    case 'file': return src.file.name;
    case 'bytes': return src.name;
    case 'modland': return src.path.split('/').pop() ?? 'song';
    case 'url': return src.name ?? src.url.split('/').pop() ?? 'song';
  }
}

/**
 * Read a song to the point where a person could be asked about it: acquire the
 * file and its partner files, classify it, and scan a module (UADE pre-scan,
 * header metadata or libopenmpt's). Changes no song state: the outgoing song
 * keeps playing until an open follows. THE preview the import dialog shows and
 * the one scan the import that follows uses.
 */
export async function prepareSong(src: SongSourceRef, hooks: PrepareHooks = {}): Promise<PreparedSong> {
  if (src.kind === 'prepared') return src;
  const { file, companions } = await acquire(src);
  const songKind = await classifySong(file);
  if (!songKind) throw new Error(`Unsupported file format: ${file.name}`);
  if (songKind !== 'module') return { kind: 'prepared', file, songKind, companions };
  const companionFiles = companions ? Array.from(companions, ([name, data]) => new File([data], name)) : [];
  const { info, uadeMetadata, sidInfo } = await prepareModuleFile(file, companionFiles, hooks);
  return { kind: 'prepared', file, songKind, companions, info, uadeMetadata, sidInfo };
}

/** Route an acquired file to its branch. The branch bodies live in UnifiedFileLoader. */
async function route(kind: SongKind, file: File, o: OpenOptions, companions?: Map<string, ArrayBuffer>, prepared?: PreparedSong): Promise<FileLoadResult> {
  const options: FileLoadOptions = {
    subsong: o.subsong,
    uadeMetadata: o.uadeMetadata,
    midiOptions: o.midiOptions,
    companionFiles: companions,
    replacePatterns: o.td3?.replacePatterns,
    preserveInstruments: o.td3?.preserveInstruments,
  };
  // A module is imported from the read it already has (the dialog's preview,
  // the D1 scan, or the Furnace / MIDI dialog's own read), never read twice;
  // without one, importModuleFile reads it. libopenmpt on unless the caller
  // says no; native-only formats stay off it regardless.
  if (prepared?.info || kind === 'module') {
    await importModuleFile(file, {
      ...(o.useLibopenmpt === false ? { useLibopenmpt: false } : {}),
      subsong: o.subsong ?? 0,
      companionFiles: companions,
      midiOptions: o.midiOptions,
      ...(prepared?.info
        ? { prepared: { info: prepared.info, uadeMetadata: o.uadeMetadata ?? prepared.uadeMetadata, sidInfo: prepared.sidInfo } }
        : { uadeMetadata: o.uadeMetadata }),
    });
    return { success: true, message: `Loaded ${file.name}` };
  }
  switch (kind) {
    case 'v2m': return loadV2MFile(file);
    case 'adplug': return loadAdPlugFile(file, companions);
    case 'goatTracker': return loadSongFile(file, options, await file.arrayBuffer());
    case 'header':
      return loadSongFile(file, options, await file.arrayBuffer());
    default:
      return loadSongFile(file, options);
  }
}

/**
 * The interactive step in front of the open (D1): prepare the file, and ask a
 * person only when it carries a real choice. Returns the song to open and the
 * options they chose, or null when they cancelled.
 */
async function askIfChoice(src: SongSourceRef, o: OpenOptions): Promise<{ song: PreparedSong; options: OpenOptions } | null> {
  let prepared: PreparedSong;
  try {
    prepared = await prepareSong(src);
  } catch (err) {
    // A format that needs a partner file the person has not picked yet fails
    // its scan; the dialog is where they pick it.
    if (src.kind !== 'file' || !needsImportChoice({ file: src.file, songKind: 'module', companions: src.companions })) throw err;
    prepared = { kind: 'prepared', file: src.file, songKind: 'module', companions: src.companions };
  }
  if (!needsImportChoice(prepared)) return { song: prepared, options: o };
  const answer = await (o.ask ?? askImportDialog)(prepared);
  if (!answer) return null;
  const { info, options } = answer;
  return {
    song: {
      ...prepared,
      info: info ?? prepared.info,
      uadeMetadata: options.uadeMetadata ?? prepared.uadeMetadata,
      companions: options.companionFiles ?? prepared.companions,
    },
    options: {
      ...o,
      subsong: options.subsong ?? o.subsong,
      useLibopenmpt: options.useLibopenmpt,
      midiOptions: options.midiOptions ?? o.midiOptions,
    },
  };
}

/**
 * A song already in hand as a SongToApply (a saved project, a restored
 * autosave, a tab, a collaborator's full sync). `song` runs AFTER the outgoing
 * song is unloaded, so a restore's re-decode of the stored file bytes happens
 * in the same silence a file open parses in.
 */
export interface StoredSongSource {
  kind: 'song';
  name: string;
  song: () => SongToApply | Promise<SongToApply>;
  /** Which opener this is, for logs and the few source-specific choices in applySong. */
  source: SongSource;
}

/** The lifecycle of a song that needs no parse: unload, loading state, apply once. */
async function openStoredSong(src: StoredSongSource): Promise<OpenResult> {
  try {
    await withSongLoad(src.name, async () => {
      useSongLoadStore.setState({ interactive: false });
      setSongLoadPhase('parse');
      const song = await src.song();
      setSongLoadPhase('apply');
      await applySong(song, src.source);
    });
    const format = useFormatStore.getState();
    return { ok: true, name: src.name, message: `Opened ${src.name}`, engine: 'saved', editorMode: format.editorMode,
      kind: 'saved', started: false, companions: 0, notified: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** openStoredSong for callers whose contract is to throw (restore, tabs, sync). */
export async function openSavedSong(src: Omit<StoredSongSource, 'kind'>): Promise<void> {
  const r = await openSong({ kind: 'song', ...src }, { origin: src.source === 'recovery' ? 'restore' : src.source as OpenOrigin });
  if (!r.ok) throw new Error(r.error);
}

/**
 * A deck target: acquire (file or Modland path, with its partner files), parse
 * on the deck's own UADE engine, return the song. One call per deck load; the
 * editor song, its stores and its UADE engine are not touched.
 */
async function openDeckSong(src: SongSourceRef, o: OpenOptions & { target: DeckTarget }): Promise<DeckSong | { ok: false; error: string }> {
  try {
    const { file, companions } = await acquire(src, false);
    const bytes = await file.arrayBuffer();
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { withDeckUADEEngine } = await import('@/lib/import/formats/UADEParser');
    const song = await withDeckUADEEngine(() => parseModuleToSong(file, o.subsong ?? 0, undefined, undefined, companions));
    return {
      ok: true, target: 'deck', deck: o.target.deck, name: file.name, file, bytes, song, companions,
      companionList: companionList(companions),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** openSong with a deck target, for callers whose contract is to throw (every DJ loader catches and reports). */
export async function openDeckTrack(src: SongSourceRef, deck?: DeckId, o: Omit<OpenOptions, 'target' | 'origin'> = {}): Promise<DeckSong> {
  const r = await openSong(src, { ...o, origin: 'dj', target: { deck } });
  if (!r.ok) throw new Error(r.error);
  return r;
}

export async function openSong(src: SongSourceRef, o: OpenOptions & { target: DeckTarget }): Promise<DeckSong | { ok: false; error: string }>;
export async function openSong(src: SongSourceRef | StoredSongSource, o: OpenOptions): Promise<OpenResult>;
export async function openSong(src: SongSourceRef | StoredSongSource, o: OpenOptions): Promise<OpenResult | DeckSong> {
  if (src.kind === 'song') return openStoredSong(src);
  if (typeof o.target === 'object') return openDeckSong(src, o as OpenOptions & { target: DeckTarget });
  const interactive = o.interactive ?? INTERACTIVE_ORIGINS.has(o.origin);
  const phase = (p: OpenPhase): void => {
    setSongLoadPhase(p);
    o.onProgress?.({ phase: p });
  };
  // One way to cancel: the loading panel's Cancel button and OpenOptions.signal
  // both land in cancel(), which raises the flag every opener step checks.
  const controller = new AbortController();
  const cancel = (): void => {
    controller.abort();
    useSongLoadStore.setState({ cancelled: true });
    // A UADE scan in flight does not poll the flag; stop it where it runs.
    void import('@engine/uade/UADEEngine')
      .then(({ UADEEngine }) => { if (UADEEngine.hasInstance()) UADEEngine.getInstance().cancelLoad(); })
      .catch(() => { /* engine never started: nothing to cancel */ });
  };
  if (o.signal) {
    if (o.signal.aborted) controller.abort();
    else o.signal.addEventListener('abort', cancel, { once: true });
  }
  const throwIfCancelled = (): void => {
    if (controller.signal.aborted) throw new Error('Load cancelled');
    throwIfSongLoadCancelled();
  };
  if (!interactive) suppressFormatChecks(); // a headless open must never stop to ask
  try {
    let source = src;
    let options = o;
    // The dialog step: a person at a drop or a file browser may be asked, once,
    // and only when there is something to choose. The dialog itself and every
    // headless origin open directly.
    if ((o.askForChoices ?? interactive) && o.origin !== 'dialog' && src.kind !== 'prepared') {
      const chosen = await askIfChoice(src, o);
      if (!chosen) return { ok: false, error: 'Import cancelled', cancelled: true };
      source = chosen.song;
      options = chosen.options;
    }
    const prepared = source.kind === 'prepared' ? source : undefined;

    let kind: SongKind | null = prepared?.songKind ?? null;
    let started = false;
    let companionCount = 0;
    const start = options.start ?? START_BY_ORIGIN[options.origin];
    let name = sourceName(source);
    const loaded = await withSongLoad(name, async () => {
      useSongLoadStore.setState({ interactive, cancel });
      phase('acquire');
      const { file, companions } = await acquire(source);
      name = file.name;
      companionCount = companions?.size ?? 0;
      useSongLoadStore.setState({ label: name });
      throwIfCancelled();
      kind ??= await classifySong(file);
      if (!kind) return { success: false, error: `Unsupported file format: ${file.name}` } as FileLoadResult;
      throwIfCancelled();
      phase('scan');
      const result = await route(kind, file, options, companions, prepared);
      throwIfCancelled();
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
      notified: kind === 'module' || kind === 'header' || !!prepared?.info,
    };
  } catch (err) {
    const wasCancelled = controller.signal.aborted;
    return wasCancelled
      ? { ok: false, error: 'Load cancelled', cancelled: true }
      : { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    o.signal?.removeEventListener('abort', cancel);
    if (!interactive) restoreFormatChecks();
  }
}
