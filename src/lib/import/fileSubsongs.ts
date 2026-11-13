/**
 * Subsongs of a command-stream file (David Whittaker, Ben Daglish, Hippel, Future Player,
 * Music Assembler): one file holds several tunes, the parser builds the grid of ONE and the
 * engine plays that one. Every format here registers the same three things - how many tunes the
 * file holds, whether a tune makes a sound (the replayer's own walk, the same one the grid is drawn
 * from) and which format-store field holds the bytes the engine loads - and gets the rest from this
 * module: the import dialog's picker (prepareSong -> PreparedSong.fileSubsongs), the song's subsong
 * selector (lib/tracker/subsongSwitch, source 'file') and the default (the first tune that sounds).
 *
 * Every index is 0-based. The UADE formats' subsongs (UADEMetadata.subsongCount) and the
 * whole-song engines' (nativeSubsongs) are other models of the same idea; these formats have a
 * grid per tune, so a switch reopens the file at the tune rather than moving a playhead.
 */
import { WalkCancelledError } from './formats/songWalkClient';

/** What a song carries about its tunes: how many, which one the grid shows, and the file it came from. */
export interface FileSubsongs {
  count: number;
  current: number;
  /** The name the file was opened under (its extension routes it to the parser again on a switch). */
  fileName: string;
  /** The engine's number for tune 0 when it does not count from 0 (UADE Medley: 1); absent = 0. */
  engineFirst?: number;
}

export interface FileSubsongFormat {
  /** FormatRegistry key. */
  key: string;
  /** Format-store field holding the bytes the engine loads (what a switch reopens). */
  fileDataField: string;
  /** Tunes in the file; 0 when it is not this format. */
  count(bytes: ArrayBuffer): Promise<number>;
  /** File names this format owns that the format registry has no native key for (matched when the registry finds none). */
  names?: RegExp;
  /** Does tune `subsong` start a note? Decided by the replayer's walk, never by a header guess. */
  audible(bytes: ArrayBuffer, subsong: number): Promise<boolean>;
}

/** The Hippel TFMX family (7V and the Amiga module): the decoder's subsong table, a tune sounds when its walked grid has steps. */
function hippelTfmxFormat(key: string): FileSubsongFormat {
  return {
    key,
    fileDataField: 'hippelFileData',
    count: async (bytes) => {
      const { hippelTfmxModule } = await import('./formats/JochenHippel7VParser');
      return hippelTfmxModule(new Uint8Array(bytes))?.nSongs ?? 0;
    },
    audible: async (bytes, subsong) => {
      const [{ hippelTfmxModule }, { hippelGrid }] = await Promise.all([import('./formats/JochenHippel7VParser'), import('./formats/HippelTfmxWalk')]);
      const m = hippelTfmxModule(new Uint8Array(bytes));
      return !!m && subsong < m.nSongs && hippelGrid(m, subsong).steps.length > 0;
    },
  };
}

