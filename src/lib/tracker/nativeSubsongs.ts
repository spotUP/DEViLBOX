/**
 * Subsongs of a whole-song engine: game-music-emu (NSF, GBS, HES, KSS, SPC,
 * VGM, GYM), ASAP (SAP and the other Atari 8-bit formats) and PSG play
 * (SNDH). One file holds several tunes; the engine plays one at a time and
 * says which (its load report). The format store keeps that report
 * (`nativeSubsongs`), the scope view's subsong control shows it, and the
 * silence detector's song-end advances through it instead of stopping the
 * song (owner, 2026-10-05: "just skip to next subsong when it ends").
 *
 * Every index here is 0-based; the engines convert (PSG play counts from 1).
 */

/** The engines that play one subsong of a file - their `NativeEngineRouting` keys. */
export type NativeSubsongEngine = 'Gme' | 'Asap' | 'Psgplay';

export interface NativeSubsongs {
  engine: NativeSubsongEngine;
  /** Subsongs in the file (>= 1). */
  count: number;
  /** The subsong playing, 0-based - what the engine reported, not what was asked for. */
  current: number;
  /** Per-subsong names the file carries (NSFE, GBS/HES m3u, ...); '' where it has none. */
  names: string[];
}

/** An engine that can start one subsong of the file it has loaded. */
export interface SubsongPlayer {
  /**
   * Start subsong `index` (0-based). With `skipSilent`, the engine may start
   * the first subsong from `index` on that makes a sound (an empty KSS slot).
   * Resolves to the subsong started, or -1 when none could be.
   */
  playSubsong(index: number, opts?: { skipSilent?: boolean }): Promise<number>;
}

export function isSubsongPlayer(x: unknown): x is SubsongPlayer {
  return !!x && typeof (x as { playSubsong?: unknown }).playSubsong === 'function';
}

/** The subsong after the one playing, or null on the last (the song then ends). */
export function nextSubsong(s: NativeSubsongs | null): number | null {
  if (!s || s.current + 1 >= s.count) return null;
  return s.current + 1;
}

/** The subsong before the one playing, or null on the first. */
export function previousSubsong(s: NativeSubsongs | null): number | null {
  if (!s || s.current <= 0) return null;
  return Math.min(s.current - 1, s.count - 1);
}

/** The control's label for subsong `index`: its number, and its name when the file has one. */
export function subsongLabel(s: NativeSubsongs, index: number): string {
  const name = s.names[index]?.trim();
  return name ? `${index + 1}. ${name}` : `Subsong ${index + 1}`;
}

/**
 * The format-store field that tells the engine which subsong to start when
 * the song is (re)loaded - play after a stop starts the subsong last heard.
 */
export function subsongStartField(s: NativeSubsongs): { gmeTrack: number } | { sndhSubtune: number } | { asapSong: number } {
  switch (s.engine) {
    case 'Gme': return { gmeTrack: s.current };
    case 'Psgplay': return { sndhSubtune: s.current + 1 };
    case 'Asap': return { asapSong: s.current };
  }
}

/**
 * The engine's report as the store keeps it: count at least 1, current inside
 * it, one name slot per subsong. Null when the file has a single subsong is
 * NOT done here - the control hides itself for count 1, and the start field
 * still has to follow what plays.
 */
export function normalizeSubsongs(engine: NativeSubsongEngine, count: number, current: number, names: string[] = []): NativeSubsongs {
  const n = Math.max(1, Math.floor(count) || 1);
  const cur = Math.min(Math.max(0, Math.floor(current) || 0), n - 1);
  return { engine, count: n, current: cur, names: Array.from({ length: n }, (_, i) => names[i] ?? '') };
}
