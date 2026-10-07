/**
 * maGridEdits.ts - write the Music Assembler grid's edits back into the module's tracks.
 *
 * The grid is the player's walk (maWalk.ts, maGrid.ts): each note is drawn on the row its track event ran
 * and the grid builder records which event that is (cellSources). An edited cell is a byte patch of that
 * event, never a re-pack, so the module keeps its length and every other byte:
 *   - note: the event's note byte (6 bits), the value whose table index - note + the position's transpose
 *     + the instrument's wave rate for a sampled wave, at most 47 - is the typed note's;
 *   - instrument: the instrument byte of an instrument+note event (6 bits; the note byte is then recomputed
 *     for the new instrument's wave rate and wave kind, so the typed note keeps its pitch).
 * A track event is shared by every row that replays its track (every position that names it, every repeat),
 * so the edit shows wherever the track plays. Edits that need a longer event (a note on a blank row, a
 * removed note, a note-off, an instrument on a note event that carries none) come back as warnings, never as
 * a half-edit.
 */
import type { Pattern } from '@/types';
import { loadMaModule, type MaModuleData } from './maModule';
import { walkMusicAssembler } from './maWalk';
import { buildMaGridFromWalk } from './maGrid';

export interface MaEditResult { data: Uint8Array; patched: number; warnings: string[] }

/** The 6-bit note byte whose table index (with `transpose` and the wave rate of `instr`) is `tableIndex`, or -1. */
function noteByteFor(m: MaModuleData, instr: number, transpose: number, synth: boolean, tableIndex: number): number {
  const ins = m.instruments[instr];
  const rate = synth || !ins ? 0 : ins.keyWaveRate;
  for (let x = 0; x < 64; x++) {
    const idx = (((x + transpose) & 0xff) + rate) & 0xff;
    if ((idx >= 48 ? 47 : idx) === tableIndex) return x;
  }
  return -1;
}

/** Whether the voice's wave is a synthesis wave: data of 128 words or less. */
function isSynthWave(m: MaModuleData, instr: number): boolean {
  const ins = m.instruments[instr];
  const sample = ins && ins.sampleNumber < m.samples.length ? m.samples[ins.sampleNumber] : null;
  return sample !== null && sample.dataOffset >= 0 && sample.lengthWords <= 128;
}

export function applyMaGridEdits(source: Uint8Array, edited: Pattern[]): MaEditResult {
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  const m = loadMaModule(source);
  const walk = m ? walkMusicAssembler(m, 0) : null;
  if (!m || !walk || walk.stop === 'ended') return { data: out, patched: 0, warnings: [`the module has no matched grid to write edits into (${walk?.endReason ?? 'no walk'})`] };
  const grid = buildMaGridFromWalk(walk, m);
  const wanted = new Map<number, { value: number; why: string }>();
  const want = (off: number, value: number, why: string): void => {
    const prev = wanted.get(off);
    if (prev && prev.value !== value) { warnings.push(`${why}: conflicts with ${prev.why} on the same byte, kept the first`); return; }
    wanted.set(off, { value: value & 0xff, why });
  };

  for (let p = 0; p < edited.length; p++) {
    const bp = grid.patterns[p];
    if (!bp) { warnings.push(`pattern ${p} is past the end of the module's song; not written`); continue; }
    for (let ch = 0; ch < bp.channels.length; ch++) {
      const eRows = edited[p].channels[ch]?.rows;
      if (!eRows) continue;
      for (let row = 0; row < bp.length; row++) {
        const b = bp.channels[ch].rows[row];
        const c = eRows[row];
        if (!c) continue;
        const dNote = (c.note ?? 0) !== (b.note ?? 0);
        const dIns = (c.instrument ?? 0) !== (b.instrument ?? 0);
        if (!dNote && !dIns) continue;
        const where = `pattern ${p} voice ${ch + 1} row ${row}`;
        const src = grid.cellSources[p][ch][row];
        if (!src) {
          if ((c.note ?? 0) !== 0) warnings.push(`${where}: a note where the module has no note event needs a longer track; not written`);
          continue;
        }
        const track = m.tracks[src.track];
        const eventOff = m.tracksStartOffset + m.trackOffsetTable[src.track] + src.trackOffset;
        const b0 = track ? track[src.trackOffset] : 0;
        const hasInstrumentByte = (b0 & 0xc0) === 0xc0;
        const noteOff = hasInstrumentByte ? eventOff + 1 : eventOff;
        const noteByte = (track ? track[hasInstrumentByte ? src.trackOffset + 1 : src.trackOffset] : 0) & 0xff;

        let instr = src.instr;
        let synth = src.synth;
        if (dIns) {
          const idx = (c.instrument ?? 0) - 1;
          if (!hasInstrumentByte) { warnings.push(`${where}: a note event carries no instrument; not written`); continue; }
          if (idx < 0 || idx > 63 || idx >= m.instruments.length) { warnings.push(`${where}: instrument ${c.instrument ?? 0} is out of range; not written`); continue; }
          want(eventOff, (b0 & 0xc0) | idx, `${where} instrument`);
          instr = idx;
          synth = isSynthWave(m, idx);
        }
        const shown = c.note ?? 0;
        if (dNote && (shown < 1 || shown > 48)) { warnings.push(`${where}: ${shown === 0 ? 'a removed note needs a shorter track' : 'a note-off is a release event, which has no note byte to patch'}; not written`); continue; }
        // the note (the typed one, or the unchanged one when only the instrument moved) keeps its pitch under the new instrument
        const wantNote = dNote ? shown : (b.note ?? 0);
        if (wantNote >= 1 && wantNote <= 48) {
          const x = noteByteFor(m, instr, src.transpose, synth, wantNote - 1);
          if (x < 0) warnings.push(`${where}: no note byte plays note ${wantNote} here; not written`);
          else want(noteOff, (noteByte & 0xc0) | x, `${where} note`);
        }
      }
    }
  }
  let patched = 0;
  for (const [off, { value }] of wanted) if (out[off] !== value) { out[off] = value; patched++; }
  return { data: out, patched, warnings };
}