const FORMATS: Record<string, FileSubsongFormat> = {
  davidWhittaker: {
    key: 'davidWhittaker',
    fileDataField: 'davidWhittakerFileData',
    count: async (bytes) => (await import('./formats/DavidWhittakerWasmExtractor')).dwSubsongCount(bytes),
    audible: async (bytes, subsong) => {
      const { walkDavidWhittaker, DW_WALK } = await import('./formats/DavidWhittakerWasmExtractor');
      const walk = await walkDavidWhittaker(bytes, 60_000, subsong);
      return walk.events.some((e) => e.kind === DW_WALK.note);
    },
  },
  hippelCoso: {
    key: 'hippelCoso',
    fileDataField: 'hippelFileData',
    count: async (bytes) => (await import('./formats/HippelCoSoParser')).cosoSubsongCount(new Uint8Array(bytes)),
    audible: async (bytes, subsong) => (await import('./formats/HippelCoSoParser')).cosoTuneHasNotes(new Uint8Array(bytes), subsong),
  },
  jochenHippel7V: hippelTfmxFormat('jochenHippel7V'),
  // The Amiga SOG./MCMD. module (.hip, .mcmd): a TFMX song behind replay code; the registry has no native key for it.
  jochenHippelAmiga: { ...hippelTfmxFormat('jochenHippelAmiga'), names: /\.(hip|mcmd)$|(^|\/)(hip|mcmd)\./ },
  // Played by UADE (UADEEngine.loadTune starts the tune from the format store); the player numbers its songs from 0, like the module's table.
  robHubbard: {
    key: 'robHubbard',
    fileDataField: 'uadeEditableFileData',
    count: async (bytes) => (await import('./formats/rhWalk')).loadRhModule(new Uint8Array(bytes))?.songs.length ?? 0,
    audible: async (bytes, subsong) => {
      const { walkRobHubbard, RH_WALK } = await import('./formats/rhWalk');
      const walk = walkRobHubbard(new Uint8Array(bytes), { song: subsong, maxTicks: 8000 });
      return !!walk && walk.events.some((e) => e.kind === RH_WALK.note);
    },
  },
  // JayTrax: S subsongs of 16564 bytes share the patterns and instruments (jxsGrid.ts); the engine opens one by index.
  // Medley (.mso): the song table's tunes 1..N, registry tune i = table entry i + 1 (medleyGrid.MEDLEY_FIRST_TUNE); UADE plays the same numbers.
  medley: {
    key: 'medley',
    // The registry's medley entry matches .ml only; Medley modules are .mso (or mso.* prefixed).
    names: /\.mso$|(^|\/)mso\./,
    fileDataField: 'uadeEditableFileData',
    count: async (bytes) => (await import('./formats/medleyGrid')).medleySubsongCount(new Uint8Array(bytes)),
    audible: async (bytes, subsong) => (await import('./formats/medleyGrid')).medleySubsongAudible(new Uint8Array(bytes), subsong),
  },
  // Digital Sonix & Chrome (.dsc): the repeats-0 entries start the tunes (dscSubsongCount); UADE and nuade number them from 0.
  digitalSonixChrome: {
    key: 'digitalSonixChrome',
    names: /\.dsc$|(^|\/)dsc\./,
    fileDataField: 'uadeEditableFileData',
    count: async (bytes) => {
      const d = await import('./formats/DigitalSonixChromeModule');
      return d.dscSubsongCount(d.decodeDscModule(new Uint8Array(bytes)));
    },
    audible: async (bytes, subsong) => {
      const d = await import('./formats/DigitalSonixChromeModule');
      return d.dscSubsongEntries(d.decodeDscModule(new Uint8Array(bytes)), subsong).some((e) => e.rows > 0);
    },
  },
  // Quartet PSG (.sqt): the songs the init routine can select (quartetPsgGrid.quartetSongBases); UADE plays the same numbers, counted from 0.
  quartet: {
    key: 'quartet',
    names: /\.sqt$|(^|\/)sqt\./,
    fileDataField: 'uadeEditableFileData',
    count: async (bytes) => (await import('./formats/quartetPsgGrid')).quartetSongBases(new Uint8Array(bytes)).length,
    audible: async (bytes, subsong) => {
      const g = (await import('./formats/quartetPsgGrid')).buildQuartetGrid(new Uint8Array(bytes), 'x.sqt', subsong);
      return !!g && g.placements.length > 0;
    },
  },
  jxs: {
    key: 'jxs',
    fileDataField: 'jxsFileData',
    count: async (bytes) => (await import('./formats/jxsInstrument')).jxsLayout(new Uint8Array(bytes))?.subsongs ?? 0,
    audible: async (bytes, subsong) => (await import('./formats/jxsGrid')).jxsSubsongAudible(new Uint8Array(bytes), subsong),
  },
  benDaglish: {
    key: 'benDaglish',
    fileDataField: 'bdFileData',
    count: async (bytes) => (await import('./formats/BenDaglishWasmExtractor')).bdSubsongCount(bytes),
    audible: async (bytes, subsong) => {
      const { walkBenDaglish, BD_WALK } = await import('./formats/BenDaglishWasmExtractor');
      const walk = await walkBenDaglish(bytes, subsong);
      return walk.events.some((e) => e.kind === BD_WALK.note);
    },
  },
  musicAssembler: {
    key: 'musicAssembler',
    fileDataField: 'maFileData',
    count: async (bytes) => {
      const { loadMaModule } = await import('./formats/maModule');
      return loadMaModule(new Uint8Array(bytes))?.subSongs.length ?? 0;
    },
    audible: async (bytes, subsong) => {
      // The walk runs in the import walk worker, never on the main thread (U2.8, importWalksRunInWorker).
      const [{ songWalks }, { MA_WALK }] = await Promise.all([import('./formats/songWalkClient'), import('./formats/maWalk')]);
      const walk = await songWalks.musicAssembler(new Uint8Array(bytes), subsong, AUDIBLE_ROWS);
      return !!walk && walk.events.some((e) => e.kind === MA_WALK.note || e.kind === MA_WALK.legato);
    },
  },
  futurePlayer: {
    key: 'futurePlayer',
    fileDataField: 'futurePlayerFileData',
    count: async (bytes) => {
      const { fpCodeSection, fpSongs } = await import('./formats/fpWalk');
      return fpSongs(fpCodeSection(new Uint8Array(bytes))).length;
    },
    audible: async (bytes, subsong) => {
      const [{ songWalks }, { fpCodeSection, FP_WALK }] = await Promise.all([import('./formats/songWalkClient'), import('./formats/fpWalk')]);
      const walk = await songWalks.futurePlayer(fpCodeSection(new Uint8Array(bytes)), subsong, AUDIBLE_ROWS);
      return !!walk && walk.events.some((e) => e.kind === FP_WALK.note || e.kind === FP_WALK.legato);
    },
  },
};

