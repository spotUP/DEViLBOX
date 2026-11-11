import { describe, it, expect } from 'vitest';
import {
  FM_FOUR_OPERATOR_ALGORITHMS,
  FM_FEEDBACK_OPERATOR,
  SSG_ENVELOPE_SHAPES,
  describeFmAlgorithm,
  fmAlgorithm,
  fmOperatorDisplayOrder,
  formatSignedValue,
  isFmCarrier,
} from '../fmOperatorModel';

/**
 * Furnace gui/insEdit.cpp `opIsOutput[8][4]`, indexed by display position
 * (operator 1 first). The editor used to hold the mirror of this table and called
 * operator 1 the carrier of the serial algorithms.
 */
const FURNACE_OP_IS_OUTPUT: boolean[][] = [
  [false, false, false, true],
  [false, false, false, true],
  [false, false, false, true],
  [false, false, false, true],
  [false, true, false, true],
  [false, true, true, true],
  [false, true, true, true],
  [true, true, true, true],
];

/**
 * Furnace engine/platform/fmsharedbase.h `isOutput[8][4]`, indexed by storage order
 * (its comment: "1 3 2 4").
 */
const FURNACE_IS_OUTPUT_STORAGE: boolean[][] = [
  [false, false, false, true],
  [false, false, false, true],
  [false, false, false, true],
  [false, false, false, true],
  [false, false, true, true],
  [false, true, true, true],
  [false, true, true, true],
  [true, true, true, true],
];

describe('fmOperatorModel', () => {
  it('marks carriers by displayed operator number as Furnace does', () => {
    for (let algorithm = 0; algorithm < 8; algorithm++) {
      for (let position = 0; position < 4; position++) {
        expect(isFmCarrier(algorithm, position + 1, 4), `algorithm ${algorithm} operator ${position + 1}`)
          .toBe(FURNACE_OP_IS_OUTPUT[algorithm][position]);
      }
    }
  });

  it('agrees with the engine carrier table once display order maps to storage order', () => {
    const order = fmOperatorDisplayOrder(4);
    expect(order).toEqual([0, 2, 1, 3]);
    for (let algorithm = 0; algorithm < 8; algorithm++) {
      order.forEach((storageIndex, position) => {
        expect(isFmCarrier(algorithm, position + 1, 4), `algorithm ${algorithm} storage ${storageIndex}`)
          .toBe(FURNACE_IS_OUTPUT_STORAGE[algorithm][storageIndex]);
      });
    }
  });

  it('never modulates from a higher operator into a lower one and never from a pure carrier chain end', () => {
    for (const algorithm of FM_FOUR_OPERATOR_ALGORITHMS) {
      for (const [from, to] of algorithm.modulations) {
        expect(from).toBeLessThan(to);
      }
      // Every operator either modulates another operator or is a carrier.
      for (let operator = 1; operator <= 4; operator++) {
        const modulates = algorithm.modulations.some(([from]) => from === operator);
        expect(modulates || algorithm.carriers.includes(operator)).toBe(true);
      }
    }
  });

  it('holds the Yamaha topologies for the algorithms the old diagram drew wrong', () => {
    expect(fmAlgorithm(2, 4).modulations).toEqual([[1, 4], [2, 3], [3, 4]]);
    expect(fmAlgorithm(3, 4).modulations).toEqual([[1, 2], [2, 4], [3, 4]]);
    expect(FM_FEEDBACK_OPERATOR).toBe(1);
  });

  it('treats operator 2 as the carrier of a two-operator chip', () => {
    expect(fmOperatorDisplayOrder(2)).toEqual([0, 1]);
    expect(isFmCarrier(0, 1, 2)).toBe(false);
    expect(isFmCarrier(0, 2, 2)).toBe(true);
    expect(isFmCarrier(1, 1, 2)).toBe(true);
  });

  it('clamps an out-of-range algorithm instead of returning nothing', () => {
    expect(fmAlgorithm(99, 4)).toBe(FM_FOUR_OPERATOR_ALGORITHMS[7]);
    expect(fmAlgorithm(-1, 4)).toBe(FM_FOUR_OPERATOR_ALGORITHMS[0]);
  });

  it('describes an algorithm in words', () => {
    expect(describeFmAlgorithm(0, 4)).toBe('1 carrier, 3 modulators');
    expect(describeFmAlgorithm(5, 4)).toBe('3 carriers, 1 modulator');
    expect(describeFmAlgorithm(7, 4)).toBe('4 carriers, no modulators');
  });

  it('lists off plus the eight SSG envelope shapes with unique register values', () => {
    expect(SSG_ENVELOPE_SHAPES.map(shape => shape.value)).toEqual([0, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(new Set(SSG_ENVELOPE_SHAPES.map(shape => shape.label)).size).toBe(SSG_ENVELOPE_SHAPES.length);
  });

  it('formats signed values', () => {
    expect(formatSignedValue(2)).toBe('+2');
    expect(formatSignedValue(0)).toBe('0');
    expect(formatSignedValue(-3)).toBe('-3');
  });
});
