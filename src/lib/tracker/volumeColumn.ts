/**
 * What a pattern cell's volume column means.
 *
 * `TrackerCell.volume` is one field holding two incompatible conventions, and
 * reading it without knowing the format produces a plausible-looking wrong
 * answer rather than an error:
 *
 *   XM / IT / S3M / MOD-via-libopenmpt — the XM volume-column byte.
 *     0x00-0x0F  no volume data
 *     0x10-0x50  set volume 0-64 (value = byte - 0x10)
 *     0x60+      volume-column EFFECTS (slide, vibrato, panning), not a level
 *
 *   AHX / HivelyTracker and the native replayer formats — a plain level, 0-64,
 *     with 0 meaning silent and no offset.
 *
 * The two overlap exactly where it hurts. Measured 2026-09-22 on jennipha.ahx:
 * channel 1 of pattern 0 row 0x2E carries a perfectly ordinary AHX volume of
 * 16, which under the XM reading is 0x10 — "set volume 0". The song went
 * silent at the same row on every play.
 *
 * Callers pass the editor mode so the field is read the way its writer meant
 * it. Anything reading `cell.volume` as a level should come through here.
 */

/**
 * Editor modes whose volume column is a raw 0-64 level rather than an XM
 * volume-column byte. These are the native-replayer formats, where the grid
 * mirrors the replayer's own per-row volume.
 */
const RAW_LEVEL_EDITOR_MODES: ReadonlySet<string> = new Set([
  'hively',
  'soundmon',
  'sonix',
  'suntronic',
  'maxtrax',
  'jamcracker',
  'futureplayer',
  'pretracker',
  'musicline',
  'sidmon',
  'hippel',
  'davidwhittaker',
  'sonicarranger',
  'digmug',
  'uade',
]);

/** The highest level either convention can express. */
export const VOLUME_COLUMN_MAX = 0x40;

/**
 * Read `volume` as a level in 0..1, or null when the cell carries no level.
 *
 * Null means "this cell says nothing about volume" — an empty column, or an XM
 * volume-column effect, which is a command and not a level. Callers must leave
 * the current volume alone on null rather than treating it as zero.
 */
export function decodeVolumeColumn(
  volume: number | null | undefined,
  editorMode: string | null | undefined,
): number | null {
  if (volume === null || volume === undefined) return null;
  if (!Number.isFinite(volume) || volume < 0) return null;

  if (editorMode && RAW_LEVEL_EDITOR_MODES.has(editorMode)) {
    // A raw level. 0 is a real instruction to be silent, but these formats
    // leave the column at 0 when they mean "nothing here", and the replayer —
    // not this grid — is what applies their volumes. Treating 0 as a command
    // would silence a channel on every empty cell.
    if (volume === 0) return null;
    return Math.min(volume, VOLUME_COLUMN_MAX) / VOLUME_COLUMN_MAX;
  }

  // XM volume-column byte.
  if (volume < 0x10 || volume > 0x50) return null;
  return (volume - 0x10) / VOLUME_COLUMN_MAX;
}

/** Exposed so tests and tooling can check a mode without duplicating the set. */
export function usesRawVolumeColumn(editorMode: string | null | undefined): boolean {
  return !!editorMode && RAW_LEVEL_EDITOR_MODES.has(editorMode);
}
