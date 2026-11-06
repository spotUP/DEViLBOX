/**
 * soundFactoryEdits.ts - the one writer for an edited Sound Factory grid.
 *
 * The song is the source bytes (tokenized by soundFactoryStream.ts, every token byte-exact) plus the edits found
 * by diffing the edited patterns against a fresh parse of those bytes. Each edit is applied to the tokens of the
 * event the cell anchors to (the parser's voice events), then the stream is serialized once and every stored
 * offset and length is recomputed:
 *   - note        the note opcode byte of the anchor token (pause <-> note, pitch from the recorded context)
 *   - effects     the effect tokens of that event are replaced by the encoding of the cell's effect list
 *                 (insert, remove, replace, change a value, enable byte zero <-> non-zero, one shot, looping)
 *   - delay       ticks move between the previous event's duration and the anchor's (a leading pause is added
 *                 when the anchor is the voice's first event)
 * An unedited song serializes to its own bytes, so a no-op export is lossless by construction.
 */
import type { Pattern, TrackerCell } from '@/types';
import { getColumnField, maxNoteColumns } from '@/lib/tracker/noteColumns';
import { parseSoundFactoryWithEffects } from './SoundFactoryParser';
import { SF_FX_ROW_OFFSET, SF_MAX_EFFECT_SLOTS } from './soundFactoryGrid';
import { sfEncodeEffects, sfNormalizeEffects } from './soundFactoryEffects';
import { soundFactoryOpcodeFor } from './soundFactoryPitch';
import type { InstrumentConfig } from '@/types';
import { sfInstrumentPatchStats, writeSfInstrParams } from './soundFactoryInstrumentParams';
import { tokenizeSoundFactory, writeSoundFactoryStream, type SfStreamEdit } from './soundFactoryStream';

const ROWS_PER_PATTERN = 64; // the parser's pattern length
const OP_PAUSE = 0x80;

const SLOT_TYP = ['effTyp', 'effTyp2', 'effTyp3', 'effTyp4', 'effTyp5', 'effTyp6', 'effTyp7', 'effTyp8'] as const;
const SLOT_VAL = ['eff', 'eff2', 'eff3', 'eff4', 'eff5', 'eff6', 'eff7', 'eff8'] as const;

/** Sentinel: how many times the writer ran (the reachability test reads it). */
export const sfWriterStats = { calls: 0, extraColumnWrites: 0 };

export interface SfEditResult {
  data: Uint8Array;
  /** Cell edits applied (note, effect list or delay changed). */
  patched: number;
  warnings: string[];
}

interface Fx { id: number; value: number; }

/** Effects of a cell without the delay slot, and the delay (ticks into the row). */
function cellEffects(cell: TrackerCell): { fx: Fx[]; delay: number } {
  const c = cell as unknown as Record<string, number | undefined>;
  const fx: Fx[] = [];
  let delay = 0;
  for (let k = 0; k < SF_MAX_EFFECT_SLOTS; k++) {
    const id = c[SLOT_TYP[k]] ?? 0, value = c[SLOT_VAL[k]] ?? 0;
    if (id === 0) continue;
    if (id === SF_FX_ROW_OFFSET) delay = value; else fx.push({ id, value });
  }
  return { fx, delay };
}

const same = (a: readonly Fx[], b: readonly Fx[]): boolean => a.length === b.length && a.every((x, i) => x.id === b[i].id && x.value === b[i].value);

/**
 * Patch each instrument's DefineInstr record from its metadata, in place and at constant length (no offset moves),
 * on a copy of `source`. The pitch fields are not writable (soundFactoryInstrumentParams.ts), so the grid's note
 * names are unchanged and the grid edits below still diff against a parse of the patched copy.
 */
function patchInstruments(source: Uint8Array, instruments: readonly InstrumentConfig[]): Uint8Array {
  const out = source.slice();
  for (const inst of instruments) {
    const meta = inst.metadata?.soundFactoryInstrument;
    if (!meta || meta.recordOffset < 0) continue;
    sfInstrumentPatchStats.records++;
    sfInstrumentPatchStats.bytes += writeSfInstrParams(out, meta.recordOffset, meta.params);
  }
  return out;
}

