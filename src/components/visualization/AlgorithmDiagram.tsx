/**
 * AlgorithmDiagram - FM Algorithm routing visualization
 *
 * Visualizes FM operator connections and routing for FM synthesizers.
 * Shows which operators are carriers (output) vs modulators (modifying others).
 * Based on Furnace's drawAlgorithm pattern.
 */

import React from 'react';

export interface AlgorithmDiagramProps {
  /** Algorithm number (0-15 for 4-op FM) */
  algorithm: number;
  /** Feedback amount (0-7) */
  feedback?: number;
  /** Number of operators (2 or 4) */
  opCount?: 2 | 4;
  /** Width of the diagram */
  width?: number;
  /** Height of the diagram */
  height?: number;
  /** Carrier color */
  carrierColor?: string;
  /** Modulator color */
  modulatorColor?: string;
  /** Connection line color */
  lineColor?: string;
  /** Show operator labels */
  showLabels?: boolean;
  /** Custom className */
  className?: string;
}

// 4-operator FM algorithm definitions (OPN/OPM style)
// Format: { connections: [[from, to], ...], carriers: [op numbers that output] }
const ALGORITHMS_4OP = [
  // Alg 0: 4→3→2→1→out (serial chain)
  { connections: [[4, 3], [3, 2], [2, 1]], carriers: [1] },
  // Alg 1: (4+3)→2→1→out
  { connections: [[4, 2], [3, 2], [2, 1]], carriers: [1] },
  // Alg 2: 4→(3+2)→1→out
  { connections: [[4, 3], [3, 1], [2, 1]], carriers: [1] },
  // Alg 3: (4→3+2)→1→out
  { connections: [[4, 3], [3, 1], [2, 1]], carriers: [1] },
  // Alg 4: (4→3)+(2→1)→out (two parallel chains)
  { connections: [[4, 3], [2, 1]], carriers: [3, 1] },
  // Alg 5: 4→(3+2+1)→out (one modulates three)
  { connections: [[4, 3], [4, 2], [4, 1]], carriers: [3, 2, 1] },
  // Alg 6: (4→3)+2+1→out
  { connections: [[4, 3]], carriers: [3, 2, 1] },
  // Alg 7: 4+3+2+1→out (all parallel, additive)
  { connections: [], carriers: [4, 3, 2, 1] },
  // Alg 8-15 are variations (OPZ/ESFM specific)
  { connections: [[4, 3], [4, 2], [3, 1]], carriers: [2, 1] },
  { connections: [[4, 3], [4, 2], [2, 1]], carriers: [3, 1] },
  { connections: [[4, 2], [3, 2], [3, 1]], carriers: [2, 1] },
  { connections: [[4, 3], [3, 2], [3, 1]], carriers: [2, 1] },
  { connections: [[4, 3], [2, 1]], carriers: [3, 2, 1] },
  { connections: [[4, 3], [4, 1]], carriers: [3, 2, 1] },
  { connections: [[4, 2]], carriers: [3, 2, 1] },
  { connections: [[4, 1]], carriers: [4, 3, 2, 1] },
];

// 2-operator FM algorithms (OPLL style)
const ALGORITHMS_2OP = [
  // Alg 0: 2→1→out (serial)
  { connections: [[2, 1]], carriers: [1] },
  // Alg 1: 2+1→out (parallel)
  { connections: [], carriers: [2, 1] },
];

