/**
 * songRevisions - the pure rules for "a song is saved before another replaces it".
 *
 * The storage (IndexedDB) lives in hooks/useProjectPersistence.ts and the hook
 * point is withSongLoad (songLifecycle.ts), which every opener passes through.
 * This module holds only the decisions, so they test without the audio engine:
 * which songs are worth a revision, when a snapshot repeats the last one, which
 * stored revisions to drop, and the newest-first order.
 */
import type { SavedSongFields } from '@/lib/song/savedSong';

/** The revisions kept of songs that were replaced. The oldest is dropped. */
export const MAX_REPLACED_REVISIONS = 20;

type CellLike = { note?: number; instrument?: number; volume?: number; effTyp?: number; eff?: number; extraNotes?: unknown[] };
type PatternLike = { channels?: Array<{ rows?: CellLike[] }> };

function cellHasContent(c: CellLike | undefined): boolean {
  if (!c) return false;
  return !!(c.note || c.instrument || c.volume || c.effTyp || c.eff || (c.extraNotes && c.extraNotes.length));
}

/**
 * An untouched blank song: no instruments, no stored module, and no cell with
 * a note, instrument, volume or effect. Nothing is lost when it is replaced.
 */
export function isBlankSong(song: Pick<SavedSongFields, 'patterns' | 'instruments' | 'originalModuleData' | 'nativeEngineData'>): boolean {
  if (song.instruments?.length) return false;
  if (song.originalModuleData || (song.nativeEngineData && Object.keys(song.nativeEngineData).length)) return false;
  for (const p of (song.patterns ?? []) as unknown as PatternLike[]) {
    for (const ch of p.channels ?? []) {
      for (const row of ch.rows ?? []) if (cellHasContent(row)) return false;
    }
  }
  return true;
}

/** A 53-bit string hash (cyrb53) of the song's JSON, ignoring when it was taken. */
export function songFingerprint(song: object): string {
  const s = JSON.stringify(song, (_k, v) => (v instanceof ArrayBuffer ? v.byteLength : v));
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + s.length;
}

export type SnapshotDecision = 'blank' | 'identical' | 'save';

/** Whether the open song earns a revision, given the fingerprint of the newest stored one. */
export function decideSnapshot(
  song: Pick<SavedSongFields, 'patterns' | 'instruments' | 'originalModuleData' | 'nativeEngineData'>,
  fingerprint: string,
  newestStoredFingerprint: string | undefined,
): SnapshotDecision {
  if (isBlankSong(song)) return 'blank';
  if (newestStoredFingerprint === fingerprint) return 'identical';
  return 'save';
}

/** Keys (ascending = oldest first) to delete so at most `max` remain. */
export function keysToDrop(keysAscending: readonly number[], max: number = MAX_REPLACED_REVISIONS): number[] {
  const extra = keysAscending.length - max;
  return extra > 0 ? keysAscending.slice(0, extra) : [];
}

/** Newest first by savedAt (ISO strings); a stable copy. */
export function newestFirst<T extends { savedAt: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
}
