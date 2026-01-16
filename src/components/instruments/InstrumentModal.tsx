/**
 * InstrumentModal - Full-screen modal for instrument editing
 * Now uses UnifiedInstrumentEditor for a consistent, modern UI
 */

import React from 'react';
import { X } from 'lucide-react';
import { UnifiedInstrumentEditor } from './UnifiedInstrumentEditor';

interface InstrumentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstrumentModal: React.FC<InstrumentModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl w-[95vw] h-[90vh] max-w-[1400px] flex flex-col overflow-hidden animate-scale-in">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors text-text-muted hover:text-text-primary"
        >
          <X size={24} />
        </button>

        {/* Unified Instrument Editor */}
        <UnifiedInstrumentEditor
          mode="modal"
          showInstrumentList={true}
          showKeyboard={true}
          onClose={onClose}
        />
      </div>
    </div>
  );
};

// ============================================================================
// Legacy TB303ModalEditor - Kept for reference, no longer used in modal
// The Devil Fish controls are now accessed via the TB303KnobPanel
// ============================================================================

/**
 * TB303ModalEditor - 2-column layout for TB303 parameters
 * Left: Core TB-303 controls
 * Right: Devil Fish mod controls
 */
interface TB303ModalEditorProps {
  config: NonNullable<InstrumentConfig['tb303']>;
  onChange: (config: Partial<NonNullable<InstrumentConfig['tb303']>>) => void;
}

