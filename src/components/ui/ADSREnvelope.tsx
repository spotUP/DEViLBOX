/**
 * ADSREnvelope - Interactive visual ADSR envelope editor
 * Drag control points to adjust attack, decay, sustain, release
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

interface ADSREnvelopeProps {
  attack: number; // ms
  decay: number; // ms
  sustain: number; // 0-100
  release: number; // ms
  onChange: (param: 'attack' | 'decay' | 'sustain' | 'release', value: number) => void;
  height?: number;
  color?: string;
}

export const ADSREnvelope: React.FC<ADSREnvelopeProps> = ({
  attack,
  decay,
  sustain,
  release,
  onChange,
  height = 120,
  color = '#00ff88',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<'attack' | 'decay' | 'sustain' | 'release' | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [width, setWidth] = useState(280);

  // ResizeObserver for dynamic width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width - 24; // Account for padding
        if (newWidth > 0) {
          setWidth(newWidth);
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Padding and dimensions
  const padding = { top: 10, right: 10, bottom: 25, left: 10 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Calculate proportional widths to always fill the graph
  // Each stage gets a proportion of the total width based on its time value
  const totalTime = attack + decay + release;
  const sustainProportion = 0.15; // Sustain gets 15% of width
  const timeProportion = 1 - sustainProportion; // Remaining 85% for A, D, R

  // Calculate widths for each stage
  const attackWidth = totalTime > 0 ? (attack / totalTime) * graphWidth * timeProportion : graphWidth * 0.25;
  const decayWidth = totalTime > 0 ? (decay / totalTime) * graphWidth * timeProportion : graphWidth * 0.25;
  const sustainWidth = graphWidth * sustainProportion;
  const releaseWidth = totalTime > 0 ? (release / totalTime) * graphWidth * timeProportion : graphWidth * 0.25;

  const levelToY = (level: number) => graphHeight - (level / 100) * graphHeight;

  // Control points - always fill the full width
  const attackX = padding.left + attackWidth;
  const attackY = padding.top; // Attack goes to top (100%)

  const decayX = attackX + decayWidth;
  const decayY = padding.top + levelToY(sustain);

  const sustainEndX = decayX + sustainWidth;
  const sustainY = decayY;

  const releaseX = padding.left + graphWidth; // Always at the right edge
  const releaseY = padding.top + graphHeight; // Release goes to bottom (0%)

  // Build the envelope path
  const envelopePath = `
    M ${padding.left} ${padding.top + graphHeight}
    L ${attackX} ${attackY}
    L ${decayX} ${decayY}
    L ${sustainEndX} ${sustainY}
    L ${releaseX} ${releaseY}
  `;

  // Fill path (closed)
  const fillPath = `
    ${envelopePath}
    L ${releaseX} ${padding.top + graphHeight}
    L ${padding.left} ${padding.top + graphHeight}
    Z
  `;

  // Handle drag start
  const handleMouseDown = useCallback((point: typeof dragging) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(point);
  }, []);

  // Max time values for each parameter
  const maxAttack = 2000;
  const maxDecay = 3000;
  const maxRelease = 5000;

  // Handle drag
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - padding.left;
    const y = e.clientY - rect.top - padding.top;

    // Calculate position as proportion of available width (excluding sustain)
    const availableWidth = graphWidth * timeProportion;

    switch (dragging) {
      case 'attack': {
        // Attack: position determines proportion of time budget
        const proportion = Math.max(0.01, Math.min(0.9, x / availableWidth));
        const time = Math.round(proportion * maxAttack);
        onChange('attack', Math.max(1, time));
        break;
      }
      case 'decay': {
        // Decay: relative to attack end position
        const relativeX = x - attackWidth;
        const proportion = Math.max(0.01, Math.min(0.9, relativeX / availableWidth));
        const time = Math.round(proportion * maxDecay);
        onChange('decay', Math.max(1, time));
        break;
      }
      case 'sustain': {
        // Sustain: vertical movement controls level
        const level = Math.max(0, Math.min(100, 100 - (y / graphHeight) * 100));
        onChange('sustain', Math.round(level));
        break;
      }
      case 'release': {
        // Release: relative position from sustain end to right edge
        const relativeX = x - attackWidth - decayWidth - sustainWidth;
        const remainingWidth = graphWidth - attackWidth - decayWidth - sustainWidth;
        const proportion = Math.max(0.01, Math.min(1, relativeX / remainingWidth));
        const time = Math.round(proportion * maxRelease);
        onChange('release', Math.max(1, time));
        break;
      }
    }
  }, [dragging, attack, decay, onChange, graphWidth, graphHeight, attackWidth, decayWidth, sustainWidth, timeProportion]);

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Add global listeners when dragging
  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Format time for display
  const formatTime = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

  // Control point component
  const ControlPoint: React.FC<{
    x: number;
    y: number;
    id: typeof dragging;
    label: string;
  }> = ({ x, y, id, label }) => (
    <g
      onMouseDown={handleMouseDown(id)}
      onMouseEnter={() => setHovered(id)}
      onMouseLeave={() => setHovered(null)}
      style={{ cursor: 'grab' }}
    >
      {/* Larger hit area */}
      <circle cx={x} cy={y} r={12} fill="transparent" />
      {/* Glow effect */}
      <circle
        cx={x}
        cy={y}
        r={8}
        fill={color}
        opacity={hovered === id || dragging === id ? 0.3 : 0}
        style={{ transition: 'opacity 0.15s' }}
      />
      {/* Main point */}
      <circle
        cx={x}
        cy={y}
        r={6}
        fill={dragging === id ? color : '#1a1a1a'}
        stroke={color}
        strokeWidth={2}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
      {/* Label on hover */}
      {(hovered === id || dragging === id) && (
        <text
          x={x}
          y={y - 14}
          textAnchor="middle"
          fill={color}
          fontSize="10"
          fontFamily="monospace"
          fontWeight="bold"
        >
          {label}
        </text>
      )}
    </g>
  );

  return (
    <div ref={containerRef} className="bg-[#1a1a1a] rounded-lg p-3 border border-gray-700 w-full">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="select-none w-full"
      >
        {/* Grid lines */}
        <g stroke="#333" strokeWidth="1">
          {/* Horizontal grid */}
          {[0, 25, 50, 75, 100].map((level) => (
            <line
              key={level}
              x1={padding.left}
              y1={padding.top + levelToY(level)}
              x2={width - padding.right}
              y2={padding.top + levelToY(level)}
              strokeDasharray={level === 0 || level === 100 ? 'none' : '2,4'}
              opacity={level === 0 || level === 100 ? 0.5 : 0.3}
            />
          ))}
        </g>

        {/* Filled area under envelope */}
        <path
          d={fillPath}
          fill={color}
          opacity={0.1}
        />

        {/* Envelope line */}
        <path
          d={envelopePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />

        {/* Stage labels */}
        <g fontSize="9" fill="#666" fontFamily="monospace">
          <text x={padding.left + attackWidth / 2} y={height - 5} textAnchor="middle">A</text>
          <text x={attackX + decayWidth / 2} y={height - 5} textAnchor="middle">D</text>
          <text x={decayX + sustainWidth / 2} y={height - 5} textAnchor="middle">S</text>
          <text x={sustainEndX + releaseWidth / 2} y={height - 5} textAnchor="middle">R</text>
        </g>

        {/* Control points */}
        <ControlPoint x={attackX} y={attackY} id="attack" label={formatTime(attack)} />
        <ControlPoint x={decayX} y={decayY} id="decay" label={formatTime(decay)} />
        <ControlPoint x={sustainEndX} y={sustainY} id="sustain" label={`${sustain}%`} />
        <ControlPoint x={releaseX} y={releaseY} id="release" label={formatTime(release)} />
      </svg>

      {/* Values display */}
      <div className="flex justify-between mt-2 text-xs font-mono">
        <div className="text-center">
          <div className="text-gray-500">ATK</div>
          <div className="text-white">{formatTime(attack)}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">DEC</div>
          <div className="text-white">{formatTime(decay)}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">SUS</div>
          <div className="text-white">{sustain}%</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">REL</div>
          <div className="text-white">{formatTime(release)}</div>
        </div>
      </div>
    </div>
  );
};
