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

/**
 * The XM volume-column byte that plays the same as effect `effTyp`/`eff`, or 0
 * when the volume column has no equivalent. XM holds one effect plus the
 * volume column per cell, so this is how a second effect column survives the
 * trip into an XM module.
 */
export function effectToVolumeColumnByte(effTyp: number, eff: number): number {
  const x = (eff >> 4) & 0x0F;
  const y = eff & 0x0F;
  switch (effTyp) {
    case 0x3: return 0xF0 + Math.min(x, 0x0F);      // tone portamento (speed / 16)
    case 0x4: return y > 0 ? 0xB0 + y : 0;           // vibrato depth
    case 0x8: return 0xC0 + x;                       // set panning (high nibble)
    case 0xA:
      if (x > 0) return 0x70 + x;                    // volume slide up (up wins, as in FT2)
      if (y > 0) return 0x60 + y;                    // volume slide down
      return 0;
    case 0xC: return 0x10 + Math.min(eff, 0x40);     // set volume
    case 0xE:
      if (x === 0xA) return 0x90 + y;                // fine volume slide up (EAx)
      if (x === 0xB) return 0x80 + y;                // fine volume slide down (EBx)
      return 0;
    default: return 0;
  }
}

/** One effect column of a TrackerCell: XM effect type number and parameter. */
export interface EffectSlot { effTyp: number; eff: number }

/**
 * Effects that change song flow (jump, break, speed/tempo, pattern loop and
 * delay, global volume). A replayer ignores them only at the cost of playing
 * the wrong rows, so they win the single XM command slot over everything else.
 */
function isFlowEffect(slot: EffectSlot): boolean {
  const x = (slot.eff >> 4) & 0x0F;
  switch (slot.effTyp) {
    case 0xB: case 0xD: case 0xF: case 0x10: case 0x11: return true;
    case 0xE: return x === 0x6 || x === 0xE;
    default: return false;
  }
}

/**
 * Fold a cell's eight effect columns into what one XM cell can hold: one
 * command and one volume-column byte.
 *
 * The command slot takes column 1 when it carries a flow effect, else the
 * first flow effect in columns 2-8, else column 1, else the first other
 * non-empty column. When the cell has no volume of its own, the volume slot
 * takes the first remaining effect that has a volume-column form. Anything
 * left over has no place in an XM cell and is dropped.
 */
export function foldEffectColumnsForXM(
  volume: number,
  slots: readonly EffectSlot[],
): { volume: number; command: EffectSlot } {
  const used = slots.filter((s) => s.effTyp !== 0 || s.eff !== 0);
  const empty: EffectSlot = { effTyp: 0, eff: 0 };
  if (used.length === 0) return { volume, command: empty };

  const first = slots[0];
  const firstUsed = first !== undefined && (first.effTyp !== 0 || first.eff !== 0);
  const command =
    (firstUsed && isFlowEffect(first) ? first : undefined) ??
    used.find(isFlowEffect) ??
    (firstUsed ? first : undefined) ??
    used[0];

  if (volume !== 0) return { volume, command };
  for (const s of used) {
    if (s === command) continue;
    const byte = effectToVolumeColumnByte(s.effTyp, s.eff);
    if (byte !== 0) return { volume: byte, command };
  }
  return { volume, command };
}
