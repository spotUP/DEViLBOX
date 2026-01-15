/**
 * EnvelopeEditor - Visual ADSR envelope editor
 */

import React from 'react';
import { Activity } from 'lucide-react';
import type { EnvelopeConfig } from '../../types/instrument';
import { DEFAULT_ENVELOPE } from '../../types/instrument';

interface EnvelopeEditorProps {
  config?: EnvelopeConfig;
  onChange: (config: EnvelopeConfig) => void;
}

export const EnvelopeEditor: React.FC<EnvelopeEditorProps> = ({ config, onChange }) => {
  const envelope = config || DEFAULT_ENVELOPE;

  const handleEnvelopeChange = (param: keyof typeof envelope, value: number) => {
    onChange({ ...envelope, [param]: value });
  };

  // Calculate visual envelope path
  const generateEnvelopePath = () => {
    const width = 300;
    const height = 120;
    const padding = 10;

    // Normalize values for visualization
    const attackTime = (envelope.attack / 2000) * (width * 0.25);
    const decayTime = (envelope.decay / 2000) * (width * 0.25);
    const sustainLevel = ((100 - envelope.sustain) / 100) * (height - padding * 2);
    const releaseTime = (envelope.release / 5000) * (width * 0.3);

    const points = [
      { x: padding, y: height - padding }, // Start
      { x: padding + attackTime, y: padding }, // Attack peak
      { x: padding + attackTime + decayTime, y: padding + sustainLevel }, // Sustain level
      { x: padding + attackTime + decayTime + (width * 0.2), y: padding + sustainLevel }, // Sustain hold
      { x: padding + attackTime + decayTime + (width * 0.2) + releaseTime, y: height - padding }, // Release
    ];

    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };

  return (
    <div className="bg-dark-bgSecondary rounded-lg p-4 space-y-4">
      {/* Title */}
      <div className="flex items-center gap-2 text-sm font-bold text-accent-primary">
        <Activity size={16} />
        <span>ADSR ENVELOPE</span>
      </div>

      {/* Visual Envelope Display */}
      <div className="bg-dark-bgTertiary rounded-lg border border-dark-border p-4">
        <svg
          width="100%"
          viewBox="0 0 300 120"
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines */}
          <line x1="10" y1="60" x2="290" y2="60" stroke="#2a2a2f" strokeWidth="1" strokeDasharray="4 2" />
          <line x1="150" y1="10" x2="150" y2="110" stroke="#2a2a2f" strokeWidth="1" strokeDasharray="4 2" />

          {/* Envelope path */}
          <path
            d={generateEnvelopePath()}
            stroke="#00d4aa"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Area fill */}
          <path
            d={`${generateEnvelopePath()} L 290 110 L 10 110 Z`}
            fill="#00d4aa"
            fillOpacity="0.15"
          />

          {/* Labels */}
          <text x="40" y="105" fontSize="10" fill="#606068" fontFamily="monospace">A</text>
          <text x="100" y="105" fontSize="10" fill="#606068" fontFamily="monospace">D</text>
          <text x="160" y="105" fontSize="10" fill="#606068" fontFamily="monospace">S</text>
          <text x="230" y="105" fontSize="10" fill="#606068" fontFamily="monospace">R</text>
        </svg>
      </div>

      {/* Attack Slider */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-accent-primary">ATTACK</span>
          <span className="text-sm font-mono bg-dark-bgTertiary px-2 py-1 rounded-md border border-dark-border text-accent-primary">
            {envelope.attack} ms
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="2000"
          step="10"
          value={envelope.attack}
          onChange={(e) => handleEnvelopeChange('attack', parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-text-muted font-mono">
          <span>0ms</span>
          <span>2s</span>
        </div>
      </div>

      {/* Decay Slider */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-accent-primary">DECAY</span>
          <span className="text-sm font-mono bg-dark-bgTertiary px-2 py-1 rounded-md border border-dark-border text-accent-primary">
            {envelope.decay} ms
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="2000"
          step="10"
          value={envelope.decay}
          onChange={(e) => handleEnvelopeChange('decay', parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-text-muted font-mono">
          <span>0ms</span>
          <span>2s</span>
        </div>
      </div>

      {/* Sustain Slider */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-accent-primary">SUSTAIN</span>
          <span className="text-sm font-mono bg-dark-bgTertiary px-2 py-1 rounded-md border border-dark-border text-accent-primary">
            {envelope.sustain}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={envelope.sustain}
          onChange={(e) => handleEnvelopeChange('sustain', parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-text-muted font-mono">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Release Slider */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-accent-primary">RELEASE</span>
          <span className="text-sm font-mono bg-dark-bgTertiary px-2 py-1 rounded-md border border-dark-border text-accent-primary">
            {envelope.release} ms
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="5000"
          step="50"
          value={envelope.release}
          onChange={(e) => handleEnvelopeChange('release', parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-text-muted font-mono">
          <span>0ms</span>
          <span>5s</span>
        </div>
      </div>

      {/* Info */}
      <div className="text-xs text-text-muted bg-dark-bgTertiary p-3 rounded-md border border-dark-border">
        ADSR controls the volume envelope over time: Attack (rise), Decay (fall), Sustain (hold level), Release (fade out)
      </div>
    </div>
  );
};
