/**
 * FilterCurve - Interactive visual filter frequency response
 * Drag to adjust cutoff (X) and resonance (Y)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'lowshelf' | 'highshelf' | 'peaking';

interface FilterCurveProps {
  cutoff: number; // 20-20000 Hz
  resonance: number; // 0-30 Q
  type: FilterType;
  onCutoffChange: (value: number) => void;
  onResonanceChange: (value: number) => void;
  width?: number;
  height?: number;
  color?: string;
}

export const FilterCurve: React.FC<FilterCurveProps> = ({
  cutoff,
  resonance,
  type,
  onCutoffChange,
  onResonanceChange,
  width = 280,
  height = 140,
  color = '#ff6b6b',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const padding = { top: 10, right: 10, bottom: 25, left: 35 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Logarithmic frequency scale (20Hz to 20kHz)
  const minFreq = 20;
  const maxFreq = 20000;
  const freqToX = (freq: number) => {
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const logFreq = Math.log10(Math.max(minFreq, Math.min(maxFreq, freq)));
    return padding.left + ((logFreq - logMin) / (logMax - logMin)) * graphWidth;
  };
  const xToFreq = (x: number) => {
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const normalized = (x - padding.left) / graphWidth;
    return Math.pow(10, logMin + normalized * (logMax - logMin));
  };

  // dB scale (-24 to +24 dB)
  const minDb = -24;
  const maxDb = 24;
  const dbToY = (db: number) => {
    const normalized = (db - minDb) / (maxDb - minDb);
    return padding.top + (1 - normalized) * graphHeight;
  };

  // Generate filter response curve
  const generateFilterPath = useCallback(() => {
    const points: string[] = [];
    const numPoints = 100;

    for (let i = 0; i <= numPoints; i++) {
      const x = padding.left + (i / numPoints) * graphWidth;
      const freq = xToFreq(x);

      // Calculate filter response (simplified approximation)
      let db = 0;
      const ratio = freq / cutoff;
      const Q = Math.max(0.5, resonance / 3); // Convert 0-30 to reasonable Q

      switch (type) {
        case 'lowpass': {
          // 12dB/octave lowpass with resonance peak
          const response = 1 / Math.sqrt(1 + Math.pow(ratio, 4));
          const peak = ratio > 0.7 && ratio < 1.3 ? (Q - 0.5) * 6 * Math.exp(-Math.pow((ratio - 1) * 3, 2)) : 0;
          db = 20 * Math.log10(response) + peak;
          break;
        }
        case 'highpass': {
          const response = Math.pow(ratio, 2) / Math.sqrt(1 + Math.pow(ratio, 4));
          const peak = ratio > 0.7 && ratio < 1.3 ? (Q - 0.5) * 6 * Math.exp(-Math.pow((ratio - 1) * 3, 2)) : 0;
          db = 20 * Math.log10(Math.max(0.001, response)) + peak;
          break;
        }
        case 'bandpass': {
          const bw = 1 / Q;
          const response = 1 / Math.sqrt(1 + Math.pow((ratio - 1 / ratio) / bw, 2));
          db = 20 * Math.log10(response);
          break;
        }
        case 'notch': {
          const bw = 1 / Q;
          const response = Math.abs(ratio - 1 / ratio) / Math.sqrt(Math.pow(ratio - 1 / ratio, 2) + bw * bw);
          db = 20 * Math.log10(Math.max(0.001, response));
          break;
        }
        default:
          db = 0;
      }

      // Clamp to display range
      db = Math.max(minDb, Math.min(maxDb, db));
      const y = dbToY(db);

      points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
    }

    return points.join(' ');
  }, [cutoff, resonance, type, graphWidth]);

  // Handle drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Update cutoff based on X position
    const newCutoff = Math.round(xToFreq(x));
    onCutoffChange(Math.max(20, Math.min(20000, newCutoff)));

    // Update resonance based on Y position (inverted)
    const normalizedY = 1 - (y - padding.top) / graphHeight;
    const newResonance = Math.round(normalizedY * 30);
    onResonanceChange(Math.max(0, Math.min(30, newResonance)));
  }, [isDragging, onCutoffChange, onResonanceChange, graphHeight]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Control point position
  const controlX = freqToX(cutoff);
  const controlY = padding.top + (1 - resonance / 30) * graphHeight;

  // Format frequency for display
  const formatFreq = (freq: number) => {
    if (freq >= 1000) return `${(freq / 1000).toFixed(1)}k`;
    return `${Math.round(freq)}`;
  };

  const filterPath = generateFilterPath();

  // Fill path
  const fillPath = `${filterPath} L ${width - padding.right} ${dbToY(minDb)} L ${padding.left} ${dbToY(minDb)} Z`;

  return (
    <div className="bg-[#1a1a1a] rounded-lg p-3 border border-gray-700">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className={`select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
      >
        {/* Grid */}
        <g stroke="#333" strokeWidth="1">
          {/* Horizontal grid (dB) */}
          {[-18, -12, -6, 0, 6, 12, 18].map((db) => (
            <g key={db}>
              <line
                x1={padding.left}
                y1={dbToY(db)}
                x2={width - padding.right}
                y2={dbToY(db)}
                strokeDasharray={db === 0 ? 'none' : '2,4'}
                opacity={db === 0 ? 0.6 : 0.3}
              />
              <text
                x={padding.left - 4}
                y={dbToY(db) + 3}
                textAnchor="end"
                fill="#555"
                fontSize="8"
                fontFamily="monospace"
              >
                {db > 0 ? `+${db}` : db}
              </text>
            </g>
          ))}

          {/* Vertical grid (frequency) */}
          {[100, 1000, 10000].map((freq) => (
            <g key={freq}>
              <line
                x1={freqToX(freq)}
                y1={padding.top}
                x2={freqToX(freq)}
                y2={height - padding.bottom}
                strokeDasharray="2,4"
                opacity={0.3}
              />
              <text
                x={freqToX(freq)}
                y={height - padding.bottom + 12}
                textAnchor="middle"
                fill="#555"
                fontSize="8"
                fontFamily="monospace"
              >
                {formatFreq(freq)}Hz
              </text>
            </g>
          ))}
        </g>

        {/* Fill under curve */}
        <path
          d={fillPath}
          fill={color}
          opacity={0.15}
        />

        {/* Filter response curve */}
        <path
          d={filterPath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />

        {/* Cutoff frequency line */}
        <line
          x1={controlX}
          y1={padding.top}
          x2={controlX}
          y2={height - padding.bottom}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4,4"
          opacity={0.5}
        />

        {/* Control point */}
        <g style={{ cursor: 'grab' }}>
          <circle
            cx={controlX}
            cy={controlY}
            r={10}
            fill={color}
            opacity={isDragging ? 0.4 : 0.2}
          />
          <circle
            cx={controlX}
            cy={controlY}
            r={6}
            fill={isDragging ? color : '#1a1a1a'}
            stroke={color}
            strokeWidth={2}
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </g>

        {/* Value display near control point */}
        <g>
          <text
            x={controlX}
            y={padding.top - 2}
            textAnchor="middle"
            fill={color}
            fontSize="10"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {formatFreq(cutoff)}Hz
          </text>
        </g>
      </svg>

      {/* Values display */}
      <div className="flex justify-between mt-2 text-xs font-mono">
        <div className="text-center">
          <div className="text-gray-500">CUTOFF</div>
          <div className="text-white">{formatFreq(cutoff)}Hz</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">RESO</div>
          <div className="text-white">{resonance}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">TYPE</div>
          <div className="text-white uppercase">{type}</div>
        </div>
      </div>
    </div>
  );
};
