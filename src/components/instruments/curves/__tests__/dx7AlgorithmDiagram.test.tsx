/**
 * The DX7 algorithm diagram is drawn from the OPS ROM walk: every algorithm places all six operators, the arrows run left
 * to right (loops through several operators are the algorithms' own feedback), and the amber boxes are the carriers.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Dx7AlgorithmDiagram } from '../../shared/Dx7AlgorithmDiagram';
import { layoutOperators } from '../dx7AlgorithmLayout';
import { dx7Algorithm } from '../dx7CurveModels';

afterEach(cleanup);

describe('layoutOperators', () => {
  it('places OP1..OP6 exactly once in every one of the 32 algorithms', () => {
    for (let a = 0; a < 32; a++) {
      const placed = layoutOperators(a);
      expect(placed.map((p) => p.opNum).sort(), `algorithm ${a + 1}`).toEqual([1, 2, 3, 4, 5, 6]);
      const cells = new Set(placed.map((p) => `${p.col}:${p.row}`));
      expect(cells.size).toBe(6);
    }
  });

  it('every modulation arrow runs rightwards, except the loops the algorithm closes through feedback', () => {
    let withLoop = 0;
    for (let a = 0; a < 32; a++) {
      const placed = layoutOperators(a); const topo = dx7Algorithm(a);
      const col = new Map(placed.map((p) => [p.opNum, p.col]));
      let back = 0;
      for (const [to, froms] of Object.entries(topo.modulators)) for (const from of froms) if (from !== Number(to) && col.get(from)! >= col.get(Number(to))!) back++;
      if (back > 0) withLoop++;
      expect(back, `algorithm ${a + 1} has ${back} backward arrows`).toBeLessThanOrEqual(2);
    }
    // a handful of algorithms feed an operator back through a chain (algorithms 4 and 6 in the DX7 chart)
    expect(withLoop).toBeLessThanOrEqual(6);
  });
});

describe('Dx7AlgorithmDiagram', () => {
  it.each([[0], [4], [31]])('algorithm %i: one amber box per carrier', (a) => {
    const { container } = render(<Dx7AlgorithmDiagram algorithm={a} feedback={3} />);
    const rects = Array.from(container.querySelectorAll('rect'));
    expect(rects).toHaveLength(6);
    expect(rects.filter((r) => r.getAttribute('fill') === '#f59e0b')).toHaveLength(dx7Algorithm(a).carriers.length);
  });
  it('draws the feedback arc only with feedback > 0', () => {
    const arcs = (fb: number) => { const { container } = render(<Dx7AlgorithmDiagram algorithm={0} feedback={fb} />); const n = container.querySelectorAll('path[stroke-dasharray]').length; cleanup(); return n; };
    expect(arcs(0)).toBe(0);
    expect(arcs(5)).toBe(1);
  });
});
