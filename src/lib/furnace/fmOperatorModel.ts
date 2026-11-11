/**
 * FM operator model shared by the Furnace instrument editor and the algorithm diagram.
 *
 * Two orders exist for the four operators of an OPN / OPM class chip:
 *
 *  - storage order: the order of `FurnaceConfig.operators`, of the Furnace file and of
 *    the chip registers. Index 0, 1, 2, 3 hold Yamaha operators 1, 3, 2, 4.
 *  - display order: operators 1, 2, 3, 4 as the chip manual and Furnace's editor number
 *    them. Display position i shows storage index `FM_FOUR_OPERATOR_DISPLAY_ORDER[i]`
 *    (Furnace `opOrder` in gui/insEdit.cpp).
 *
 * Everything a person reads (operator numbers, carrier or modulator, the diagram) uses
 * display numbers 1-4. Operator 1 is the feedback operator and operator 4 is always a
 * carrier (Furnace `opIsOutput` in gui/insEdit.cpp, `isOutput` in
 * engine/platform/fmsharedbase.h).
 */

import type { FurnaceOperatorConfig } from '@typedefs/instrument';

export interface FmAlgorithm {
  /** Modulation pairs [from, to], displayed operator numbers. */
  modulations: ReadonlyArray<readonly [number, number]>;
  /** Displayed operator numbers that reach the output. */
  carriers: ReadonlyArray<number>;
}

/** The eight algorithms of the four-operator Yamaha chips (OPN, OPM, OPZ families). */
export const FM_FOUR_OPERATOR_ALGORITHMS: ReadonlyArray<FmAlgorithm> = [
  { modulations: [[1, 2], [2, 3], [3, 4]], carriers: [4] },
  { modulations: [[1, 3], [2, 3], [3, 4]], carriers: [4] },
  { modulations: [[1, 4], [2, 3], [3, 4]], carriers: [4] },
  { modulations: [[1, 2], [2, 4], [3, 4]], carriers: [4] },
  { modulations: [[1, 2], [3, 4]], carriers: [2, 4] },
  { modulations: [[1, 2], [1, 3], [1, 4]], carriers: [2, 3, 4] },
  { modulations: [[1, 2]], carriers: [2, 3, 4] },
  { modulations: [], carriers: [1, 2, 3, 4] },
];

/** The two connections of a two-operator chip: operator 1 modulates 2, or both sound. */
export const FM_TWO_OPERATOR_ALGORITHMS: ReadonlyArray<FmAlgorithm> = [
  { modulations: [[1, 2]], carriers: [2] },
  { modulations: [], carriers: [1, 2] },
];

/** Displayed operator number that carries the self-feedback loop. */
export const FM_FEEDBACK_OPERATOR = 1;

/** Storage index shown at each display position of a four-operator chip. */
export const FM_FOUR_OPERATOR_DISPLAY_ORDER: ReadonlyArray<number> = [0, 2, 1, 3];

/** Storage indices in the order the operators are displayed (operator 1 first). */
export function fmOperatorDisplayOrder(operatorCount: number): number[] {
  if (operatorCount === 4) return [...FM_FOUR_OPERATOR_DISPLAY_ORDER];
  return Array.from({ length: operatorCount }, (_, index) => index);
}

/** The algorithm table entry for a chip with this many operators, index clamped into range. */
export function fmAlgorithm(algorithm: number, operatorCount: number): FmAlgorithm {
  const table = operatorCount === 2 ? FM_TWO_OPERATOR_ALGORITHMS : FM_FOUR_OPERATOR_ALGORITHMS;
  const index = Math.max(0, Math.min(table.length - 1, Math.round(algorithm)));
  return table[index];
}

/** Storage indices of the operators that reach the output (derived from the algorithm table and the display order). */
export function fmCarrierStorageIndices(algorithm: number, operatorCount: number): number[] {
  const order = fmOperatorDisplayOrder(operatorCount);
  return fmAlgorithm(algorithm, operatorCount).carriers.map((operatorNumber) => order[operatorNumber - 1]).sort((a, b) => a - b);
}

/**
 * Operator data written as the chip manual numbers it (operator 1, 2, 3, 4) in storage order
 * (operator 1, 3, 2, 4). Four-operator lists swap entries 1 and 2; other lengths pass through.
 */
export function fmOperatorsFromManualOrder<T>(operators: ReadonlyArray<T>): T[] {
  const stored = [...operators];
  if (stored.length !== 4) return stored;
  const order = FM_FOUR_OPERATOR_DISPLAY_ORDER; // the swap is its own inverse
  return order.map((index) => stored[index]);
}

/** How many algorithms a chip with this many operators has. */
export function fmAlgorithmCount(operatorCount: number): number {
  return (operatorCount === 2 ? FM_TWO_OPERATOR_ALGORITHMS : FM_FOUR_OPERATOR_ALGORITHMS).length;
}

/** Whether the operator with this displayed number (1-based) reaches the output. */
export function isFmCarrier(algorithm: number, operatorNumber: number, operatorCount: number): boolean {
  return fmAlgorithm(algorithm, operatorCount).carriers.includes(operatorNumber);
}

/** One line for the algorithm, e.g. "1 carrier, 3 modulators". */
export function describeFmAlgorithm(algorithm: number, operatorCount: number): string {
  const carriers = fmAlgorithm(algorithm, operatorCount).carriers.length;
  const modulators = operatorCount - carriers;
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return modulators === 0
    ? `${count(carriers, 'carrier')}, no modulators`
    : `${count(carriers, 'carrier')}, ${count(modulators, 'modulator')}`;
}

export type FmOperatorParameter = Exclude<keyof FurnaceOperatorConfig, 'enabled'>;

/** Full English name of every operator parameter. */
export const FM_OPERATOR_PARAMETER_LABELS: Record<FmOperatorParameter, string> = {
  tl: 'Total Level',
  mult: 'Multiplier',
  dt: 'Detune',
  dt2: 'Coarse Detune',
  ar: 'Attack Rate',
  dr: 'Decay Rate',
  sl: 'Sustain Level',
  d2r: 'Sustain Rate',
  rr: 'Release Rate',
  rs: 'Rate Scaling',
  ksl: 'Key Scale Level',
  ws: 'Waveform',
  am: 'Amplitude Modulation',
  vib: 'Vibrato',
  sus: 'Sustain',
  ksr: 'Key Scale Rate',
  ssg: 'SSG Envelope',
  dam: 'Amplitude Depth',
  dvb: 'Vibrato Depth',
  egt: 'Fixed Frequency',
  kvs: 'Velocity Sensitivity',
};

export interface SsgEnvelopeShape {
  /** Register value: 0 is off, 8-15 are the eight shapes (bit 3 enables). */
  value: number;
  label: string;
}

/**
 * SSG envelope generator shapes of the OPN family. Bits: 4 = attack (inverted start),
 * 2 = alternate, 1 = hold.
 */
export const SSG_ENVELOPE_SHAPES: ReadonlyArray<SsgEnvelopeShape> = [
  { value: 0, label: 'Off' },
  { value: 8, label: 'Repeating Fall' },
  { value: 9, label: 'Fall, Hold Low' },
  { value: 10, label: 'Fall and Rise, Repeating' },
  { value: 11, label: 'Fall, Hold High' },
  { value: 12, label: 'Repeating Rise' },
  { value: 13, label: 'Rise, Hold High' },
  { value: 14, label: 'Rise and Fall, Repeating' },
  { value: 15, label: 'Rise, Hold Low' },
];

/** Signed display for detune values: "+2", "0", "-1". */
export function formatSignedValue(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}
