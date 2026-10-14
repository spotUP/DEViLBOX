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
 * The forward mapping is lossy for volume (a Furnace volume of 0-127 shown
 * on the XM scale), so an edit only rewrites the fields the editor actually
 * changed; every other field keeps its native value. Effects are not mapped:
 * the cell holds Furnace's code and value (effect notation 'furnace').
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
 * Convert a FurnaceRow to a TrackerCell for the editor UI.
 */
export function furnaceRowToTrackerCell(row: FurnaceRow): TrackerCell {
  const note = furnaceNoteToXM(row.note);
  const instrument = row.ins >= 0 ? row.ins + 1 : 0;
  const volume = furnaceVolToXM(row.vol);

  // The effect columns keep Furnace's own code and value (the channel is marked
  // effectNotation 'furnace', so the grid writes them as Furnace does: "8040",
  // "E580"). No folding into tracker letters: that lost the value's high nibble
  // of every E1-EF command and let chip codes collide with other formats' glyphs.
  const convertEffect = (i: number) => {
    const fx = row.effects[i];
    if (!fx || (fx.cmd < 0 && fx.val < 0)) return { type: 0, param: 0 };
    return { type: fx.cmd < 0 ? 0 : fx.cmd & 0xFF, param: fx.val >= 0 ? fx.val & 0xFF : 0 };
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

/** Editor effect (type, param) → Furnace effect (cmd, val): the cell holds Furnace's code and value as they are. */
export function editorEffectToFurnace(type: number, param: number): { cmd: number; val: number } {
  if (type === 0 && param === 0) return { cmd: -1, val: -1 };
  return { cmd: type & 0xFF, val: param & 0xFF };
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
    const e = editorEffectToFurnace(nt, np);
    while (nat.effects.length <= fx) nat.effects.push({ cmd: -1, val: -1 });
    nat.effects[fx] = e;
    put(3 + fx * 2, e.cmd);
    put(4 + fx * 2, e.val);
  });
  return writes;
}

const EFFECT_SLOT_KEYS = ['', '2', '3', '4', '5', '6', '7', '8'] as const;

/**
 * Bring a Furnace song's cells to Furnace effect notation.
 *
 * Until 2026-10-15 the cells held effects folded into tracker letters (Furnace
 * 09xx shown as Fxx, E5 80 split into E5 0, chip codes in other formats'
 * glyph blocks). A song saved or autosaved then still carries those cells,
 * without the channel's `effectNotation` mark. Their effect fields are re-read
 * from the native rows - the data the sequencer plays and the .fur save
 * writes - through the same `furnaceRowToTrackerCell` the importer uses, and
 * the channel is marked. Channels already marked are left alone (an imported
 * song costs one check per channel). A pattern no song position shows has no
 * native rows to read and keeps its cells. Mutates `patterns`; call before
 * they enter the store.
 */
export function upgradeFurnaceEffectNotation(
  patterns: Array<{ channels: Array<{ rows: TrackerCell[]; channelMeta?: ChannelMetaLike }> }>,
  songPositions: readonly number[],
  native: FurnaceNativeData,
): number {
  const sub = native.subsongs[native.activeSubsong ?? 0];
  if (!sub) return 0;
  let upgraded = 0;
  patterns.forEach((pattern, p) => {
    const pos = songPositions.indexOf(p);
    if (pos < 0) return;
    pattern.channels.forEach((channel, ch) => {
      if (channel.channelMeta?.effectNotation === 'furnace') return;
      const pool = sub.channels[ch]?.patterns;
      const pat = sub.orders[ch]?.[pos];
      if (!pool || typeof pool.get !== 'function' || pat === undefined) return;
      const nativeRows = pool.get(pat)?.rows ?? [];
      channel.rows.forEach((cell, r) => {
        const shown = furnaceRowToTrackerCell(nativeRows[r] ?? { note: -1, ins: -1, vol: -1, effects: [] });
        const dst = cell as unknown as Record<string, number | undefined>;
        const src = shown as unknown as Record<string, number | undefined>;
        for (const k of EFFECT_SLOT_KEYS) {
          const t = src[`effTyp${k}`], v = src[`eff${k}`];
          if (k === '' || k === '2' || t !== undefined) { dst[`effTyp${k}`] = t ?? 0; dst[`eff${k}`] = v ?? 0; }
          else { delete dst[`effTyp${k}`]; delete dst[`eff${k}`]; }
        }
      });
      channel.channelMeta = { ...channel.channelMeta, importedFromMOD: channel.channelMeta?.importedFromMOD ?? false, effectNotation: 'furnace' };
      upgraded++;
    });
  });
  return upgraded;
}

type ChannelMetaLike = NonNullable<import('@/types/tracker').ChannelData['channelMeta']>;
