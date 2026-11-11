/**
 * FMAlgorithmDiagram - Interactive FM operator routing diagram
 *
 * Renders an SVG topology diagram for FM synthesis algorithms, showing:
 *  - Operator boxes (carriers filled with the primary accent, modulators outlined,
 *    the selected operator ringed with the highlight accent)
 *  - Modulation connection arrows with S-curve beziers for cross-row connections
 *  - Feedback loop (dashed) above the feedback operator when feedback > 0
 *  - Output bus: vertical collector line and arrow for multi-carrier algorithms
 *
 * Four-operator chips (8 algorithms, OPN/OPM/OPZ) take their topology from
 * `@lib/furnace/fmOperatorModel`: operators are numbered 1-4 as on the chip, operator 1
 * carries the feedback loop and operator 4 is always a carrier. Signal flows left to
 * right.
 *
 * The two-operator layout keeps its own numbering (box 2 modulates box 1); callers
 * that number the modulator 1 pass `opLabels`.
 *
 * Colours come from the theme through `currentColor` and token text classes.
 *
 * Usage:
 *   <FMAlgorithmDiagram algorithm={3} feedback={2} opCount={4} />
 *   <FMAlgorithmDiagram algorithm={0} feedback={0} opCount={4}
 *     selectedOp={activeOp} onSelectOp={setActiveOp} />
 *   <FMAlgorithmDiagram algorithm={5} feedback={0} compact />
 */

import React from 'react';
import { FM_FEEDBACK_OPERATOR, FM_FOUR_OPERATOR_ALGORITHMS } from '@lib/furnace/fmOperatorModel';

// ─── Box geometry constants ──────────────────────────────────────────────────

const BW = 22;     // operator box width
const BH = 16;     // operator box height
const BW2 = BW / 2;
const BH2 = BH / 2;

// ─── Public props ─────────────────────────────────────────────────────────────

export interface FMAlgorithmDiagramProps {
  /** Algorithm index (0-7 for 4-op; 0-1 for 2-op) */
  algorithm: number;
  /** Feedback amount 0-7; 0 = no feedback loop */
  feedback: number;
  /** Number of FM operators (default 4) */
  opCount?: 2 | 4;
  /** Currently highlighted operator, 1-indexed (null = none) */
  selectedOp?: number | null;
  /** Called when user clicks an operator box (1-indexed) */
  onSelectOp?: (op: number) => void;
  /** Carrier box fill colour override; default is the theme's primary accent. */
  accentColor?: string;
  /** Text drawn in an operator box instead of its number (the OPL convention numbers the modulator 1 and the carrier 2). */
  opLabels?: Partial<Record<number, string>>;
  /** Thumbnail mode: no frame, no output caption. */
  compact?: boolean;
  /** Rendered height in pixels (default 72, compact 40). */
  height?: number;
  className?: string;
}

// ─── Algorithm layout types ───────────────────────────────────────────────────

interface AlgDef {
  /** Center [cx, cy] per operator (1-indexed key) */
  pos: Record<number, [number, number]>;
  /** Modulation pairs [from, to] (1-indexed op numbers) */
  mods: ReadonlyArray<readonly [number, number]>;
  /** Operator numbers that feed the output (1-indexed) */
  carriers: ReadonlyArray<number>;
  /**
   * X coordinate of the output bus (multi-carrier algorithms).
   * Omit for single-carrier — output line goes directly from carrier.
   */
  busX?: number;
}

// ─── 4-op layouts ────────────────────────────────────────────────────────────
//
// Only the geometry lives here; which operator modulates which, and which reach
// the output, come from the shared model.

interface FourOperatorLayout {
  pos: Record<number, [number, number]>;
  busX?: number;
}

