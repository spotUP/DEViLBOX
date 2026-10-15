/**
 * Dx7AlgorithmDiagram - the routing of one of the DX7's 32 six-operator algorithms, drawn from the OPS algorithm ROM
 * (dx7Algorithm walks the ROM, so the carriers and the arrows are the chip's, not a hand-copied chart).
 * Carriers amber, modulators blue, feedback as a dashed arc, same palette and conventions as FMAlgorithmDiagram (which
 * draws the 2- and 4-operator chips). Signal flows left to right.
 */
import React from 'react';
import { dx7Algorithm } from '../curves/dx7CurveModels';
import { layoutOperators, type PlacedOperator } from '../curves/dx7AlgorithmLayout';

const BW = 24;
const BH = 16;
const COL = 38;
const ROW = 24;
const C_CARRIER = '#f59e0b';
const C_CARRIER_RING = '#fcd34d';
const C_MOD = '#3b5b8a';
const C_MOD_RING = '#60a5fa';
const C_CONN = '#64748b';
const C_FEEDBACK = '#f472b6';
const C_OUTPUT = '#22c55e';

export interface Dx7AlgorithmDiagramProps {
  /** Algorithm index 0..31 (displayed as 1..32). */
  algorithm: number;
  /** Feedback 0..7; 0 draws no arc. */
  feedback: number;
  className?: string;
}

export const Dx7AlgorithmDiagram: React.FC<Dx7AlgorithmDiagramProps> = ({ algorithm, feedback, className = '' }) => {
  const topo = dx7Algorithm(algorithm);
  const placed = layoutOperators(algorithm);
  const maxCol = Math.max(...placed.map((p) => p.col));
  const maxRows = Math.max(...Array.from({ length: maxCol + 1 }, (_, c) => placed.filter((p) => p.col === c).length));
  const pos = (p: PlacedOperator): [number, number] => {
    const inCol = placed.filter((q) => q.col === p.col).length;
    const top = ((maxRows - inCol) * ROW) / 2;
    return [BW / 2 + 6 + p.col * COL, BH / 2 + 4 + top + p.row * ROW];
  };
  const at = new Map(placed.map((p) => [p.opNum, pos(p)] as const));
  const width = BW + 12 + maxCol * COL + 34;
  const height = BH + 8 + (maxRows - 1) * ROW + 12;
  const outX = width - 22;

  return (
    <div className={`bg-dark-bg rounded border border-dark-border select-none ${className}`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: Math.min(96, height * 0.9) }} overflow="visible">
        {Object.entries(topo.modulators).flatMap(([toStr, froms]) => froms.filter((f) => f !== Number(toStr)).map((from) => {
          const [fx, fy] = at.get(from)!; const [tx, ty] = at.get(Number(toStr))!;
          const x1 = fx + BW / 2; const x2 = tx - BW / 2; const mx = (x1 + x2) / 2;
          const back = x2 <= x1;
          return (
            <path key={`${from}-${toStr}`} fill="none" stroke={C_CONN} strokeWidth={1}
              d={back ? `M ${fx} ${fy - BH / 2} C ${fx} ${fy - BH} ${tx} ${ty - BH} ${tx} ${ty - BH / 2}` : `M ${x1} ${fy} C ${mx} ${fy} ${mx} ${ty} ${x2} ${ty}`} />
          );
        }))}
        {topo.feedbackOp !== null && feedback > 0 && (() => {
          const [cx, cy] = at.get(topo.feedbackOp)!;
          return <path d={`M ${cx + BW / 2} ${cy} Q ${cx} ${cy - 20} ${cx - BW / 2} ${cy}`} fill="none" stroke={C_FEEDBACK} strokeWidth={1} strokeDasharray="2,2" />;
        })()}
        {topo.carriers.map((op) => {
          const [cx, cy] = at.get(op)!;
          return <line key={`out-${op}`} x1={cx + BW / 2} y1={cy} x2={outX} y2={cy} stroke={C_OUTPUT} strokeWidth={1} />;
        })}
        {topo.carriers.length > 1 && (() => {
          const ys = topo.carriers.map((op) => at.get(op)![1]);
          return <line x1={outX} y1={Math.min(...ys)} x2={outX} y2={Math.max(...ys)} stroke={C_OUTPUT} strokeWidth={1.5} />;
        })()}
        <text x={outX + 3} y={height / 2 + 2} fontSize="7" fontFamily="monospace" fontWeight="bold" fill={C_OUTPUT}>OUT</text>
        {placed.map((p) => {
          const [cx, cy] = at.get(p.opNum)!;
          const carrier = topo.carriers.includes(p.opNum);
          return (
            <g key={p.opNum}>
              <rect x={cx - BW / 2} y={cy - BH / 2} width={BW} height={BH} rx={2} fill={carrier ? C_CARRIER : C_MOD} stroke={carrier ? C_CARRIER_RING : C_MOD_RING} strokeWidth={1} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fontFamily="monospace" fontWeight="bold" fill={carrier ? '#000' : '#e2e8f0'}>{p.opNum}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
