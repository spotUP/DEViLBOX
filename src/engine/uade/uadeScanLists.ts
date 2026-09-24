/**
 * Centralized UADE scan-control lists.
 *
 * Consumed by UADEParser.ts, UADEEngine.ts, and UADESynth.ts.
 * Keep ONE copy here — never duplicate these sets in other files.
 *
 * Two tiers:
 *   SCAN_CRASH — format genuinely crashes browser or corrupts WASM state during scan.
 *                Scan is SKIPPED entirely (no tick snapshots captured).
 *   SHORT_SCAN — compiled 68k replayers that loop indefinitely but don't crash.
 *                A 30-second timeout scan captures tick snapshots for pattern display.
 *
 * FORCE_CLASSIC is separate (in UADEParser.ts) and controls audio routing only.
 * Formats can be in SHORT_SCAN (scan runs, ticks captured) AND FORCE_CLASSIC
 * (audio via UADESynth streaming) simultaneously — that's the intended decoupled design.
 */

// ── Formats that CRASH the browser or corrupt WASM state during scan ────────

export const SCAN_CRASH_EXTS = new Set([
  'mon',   // ManiacsOfNoise — enhanced scan crashes browser
  'sa',    // SonicArranger compiled binary variant — JSR prolog, enhanced scan hangs
  'aps',   // AProSys — ADRVPACK-packed binary; scan produces garbage rows
  'sas',   // SonicArranger suffix-form compiled binary — scan crashes browser
  'mso',   // Medley — enhanced scan crashes browser
  'ml',    // Medley (alternate ext) — enhanced scan crashes browser
  'sun',   // SunTronic/TSM — compiled 68k synth, enhanced scan corrupts engine
  'tsm',   // SunTronic/TSM — suffix-form variant
  'thm',   // ThomasHermann — scan crashes browser
  'sb',    // SteveBarrett — scan crashes browser
  'ps',    // PaulShields — scan crashes browser
  'cus', 'cust', 'custom',  // DelitrackerCustom — soft reset fails after scan → stutter
  'hip7',  // JochenHippel-7V — game music that never ends: the scan runs its whole budget, and the reload after a cut scan renders silence (2026-09-22)
]);

export const SCAN_CRASH_PREFIXES = new Set([
  'sas',   // SonicArranger prefix-form — scan crashes browser
  'ash',   // AshleyHogg — scan crashes browser
  'tsm',   // SunTronic/TSM — scan corrupts engine state
  'thm',   // ThomasHermann — scan crashes browser
  'sb',    // SteveBarrett — scan crashes browser
  'ps',    // PaulShields — scan crashes browser
  'cus', 'cust', 'custom',  // DelitrackerCustom — soft reset fails after scan → stutter
]);

// ── Formats that loop indefinitely but don't crash — safe for short 30s scan ─

export const SHORT_SCAN_EXTS = new Set([
  'jpo', 'jpold', 'rh', 'rhp', 'mm4', 'mm8', 'sdata', 'jd', 'doda', 'gray',
  'spl', 'riff', 'hd', 'tw', 'dz', 'bss', 'scn', 'scumm',
  'rho', 'dln', 'core', 'hot', 'wb', 'dh',
  'bd', 'bds', 'ex', 'sm', 'mok', 'pvp', 'dns', 'vss', 'synmod',
  'cm', 'rk', 'rkb',
  'mc', 'mcr', 'mco',  // MarkCooksey
  'jmf',    // JankoMrsicFlogel
  'kh',     // KrisHatlelid
  'sng',    // RichardJoseph (two-file .sng/.ins)
  'sjs',    // SoundPlayer (two-file sjs.*+smp.*)
  'jpn', 'jpnd', 'jp',  // JasonPage (two-file jpn.*+smp.*)
]);

export const SHORT_SCAN_PREFIXES = new Set([
  'dl_deli', 'dln', 'rh', 'mm4', 'mm8', 'sdata', 'jd', 'doda', 'gray',
  'fw', 'spl', 'riff', 'hd', 'tw', 'dz', 'bss', 'scn', 'scumm',
  'dns', 'mk2', 'mkii', 'rho', 'core', 'hot', 'wb', 'dh',
  'bd', 'bds', 'ex', 'sm', 'mok', 'pvp', 'vss', 'synmod',
  'cm', 'rk', 'rkb',
  'mc', 'mcr', 'mco',  // MarkCooksey
  'jmf',    // JankoMrsicFlogel
  'kh',     // KrisHatlelid
  'mfp',    // MagneticFieldsPacker
  'smp',    // ThomasHermann companion prefix (smp.*)
  'sjs',    // SoundPlayer
  'jpn', 'jpnd', 'jp',  // JasonPage
  'sng',    // RichardJoseph
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if scan should be SKIPPED entirely (format crashes). */
export function shouldSkipScan(ext: string, prefix: string): boolean {
  return SCAN_CRASH_EXTS.has(ext) || SCAN_CRASH_PREFIXES.has(prefix);
}

/** Returns true if scan should use a short timeout (format loops but doesn't crash). */
export function isShortScan(ext: string, prefix: string): boolean {
  return SHORT_SCAN_EXTS.has(ext) || SHORT_SCAN_PREFIXES.has(prefix);
}

export interface ScanParams {
  /** The format crashes the browser or corrupts WASM state during a scan. */
  scanCrashes: boolean;
  /** Compiled 68k replayer: a 30 s scan captures ticks, a full one never ends. */
  shortScan: boolean;
  /** Skip the scan entirely. */
  skipScan: boolean;
  /** Scan budget in seconds, or undefined for the 600 s default. */
  scanTimeoutSec: number | undefined;
  /**
   * Whether UADE is left LOOPING after a load of this format.
   *
   * This was never chosen — it fell out of whether a scan ran. A scan calls
   * `set_looping(0)` so it can terminate, and the reload afterwards leaves it
   * there, so scanned formats stop at the end of the song. The two paths that
   * do not complete a scan (`skipScan`, and the short scan's full reinit) both
   * call `set_looping(1)`. Stating it here keeps that behaviour when the
   * caller skips a scan it never needed.
   */
  loops: boolean;
}

/**
 * Scan parameters for a filename. THE single decision point — never re-derive
 * `ext`/`prefix` at a call site.
 *
 * Both halves of the name are tested against both lists, because UADE names a
 * module either way round: `unreal flying.mon` on disk becomes the hint
 * `mon.unreal flying`. Splitting that on "." and calling the last part the
 * extension yields "unreal flying", and `mon` — which is on the CRASH list —
 * was then scanned anyway, for 3.7 s, on a format whose scan is documented to
 * crash the browser (measured 2026-09-24).
 */
export function getScanParams(filename: string): ScanParams {
  const basename = filename.includes('/') ? filename.split('/').pop()! : filename;
  const parts = basename.toLowerCase().split('.');
  const head = parts[0] ?? '';
  const tail = parts.length > 1 ? parts[parts.length - 1] : '';

  // Either half may be the format token — test both against both lists.
  const scanCrashes = shouldSkipScan(tail, head) || shouldSkipScan(head, tail);
  const shortScan = isShortScan(tail, head) || isShortScan(head, tail);

  return {
    scanCrashes,
    shortScan,
    skipScan: scanCrashes,
    scanTimeoutSec: shortScan ? 30 : undefined,
    loops: scanCrashes || shortScan,
  };
}
