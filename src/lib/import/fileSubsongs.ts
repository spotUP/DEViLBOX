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
/** What a song carries about its tunes: how many, which one the grid shows, and the file it came from. */
export interface FileSubsongs {
  count: number;
  current: number;
  /** The name the file was opened under (its extension routes it to the parser again on a switch). */
  fileName: string;
}

export interface FileSubsongFormat {
  /** FormatRegistry key. */
  key: string;
  /** Format-store field holding the bytes the engine loads (what a switch reopens). */
  fileDataField: string;
  /** Tunes in the file; 0 when it is not this format. */
  count(bytes: ArrayBuffer): Promise<number>;
  /** Does tune `subsong` start a note? Decided by the replayer's walk, never by a header guess. */
  audible(bytes: ArrayBuffer, subsong: number): Promise<boolean>;
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
};

/** The registered format of a file name, or null for a file that has one tune or is no such format. */
export async function fileSubsongFormat(fileName: string, head?: Uint8Array): Promise<FileSubsongFormat | null> {
  const { detectNativeFormat } = await import('@lib/import/prepareModuleImport');
  const key = detectNativeFormat(fileName.toLowerCase(), head)?.key;
  return key ? FORMATS[key] ?? null : null;
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
    if (await format.audible(bytes, i).catch(() => false)) return { count, current: i, fileName };
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
