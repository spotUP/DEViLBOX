/**
 * DeckScopes - Per-channel waveform oscilloscope display
 *
 * 4 small oscilloscope traces in a 2x2 grid with green phosphor color.
 * Currently renders placeholder static sine wave shapes using SVG paths.
 * Will be connected to actual audio analysis nodes in a later phase.
 */

import React from 'react';

interface DeckScopesProps {
  deckId: 'A' | 'B';
}

const SCOPE_WIDTH = 48;
const SCOPE_HEIGHT = 32;
const PHOSPHOR_COLOR = '#00ff44';
const PHOSPHOR_DIM = '#00aa2e';
const SCOPE_BG = '#0a0a12';
const SCOPE_BORDER = '#1a1a2e';
const NUM_CHANNELS = 4;

/** Generate an SVG polyline path for a sine wave with given frequency multiplier */
function generateSinePath(freqMultiplier: number, amplitude: number, phase: number): string {
  const points: string[] = [];
  const midY = SCOPE_HEIGHT / 2;
  const steps = 48;

  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * SCOPE_WIDTH;
    const t = (i / steps) * Math.PI * 2 * freqMultiplier + phase;
    const y = midY - Math.sin(t) * amplitude;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return points.join(' ');
}

// Pre-generate different wave shapes for visual variety
const WAVE_SHAPES = [
  generateSinePath(2, 10, 0),       // CH1: 2-cycle sine
  generateSinePath(3, 8, 0.5),      // CH2: 3-cycle sine, offset
  generateSinePath(1.5, 12, 1.0),   // CH3: 1.5-cycle sine, larger
  generateSinePath(4, 6, 0.25),     // CH4: 4-cycle sine, smaller
];

const ScopeTrace: React.FC<{ channelIndex: number }> = ({ channelIndex }) => {
  const label = `CH${channelIndex + 1}`;

  return (
    <div
      className="relative overflow-hidden rounded-sm"
      style={{
        width: SCOPE_WIDTH,
        height: SCOPE_HEIGHT,
        backgroundColor: SCOPE_BG,
        border: `1px solid ${SCOPE_BORDER}`,
      }}
    >
      {/* Horizontal center line (zero crossing reference) */}
      <svg
        width={SCOPE_WIDTH}
        height={SCOPE_HEIGHT}
        className="absolute inset-0"
        style={{ opacity: 0.2 }}
      >
        <line
          x1={0}
          y1={SCOPE_HEIGHT / 2}
          x2={SCOPE_WIDTH}
          y2={SCOPE_HEIGHT / 2}
          stroke={PHOSPHOR_DIM}
          strokeWidth={0.5}
          strokeDasharray="2,2"
        />
      </svg>

      {/* Waveform trace */}
      <svg
        width={SCOPE_WIDTH}
        height={SCOPE_HEIGHT}
        className="absolute inset-0"
      >
        {/* Glow layer */}
        <polyline
          points={WAVE_SHAPES[channelIndex]}
          fill="none"
          stroke={PHOSPHOR_COLOR}
          strokeWidth={2}
          opacity={0.3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Main trace */}
        <polyline
          points={WAVE_SHAPES[channelIndex]}
          fill="none"
          stroke={PHOSPHOR_COLOR}
          strokeWidth={1}
          opacity={0.9}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {/* Channel label */}
      <div
        className="absolute font-mono text-text-muted/50 select-none"
        style={{
          fontSize: 7,
          top: 1,
          left: 2,
          lineHeight: 1,
        }}
      >
        {label}
      </div>
    </div>
  );
};

export const DeckScopes: React.FC<DeckScopesProps> = ({ deckId: _deckId }) => {
  return (
    <div className="grid grid-cols-2 gap-1" style={{ width: SCOPE_WIDTH * 2 + 4 }}>
      {Array.from({ length: NUM_CHANNELS }, (_, i) => (
        <ScopeTrace key={i} channelIndex={i} />
      ))}
    </div>
  );
};
