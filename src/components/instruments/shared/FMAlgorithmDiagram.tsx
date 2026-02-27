/**
 * FMAlgorithmDiagram - Interactive FM operator routing diagram
 *
 * Renders an SVG topology diagram for FM synthesis algorithms, showing:
 *  - Operator boxes (carriers in amber, modulators in blue, selected in emerald)
 *  - Modulation connection arrows with S-curve beziers for cross-row connections
 *  - Feedback arc (dashed pink) above OP4 when feedback > 0
 *  - Output bus: vertical collector line → green arrow for multi-carrier algorithms
 *
 * Supports 4-op (8 algorithms, OPN/OPM/OPL/OPZ) and 2-op (OPLL) chips.
 * Click any operator box to invoke onSelectOp (1-indexed).
 *
 * Usage:
 *   <FMAlgorithmDiagram algorithm={3} feedback={2} opCount={4} />
 *   <FMAlgorithmDiagram algorithm={0} feedback={0} opCount={4}
 *     selectedOp={activeOp} onSelectOp={setActiveOp} />
 */

import React from 'react';

// ─── Box geometry constants ──────────────────────────────────────────────────

const BW = 22;     // operator box width
const BH = 16;     // operator box height
const BW2 = BW / 2;
const BH2 = BH / 2;

// ─── Colors ──────────────────────────────────────────────────────────────────

const C_CARRIER   = '#f59e0b';  // amber   – carrier operators
const C_MOD       = '#3b5b8a';  // steel   – modulator operators
const C_MOD_RING  = '#60a5fa';  // blue-400
const C_SELECTED  = '#10b981';  // emerald – highlighted operator
const C_SEL_RING  = '#6ee7b7';  // emerald-300
const C_CONN      = '#64748b';  // slate-500 – modulation arrows
const C_FEEDBACK  = '#f472b6';  // pink-400 – self-feedback arc
const C_OUTPUT    = '#22c55e';  // green-500 – output bus/arrow

// ─── Public props ─────────────────────────────────────────────────────────────

export interface FMAlgorithmDiagramProps {
  /** Algorithm index (0-7 for 4-op; 0-1 for 2-op) */
  algorithm: number;
  /** Feedback amount 0-7; 0 = no feedback arc */
  feedback: number;
  /** Number of FM operators (default 4) */
  opCount?: 2 | 4;
  /** Currently highlighted operator, 1-indexed (null = none) */
  selectedOp?: number | null;
  /** Called when user clicks an operator box (1-indexed) */
  onSelectOp?: (op: number) => void;
  /** Carrier box fill color (theme accent) */
  accentColor?: string;
  className?: string;
}

// ─── Algorithm layout types ───────────────────────────────────────────────────

interface AlgDef {
  /** Center [cx, cy] per operator (1-indexed key) */
  pos: Record<number, [number, number]>;
  /** Modulation pairs [from, to] (1-indexed op numbers) */
  mods: [number, number][];
  /** Operator numbers that feed the output (1-indexed) */
  carriers: number[];
  /**
   * X coordinate of the output bus (multi-carrier algorithms).
   * Omit for single-carrier — output line goes directly from carrier.
   */
  busX?: number;
}

// ─── 4-op algorithm definitions ──────────────────────────────────────────────
//
// Viewing convention: OP4 is the first (leftmost) modulator; OP1 is the last
// carrier in serial chains.  Signal flows left-to-right.

const ALG_4OP: AlgDef[] = [
  // 0 ── Full serial:  4 → 3 → 2 → 1 → OUT
  {
    pos:  { 4:[22,41], 3:[62,41], 2:[102,41], 1:[145,41] },
    mods: [[4,3],[3,2],[2,1]],
    carriers: [1],
  },
  // 1 ── (4+3) → 2 → 1 → OUT
  {
    pos:  { 4:[22,25], 3:[22,57], 2:[82,41], 1:[148,41] },
    mods: [[4,2],[3,2],[2,1]],
    carriers: [1],
  },
  // 2 ── 4 → 3 → 1,  2 → 1 → OUT   (two modulators feed OP1)
  {
    pos:  { 4:[22,20], 3:[72,20], 2:[22,62], 1:[147,41] },
    mods: [[4,3],[3,1],[2,1]],
    carriers: [1],
  },
  // 3 ── 4 → 3 → 1,  2 → 3 → 1     (OP2 feeds OP3, not directly OP1)
  {
    pos:  { 4:[22,22], 3:[78,41], 2:[22,60], 1:[148,41] },
    mods: [[4,3],[2,3],[3,1]],
    carriers: [1],
  },
  // 4 ── (4 → 3) + (2 → 1) → OUT    (dual parallel chains)
  {
    pos:  { 4:[22,22], 3:[82,22], 2:[22,60], 1:[82,60] },
    mods: [[4,3],[2,1]],
    carriers: [3,1],
    busX: 148,
  },
  // 5 ── 4 → (3 + 2 + 1) → OUT      (OP4 fans out to all three carriers)
  {
    pos:  { 4:[20,41], 3:[97,15], 2:[97,41], 1:[97,67] },
    mods: [[4,3],[4,2],[4,1]],
    carriers: [3,2,1],
    busX: 153,
  },
  // 6 ── (4 → 3) + 2 + 1 → OUT      (OP2/OP1 free carriers)
  {
    pos:  { 4:[22,18], 3:[82,18], 2:[82,42], 1:[82,66] },
    mods: [[4,3]],
    carriers: [3,2,1],
    busX: 148,
  },
  // 7 ── Full parallel:  4 + 3 + 2 + 1 → OUT
  {
    pos:  { 4:[22,10], 3:[22,30], 2:[22,50], 1:[22,70] },
    mods: [],
    carriers: [4,3,2,1],
    busX: 90,
  },
];

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

