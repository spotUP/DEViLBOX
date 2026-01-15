/**
 * TB303Editor - Dedicated editor panel for TB-303 parameters
 * Authentic TB-303 controls: Tuning, Cutoff, Resonance, Env Mod, Decay, Accent
 * Devil Fish Mod: Extended controls based on Robin Whittle's TB-303 modifications
 */

import React, { useState } from 'react';
import type { TB303Config, DevilFishConfig } from '@typedefs/instrument';
import { DEFAULT_DEVIL_FISH } from '@typedefs/instrument';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface TB303EditorProps {
  config: TB303Config;
  onChange: (config: Partial<TB303Config>) => void;
  tuning?: number; // Current tuning in cents (-1200 to +1200)
  onTuningChange?: (cents: number) => void;
}

export const TB303Editor: React.FC<TB303EditorProps> = ({
  config,
  onChange,
  tuning = 0,
  onTuningChange
}) => {
  // Devil Fish section collapse state - expanded when enabled
  const devilFish = config.devilFish ?? DEFAULT_DEVIL_FISH;
  const [devilFishExpanded, setDevilFishExpanded] = useState(devilFish.enabled);

  const handleOscillatorChange = (type: 'sawtooth' | 'square') => {
    onChange({ oscillator: { type } });
  };

  const handleTuningChange = (cents: number) => {
    if (onTuningChange) {
      onTuningChange(cents);
    }
  };

  const handleFilterChange = (field: 'cutoff' | 'resonance', value: number) => {
    onChange({
      filter: {
        ...config.filter,
        [field]: value,
      },
    });
  };

  const handleFilterEnvelopeChange = (field: 'envMod' | 'decay', value: number) => {
    onChange({
      filterEnvelope: {
        ...config.filterEnvelope,
        [field]: value,
      },
    });
  };

  const handleAccentChange = (amount: number) => {
    onChange({
      accent: { amount },
    });
  };

  const handleSlideChange = (time: number) => {
    onChange({
      slide: {
        ...config.slide,
        time,
      },
    });
  };

  const handleOverdriveChange = (amount: number) => {
    onChange({
      overdrive: { amount },
    });
  };

  // Devil Fish handlers
  const handleDevilFishChange = <K extends keyof DevilFishConfig>(
    field: K,
    value: DevilFishConfig[K]
  ) => {
    onChange({
      devilFish: {
        ...devilFish,
        [field]: value,
      },
    });
  };

  const handleDevilFishToggle = (enabled: boolean) => {
    handleDevilFishChange('enabled', enabled);
    setDevilFishExpanded(enabled);
  };

  return (
    <div className="p-4 bg-dark-bg text-text-primary font-mono space-y-6">
      <div className="text-accent-primary text-lg font-bold border-b border-dark-border pb-3">
        TB-303 Bass Synthesizer
      </div>

      {/* Oscillator Section */}
      <div className="space-y-3">
        <div className="text-sm font-bold text-accent-primary">OSCILLATOR</div>
        <div className="flex gap-2">
          <button
            onClick={() => handleOscillatorChange('sawtooth')}
            className={`px-4 py-2 rounded-md border transition-all ${
              config.oscillator.type === 'sawtooth'
                ? 'bg-accent-primary text-text-inverse border-accent-primary'
                : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
            }`}
          >
            Sawtooth
          </button>
          <button
            onClick={() => handleOscillatorChange('square')}
            className={`px-4 py-2 rounded-md border transition-all ${
              config.oscillator.type === 'square'
                ? 'bg-accent-primary text-text-inverse border-accent-primary'
                : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
            }`}
          >
            Square
          </button>
        </div>
      </div>

      {/* Tuning Section */}
      <div className="space-y-4">
        <div className="text-sm font-bold text-accent-primary">TUNING</div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Pitch Offset</span>
            <span className="text-accent-primary">
              {tuning > 0 ? '+' : ''}{tuning} cents
              {Math.abs(tuning) >= 100 && ` (${(tuning / 100).toFixed(1)} semitones)`}
            </span>
          </div>
          <input
            type="range"
            min="-1200"
            max="1200"
            step="1"
            value={tuning}
            onChange={(e) => handleTuningChange(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-text-muted">
            <span>-1 oct</span>
            <button
              onClick={() => handleTuningChange(0)}
              className="text-accent-primary hover:underline"
            >
              Reset
            </button>
            <span>+1 oct</span>
          </div>
        </div>
      </div>

      {/* Filter Section */}
      <div className="space-y-4">
        <div className="text-sm font-bold text-accent-primary">FILTER (24dB/oct 4-pole)</div>

        {/* Cutoff */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Cutoff</span>
            <span className="text-accent-primary">{Math.round(config.filter.cutoff)} Hz</span>
          </div>
          <input
            type="range"
            min="200"
            max="20000"
            step="10"
            value={config.filter.cutoff}
            onChange={(e) => handleFilterChange('cutoff', parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Resonance */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Resonance</span>
            <span className="text-accent-primary">{config.filter.resonance}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={config.filter.resonance}
            onChange={(e) => handleFilterChange('resonance', parseFloat(e.target.value))}
            className="w-full"
          />
          {config.filter.resonance >= 90 && (
            <div className="text-xs text-accent-warning flex items-center gap-1">
              <span>⚠</span> Self-oscillation zone
            </div>
          )}
        </div>
      </div>

      {/* Filter Envelope Section */}
      <div className="space-y-4">
        <div className="text-sm font-bold text-accent-primary">FILTER ENVELOPE</div>

        {/* Env Mod */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Env Mod</span>
            <span className="text-accent-primary">{config.filterEnvelope.envMod}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={config.filterEnvelope.envMod}
            onChange={(e) => handleFilterEnvelopeChange('envMod', parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Decay */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Decay</span>
            <span className="text-accent-primary">{config.filterEnvelope.decay} ms</span>
          </div>
          <input
            type="range"
            min="30"
            max="3000"
            step="10"
            value={config.filterEnvelope.decay}
            onChange={(e) => handleFilterEnvelopeChange('decay', parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Visual Envelope Diagram */}
        <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4">
          <div className="text-xs text-text-muted mb-2">Envelope Shape</div>
          <svg viewBox="0 0 200 80" className="w-full h-20" preserveAspectRatio="none">
            {/* Grid lines */}
            <line x1="0" y1="40" x2="200" y2="40" stroke="#00d4aa" strokeWidth="0.5" opacity="0.3" />
            <line x1="0" y1="20" x2="200" y2="20" stroke="#00d4aa" strokeWidth="0.5" opacity="0.2" />
            <line x1="0" y1="60" x2="200" y2="60" stroke="#00d4aa" strokeWidth="0.5" opacity="0.2" />

            {/* Envelope curve - exponential decay */}
            <path
              d={`M 10 70 L 10 ${70 - (config.filterEnvelope.envMod * 0.6)} Q ${10 + (config.filterEnvelope.decay / 3000 * 180 * 0.3)} ${70 - (config.filterEnvelope.envMod * 0.4)} ${10 + (config.filterEnvelope.decay / 3000 * 180)} 70`}
              fill="none"
              stroke="#00d4aa"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Peak dot */}
            <circle
              cx="10"
              cy={70 - (config.filterEnvelope.envMod * 0.6)}
              r="3"
              fill="#7c3aed"
            />

            {/* End dot */}
            <circle
              cx={10 + (config.filterEnvelope.decay / 3000 * 180)}
              cy="70"
              r="3"
              fill="#00d4aa"
            />

            {/* Axis labels */}
            <text x="5" y="78" fontSize="8" fill="#606068">0</text>
            <text x={10 + (config.filterEnvelope.decay / 3000 * 180) - 10} y="78" fontSize="8" fill="#606068">{config.filterEnvelope.decay}ms</text>
          </svg>
        </div>
      </div>

      {/* Accent Section */}
      <div className="space-y-4">
        <div className="text-sm font-bold text-accent-primary">ACCENT</div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Amount</span>
            <span className="text-accent-primary">{config.accent.amount}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={config.accent.amount}
            onChange={(e) => handleAccentChange(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="text-xs text-text-muted">
            Boosts volume, filter envelope, and decay
          </div>
        </div>
      </div>

      {/* Slide Section */}
      <div className="space-y-4">
        <div className="text-sm font-bold text-accent-primary">SLIDE</div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Time</span>
            <span className="text-accent-primary">{config.slide.time} ms</span>
          </div>
          <input
            type="range"
            min="10"
            max="200"
            step="5"
            value={config.slide.time}
            onChange={(e) => handleSlideChange(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="text-xs text-text-muted">
            Portamento between notes (requires slide flag)
          </div>
        </div>
      </div>

      {/* Overdrive Section */}
      <div className="space-y-4">
        <div className="text-sm font-bold text-accent-warning">OVERDRIVE</div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Drive</span>
            <span className="text-accent-warning">{config.overdrive?.amount ?? 0}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={config.overdrive?.amount ?? 0}
            onChange={(e) => handleOverdriveChange(parseFloat(e.target.value))}
            className="w-full accent-orange-500"
          />
          <div className="text-xs text-text-muted">
            Soft clipping saturation for gritty acid tones
          </div>
        </div>
      </div>

      {/* Devil Fish Mod Section - Collapsible */}
      <div className="border border-purple-500/30 rounded-lg overflow-hidden">
        {/* Header - Always visible */}
        <button
          onClick={() => setDevilFishExpanded(!devilFishExpanded)}
          className="w-full flex items-center justify-between p-3 bg-purple-900/20 hover:bg-purple-900/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            {devilFishExpanded ? (
              <ChevronDown className="w-4 h-4 text-purple-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-purple-400" />
            )}
            <span className="text-sm font-bold text-purple-400">DEVIL FISH MOD</span>
          </div>
          <label
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs text-text-muted">
              {devilFish.enabled ? 'ON' : 'OFF'}
            </span>
            <input
              type="checkbox"
              checked={devilFish.enabled}
              onChange={(e) => handleDevilFishToggle(e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
          </label>
        </button>

        {/* Collapsible content */}
        {devilFishExpanded && (
          <div className="p-4 space-y-6 bg-purple-900/10">
            {/* Envelope Section */}
            <div className="space-y-4">
              <div className="text-xs font-bold text-purple-300 uppercase tracking-wide">
                Envelopes
              </div>

              {/* Normal Decay */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Normal Decay (MEG)</span>
                  <span className="text-purple-400">{devilFish.normalDecay} ms</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="3000"
                  step="10"
                  value={devilFish.normalDecay}
                  onChange={(e) => handleDevilFishChange('normalDecay', parseFloat(e.target.value))}
                  disabled={!devilFish.enabled}
                  className="w-full accent-purple-500 disabled:opacity-50"
                />
              </div>

              {/* Accent Decay */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Accent Decay (MEG)</span>
                  <span className="text-purple-400">{devilFish.accentDecay} ms</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="3000"
                  step="10"
                  value={devilFish.accentDecay}
                  onChange={(e) => handleDevilFishChange('accentDecay', parseFloat(e.target.value))}
                  disabled={!devilFish.enabled}
                  className="w-full accent-purple-500 disabled:opacity-50"
                />
              </div>

              {/* VEG Decay */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">VEG Decay</span>
                  <span className="text-purple-400">{devilFish.vegDecay} ms</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="3000"
                  step="10"
                  value={devilFish.vegDecay}
                  onChange={(e) => handleDevilFishChange('vegDecay', parseFloat(e.target.value))}
                  disabled={!devilFish.enabled}
                  className="w-full accent-purple-500 disabled:opacity-50"
                />
              </div>

              {/* VEG Sustain */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">VEG Sustain</span>
                  <span className="text-purple-400">
                    {devilFish.vegSustain}%
                    {devilFish.vegSustain === 100 && ' (Drone)'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={devilFish.vegSustain}
                  onChange={(e) => handleDevilFishChange('vegSustain', parseFloat(e.target.value))}
                  disabled={!devilFish.enabled}
                  className="w-full accent-purple-500 disabled:opacity-50"
                />
                {devilFish.vegSustain >= 90 && devilFish.enabled && (
                  <div className="text-xs text-purple-300">
                    Notes will sustain indefinitely
                  </div>
                )}
              </div>

              {/* Soft Attack */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Soft Attack</span>
                  <span className="text-purple-400">{devilFish.softAttack.toFixed(1)} ms</span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="30"
                  step="0.1"
                  value={devilFish.softAttack}
                  onChange={(e) => handleDevilFishChange('softAttack', parseFloat(e.target.value))}
                  disabled={!devilFish.enabled}
                  className="w-full accent-purple-500 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Filter Section */}
            <div className="space-y-4">
              <div className="text-xs font-bold text-purple-300 uppercase tracking-wide">
                Filter
              </div>

              {/* Filter Tracking */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Filter Tracking</span>
                  <span className="text-purple-400">{devilFish.filterTracking}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="1"
                  value={devilFish.filterTracking}
                  onChange={(e) => handleDevilFishChange('filterTracking', parseFloat(e.target.value))}
                  disabled={!devilFish.enabled}
                  className="w-full accent-purple-500 disabled:opacity-50"
                />
                <div className="text-xs text-text-muted">
                  {devilFish.filterTracking === 0 && 'TB-303 default (no tracking)'}
                  {devilFish.filterTracking > 0 && devilFish.filterTracking <= 100 && 'Filter follows pitch'}
                  {devilFish.filterTracking > 100 && 'Over-tracking (filter moves more than pitch)'}
                </div>
              </div>

              {/* Filter FM */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Filter FM</span>
                  <span className="text-purple-400">{devilFish.filterFM}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={devilFish.filterFM}
                  onChange={(e) => handleDevilFishChange('filterFM', parseFloat(e.target.value))}
                  disabled={!devilFish.enabled}
                  className="w-full accent-purple-500 disabled:opacity-50"
                />
                {devilFish.filterFM >= 70 && devilFish.enabled && (
                  <div className="text-xs text-amber-400 flex items-center gap-1">
                    <span>⚠</span> High FM can create chaotic sounds
                  </div>
                )}
              </div>
            </div>

            {/* Accent Section */}
            <div className="space-y-4">
              <div className="text-xs font-bold text-purple-300 uppercase tracking-wide">
                Accent
              </div>

              {/* Sweep Speed */}
              <div className="space-y-2">
                <div className="text-xs text-text-muted">Sweep Speed</div>
                <div className="flex gap-2">
                  {(['fast', 'normal', 'slow'] as const).map((speed) => (
                    <button
                      key={speed}
                      onClick={() => handleDevilFishChange('sweepSpeed', speed)}
                      disabled={!devilFish.enabled}
                      className={`px-3 py-1.5 text-xs rounded border transition-all disabled:opacity-50 ${
                        devilFish.sweepSpeed === speed
                          ? 'bg-purple-600 text-white border-purple-500'
                          : 'bg-dark-bgSecondary text-text-muted border-dark-border hover:border-purple-500/50'
                      }`}
                    >
                      {speed.charAt(0).toUpperCase() + speed.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-text-muted">
                  {devilFish.sweepSpeed === 'fast' && 'Quick decay, smaller subsequent accents'}
                  {devilFish.sweepSpeed === 'normal' && 'Classic TB-303 - accents build up'}
                  {devilFish.sweepSpeed === 'slow' && 'Long rise time, 2x peak height'}
                </div>
              </div>

              {/* Accent Sweep Toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={devilFish.accentSweepEnabled}
                  onChange={(e) => handleDevilFishChange('accentSweepEnabled', e.target.checked)}
                  disabled={!devilFish.enabled}
                  className="w-4 h-4 accent-purple-500 disabled:opacity-50"
                />
                <div>
                  <div className="text-xs text-text-primary">Accent Sweep</div>
                  <div className="text-xs text-text-muted">
                    Enable filter/VCA sweep on accents
                  </div>
                </div>
              </label>
            </div>

            {/* Resonance & Output Section */}
            <div className="space-y-4">
              <div className="text-xs font-bold text-purple-300 uppercase tracking-wide">
                Resonance & Output
              </div>

              {/* High Resonance Toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={devilFish.highResonance}
                  onChange={(e) => handleDevilFishChange('highResonance', e.target.checked)}
                  disabled={!devilFish.enabled}
                  className="w-4 h-4 accent-purple-500 disabled:opacity-50"
                />
                <div>
                  <div className="text-xs text-text-primary">High Resonance</div>
                  <div className="text-xs text-text-muted">
                    Enable filter self-oscillation at mid/high frequencies
                  </div>
                </div>
              </label>

              {/* Muffler */}
              <div className="space-y-2">
                <div className="text-xs text-text-muted">Muffler (VCA Clipping)</div>
                <div className="flex gap-2">
                  {(['off', 'soft', 'hard'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleDevilFishChange('muffler', mode)}
                      disabled={!devilFish.enabled}
                      className={`px-3 py-1.5 text-xs rounded border transition-all disabled:opacity-50 ${
                        devilFish.muffler === mode
                          ? 'bg-purple-600 text-white border-purple-500'
                          : 'bg-dark-bgSecondary text-text-muted border-dark-border hover:border-purple-500/50'
                      }`}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-text-muted">
                  {devilFish.muffler === 'off' && 'TB-303 default (no muffler)'}
                  {devilFish.muffler === 'soft' && 'Gentle limiting, adds warmth'}
                  {devilFish.muffler === 'hard' && 'Aggressive clipping, adds buzz/fuzz'}
                </div>
              </div>
            </div>

            {/* Devil Fish Info */}
            <div className="text-xs text-purple-200/60 bg-purple-900/20 p-3 rounded border border-purple-500/20">
              <div className="font-bold mb-1">Devil Fish Mod</div>
              <div>Based on Robin Whittle's hardware modifications.</div>
              <div>Expands TB-303 from 5 to 14 sonic dimensions.</div>
            </div>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="text-xs text-text-secondary bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="font-bold text-accent-primary mb-2">TB-303 Tips:</div>
        <ul className="list-disc list-inside space-y-1 text-text-muted">
          <li>Use <span className="text-accent-primary">ACC</span> column in tracker for accent hits</li>
          <li>Use <span className="text-accent-secondary">SLD</span> column for slides between notes</li>
          <li>High resonance (90%+) creates self-oscillation</li>
          <li>Env Mod controls filter sweep intensity</li>
        </ul>
      </div>
    </div>
  );
};
