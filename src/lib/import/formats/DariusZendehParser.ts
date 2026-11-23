/**
 * DariusZendehParser.ts - Darius Zendeh (.dz / DZ.*) editable grid.
 *
 * The replayer is 68k code inside the module; nuade finds its tables (nw_dz_layout, nuadeDzLayout.ts) and the grid
 * follows its row grammar (third-party/nuade/players/dariuszendeh/dariuszendeh.c, set_row / advance_row):
 *   - a song is a list of steps, one (pattern, transpose) byte pair per voice; pattern 0xff ends the list
 *   - a four voice song starts at the loop list, a two voice song at the start list and continues with the loop list
 *   - a voice's row is at pattern_base + pattern * record_size + row * 4 (cell: DariusZendehEncoder.ts)
 *   - every pattern has as many rows as pattern 0 has before its instrument byte 0xff
 *   - the voice plays period_table[note + transpose]; the grid shows that period through periodToNote
 *
 * The grid has one pattern per distinct step; a shared stored pattern is edited at every step that plays it.
 * Subsong 0 only. Playback stays on UADE; edits land in place in the module bytes.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { decodeDariusZendehCell, encodeDariusZendehCell } from '@/engine/uade/encoders/DariusZendehEncoder';
import { dzLayout } from '@/engine/nuade/nuadeDzLayout';
import { periodToNote } from '@/lib/amiga/periodNotes';

const END_MARK = 0xff;
const ROW_BYTES = 4;
const MAX_ROWS = 256;
const MAX_STEPS = 1024;
const SLIDE_BIT = 0x80;

const u16 = (b: Uint8Array, o: number) => (o + 1 < b.length ? (b[o] << 8) | b[o + 1] : 0);

type Step = Array<{ pattern: number; transpose: number }>;

export async function parseDariusZendehFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong | null> {
  const b = new Uint8Array(buffer);
  const layout = await dzLayout(b);
  const song = layout?.songs[0];
  if (!layout || !song || song.voices < 1) return null;
  const voices = song.voices;

  let rows = 0;
  while (rows < MAX_ROWS && song.patternBase + rows * ROW_BYTES < b.length && b[song.patternBase + rows * ROW_BYTES] !== END_MARK) rows++;
  if (rows === 0) return null;

  // The steps a list holds up to its end mark (the voice 0 pattern byte).
  const listSteps = (at: number): Step[] => {
    const steps: Step[] = [];
    for (let k = 0; k < MAX_STEPS; k++) {
      const o = at + k * voices * 2;
      if (o + voices * 2 > b.length || b[o] === END_MARK) break;
      steps.push(Array.from({ length: voices }, (_, v) => ({ pattern: b[o + 2 * v], transpose: b[o + 2 * v + 1] })));
    }
    return steps;
  };
  const intro = voices === 4 || song.startList === song.loopList ? [] : listSteps(song.startList);
  const loop = listSteps(song.loopList);
  const order = [...intro, ...loop];
  if (order.length === 0) return null;

  const keyOf = new Map<string, number>();
  const gridSteps: Step[] = [];
  const songPositions = order.map((step) => {
    const key = step.map((v) => `${v.pattern}:${v.transpose}`).join(',');
    let idx = keyOf.get(key);
    if (idx === undefined) { idx = gridSteps.length; keyOf.set(key, idx); gridSteps.push(step); }
    return idx;
  });

  const cellOffset = (pat: number, row: number, ch: number): number => {
    const v = gridSteps[pat]?.[ch];
    if (!v || row >= rows) return -1;
    const at = song.patternBase + v.pattern * song.recordSize + row * ROW_BYTES;
    return at + ROW_BYTES <= b.length ? at : -1;
  };
  // The grid note a stored note byte plays at this step; 0 for a slide (it starts from the last period).
  const playedNote = (pat: number, ch: number, note: number): number => {
    const v = gridSteps[pat]?.[ch];
    if (!v || (layout.slide && (note & SLIDE_BIT))) return 0;
    return periodToNote(u16(b, layout.periodTable + 2 * (note + v.transpose)));
  };

  const patterns: Pattern[] = gridSteps.map((_, pat) => ({
    id: `pattern-${pat}`,
    name: `Pattern ${pat}`,
    length: rows,
    channels: Array.from({ length: voices }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rows }, (_, row): TrackerCell => {
        const at = cellOffset(pat, row, ch);
        if (at < 0) return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        const cell = decodeDariusZendehCell(b.subarray(at, at + ROW_BYTES));
        return { ...cell, note: playedNote(pat, ch, b[at + 1]) };
      }),
    })),
  }));

  let instrumentCount = 0;
  for (const p of patterns) for (const c of p.channels) for (const r of c.rows) instrumentCount = Math.max(instrumentCount, r.instrument);
  const instruments: InstrumentConfig[] = Array.from({ length: instrumentCount }, (_, i) => ({
    id: i + 1,
    name: `Instrument ${i + 1}`,
    type: 'synth' as const,
    synthType: 'Synth' as const,
    effects: [],
    volume: 64,
    pan: 0,
  } as InstrumentConfig));

  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const moduleName = baseName.replace(/^dz\./i, '').replace(/\.dz$/i, '') || baseName;
  return {
    name: `${moduleName} [Darius Zendeh]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: intro.length,
    numChannels: voices,
    initialSpeed: 2, // a row every second tick
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'dariusZendeh',
      patternDataFileOffset: song.patternBase,
      bytesPerCell: ROW_BYTES,
      rowsPerPattern: rows,
      numChannels: voices,
      numPatterns: patterns.length,
      moduleSize: buffer.byteLength,
      encodeCell: encodeDariusZendehCell,
      encodeOverStored: true,
      decodeCell: decodeDariusZendehCell,
      getCellFileOffset: cellOffset,
      // A stored pattern plays at every step that names it, each with its own transpose.
      propagateSharedCells: true,
      // The note byte whose period (with the step transpose) is the grid note; null when the table has none.
      storeNote: (pat, _row, ch, gridNote) => {
        for (let note = 0; note < SLIDE_BIT; note++) if (playedNote(pat, ch, note) === gridNote) return { period: note };
        return null;
      },
      playedNote: (pat, _row, ch, stored) => playedNote(pat, ch, stored.period ?? 0) || null,
    } satisfies UADEPatternLayout,
  };
}
