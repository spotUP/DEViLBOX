/**
 * Furnace's native pattern rows ↔ the pattern editor's cells.
 *
 * A Furnace song is played by the WASM sequencer from `song.furnaceNative`;
 * the editor shows a translation of it. Both directions live here so they
 * cannot drift: import builds the editor's cells with `furnaceRowToTrackerCell`,
 * and an edit goes back through `applyEditorCellEdit`, which updates the
 * native row — the data the sequencer is uploaded from on every Play — and
 * says which sequencer cells to rewrite now.
 *
 * The forward mapping is lossy (a Furnace volume of 0-127 shown on the XM
 * scale, an E5 80 fine-pitch shown as E5 0), so an edit only rewrites the
 * fields the editor actually changed; every other field keeps its native
 * value.
 */
import type { TrackerCell, FurnaceRow, FurnaceNativeData } from '@/types/tracker';

/**
 * Furnace note → editor note.
 *
 * Furnace's native rows hold notes as `octave * 12 + semitone` with C-0 = 0
 * (FurnaceFileOps strips the pattern's +60): C-4 = 48, which the sequencer
 * sends back as 108 and the chip plays as C-4. The editor counts from 1
 * (C-0 = 1, C-4 = 49, 97 = note off). This used to return the Furnace number
 * unchanged, on the belief that it was already 1-based: every Furnace song
 * showed one semitone low in the pattern editor (Furnace C-4 as B-3), C-0
 * came out empty, and anything that played the editor's notes — hybrid
 * playback among them — played them a semitone flat.
 */
export function furnaceNoteToXM(note: number): number {
  if (note < 0 || note === 252) return 0; // empty / null
  if (note === 253 || note === 254 || note === 255) return 97; // off / release → note off
  return Math.min(96, note + 1);
}

/** Editor note → Furnace note: the inverse of `furnaceNoteToXM`. */
export function xmNoteToFurnace(note: number): number {
  if (note <= 0) return -1;
  if (note >= 97) return 253;
  return note - 1;
}

/**
 * Convert a Furnace-native volume value to XM volume column.
 * Furnace: -1=empty, 0-127
 * XM vol column: 0=empty, 0x10-0x50 = volume 0-64
 */
export function furnaceVolToXM(vol: number): number {
  if (vol < 0) return 0;
  return 0x10 + Math.min(64, Math.round(vol * 64 / 127));
}

/**
 * Convert a Furnace effect command to XM effect type.
 * Furnace effects 0x00-0x0F map directly to XM.
 * Higher Furnace effects are passed through for the WASM dispatch router.
 */
export function mapFurnaceEffectToXM(cmd: number): number {
  if (cmd < 0) return 0;

  // Standard tracker effects that map directly
  const mapping: Record<number, number> = {
    0x00: 0x00, // Arpeggio
    0x01: 0x01, // Portamento up
    0x02: 0x02, // Portamento down
    0x03: 0x03, // Tone portamento
    0x04: 0x04, // Vibrato
    0x05: 0x05, // Volslide + tone porta
    0x06: 0x06, // Volslide + vibrato
    0x07: 0x07, // Tremolo
    0x08: 0x08, // Panning
    0x09: 0x0F, // Set speed (groove)
    0x0A: 0x0A, // Volume slide
    0x0B: 0x0B, // Jump to order
    0x0C: 0x0C, // Set volume
    0x0D: 0x0D, // Pattern break
    0x0F: 0x0F, // Set speed
    0x0E: 0x0E, // Extended effects

    // Furnace extended effects — pass through for WASM dispatch
    0xE1: 0xE1, // Note slide up
    0xE2: 0xE2, // Note slide down
    0xE3: 0xE3, // Vibrato mode
    0xE4: 0xE4, // Fine vibrato depth
    0xE5: 0xE5, // Fine pitch
    0xE6: 0xE6, // Legato mode
    0xE7: 0xE7, // Samp offs (high byte)
    0xE8: 0xE8, // Macro release
    0xE9: 0xE9, // Note retrigger
    0xEA: 0xEA, // Fine volslide up
    0xEB: 0xEB, // Fine volslide down
    0xEC: 0xEC, // Note cut
    0xED: 0xED, // Note delay
    0xEE: 0xEE, // Delayed pattern change
    0xEF: 0xEF, // Set BPM
  };

  if (cmd in mapping) return mapping[cmd];
  // All other Furnace-specific effects pass through
  return cmd;
}

/**
 * Convert a FurnaceRow to a TrackerCell for the editor UI.
 */
export function furnaceRowToTrackerCell(row: FurnaceRow): TrackerCell {
  const note = furnaceNoteToXM(row.note);
  const instrument = row.ins >= 0 ? row.ins + 1 : 0;
  const volume = furnaceVolToXM(row.vol);

  const convertEffect = (i: number) => {
    const fx = row.effects[i];
    if (!fx || (fx.cmd < 0 && fx.val < 0)) return { type: 0, param: 0 };
    let t = mapFurnaceEffectToXM(fx.cmd < 0 ? 0 : fx.cmd);
    let p = fx.val >= 0 ? fx.val & 0xFF : 0;
    // Split composite XM extended effects (E1x-EFx)
    if (t >= 0xE0 && t <= 0xEF) {
      const subCmd = t & 0x0F;
      t = 0x0E;
      p = (subCmd << 4) | (p & 0x0F);
    }
    return { type: t, param: p };
  };

  const e0 = convertEffect(0);
  const e1 = convertEffect(1);

  const cell: TrackerCell = {
    note,
    instrument,
    volume,
    effTyp: e0.type,
    eff: e0.param,
    effTyp2: e1.type,
    eff2: e1.param,
  };

  for (let i = 2; i < Math.min(8, row.effects.length); i++) {
    const e = convertEffect(i);
    if (e.type || e.param) {
      const idx = i + 1; // effTyp3, eff3, etc.
      (cell as unknown as Record<string, number>)[`effTyp${idx}`] = e.type;
      (cell as unknown as Record<string, number>)[`eff${idx}`] = e.param;
    }
  }

  return cell;
}