export const AlgorithmDiagram: React.FC<AlgorithmDiagramProps> = ({
  algorithm,
  feedback = 0,
  opCount = 4,
  width = 120,
  height = 50,
  carrierColor = '#22c55e',
  modulatorColor = '#6366f1',
  lineColor = '#64748b',
  showLabels = true,
  className = '',
}) => {
  const algorithms = opCount === 4 ? ALGORITHMS_4OP : ALGORITHMS_2OP;
  const alg = algorithms[Math.min(algorithm, algorithms.length - 1)] || algorithms[0];

  const ops = opCount === 4 ? [4, 3, 2, 1] : [2, 1];
  const opSpacing = width / (opCount + 1);
  const opY = height * 0.4;
  const opRadius = Math.min(12, width / (opCount * 2));
  const outputY = height * 0.85;

  return (
    <div className={`bg-slate-900 rounded border border-gray-700 ${className}`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        {/* Connection lines */}
        {alg.connections.map(([from, to], idx) => {
          const fromIdx = ops.indexOf(from);
          const toIdx = ops.indexOf(to);
          if (fromIdx === -1 || toIdx === -1) return null;

          const x1 = opSpacing * (fromIdx + 1);
          const x2 = opSpacing * (toIdx + 1);

          // Draw curved connection
          const midY = opY - opRadius - 8;

          return (
            <g key={`conn-${idx}`}>
              <path
                d={`M ${x1} ${opY - opRadius} Q ${(x1 + x2) / 2} ${midY} ${x2} ${opY - opRadius}`}
                fill="none"
                stroke={lineColor}
                strokeWidth="1.5"
                markerEnd="url(#arrowhead)"
              />
            </g>
          );
        })}

        {/* Output lines from carriers */}
        {alg.carriers.map((op) => {
          const opIdx = ops.indexOf(op);
          if (opIdx === -1) return null;
          const x = opSpacing * (opIdx + 1);

          return (
            <line
              key={`out-${op}`}
              x1={x}
              y1={opY + opRadius}
              x2={x}
              y2={outputY - 4}
              stroke={carrierColor}
              strokeWidth="1.5"
            />
          );
        })}

        {/* Output bar */}
        <rect
          x={opSpacing * 0.5}
          y={outputY - 2}
          width={width - opSpacing}
          height={4}
          rx={2}
          fill={carrierColor}
          opacity={0.7}
        />

        {/* Feedback indicator (if enabled) */}
        {feedback > 0 && (
          <g>
            <path
              d={`M ${opSpacing + opRadius} ${opY - opRadius - 2}
                  Q ${opSpacing + opRadius + 10} ${opY - opRadius - 12}
                  ${opSpacing} ${opY - opRadius - 2}`}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1"
              strokeDasharray="2,2"
              markerEnd="url(#arrowhead-fb)"
            />
            <text
              x={opSpacing + opRadius + 12}
              y={opY - opRadius - 8}
              fill="#f59e0b"
              fontSize="7"
              fontWeight="bold"
            >
              FB
            </text>
          </g>
        )}

        {/* Operator circles */}
        {ops.map((op, idx) => {
          const x = opSpacing * (idx + 1);
          const isCarrier = alg.carriers.includes(op);
          const color = isCarrier ? carrierColor : modulatorColor;

          return (
            <g key={`op-${op}`}>
              {/* Outer glow for carriers */}
              {isCarrier && (
                <circle
                  cx={x}
                  cy={opY}
                  r={opRadius + 2}
                  fill="none"
                  stroke={color}
                  strokeWidth="1"
                  opacity={0.3}
                />
              )}
              {/* Operator circle */}
              <circle
                cx={x}
                cy={opY}
                r={opRadius}
                fill={`${color}30`}
                stroke={color}
                strokeWidth="2"
              />
              {/* Operator label */}
              {showLabels && (
                <text
                  x={x}
                  y={opY + 4}
                  textAnchor="middle"
                  fill={color}
                  fontSize="10"
                  fontWeight="bold"
                >
                  {op}
                </text>
              )}
            </g>
          );
        })}

        {/* Arrow marker definitions */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="6"
            markerHeight="6"
            refX="3"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 6 3, 0 6" fill={lineColor} />
          </marker>
          <marker
            id="arrowhead-fb"
            markerWidth="4"
            markerHeight="4"
            refX="2"
            refY="2"
            orient="auto"
          >
            <polygon points="0 0, 4 2, 0 4" fill="#f59e0b" />
          </marker>
        </defs>
      </svg>
    </div>
  );
};

export default AlgorithmDiagram;