/** Write `edited` over the loaded .psf bytes `source`; `instruments` (optional) patch the instrument records. */
export function writeSoundFactory(sourceBytes: Uint8Array, edited: readonly Pattern[], instruments: readonly InstrumentConfig[] = []): SfEditResult {
  sfWriterStats.calls++;
  const source = instruments.length > 0 ? patchInstruments(sourceBytes, instruments) : sourceBytes;
  const warnings: string[] = [];
  const res: SfEditResult = { data: source, patched: 0, warnings };
  const parse = parseSoundFactoryWithEffects(source, 'edit.psf');
  const stream = tokenizeSoundFactory(source);
  if (!parse || !stream) { warnings.push('source is not a Sound Factory module; nothing written'); return res; }
  const { tokens, tokenAt } = stream;
  const edit: SfStreamEdit = { before: new Map(), dropped: new Set() };
  const bytes = tokens.map((t) => t.bytes.slice()); // working copies; written back below
  const at = (fileOffset: number): number => tokenAt[fileOffset - 276];
  const insert = (index: number, b: number[]): void => {
    if (b.length === 0) return;
    const list = edit.before.get(index) ?? [];
    list.push(Uint8Array.from(b));
    edit.before.set(index, list);
  };
  const duration = (i: number): number => (bytes[i][1] << 8) | bytes[i][2];
  const setDuration = (i: number, d: number): void => { bytes[i][1] = (d >> 8) & 255; bytes[i][2] = d & 255; };
  const base = parse.song.patterns;
  /** Set the note of the command token `tok` (its event opcode at `fileOffset`): pause <-> note, pitch from the recorded context. */
  const writeNote = (toks: Uint8Array[], tok: number, fileOffset: number, note: number, where: string): void => {
    const ctx = parse.eventContext.get(fileOffset);
    if (toks[tok][0] === 0x99) warnings.push(`${where}: a stop-and-pause command keeps its note`);
    else if (note === 0) toks[tok][0] = OP_PAUSE;
    else if (ctx) toks[tok][0] = soundFactoryOpcodeFor(ctx.pitch, note, ctx.transpose);
    else warnings.push(`${where}: no pitch context for this command; note not written`);
  };

  /** Move the onset of event `ai` (command token `anchor`) later by `d` ticks: the previous event's duration grows, its own shrinks. */
  const moveOnset = (c: number, ai: number, anchor: number, insertAt: number, d: number, shown: number, where: string): void => {
    const prev = ai > 0 ? parse.voiceEvents[c][ai - 1] : undefined;
    const prevTok = prev && prev.fileOffset >= 0 ? at(prev.fileOffset) : -1;
    if (prevTok >= 0 && duration(prevTok) + d >= 0 && duration(anchor) - d >= 0 && duration(prevTok) + d <= 0xffff) {
      setDuration(prevTok, duration(prevTok) + d);
      setDuration(anchor, duration(anchor) - d);
    } else if (ai === 0 && d > 0 && duration(anchor) - d >= 0) {
      insert(insertAt, [OP_PAUSE, (d >> 8) & 255, d & 255]);
      setDuration(anchor, duration(anchor) - d);
    } else {
      warnings.push(`${where}: delay ${shown} does not fit the neighbouring durations; not written`);
    }
  };

  edited.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
    const was = base[p]?.channels[c]?.rows[r];
    if (!was) return;
    const g = p * ROWS_PER_PATTERN + r;
    const where = `Ch${c + 1} row ${g}`;
    const a = cell as unknown as Record<string, number | undefined>;
    const b = was as unknown as Record<string, number | undefined>;
    const now = cellEffects(cell), old = cellEffects(was);
    const noteChanged = (a.note ?? 0) !== (b.note ?? 0);
    const fxChanged = !same(sfNormalizeEffects(now.fx), old.fx);
    const delayChanged = now.delay !== old.delay;
    if ((a.instrument ?? 0) !== (b.instrument ?? 0) || Array.from({ length: maxNoteColumns([cell, was]) - 1 }, (_, i) => i + 1).some((k) => (getColumnField(cell, k, 'instrument') ?? 0) !== (getColumnField(was, k, 'instrument') ?? 0))) {
      warnings.push(`${where}: instrument edits are not written`);
    }
    // Further note columns: the note opcode of the event each column's onset anchors to.
    for (let k = 1; k < maxNoteColumns([cell, was]); k++) {
      const nowNote = getColumnField(cell, k, 'note') ?? 0;
      const xNoteChanged = nowNote !== (getColumnField(was, k, 'note') ?? 0);
      const xDelay = getColumnField(cell, k, 'delay') ?? 0, xDelayWas = getColumnField(was, k, 'delay') ?? 0;
      if (!xNoteChanged && xDelay === xDelayWas) continue;
      const xi = parse.colAnchors[c]?.get(g)?.[k - 1] ?? -1;
      const xev = xi >= 0 ? parse.voiceEvents[c][xi] : undefined;
      const xTok = xev && xev.fileOffset >= 0 ? at(xev.fileOffset) : -1;
      if (!xev || xTok < 0) { warnings.push(`${where} note column ${k + 1}: no command to edit here; not written`); continue; }
      sfWriterStats.extraColumnWrites++;
      res.patched++;
      if (xNoteChanged) writeNote(bytes, xTok, xev.fileOffset, nowNote, where);
      if (xDelay !== xDelayWas) {
        const fx = [...new Set((xev.effects ?? []).map((f) => at(f.fileOffset)))].sort((x, y) => x - y);
        moveOnset(c, xi, xTok, fx.length > 0 ? fx[0] : xTok, xDelay - xDelayWas, xDelay, `${where} note column ${k + 1}`);
      }
    }
    if (!noteChanged && !fxChanged && !delayChanged) return;
    const ai = parse.anchors[c]?.[g] ?? -1;
    const ev = ai >= 0 ? parse.voiceEvents[c][ai] : undefined;
    const anchor = ev && ev.fileOffset >= 0 ? at(ev.fileOffset) : -1;
    if (!ev || anchor < 0) { warnings.push(`${where}: no command to edit here (outside the voice's stream); not written`); return; }
    res.patched++;

    // Effect tokens of this event: the tokens holding its effect operand bytes.
    const fxTokens = [...new Set((ev.effects ?? []).map((f) => at(f.fileOffset)))].sort((x, y) => x - y);
    const insertAt = fxTokens.length > 0 ? fxTokens[0] : anchor;

    if (delayChanged) moveOnset(c, ai, anchor, insertAt, now.delay - old.delay, now.delay, where);

    if (noteChanged) {
      writeNote(bytes, anchor, ev.fileOffset, a.note ?? 0, where);
    }

    if (fxChanged) {
      for (const i of fxTokens) edit.dropped.add(i);
      insert(insertAt, sfEncodeEffects(sfNormalizeEffects(now.fx), warnings, where));
    }
  })));

  bytes.forEach((nb, i) => { tokens[i] = { ...tokens[i], bytes: nb }; });
  res.data = writeSoundFactoryStream(source, stream, edit, warnings);
  return res;
}
