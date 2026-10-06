/**
 * A restored song is decoded again from its stored module bytes.
 *
 * Autosave / crash recovery used to bring the song back exactly as it was
 * saved: the grid the decoder of that day produced (Sound Master cells with the
 * retired effect 0x76 showing as '?00') and the engine fields of that day (an
 * MMD3 song carrying uadeEditableFileData that UADE cannot play). A decoder fix
 * never reached a restored song (2026-10-06).
 *
 * For a song that carries the bytes the decoder read (uadeEditableFileData and
 * its name - every UADE byte-exact codec, MED, Sound Master, Jesper Olsen ...)
 * the restore runs the same parse a fresh load runs (parseModuleToSong, with
 * the stored companion files) and takes the grid and the engine fields from it.
 * The user's work is kept: a cell whose hash differs from the load-time
 * baseline (gridBaseline.ts) is an edit and wins; instruments, order, tempo,
 * channel and pattern names, mixer and the rest of the project come from the
 * save.
 *
 * Kept as saved, with the reason logged, when re-decoding is not safe:
 *  - no bytes or no file name (TS-replayer songs, hively, libopenmpt songs:
 *    their edits live in the stored patterns and there is nothing to re-read);
 *  - no baseline (saved before baselines existed: every edit would be
 *    indistinguishable from the old decoder's output);
 *  - several subsongs (the played subsong is not saved);
 *  - the grid no longer lines up with the baseline or the fresh decode
 *    (patterns added, resized, or the new decoder reads another shape);
 *  - the parse fails.
 */
import type { Pattern } from '@/types/tracker';
import type { SongToApply } from './applySong';
import { hashCell, type GridBaseline } from './gridBaseline';

type Parse = typeof import('@/lib/import/parseModuleToSong').parseModuleToSong;

export interface RestoreOutcome {
  song: SongToApply;
  /** The baseline the applied grid is measured against (the fresh decode's, when re-decoded). */
  baseline: GridBaseline | null;
  redecoded: boolean;
  reason?: string;
}

function lineUp(stored: readonly Pattern[], other: readonly Pattern[]): boolean {
  return stored.length === other.length && stored.every((p, i) => {
    const o = other[i];
    return p.channels.length === o.channels.length
      && p.channels.every((ch, c) => ch.rows.length === o.channels[c].rows.length);
  });
}

export async function restoreFromStoredBytes(
  song: SongToApply,
  baseline: GridBaseline | null | undefined,
  parse?: Parse,
): Promise<RestoreOutcome> {
  const kept = (reason: string): RestoreOutcome => ({ song, baseline: baseline ?? null, redecoded: false, reason });
  const eng = song.engine as Record<string, unknown>;
  const bytes = eng.uadeEditableFileData as ArrayBuffer | undefined;
  const name = eng.uadeEditableFileName as string | undefined;
  if (!bytes || bytes.byteLength === 0 || !name) return kept('no stored module bytes');
  if (!baseline) return kept('saved without a grid baseline');
  if ((eng.uadeEditableSubsongs as { count?: number } | null | undefined)?.count && (eng.uadeEditableSubsongs as { count: number }).count > 1) {
    return kept('several subsongs: the played one is not saved');
  }
  const storedFlat = song.patterns.map((p) => p.channels.reduce((n, ch) => n + ch.rows.length, 0));
  if (baseline.length !== song.patterns.length || baseline.some((b, i) => b.length !== storedFlat[i])) {
    return kept('the grid no longer lines up with its baseline');
  }

  let fresh;
  try {
    const parseFn = parse ?? (await import('@/lib/import/parseModuleToSong')).parseModuleToSong;
    const companions = eng.uadeCompanionFiles as Map<string, ArrayBuffer> | undefined;
    fresh = await parseFn(new File([bytes], name), 0, undefined, undefined, companions);
  } catch (err) {
    console.warn('[restore] re-decoding the stored module failed, keeping the saved song:', err);
    return kept('the parse failed');
  }
  if (!fresh.patterns.length || !lineUp(song.patterns, fresh.patterns)) {
    return kept('the decoder now reads another grid shape');
  }

  // Fresh cells, except those the user edited.
  const patterns: Pattern[] = song.patterns.map((p, pi) => {
    const fp = fresh.patterns[pi];
    let flat = 0;
    return {
      ...p,
      importMetadata: fp.importMetadata,
      channels: p.channels.map((ch, c) => ({
        ...ch,
        rows: ch.rows.map((cell, r) => {
          const edited = hashCell(cell) !== baseline[pi][flat++];
          return edited ? cell : fp.channels[c].rows[r];
        }),
      })),
    };
  });

  const freshBaseline: GridBaseline = fresh.patterns.map((p) => p.channels.flatMap((ch) => ch.rows.map(hashCell)));
  const useStoredInstruments = song.instruments.length === fresh.instruments.length;
  return {
    baseline: freshBaseline,
    redecoded: true,
    song: {
      ...song,
      patterns,
      instruments: useStoredInstruments ? song.instruments : fresh.instruments,
      originalModuleData: fresh.originalModuleData ?? song.originalModuleData,
      engine: fresh as unknown as SongToApply['engine'],
    },
  };
}