// ─── SVG helpers ─────────────────────────────────────────────────────────────

/** S-curve cubic bezier path between two points (horizontal tangents at both ends) */
function curvePath(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y1 - y2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
}

/** Arrowhead pointing right, tip at (x, y) */
const ArrowRight: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <polygon points={`${x},${y} ${x - 5},${y - 3} ${x - 5},${y + 3}`} fill={color} />
);

// ─── Component ────────────────────────────────────────────────────────────────

export const FMAlgorithmDiagram: React.FC<FMAlgorithmDiagramProps> = ({
  algorithm,
  feedback,
  opCount = 4,
  selectedOp = null,
  onSelectOp,
  accentColor = C_CARRIER,
  className = '',
}) => {
  const algList  = opCount === 2 ? ALG_2OP : ALG_4OP;
  const alg      = algList[Math.max(0, Math.min(algorithm, algList.length - 1))];
  const opNumbers = opCount === 2 ? [2, 1] : [4, 3, 2, 1];

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

  return (
    <div
      className={`bg-dark-bg rounded border border-dark-border select-none ${className}`}
    >
      <svg
        viewBox="0 0 210 82"
        className="w-full"
        style={{ height: 72 }}
        overflow="visible"
      >
        {/* ── Modulation connection arrows ──────────────────────────────── */}
        {alg.mods.map(([from, to], i) => {
          const [fx, fy] = alg.pos[from];
          const [tx, ty] = alg.pos[to];
          const x1 = fx + BW2;  // right edge of source
          const x2 = tx - BW2;  // left edge of target
          return (
            <g key={i}>
              <path
                d={curvePath(x1, fy, x2, ty)}
                fill="none"
                stroke={C_CONN}
                strokeWidth={1}
              />
              <ArrowRight x={x2} y={ty} color={C_CONN} />
            </g>
          );
        })}

        {/* ── Self-feedback arc above OP4 ───────────────────────────────── */}
        {feedback > 0 && (() => {
          const op4 = opCount === 2 ? 2 : 4;
          const [cx, cy] = alg.pos[op4];
          return (
            <path
              d={`M ${cx + BW2} ${cy} Q ${cx} ${cy - 18} ${cx - BW2} ${cy}`}
              fill="none"
              stroke={C_FEEDBACK}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
          );
        })()}

        {/* ── Carrier → output (single) ─────────────────────────────────── */}
        {isSingle && (
          <g>
            <line
              x1={outSx} y1={outSy}
              x2={outArrowX - 4} y2={outSy}
              stroke={C_OUTPUT} strokeWidth={1.5}
            />
            <ArrowRight x={outArrowX} y={outSy} color={C_OUTPUT} />
          </g>
        )}

        {/* ── Carrier → output (multi-carrier bus) ─────────────────────── */}
        {!isSingle && alg.busX !== undefined && (
          <g>
            {/* Horizontal legs from each carrier to bus */}
            {alg.carriers.map(op => {
              const [cx, cy] = alg.pos[op];
              return (
                <line key={op}
                  x1={cx + BW2} y1={cy}
                  x2={alg.busX!} y2={cy}
                  stroke={C_OUTPUT} strokeWidth={1}
                />
              );
            })}
            {/* Vertical collector bus */}
            <line
              x1={alg.busX} y1={minCy}
              x2={alg.busX} y2={maxCy}
              stroke={C_OUTPUT} strokeWidth={1.5}
            />
            {/* Bus → output arrow */}
            <line
              x1={alg.busX} y1={midCy}
              x2={outArrowX - 4} y2={midCy}
              stroke={C_OUTPUT} strokeWidth={1.5}
            />
            <ArrowRight x={outArrowX} y={midCy} color={C_OUTPUT} />
          </g>
        )}

        {/* ── Operator boxes (rendered on top of arrows) ─────────────────── */}
        {opNumbers.map((opNum) => {
          const [cx, cy] = alg.pos[opNum];
          const isCarrier  = alg.carriers.includes(opNum);
          const isSelected = selectedOp === opNum;

          let fill   = isCarrier ? accentColor : C_MOD;
          let stroke = isCarrier ? '#fcd34d'   : C_MOD_RING;
          if (isSelected) { fill = C_SELECTED; stroke = C_SEL_RING; }

          return (
            <g
              key={opNum}
              style={{ cursor: onSelectOp ? 'pointer' : 'default' }}
              onClick={() => onSelectOp?.(opNum)}
            >
              <rect
                x={cx - BW2} y={cy - BH2}
                width={BW} height={BH}
                rx={2}
                fill={fill}
                stroke={stroke}
                strokeWidth={isSelected ? 1.5 : 1}
              />
              <text
                x={cx} y={cy + 4}
                textAnchor="middle"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
                fill={isCarrier || isSelected ? '#000' : '#e2e8f0'}
              >
                {opNum}
              </text>
            </g>
          );
        })}

        {/* ── OUT label ──────────────────────────────────────────────────── */}
        <text
          x={outArrowX + 3}
          y={outSy + 3}
          fontSize="7"
          fontFamily="monospace"
          fontWeight="bold"
          fill={C_OUTPUT}
        >
          OUT
        </text>

        {/* ── ALG / FB legend ────────────────────────────────────────────── */}
        <text
          x={105} y={80}
          textAnchor="middle"
          fontSize="7"
          fontFamily="monospace"
          fill="#475569"
        >
          ALG {algorithm} · FB {feedback}
        </text>
      </svg>
    </div>
  );
};