const LAYOUT_4OP: FourOperatorLayout[] = [
  // 0 ── 1 → 2 → 3 → 4 → OUT
  { pos: { 1: [22, 41], 2: [62, 41], 3: [102, 41], 4: [145, 41] } },
  // 1 ── (1 + 2) → 3 → 4 → OUT
  { pos: { 1: [22, 25], 2: [22, 57], 3: [82, 41], 4: [148, 41] } },
  // 2 ── 1 → 4,  2 → 3 → 4 → OUT
  { pos: { 1: [22, 20], 2: [22, 62], 3: [82, 62], 4: [147, 41] } },
  // 3 ── 1 → 2 → 4,  3 → 4 → OUT
  { pos: { 1: [22, 20], 2: [82, 20], 3: [22, 62], 4: [147, 41] } },
  // 4 ── (1 → 2) + (3 → 4) → OUT
  { pos: { 1: [22, 22], 2: [82, 22], 3: [22, 60], 4: [82, 60] }, busX: 148 },
  // 5 ── 1 → (2 + 3 + 4) → OUT
  { pos: { 1: [20, 41], 2: [97, 15], 3: [97, 41], 4: [97, 67] }, busX: 153 },
  // 6 ── (1 → 2) + 3 + 4 → OUT
  { pos: { 1: [22, 18], 2: [82, 18], 3: [82, 42], 4: [82, 66] }, busX: 148 },
  // 7 ── 1 + 2 + 3 + 4 → OUT
  { pos: { 1: [22, 14], 2: [22, 32], 3: [22, 50], 4: [22, 68] }, busX: 90 },
];

const ALG_4OP: AlgDef[] = LAYOUT_4OP.map((layout, index) => ({
  pos: layout.pos,
  busX: layout.busX,
  mods: FM_FOUR_OPERATOR_ALGORITHMS[index].modulations,
  carriers: FM_FOUR_OPERATOR_ALGORITHMS[index].carriers,
}));

// ─── 2-op algorithm definitions ──────────────────────────────────────────────

const ALG_2OP: AlgDef[] = [
  // 0 ── Serial:  2 → 1 → OUT
  {
    pos:  { 2:[40,41], 1:[100,41] },
    mods: [[2,1]],
    carriers: [1],
  },
  // 1 ── Additive: 2 + 1 → OUT
  {
    pos:  { 2:[40,24], 1:[40,58] },
    mods: [],
    carriers: [2,1],
    busX: 106,
  },
];

/** Box number of the feedback operator in the two-operator layout (the modulator). */
const FEEDBACK_BOX_2OP = 2;

// ─── SVG helpers ─────────────────────────────────────────────────────────────

/** S-curve cubic bezier path between two points (horizontal tangents at both ends) */
function curvePath(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y1 - y2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
}

/** Arrowhead pointing right, tip at (x, y); filled with the current colour. */
const ArrowRight: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <polygon points={`${x},${y} ${x - 5},${y - 3} ${x - 5},${y + 3}`} fill="currentColor" />
);

// ─── Component ────────────────────────────────────────────────────────────────