const TB303ModalEditor: React.FC<TB303ModalEditorProps> = ({ config, onChange }) => {
  const devilFish = config.devilFish ?? {
    enabled: false,
    normalDecay: 200,
    accentDecay: 200,
    vegDecay: 3000,
    vegSustain: 0,
    softAttack: 4,
    filterTracking: 0,
    filterFM: 0,
    sweepSpeed: 'normal' as const,
    accentSweepEnabled: true,
    highResonance: false,
    muffler: 'off' as const,
  };

  const handleDevilFishChange = <K extends keyof typeof devilFish>(
    field: K,
    value: (typeof devilFish)[K]
  ) => {
    onChange({
      devilFish: {
        ...devilFish,
        [field]: value,
      },
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
      {/* LEFT COLUMN: Core TB-303 Parameters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Waves className="w-5 h-5 text-accent-primary" />
          <h2 className="text-lg font-bold text-text-primary">TB-303 Acid Bass</h2>
        </div>

        {/* Oscillator */}
        <Section title="OSCILLATOR">
          <div className="flex gap-2">
            {(['sawtooth', 'square'] as const).map((type) => (
              <button
                key={type}
                onClick={() => onChange({ oscillator: { type } })}
                className={`flex-1 py-2 px-3 rounded-lg border-2 transition-all font-mono text-sm ${
                  config.oscillator.type === type
                    ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
                    : 'border-dark-border bg-dark-bgSecondary text-text-muted hover:border-accent-primary/50'
                }`}
              >
                {type === 'sawtooth' ? '⟋ Saw' : '⊓ Sqr'}
              </button>
            ))}
          </div>
        </Section>

        {/* Filter */}
        <Section title="FILTER (24dB/oct)">
          <Slider
            label="Cutoff"
            value={config.filter.cutoff}
            min={200}
            max={18000}
            unit="Hz"
            onChange={(v) => onChange({ filter: { ...config.filter, cutoff: v } })}
            logarithmic
          />
          <Slider
            label="Resonance"
            value={config.filter.resonance}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onChange({ filter: { ...config.filter, resonance: v } })}
          />
        </Section>

        {/* Filter Envelope */}
        <Section title="FILTER ENVELOPE">
          <Slider
            label="Env Mod"
            value={config.filterEnvelope.envMod}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onChange({ filterEnvelope: { ...config.filterEnvelope, envMod: v } })}
          />
          <Slider
            label="Decay"
            value={config.filterEnvelope.decay}
            min={30}
            max={3000}
            unit="ms"
            onChange={(v) => onChange({ filterEnvelope: { ...config.filterEnvelope, decay: v } })}
            logarithmic
          />
        </Section>

        {/* Accent & Slide */}
        <Section title="ACCENT & SLIDE">
          <Slider
            label="Accent"
            value={config.accent.amount}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onChange({ accent: { amount: v } })}
            accentColor="orange"
          />
          <Slider
            label="Slide Time"
            value={config.slide.time}
            min={60}
            max={360}
            unit="ms"
            onChange={(v) => onChange({ slide: { ...config.slide, time: v } })}
          />
        </Section>

        {/* Overdrive */}
        <Section title="OVERDRIVE">
          <Slider
            label="Drive"
            value={config.overdrive?.amount ?? 0}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onChange({ overdrive: { amount: v } })}
            accentColor="red"
          />
        </Section>
      </div>

      {/* RIGHT COLUMN: Devil Fish Mod */}
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
              DF
            </div>
            <h2 className="text-lg font-bold text-purple-400">Devil Fish Mod</h2>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-text-muted">{devilFish.enabled ? 'ON' : 'OFF'}</span>
            <input
              type="checkbox"
              checked={devilFish.enabled}
              onChange={(e) => handleDevilFishChange('enabled', e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
          </label>
        </div>

        <div className={`space-y-3 transition-opacity ${devilFish.enabled ? 'opacity-100' : 'opacity-40'}`}>
          {/* Envelope Controls */}
          <Section title="ENVELOPES" color="purple">
            <Slider
              label="Normal Decay (MEG)"
              value={devilFish.normalDecay}
              min={30}
              max={3000}
              unit="ms"
              onChange={(v) => handleDevilFishChange('normalDecay', v)}
              disabled={!devilFish.enabled}
              accentColor="purple"
            />
            <Slider
              label="Accent Decay (MEG)"
              value={devilFish.accentDecay}
              min={30}
              max={3000}
              unit="ms"
              onChange={(v) => handleDevilFishChange('accentDecay', v)}
              disabled={!devilFish.enabled}
              accentColor="purple"
            />
            <Slider
              label="VEG Decay"
              value={devilFish.vegDecay}
              min={16}
              max={3000}
              unit="ms"
              onChange={(v) => handleDevilFishChange('vegDecay', v)}
              disabled={!devilFish.enabled}
              accentColor="purple"
            />
            <Slider
              label="VEG Sustain"
              value={devilFish.vegSustain}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => handleDevilFishChange('vegSustain', v)}
              disabled={!devilFish.enabled}
              accentColor="purple"
              hint={devilFish.vegSustain >= 90 ? 'Drone mode - notes sustain forever' : undefined}
            />
            <Slider
              label="Soft Attack"
              value={devilFish.softAttack}
              min={0.3}
              max={30}
              step={0.1}
              unit="ms"
              onChange={(v) => handleDevilFishChange('softAttack', v)}
              disabled={!devilFish.enabled}
              accentColor="purple"
            />
          </Section>

          {/* Filter Controls */}
          <Section title="FILTER" color="purple">
            <Slider
              label="Filter Tracking"
              value={devilFish.filterTracking}
              min={0}
              max={200}
              unit="%"
              onChange={(v) => handleDevilFishChange('filterTracking', v)}
              disabled={!devilFish.enabled}
              accentColor="purple"
              hint={
                devilFish.filterTracking === 0
                  ? 'TB-303 default'
                  : devilFish.filterTracking > 100
                  ? 'Over-tracking'
                  : 'Filter follows pitch'
              }
            />
            <Slider
              label="Filter FM"
              value={devilFish.filterFM}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => handleDevilFishChange('filterFM', v)}
              disabled={!devilFish.enabled}
              accentColor="purple"
              hint={devilFish.filterFM >= 70 ? 'High FM = chaotic sounds' : undefined}
              warning={devilFish.filterFM >= 70}
            />
          </Section>

          {/* Accent Controls */}
          <Section title="ACCENT" color="purple">
            <div className="space-y-3">
              <div className="text-xs text-text-muted">Sweep Speed</div>
              <div className="flex gap-2">
                {(['fast', 'normal', 'slow'] as const).map((speed) => (
                  <button
                    key={speed}
                    onClick={() => handleDevilFishChange('sweepSpeed', speed)}
                    disabled={!devilFish.enabled}
                    className={`flex-1 py-1.5 px-2 text-xs rounded-lg border transition-all disabled:opacity-50 ${
                      devilFish.sweepSpeed === speed
                        ? 'bg-purple-600 text-white border-purple-500'
                        : 'bg-dark-bgSecondary text-text-muted border-dark-border hover:border-purple-500/50'
                    }`}
                  >
                    {speed.charAt(0).toUpperCase() + speed.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-muted">
                {devilFish.sweepSpeed === 'fast' && 'Quick decay, smaller subsequent accents'}
                {devilFish.sweepSpeed === 'normal' && 'Classic TB-303 - accents build up'}
                {devilFish.sweepSpeed === 'slow' && 'Long rise time, 2x peak height'}
              </p>
            </div>

            <label className="flex items-center gap-3 cursor-pointer mt-4">
              <input
                type="checkbox"
                checked={devilFish.accentSweepEnabled}
                onChange={(e) => handleDevilFishChange('accentSweepEnabled', e.target.checked)}
                disabled={!devilFish.enabled}
                className="w-4 h-4 accent-purple-500 disabled:opacity-50"
              />
              <div>
                <div className="text-sm text-text-primary">Accent Sweep</div>
                <div className="text-xs text-text-muted">Enable filter/VCA sweep on accents</div>
              </div>
            </label>
          </Section>

          {/* Resonance & Output */}
          <Section title="RESONANCE & OUTPUT" color="purple">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={devilFish.highResonance}
                onChange={(e) => handleDevilFishChange('highResonance', e.target.checked)}
                disabled={!devilFish.enabled}
                className="w-4 h-4 accent-purple-500 disabled:opacity-50"
              />
              <div>
                <div className="text-sm text-text-primary">High Resonance</div>
                <div className="text-xs text-text-muted">Filter self-oscillation at mid/high frequencies</div>
              </div>
            </label>

            <div className="space-y-3 mt-4">
              <div className="text-xs text-text-muted">Muffler (VCA Clipping)</div>
              <div className="flex gap-2">
                {(['off', 'soft', 'hard'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleDevilFishChange('muffler', mode)}
                    disabled={!devilFish.enabled}
                    className={`flex-1 py-1.5 px-2 text-xs rounded-lg border transition-all disabled:opacity-50 ${
                      devilFish.muffler === mode
                        ? 'bg-purple-600 text-white border-purple-500'
                        : 'bg-dark-bgSecondary text-text-muted border-dark-border hover:border-purple-500/50'
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-muted">
                {devilFish.muffler === 'off' && 'TB-303 default (no muffler)'}
                {devilFish.muffler === 'soft' && 'Gentle limiting, adds warmth'}
                {devilFish.muffler === 'hard' && 'Aggressive clipping, adds buzz'}
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
};

// Helper Components

interface SectionProps {
  title: string;
  color?: 'primary' | 'purple';
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, color = 'primary', children }) => (
  <div className="space-y-2">
    <h3
      className={`text-xs font-bold tracking-wide ${
        color === 'purple' ? 'text-purple-400' : 'text-accent-primary'
      }`}
    >
      {title}
    </h3>
    <div className="space-y-2">{children}</div>
  </div>
);

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  logarithmic?: boolean;
  accentColor?: 'primary' | 'purple' | 'orange' | 'red';
  hint?: string;
  warning?: boolean;
}

const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  disabled = false,
  accentColor = 'primary',
}) => {
  const colors = {
    primary: '#14b8a6', // teal-500
    purple: '#a855f7',  // purple-500
    orange: '#f97316',  // orange-500
    red: '#ef4444',     // red-500
  };

  const textColors = {
    primary: 'text-accent-primary',
    purple: 'text-purple-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
  };

  const formatValue = (v: number): string => {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (step < 1) return v.toFixed(1);
    return Math.round(v).toString();
  };

  // Calculate fill percentage
  const percent = ((value - min) / (max - min)) * 100;
  const trackColor = colors[accentColor];

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className={textColors[accentColor]}>
          {formatValue(value)} {unit}
        </span>
      </div>
      <div className="relative h-2">
        {/* Track background */}
        <div className="absolute inset-0 rounded-full bg-dark-bgTertiary" />
        {/* Filled portion */}
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: trackColor }}
        />
        {/* Input overlay */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ margin: 0 }}
        />
        {/* Custom thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none"
          style={{
            left: `calc(${percent}% - 8px)`,
            backgroundColor: trackColor,
          }}
        />
      </div>
    </div>
  );
};