/** Editor volume column (0 = empty, 0x10-0x50) → Furnace volume (-1 = empty, 0-127). */
export function xmVolToFurnace(vol: number): number {
  if (vol < 0x10) return -1;
  return Math.min(127, Math.round((Math.min(vol, 0x50) - 0x10) * 127 / 64));
}

/** Editor effect (type, param) → Furnace effect (cmd, val). Inverse of the forward split of Exy. */
export function xmEffectToFurnace(type: number, param: number): { cmd: number; val: number } {
  if (type === 0 && param === 0) return { cmd: -1, val: -1 };
  if (type === 0x0E) return { cmd: 0xE0 | ((param >> 4) & 0x0F), val: param & 0x0F };
  return { cmd: type, val: param };
}

/** A write for the WASM sequencer: FurnaceDispatchEngine.seqSetCell(ch, pat, row, col, val). */
export interface SeqCellWrite { ch: number; pat: number; row: number; col: number; val: number }

/** The sequencer's value for a native row field (notes carry the pattern's +60). */
function seqNote(note: number): number {
  return note >= 252 || note < 0 ? note : note + 60;
}

const EFFECT_FIELDS: Array<[keyof TrackerCell, keyof TrackerCell]> = [
  ['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3' as keyof TrackerCell, 'eff3' as keyof TrackerCell],
  ['effTyp4' as keyof TrackerCell, 'eff4' as keyof TrackerCell], ['effTyp5' as keyof TrackerCell, 'eff5' as keyof TrackerCell],
  ['effTyp6' as keyof TrackerCell, 'eff6' as keyof TrackerCell], ['effTyp7' as keyof TrackerCell, 'eff7' as keyof TrackerCell],
  ['effTyp8' as keyof TrackerCell, 'eff8' as keyof TrackerCell],
];

/**
 * Apply an edit of one editor cell to the song's native Furnace data.
 *
 * `editorPattern` is the editor's pattern index — a composite of one Furnace
 * pattern per channel, the one each channel plays at the song positions that
 * show it (`songPositions[pos] === editorPattern`, `orders[ch][pos]`). The edit
 * lands in that channel's own Furnace pattern, and the returned writes are
 * what the running sequencer needs to hear it now. A field the edit does not
 * change keeps its native value, so the lossy forward mapping never leaks
 * back into the song.
 */
export function applyEditorCellEdit(
  native: FurnaceNativeData,
  songPositions: readonly number[],
  editorPattern: number,
  ch: number,
  row: number,
  edit: Partial<TrackerCell>,
): SeqCellWrite[] {
  const sub = native.subsongs[native.activeSubsong ?? 0];
  if (!sub) return [];
  const pos = songPositions.indexOf(editorPattern);
  if (pos < 0) return [];
  const pat = sub.orders[ch]?.[pos];
  const chan = sub.channels[ch];
  if (pat === undefined || !chan) return [];

  let patData = chan.patterns.get(pat);
  if (!patData) {
    patData = { rows: [] };
    chan.patterns.set(pat, patData);
  }
  const blank = (): FurnaceRow => ({ note: -1, ins: -1, vol: -1, effects: [] });
  const nat = patData.rows[row] ?? blank();
  patData.rows[row] = nat;
  const shown = furnaceRowToTrackerCell(nat);
  const writes: SeqCellWrite[] = [];
  const put = (col: number, val: number) => writes.push({ ch, pat, row, col, val });

  if (edit.note !== undefined && edit.note !== shown.note) {
    nat.note = xmNoteToFurnace(edit.note);
    put(0, seqNote(nat.note));
  }
  if (edit.instrument !== undefined && edit.instrument !== shown.instrument) {
    nat.ins = edit.instrument > 0 ? edit.instrument - 1 : -1;
    put(1, nat.ins);
  }
  if (edit.volume !== undefined && edit.volume !== shown.volume) {
    nat.vol = xmVolToFurnace(edit.volume);
    put(2, nat.vol);
  }
  EFFECT_FIELDS.forEach(([typeKey, paramKey], fx) => {
    const t = edit[typeKey] as number | undefined;
    const p = edit[paramKey] as number | undefined;
    if (t === undefined && p === undefined) return;
    const shownT = (shown[typeKey] as number | undefined) ?? 0;
    const shownP = (shown[paramKey] as number | undefined) ?? 0;
    const nt = t ?? shownT, np = p ?? shownP;
    if (nt === shownT && np === shownP) return;
    const e = xmEffectToFurnace(nt, np);
    while (nat.effects.length <= fx) nat.effects.push({ cmd: -1, val: -1 });
    nat.effects[fx] = e;
    put(3 + fx * 2, e.cmd);
    put(4 + fx * 2, e.val);
  });
  return writes;
}