export const FMAlgorithmDiagram: React.FC<FMAlgorithmDiagramProps> = ({
  algorithm,
  feedback,
  opCount = 4,
  selectedOp = null,
  onSelectOp,
  accentColor,
  opLabels,
  compact = false,
  height,
  className = '',
}) => {
  const algList  = opCount === 2 ? ALG_2OP : ALG_4OP;
  const alg      = algList[Math.max(0, Math.min(Math.round(algorithm), algList.length - 1))];
  const opNumbers = opCount === 2 ? [2, 1] : [1, 2, 3, 4];
  const feedbackBox = opCount === 2 ? FEEDBACK_BOX_2OP : FM_FEEDBACK_OPERATOR;

  // ── Carrier statistics ───────────────────────────────────────────────────
  const carrierCys  = alg.carriers.map(op => alg.pos[op][1]);
  const minCy       = Math.min(...carrierCys);
  const maxCy       = Math.max(...carrierCys);
  const midCy       = (minCy + maxCy) / 2;
  const isSingle    = alg.carriers.length === 1;

  // Where the output arrow starts
  const outSx = isSingle
    ? alg.pos[alg.carriers[0]][0] + BW2   // right edge of single carrier
    : (alg.busX ?? 160);                   // bus x for multi-carrier
  const outSy = isSingle ? alg.pos[alg.carriers[0]][1] : midCy;
  const outArrowX = 195;

  const frame = compact ? '' : 'bg-dark-bg rounded border border-dark-border';

  return (
    <div className={`${frame} select-none ${className}`}>
      <svg
        viewBox="0 0 210 82"
        className="w-full block"
        style={{ height: height ?? (compact ? 40 : 72) }}
        overflow="visible"
        role="img"
        aria-label={`Algorithm ${algorithm}`}
      >
        {/* ── Modulation connection arrows ──────────────────────────────── */}
        <g className="text-text-muted">
          {alg.mods.map(([from, to], i) => {
            const [fx, fy] = alg.pos[from];
            const [tx, ty] = alg.pos[to];
            const x1 = fx + BW2;  // right edge of source
            const x2 = tx - BW2;  // left edge of target
            return (
              <g key={i}>
                <path
                  d={curvePath(x1, fy, x2 - 4, ty)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.25}
                />
                <ArrowRight x={x2} y={ty} />
              </g>
            );
          })}
        </g>

        {/* ── Self-feedback loop above the feedback operator ────────────── */}
        {feedback > 0 && (() => {
          const [cx, cy] = alg.pos[feedbackBox];
          const top = cy - BH2;
          return (
            <g className="text-accent-secondary">
              <path
                d={`M ${cx + 6} ${top} C ${cx + 10} ${top - 8} ${cx - 10} ${top - 8} ${cx - 6} ${top}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.25}
                strokeDasharray="2,2"
              />
              <polygon
                points={`${cx - 6},${top} ${cx - 9.5},${top - 3.5} ${cx - 4},${top - 4.5}`}
                fill="currentColor"
              />
            </g>
          );
        })()}

        {/* ── Carrier → output ──────────────────────────────────────────── */}
        <g className="text-accent-success">
          {isSingle && (
            <>
              <line
                x1={outSx} y1={outSy}
                x2={outArrowX - 4} y2={outSy}
                stroke="currentColor" strokeWidth={1.5}
              />
              <ArrowRight x={outArrowX} y={outSy} />
            </>
          )}

          {!isSingle && alg.busX !== undefined && (
            <>
              {/* Horizontal legs from each carrier to bus */}
              {alg.carriers.map(op => {
                const [cx, cy] = alg.pos[op];
                return (
                  <line key={op}
                    x1={cx + BW2} y1={cy}
                    x2={alg.busX} y2={cy}
                    stroke="currentColor" strokeWidth={1}
                  />
                );
              })}
              {/* Vertical collector bus */}
              <line
                x1={alg.busX} y1={minCy}
                x2={alg.busX} y2={maxCy}
                stroke="currentColor" strokeWidth={1.5}
              />
              {/* Bus → output arrow */}
              <line
                x1={alg.busX} y1={midCy}
                x2={outArrowX - 4} y2={midCy}
                stroke="currentColor" strokeWidth={1.5}
              />
              <ArrowRight x={outArrowX} y={midCy} />
            </>
          )}

          {!compact && (
            <text
              x={outArrowX + 3}
              y={outSy + 3}
              fontSize="7"
              fontWeight="bold"
              fill="currentColor"
            >
              OUT
            </text>
          )}
        </g>

        {/* ── Operator boxes (rendered on top of arrows) ─────────────────── */}
        {opNumbers.map((opNum) => {
          const [cx, cy] = alg.pos[opNum];
          const isCarrier  = alg.carriers.includes(opNum);
          const isSelected = selectedOp === opNum;

          return (
            <g
              key={opNum}
              style={{ cursor: onSelectOp ? 'pointer' : 'default' }}
              onClick={onSelectOp ? () => onSelectOp(opNum) : undefined}
            >
              <rect
                className={isCarrier ? 'text-accent-primary' : 'text-text-secondary'}
                style={isCarrier && accentColor ? { color: accentColor } : undefined}
                x={cx - BW2} y={cy - BH2}
                width={BW} height={BH}
                rx={2}
                fill="currentColor"
                fillOpacity={isCarrier ? 1 : 0.18}
                stroke="currentColor"
                strokeWidth={1}
              />
              {isSelected && (
                <rect
                  className="text-accent-highlight"
                  x={cx - BW2 - 2} y={cy - BH2 - 2}
                  width={BW + 4} height={BH + 4}
                  rx={3}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                />
              )}
              <text
                className={isCarrier ? 'text-text-inverse' : 'text-text-primary'}
                x={cx} y={cy + 3.5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fill="currentColor"
              >
                {opLabels?.[opNum] ?? opNum}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
