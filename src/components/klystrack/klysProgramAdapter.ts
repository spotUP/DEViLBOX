/**
 * Klystrack instrument program -> InstrumentTableEditor: the 32-word program as table rows, the columns, and the
 * cell-change handler. Every write goes through editKlysProgramStep (klysInstrumentEdit.ts, the one write path).
 *
 * A program word is `chain << 15 | instruction` (klysProgramCommands.ts), so the table shows the instruction in
 * `cmd` and the chain flag in its own column. Typing a command keeps the step's chain flag.
 */
import type { ColumnDef, FormatCell, OnCellChange } from '@/components/shared/format-editor-types';
import { KLYS_EMPTY_STEP, KLYS_PROGRAM_LENGTH } from '@/engine/klystrack/klysInstrumentFields';
import {
  describeKlysStep, klysStepHasChainBit, klysStepInstruction,
} from '@/engine/klystrack/klysProgramCommands';
import { editKlysProgramStep, readKlysInstrument } from './klysInstrumentEdit';

const hex4 = (v: number): string => (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');

/**
 * Columns of the program table. `meaning` is derived text (readOnly). NOTE: the pattern renderers draw hex cells
 * only (they ignore `formatter`), so a canvas shows `meaning` as the word's digits; show the description from
 * describeKlysStep in the DOM instead and leave this column out of the canvas.
 */
export function KLYS_PROGRAM_COLUMNS(baseNote: number): ColumnDef[] {
  return [
    {
      key: 'cmd', label: 'Command', charWidth: 4, type: 'hex', hexDigits: 4,
      color: 'var(--color-accent-primary)', emptyColor: 'var(--color-border-light)',
      emptyValue: KLYS_EMPTY_STEP, formatter: (word) => hex4(klysStepInstruction(word)),
    },
    {
      key: 'chain', label: 'Chain', charWidth: 1, type: 'ctrl', hexDigits: 1,
      color: 'var(--color-accent-secondary)', emptyColor: 'var(--color-border-light)',
      emptyValue: 0, formatter: (v) => (v ? '+' : '.'),
    },
    {
      key: 'meaning', label: 'Meaning', charWidth: 28, type: 'hex', hexDigits: 4, readOnly: true,
      color: 'var(--color-text-secondary)', emptyColor: 'var(--color-border-light)',
      emptyValue: KLYS_EMPTY_STEP, formatter: (word) => describeKlysStep(word, baseNote),
    },
  ];
}

/** The table's rows for a program: always 32, missing steps shown as NOP. */
export function klysProgramToRows(program: readonly number[]): FormatCell[] {
  const rows: FormatCell[] = [];
  for (let i = 0; i < KLYS_PROGRAM_LENGTH; i++) {
    const word = program[i] ?? KLYS_EMPTY_STEP;
    rows.push({
      cmd: klysStepInstruction(word),
      chain: klysStepHasChainBit(word) && (word & 0x8000) !== 0 ? 1 : 0,
      meaning: word,
    });
  }
  return rows;
}

/**
 * The word a table edit makes. `cmd` keeps the step's chain flag, `chain` sets or clears bit 15 (never in the
 * 0xFxxx group, where bit 15 is part of the instruction), the empty command is NOP, `meaning` changes nothing.
 */
export function klysWordAfterEdit(oldWord: number, columnKey: string, value: number): number {
  const chained = klysStepHasChainBit(oldWord) && (oldWord & 0x8000) !== 0;
  if (columnKey === 'cmd') {
    const instruction = value === KLYS_EMPTY_STEP ? KLYS_EMPTY_STEP : (klysStepHasChainBit(value) ? value & 0x7FFF : value & 0xFFFF);
    return chained && klysStepHasChainBit(instruction) ? instruction | 0x8000 : instruction;
  }
  if (columnKey === 'chain') {
    const instruction = klysStepInstruction(oldWord);
    return value !== 0 && klysStepHasChainBit(instruction) ? instruction | 0x8000 : instruction;
  }
  return oldWord;
}

/** Cell-change handler over a word getter and a writer; the pure core of klysProgramCellChange. */
export function makeKlysProgramCellChange(
  wordAt: (step: number) => number,
  write: (step: number, word: number) => void,
): OnCellChange {
  return (_channel, step, columnKey, value) => {
    if (columnKey !== 'cmd' && columnKey !== 'chain') return;
    const old = wordAt(step);
    const next = klysWordAfterEdit(old, columnKey, value);
    if (next !== old) write(step, next);
  };
}

/** The handler for instrument `index` of the loaded song: reads the pending instrument, writes through editKlysProgramStep. */
export function klysProgramCellChange(index: number): OnCellChange {
  return makeKlysProgramCellChange(
    // readKlysInstrument sees edits not yet written to the store, so a command and its chain flag typed in one frame agree.
    (step) => readKlysInstrument(index)?.program[step] ?? KLYS_EMPTY_STEP,
    (step, word) => editKlysProgramStep(index, step, word),
  );
}