/** Rows of a tune searched for its first note: a tune silent that long is silent (an intro rest is not). */
const AUDIBLE_ROWS = 2048;

/** The registered format of a file name, or null for a file that has one tune or is no such format. */
export async function fileSubsongFormat(fileName: string, head?: Uint8Array): Promise<FileSubsongFormat | null> {
  const { detectNativeFormat } = await import('@lib/import/prepareModuleImport');
  const lower = fileName.toLowerCase();
  const key = detectNativeFormat(lower, head)?.key;
  if (key && FORMATS[key]) return FORMATS[key];
  return Object.values(FORMATS).find((f) => f.names?.test(lower)) ?? null;
}

export function fileSubsongFormatByKey(key: string): FileSubsongFormat | null {
  return FORMATS[key] ?? null;
}

/** The format-store field names that hold a registered engine's bytes. */
export function fileSubsongDataFields(): string[] {
  return Object.values(FORMATS).map((f) => f.fileDataField);
}

/**
 * The tune to build: `requested` when the file has it, else the first that sounds, else the first.
 * The default is what a headless open (MCP, restore, a drop with no dialog) gets.
 */
export async function chooseFileSubsong(format: FileSubsongFormat, bytes: ArrayBuffer, fileName: string, requested?: number): Promise<FileSubsongs> {
  const count = Math.max(1, await format.count(bytes));
  if (requested !== undefined && requested >= 0 && requested < count) return { count, current: requested, fileName };
  for (let i = 0; i < count; i++) {
    // A Cancel ends the open; any other failure of the probe means "does not sound".
    if (await format.audible(bytes, i).catch((err: unknown) => { if (err instanceof WalkCancelledError) throw err; return false; })) return { count, current: i, fileName };
  }
  return { count, current: 0, fileName };
}

/** What the import dialog needs to offer the picker: the tunes in the file and the first that sounds. */
export async function scanFileSubsongs(fileName: string, bytes: ArrayBuffer): Promise<{ count: number; first: number } | null> {
  const format = await fileSubsongFormat(fileName, new Uint8Array(bytes, 0, Math.min(128, bytes.byteLength)));
  if (!format) return null;
  const { count, current } = await chooseFileSubsong(format, bytes, fileName);
  return count > 1 ? { count, first: current } : null;
}

/** The song's field for its tunes: absent when the file holds one. */
export function fileSubsongsField(chosen: FileSubsongs): { fileSubsongs: FileSubsongs } | Record<string, never> {
  return chosen.count > 1 ? { fileSubsongs: chosen } : {};
}
