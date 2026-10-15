/**
 * dx7AlgorithmLayout.ts - where each operator of a DX7 algorithm sits in the routing diagram: column = the longest chain of
 * modulators feeding it (feedback loops ignored), row = order inside the column. Pure, so the layout is tested.
 */
import { dx7Algorithm } from './dx7CurveModels';

export interface PlacedOperator { opNum: number; col: number; row: number }

/** Column = longest chain of modulators feeding the operator (feedback loops ignored); row = order inside the column. */
export function layoutOperators(algorithm: number): PlacedOperator[] {
  const topo = dx7Algorithm(algorithm);
  const depth = new Map<number, number>();
  const visiting = new Set<number>();
  const depthOf = (op: number): number => {
    const known = depth.get(op);
    if (known !== undefined) return known;
    if (visiting.has(op)) return 0; // a loop through several operators: cut it here
    visiting.add(op);
    let d = 0;
    for (const m of topo.modulators[op] ?? []) if (m !== op) d = Math.max(d, depthOf(m) + 1);
    visiting.delete(op);
    depth.set(op, d);
    return d;
  };
  const byCol = new Map<number, number[]>();
  for (let op = 6; op >= 1; op--) { const c = depthOf(op); byCol.set(c, [...(byCol.get(c) ?? []), op]); }
  const placed: PlacedOperator[] = [];
  for (const [col, ops] of byCol) ops.forEach((opNum, row) => placed.push({ opNum, col, row }));
  return placed;
}
