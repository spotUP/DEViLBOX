/**
 * InstrumentModal - Full-screen modal for instrument editing
 * Provides more space for TB303 + Devil Fish parameters in a 2-column layout
 */

import React, { useState } from 'react';
import { X, ChevronDown, Music, Waves } from 'lucide-react';
import { useInstrumentStore } from '@stores';
// TB303Editor imported but currently using GenericSynthEditor for all types
// import { TB303Editor } from './TB303Editor';
import { GenericSynthEditor } from './GenericSynthEditor';
import { SynthTypeSelector } from './SynthTypeSelector';
import { PresetBrowser } from './PresetBrowser';
import type { InstrumentConfig } from '@typedefs/instrument';

interface InstrumentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalTab = 'edit' | 'type' | 'presets';

export const InstrumentModal: React.FC<InstrumentModalProps> = ({ isOpen, onClose }) => {
  const {
    instruments,
    currentInstrumentId,
    updateInstrument,
    setCurrentInstrument,
  } = useInstrumentStore();

  const [activeTab, setActiveTab] = useState<ModalTab>('edit');
  const [showInstrumentDropdown, setShowInstrumentDropdown] = useState(false);

  const currentInstrument = instruments.find((i) => i.id === currentInstrumentId);

  if (!isOpen || !currentInstrument) return null;

  const handleTB303Change = (config: Partial<typeof currentInstrument.tb303>) => {
    if (!currentInstrument.tb303) return;
    updateInstrument(currentInstrument.id, {
      tb303: {
        ...currentInstrument.tb303,
        ...config,
      },
    });
  };

  const handleSelectInstrument = (id: number) => {
    setCurrentInstrument(id);
    setShowInstrumentDropdown(false);
  };

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
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border bg-dark-bgSecondary">
          <div className="flex items-center gap-6">
            {/* Instrument Selector */}
            <div className="relative">
              <button
                onClick={() => setShowInstrumentDropdown(!showInstrumentDropdown)}
                className="flex items-center gap-3 px-4 py-2 rounded-lg bg-dark-bgTertiary hover:bg-dark-bgHover transition-colors"
              >
                <Music size={18} className="text-accent-primary" />
                <span className="font-mono text-accent-primary font-bold">
                  {currentInstrument.id.toString(16).toUpperCase().padStart(2, '0')}
                </span>
                <span className="text-text-primary font-medium">{currentInstrument.name}</span>
                <ChevronDown size={16} className="text-text-muted" />
              </button>

              {showInstrumentDropdown && (
                <div className="absolute top-full left-0 mt-2 bg-dark-bgTertiary border border-dark-border rounded-lg shadow-xl z-50 min-w-[280px] max-h-[400px] overflow-y-auto scrollbar-modern">
                  {instruments
                    .slice()
                    .sort((a, b) => a.id - b.id)
                    .map((inst) => (
                      <button
                        key={inst.id}
                        onClick={() => handleSelectInstrument(inst.id)}
                        className={`w-full px-4 py-3 font-mono text-sm text-left hover:bg-dark-bgHover transition-colors flex items-center gap-3 ${
                          inst.id === currentInstrumentId
                            ? 'bg-dark-bgActive text-accent-primary'
                            : 'text-text-primary'
                        }`}
                      >
                        <span className="text-accent-primary font-bold">
                          {inst.id.toString(16).toUpperCase().padStart(2, '0')}
                        </span>
                        <span className="truncate flex-1">{inst.name}</span>
                        <span className="text-xs text-text-muted">{inst.synthType}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-1 bg-dark-bgTertiary rounded-lg p-1">
              <button
                onClick={() => setActiveTab('edit')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'edit'
                    ? 'bg-accent-primary text-white'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Edit Parameters
              </button>
              <button
                onClick={() => setActiveTab('type')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'type'
                    ? 'bg-accent-primary text-white'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Synth Type
              </button>
              <button
                onClick={() => setActiveTab('presets')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'presets'
                    ? 'bg-accent-primary text-white'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Presets
              </button>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-bgHover transition-colors text-text-muted hover:text-text-primary"
          >
            <X size={24} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'edit' && (
            <div className="h-full overflow-y-auto scrollbar-modern">
              {currentInstrument.synthType === 'TB303' && currentInstrument.tb303 ? (
                <TB303ModalEditor
                  config={currentInstrument.tb303}
                  onChange={handleTB303Change}
                />
              ) : (
                <div className="p-6">
                  <GenericSynthEditor
                    instrument={currentInstrument}
                    onChange={(updates) => updateInstrument(currentInstrument.id, updates)}
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'type' && (
            <div className="h-full overflow-y-auto scrollbar-modern p-6">
              <SynthTypeSelector instrument={currentInstrument} />
            </div>
          )}

          {activeTab === 'presets' && (
            <div className="h-full overflow-y-auto scrollbar-modern">
              <PresetBrowser instrumentId={currentInstrument.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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
