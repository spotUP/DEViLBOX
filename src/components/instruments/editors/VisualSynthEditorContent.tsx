/**
 * VisualSynthEditorContent - Tab content rendering for generic synths
 *
 * This module contains the tab content rendering logic extracted from VisualSynthEditor.
 * It's used by both VisualSynthEditor (for backward compatibility) and UnifiedInstrumentEditor.
 *
 * Exports:
 * - renderGenericTabContent: Renders content for the active tab
 * - renderSpecialParameters: Renders synth-specific parameters
 */

import React from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import {
  DEFAULT_CHIP_SYNTH,
  DEFAULT_SUPERSAW,
  DEFAULT_POLYSYNTH,
  DEFAULT_ORGAN,
  DEFAULT_DRUM_MACHINE,
  DEFAULT_WOBBLE_BASS,
  DEFAULT_PWM_SYNTH,
  DEFAULT_STRING_MACHINE,
  DEFAULT_FORMANT_SYNTH,
  DEFAULT_WAVETABLE,
  DEFAULT_GRANULAR,
  VOWEL_FORMANTS,
} from '@typedefs/instrument';
import type { VowelType } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { CustomSelect } from '@components/common/CustomSelect';
import { WaveformSelector } from '@components/ui/WaveformSelector';
import { LFOControls } from '../LFOControls';
import type { SynthEditorTab } from '../shared/SynthEditorTabs';
import { LiveFilterCurve } from '@components/visualization';
import { EnvelopeVisualization, SectionHeader } from '@components/instruments/shared';

// Sample-based synth types
const SAMPLE_SYNTH_TYPES = ['Sampler', 'Player', 'GranularSynth'];

// ============================================================================
// MAIN TAB CONTENT RENDERER
// ============================================================================

export function renderGenericTabContent(
  instrument: InstrumentConfig,
  onChange: (updates: Partial<InstrumentConfig>) => void,
  activeTab: SynthEditorTab
): React.ReactNode {
  const isSampleBased = SAMPLE_SYNTH_TYPES.includes(instrument.synthType);

  // Update helpers
  const updateOscillator = (key: string, value: string | number | boolean) => {
    const currentOsc = instrument.oscillator || { type: 'sawtooth', detune: 0, octave: 0 };
    onChange({
      oscillator: { ...currentOsc, [key]: value },
    });
  };

  const updateEnvelope = (key: string, value: number) => {
    const currentEnv = instrument.envelope || { attack: 10, decay: 200, sustain: 50, release: 1000 };
    onChange({
      envelope: { ...currentEnv, [key]: value },
    });
  };

  const updatePitchEnvelope = (key: string, value: number | boolean) => {
    const currentPitchEnv = instrument.pitchEnvelope || {
      enabled: false, amount: 12, attack: 0, decay: 50, sustain: 0, release: 100
    };
    onChange({
      pitchEnvelope: { ...currentPitchEnv, [key]: value },
    });
  };

  const updateFilter = (key: string, value: string | number) => {
    const currentFilter = instrument.filter || { type: 'lowpass' as const, frequency: 2000, Q: 1, rolloff: -24 as const };
    onChange({
      filter: { ...currentFilter, [key]: value },
    });
  };

  switch (activeTab) {
    case 'oscillator':
      return renderOscillatorTab(instrument, updateOscillator, isSampleBased);
    case 'envelope':
      return renderEnvelopeTab(instrument, updateEnvelope, updatePitchEnvelope);
    case 'filter':
      return renderFilterTab(instrument, updateFilter);
    case 'modulation':
      return renderModulationTab(instrument, onChange, isSampleBased);
    case 'output':
      return renderOutputTab(instrument, onChange);
    case 'special':
      return renderSpecialTab(instrument, onChange);
    default:
      return null;
  }
}

// ============================================================================
// ALL-SECTIONS LAYOUT — Compact two-column flow (no tabs needed)
// ============================================================================

export function renderAllSections(
  instrument: InstrumentConfig,
  onChange: (updates: Partial<InstrumentConfig>) => void,
): React.ReactNode {
  const isSampleBased = SAMPLE_SYNTH_TYPES.includes(instrument.synthType);

  const updateOscillator = (key: string, value: string | number | boolean) => {
    const currentOsc = instrument.oscillator || { type: 'sawtooth', detune: 0, octave: 0 };
    onChange({ oscillator: { ...currentOsc, [key]: value } });
  };

  const updateEnvelope = (key: string, value: number) => {
    const currentEnv = instrument.envelope || { attack: 10, decay: 200, sustain: 50, release: 1000 };
    onChange({ envelope: { ...currentEnv, [key]: value } });
  };

  const updatePitchEnvelope = (key: string, value: number | boolean) => {
    const currentPitchEnv = instrument.pitchEnvelope || {
      enabled: false, amount: 12, attack: 0, decay: 50, sustain: 0, release: 100
    };
    onChange({ pitchEnvelope: { ...currentPitchEnv, [key]: value } });
  };

  const updateFilter = (key: string, value: string | number) => {
    const currentFilter = instrument.filter || { type: 'lowpass' as const, frequency: 2000, Q: 1, rolloff: -24 as const };
    onChange({ filter: { ...currentFilter, [key]: value } });
  };

  // Collect all non-null sections
  const sections: React.ReactNode[] = [];

  // ── Combined small-knob panel: Oscillator + Pitch Env + Output ──
  const smallSections: React.ReactNode[] = [];

  // Oscillator sub-section
  if (instrument.oscillator && !isSampleBased) {
    smallSections.push(
      <div key="osc">
        <SectionHeader color="#4a9eff" title="Oscillator" />
        <div className="mb-2">
          <WaveformSelector
            value={instrument.oscillator.type as 'sine' | 'square' | 'sawtooth' | 'triangle' | 'pulse' | 'pwm'}
            onChange={(type) => updateOscillator('type', type)}
            size="md"
            color="#4a9eff"
          />
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
          <Knob
            value={instrument.oscillator.detune || 0} min={-100} max={100}
            onChange={(v) => updateOscillator('detune', v)}
            label="Detune" color="#4a9eff" bipolar
          />
          <Knob
            value={instrument.oscillator.octave || 0} min={-2} max={2}
            onChange={(v) => updateOscillator('octave', v)}
            label="Octave" color="#4a9eff"
            formatValue={(v) => v > 0 ? `+${v}` : v.toString()}
          />
        </div>
      </div>
    );
  }

  // Pitch Envelope sub-section
  smallSections.push(
    <div key="pitchenv">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3 bg-orange-500 rounded-full" />
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wide">Pitch Env</h3>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <span className="text-[10px] text-text-secondary">
            {instrument.pitchEnvelope?.enabled ? 'ON' : 'OFF'}
          </span>
          <input type="checkbox"
            checked={instrument.pitchEnvelope?.enabled || false}
            onChange={(e) => updatePitchEnvelope('enabled', e.target.checked)}
            className="w-3.5 h-3.5 rounded bg-dark-bgHover border-dark-borderLight text-orange-500 focus:ring-orange-500 focus:ring-offset-0" />
        </label>
      </div>
      <div className={`grid gap-3 ${!instrument.pitchEnvelope?.enabled ? 'opacity-40 pointer-events-none' : ''}`} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
        <Knob value={instrument.pitchEnvelope?.amount || 12} min={-48} max={48}
          onChange={(v) => updatePitchEnvelope('amount', v)}
          label="Amt" color="#f97316" formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}st`} />
        <Knob value={instrument.pitchEnvelope?.attack || 0} min={0} max={2000}
          onChange={(v) => updatePitchEnvelope('attack', v)}
          label="A" color="#f97316" formatValue={(v) => `${Math.round(v)}ms`} />
        <Knob value={instrument.pitchEnvelope?.decay || 50} min={1} max={2000}
          onChange={(v) => updatePitchEnvelope('decay', v)}
          label="D" color="#f97316" formatValue={(v) => `${Math.round(v)}ms`} />
        <Knob value={instrument.pitchEnvelope?.sustain || 0} min={-100} max={100}
          onChange={(v) => updatePitchEnvelope('sustain', v)}
          label="S" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
        <Knob value={instrument.pitchEnvelope?.release || 100} min={1} max={5000}
          onChange={(v) => updatePitchEnvelope('release', v)}
          label="R" color="#f97316" formatValue={(v) => `${Math.round(v)}ms`} />
      </div>
    </div>
  );

  // Output sub-section
  smallSections.push(
    <div key="output">
      <SectionHeader color="#a855f7" title="Output" />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
        <Knob value={instrument.volume} min={-60} max={0}
          onChange={(v) => onChange({ volume: v })}
          label="Volume" unit="dB" color="#a855f7" />
        <Knob value={instrument.pan} min={-100} max={100}
          onChange={(v) => onChange({ pan: v })}
          label="Pan" color="#a855f7" bipolar
          formatValue={(v) => v === 0 ? 'C' : v < 0 ? `L${Math.abs(v)}` : `R${v}`} />
      </div>
    </div>
  );

  // Push the combined panel as one section
  sections.push(
    <section key="controls" className="synth-all-section bg-[#1a1a1a] rounded-lg p-3 border border-dark-border space-y-4">
      {smallSections}
    </section>
  );

  // ── Amp Envelope + Filter (combined panel, stacked vertically) ──
  const hasEnv = !!instrument.envelope;
  const hasFilter = !!instrument.filter;
  if (hasEnv || hasFilter) {
    sections.push(
      <section key="env-filter" className="synth-all-section bg-[#1a1a1a] rounded-lg p-3 border border-dark-border space-y-4">
        {hasEnv && instrument.envelope && (
          <div>
            <SectionHeader color="#22c55e" title="Amp Envelope" />
            <EnvelopeVisualization
              mode="ms"
              attack={instrument.envelope.attack}
              decay={instrument.envelope.decay}
              sustain={instrument.envelope.sustain}
              release={instrument.envelope.release}
              width="auto" height={100}
              color="#22c55e" backgroundColor="#0a0a0a" border="none"
            />
            <div className="flex gap-2 mt-2 justify-center">
              <Knob value={instrument.envelope.attack} min={1} max={2000}
                onChange={(v) => updateEnvelope('attack', v)}
                label="A" color="#22c55e" formatValue={(v) => `${Math.round(v)}ms`} />
              <Knob value={instrument.envelope.decay} min={1} max={2000}
                onChange={(v) => updateEnvelope('decay', v)}
                label="D" color="#22c55e" formatValue={(v) => `${Math.round(v)}ms`} />
              <Knob value={instrument.envelope.sustain} min={0} max={100}
                onChange={(v) => updateEnvelope('sustain', v)}
                label="S" color="#22c55e" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={instrument.envelope.release} min={1} max={5000}
                onChange={(v) => updateEnvelope('release', v)}
                label="R" color="#22c55e" formatValue={(v) => `${Math.round(v)}ms`} />
            </div>
          </div>
        )}
        {hasFilter && instrument.filter && (
          <div>
            <SectionHeader color="#ff6b6b" title="Filter" />
            <div className="flex gap-1 mb-3">
              {['lowpass', 'highpass', 'bandpass', 'notch'].map((type) => (
                <button key={type} onClick={() => updateFilter('type', type)}
                  className={`flex-1 px-1.5 py-1 text-[10px] font-bold rounded uppercase transition-all
                    ${instrument.filter?.type === type
                      ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500'
                      : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'}`}>
                  {type.replace('pass', '')}
                </button>
              ))}
            </div>
            <LiveFilterCurve
              instrumentId={instrument.id}
              cutoff={instrument.filter.frequency} resonance={instrument.filter.Q}
              type={instrument.filter.type as 'lowpass' | 'highpass' | 'bandpass' | 'notch'}
              width="auto" height={100}
              color="#ff6b6b" modulatedColor="#fbbf24" backgroundColor="#0a0a0a"
            />
            <div className="flex gap-2 mt-2 justify-center">
              <Knob value={instrument.filter.frequency} min={20} max={20000}
                onChange={(v) => updateFilter('frequency', v)}
                label="Cutoff" color="#ff6b6b"
                formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob value={instrument.filter.Q} min={0} max={100}
                onChange={(v) => updateFilter('Q', v)}
                label="Reso" color="#ff6b6b" formatValue={(v) => `${Math.round(v)}%`} />
            </div>
          </div>
        )}
      </section>
    );
  }

  // ── Modulation / LFO (has visualizer — full panel) ──
  if (!isSampleBased) {
    sections.push(
      <section key="mod" className="synth-all-section bg-[#1a1a1a] rounded-lg p-3 border border-dark-border">
        <LFOControls instrument={instrument} onChange={onChange} />
      </section>
    );
  }

  // Special parameters (only if synth has them)
  const specialContent = renderSpecialParameters(instrument, onChange);
  if (specialContent) {
    sections.push(
      <section key="special" className="synth-all-section bg-[#1a1a1a] rounded-lg p-3 border border-dark-border">
        {specialContent}
      </section>
    );
  }

  return (
    <div className="synth-all-sections">
      {sections}
    </div>
  );
}

// ============================================================================
// OSCILLATOR TAB
// ============================================================================

function renderOscillatorTab(
  instrument: InstrumentConfig,
  updateOscillator: (key: string, value: string | number | boolean) => void,
  isSampleBased: boolean
): React.ReactNode {
  if (!instrument.oscillator || isSampleBased) return null;

  return (
    <div className="synth-tab-section p-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
        <SectionHeader color="#4a9eff" title="Oscillator" />

        {/* Waveform Selector */}
        <div className="mb-4">
          <WaveformSelector
            value={instrument.oscillator.type as 'sine' | 'square' | 'sawtooth' | 'triangle' | 'pulse' | 'pwm'}
            onChange={(type) => updateOscillator('type', type)}
           
            color="#4a9eff"
          />
        </div>

        {/* Oscillator Knobs */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
          <Knob
            value={instrument.oscillator.detune || 0}
            min={-100}
            max={100}
            onChange={(v) => updateOscillator('detune', v)}
            label="Detune"
            unit=""
            color="#4a9eff"
            bipolar
          />
          <Knob
            value={instrument.oscillator.octave || 0}
            min={-2}
            max={2}
            onChange={(v) => updateOscillator('octave', v)}
            label="Octave"
            color="#4a9eff"
            formatValue={(v) => v > 0 ? `+${v}` : v.toString()}
          />
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// ENVELOPE TAB
// ============================================================================

function renderEnvelopeTab(
  instrument: InstrumentConfig,
  updateEnvelope: (key: string, value: number) => void,
  updatePitchEnvelope: (key: string, value: number | boolean) => void
): React.ReactNode {
  return (
    <div className="synth-tab-section p-4 space-y-4">
      {/* Amplitude Envelope */}
      {instrument.envelope && (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#22c55e" title="Amplitude Envelope" />

          <div className="flex gap-4">
            <div className="flex-1">
              <EnvelopeVisualization
                mode="ms"
                attack={instrument.envelope.attack}
                decay={instrument.envelope.decay}
                sustain={instrument.envelope.sustain}
                release={instrument.envelope.release}
                width="auto"
                height={100}
                color="#22c55e"
                backgroundColor="#0a0a0a"
                border="none"
              />
            </div>

            {/* ADSR Knobs */}
            <div className="flex gap-2 items-end">
              <Knob
                value={instrument.envelope.attack}
                min={1}
                max={2000}
                onChange={(v) => updateEnvelope('attack', v)}
                label="A"
               
                color="#22c55e"
                formatValue={(v) => `${Math.round(v)}ms`}
              />
              <Knob
                value={instrument.envelope.decay}
                min={1}
                max={2000}
                onChange={(v) => updateEnvelope('decay', v)}
                label="D"
               
                color="#22c55e"
                formatValue={(v) => `${Math.round(v)}ms`}
              />
              <Knob
                value={instrument.envelope.sustain}
                min={0}
                max={100}
                onChange={(v) => updateEnvelope('sustain', v)}
                label="S"
               
                color="#22c55e"
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Knob
                value={instrument.envelope.release}
                min={1}
                max={5000}
                onChange={(v) => updateEnvelope('release', v)}
                label="R"
               
                color="#22c55e"
                formatValue={(v) => `${Math.round(v)}ms`}
              />
            </div>
          </div>
        </section>
      )}

      {/* Pitch Envelope Section */}
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-orange-500 rounded-full" />
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">Pitch Envelope</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-text-secondary">
              {instrument.pitchEnvelope?.enabled ? 'ON' : 'OFF'}
            </span>
            <input
              type="checkbox"
              checked={instrument.pitchEnvelope?.enabled || false}
              onChange={(e) => updatePitchEnvelope('enabled', e.target.checked)}
              className="w-4 h-4 rounded bg-dark-bgHover border-dark-borderLight text-orange-500 focus:ring-orange-500 focus:ring-offset-0"
            />
          </label>
        </div>

        {/* Pitch Envelope Knobs */}
        <div className={`grid gap-3 ${!instrument.pitchEnvelope?.enabled ? 'opacity-50 pointer-events-none' : ''}`} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
          <Knob
            value={instrument.pitchEnvelope?.amount || 12}
            min={-48}
            max={48}
            onChange={(v) => updatePitchEnvelope('amount', v)}
            label="Amt"
           
            color="#f97316"
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}st`}
          />
          <Knob
            value={instrument.pitchEnvelope?.attack || 0}
            min={0}
            max={2000}
            onChange={(v) => updatePitchEnvelope('attack', v)}
            label="A"
           
            color="#f97316"
            formatValue={(v) => `${Math.round(v)}ms`}
          />
          <Knob
            value={instrument.pitchEnvelope?.decay || 50}
            min={1}
            max={2000}
            onChange={(v) => updatePitchEnvelope('decay', v)}
            label="D"
           
            color="#f97316"
            formatValue={(v) => `${Math.round(v)}ms`}
          />
          <Knob
            value={instrument.pitchEnvelope?.sustain || 0}
            min={-100}
            max={100}
            onChange={(v) => updatePitchEnvelope('sustain', v)}
            label="S"
           
            color="#f97316"
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={instrument.pitchEnvelope?.release || 100}
            min={1}
            max={5000}
            onChange={(v) => updatePitchEnvelope('release', v)}
            label="R"
           
            color="#f97316"
            formatValue={(v) => `${Math.round(v)}ms`}
          />
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// FILTER TAB
// ============================================================================

function renderFilterTab(
  instrument: InstrumentConfig,
  updateFilter: (key: string, value: string | number) => void
): React.ReactNode {
  if (!instrument.filter) return null;

  return (
    <div className="synth-tab-section p-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
        <SectionHeader color="#ff6b6b" title="Filter" />

        {/* Filter Type Buttons */}
        <div className="flex gap-1 mb-4">
          {['lowpass', 'highpass', 'bandpass', 'notch'].map((type) => (
            <button
              key={type}
              onClick={() => updateFilter('type', type)}
              className={`
                flex-1 px-2 py-1.5 text-xs font-bold rounded uppercase transition-all
                ${instrument.filter?.type === type
                  ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500'
                  : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
                }
              `}
            >
              {type.replace('pass', '')}
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <LiveFilterCurve
              instrumentId={instrument.id}
              cutoff={instrument.filter.frequency}
              resonance={instrument.filter.Q}
              type={instrument.filter.type as 'lowpass' | 'highpass' | 'bandpass' | 'notch'}
              width="auto"
              height={100}
              color="#ff6b6b"
              modulatedColor="#fbbf24"
              backgroundColor="#0a0a0a"
            />
          </div>

          {/* Filter Knobs */}
          <div className="flex gap-2 items-end">
            <Knob
              value={instrument.filter.frequency}
              min={20}
              max={20000}
              onChange={(v) => updateFilter('frequency', v)}
              label="Cutoff"
              color="#ff6b6b"
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
            />
            <Knob
              value={instrument.filter.Q}
              min={0}
              max={100}
              onChange={(v) => updateFilter('Q', v)}
              label="Reso"
              color="#ff6b6b"
              formatValue={(v) => `${Math.round(v)}%`}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// MODULATION TAB
// ============================================================================

function renderModulationTab(
  instrument: InstrumentConfig,
  onChange: (updates: Partial<InstrumentConfig>) => void,
  isSampleBased: boolean
): React.ReactNode {
  if (isSampleBased) return null;

  return (
    <div className="synth-tab-section p-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
        <LFOControls
          instrument={instrument}
          onChange={onChange}
        />
      </section>
    </div>
  );
}

// ============================================================================
// OUTPUT TAB
// ============================================================================

function renderOutputTab(
  instrument: InstrumentConfig,
  onChange: (updates: Partial<InstrumentConfig>) => void
): React.ReactNode {
  return (
    <div className="synth-tab-section p-4">
      <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
        <SectionHeader color="#a855f7" title="Output" />

        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
          <Knob
            value={instrument.volume}
            min={-60}
            max={0}
            onChange={(v) => onChange({ volume: v })}
            label="Volume"
            unit="dB"
           
            color="#a855f7"
          />
          <Knob
            value={instrument.pan}
            min={-100}
            max={100}
            onChange={(v) => onChange({ pan: v })}
            label="Pan"
            color="#a855f7"
            bipolar
            formatValue={(v) => v === 0 ? 'C' : v < 0 ? `L${Math.abs(v)}` : `R${v}`}
          />
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// SPECIAL TAB
// ============================================================================

function renderSpecialTab(
  instrument: InstrumentConfig,
  onChange: (updates: Partial<InstrumentConfig>) => void
): React.ReactNode {
  const specialContent = renderSpecialParameters(instrument, onChange);
  if (!specialContent) return null;

  return (
    <div className="synth-tab-section p-4 overflow-y-auto">
      {specialContent}
    </div>
  );
}

// ============================================================================
// SPECIAL PARAMETERS (synth-specific controls)
// ============================================================================

export function renderSpecialParameters(
  instrument: InstrumentConfig,
  onChange: (updates: Partial<InstrumentConfig>) => void
): React.ReactNode {
  const params = (instrument.parameters || {}) as Record<string, number>;

  const updateParam = (key: string, value: string | number | boolean) => {
    onChange({
      parameters: { ...params, [key]: value },
    });
  };

  switch (instrument.synthType) {
    // FM SYNTH
    case 'FMSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#22d3ee" title="FM Synthesis" />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <Knob value={params.modulationIndex ?? 10} min={0} max={100} onChange={(v) => updateParam('modulationIndex', v)} label="Mod Index" color="#22d3ee" formatValue={(v) => v.toFixed(1)} />
            <Knob value={params.harmonicity ?? 3} min={0.1} max={20} step={0.1} onChange={(v) => updateParam('harmonicity', v)} label="Harmonicity" color="#22d3ee" formatValue={(v) => v.toFixed(2)} />
            <Knob value={params.modulationEnvAmount ?? 50} min={0} max={100} onChange={(v) => updateParam('modulationEnvAmount', v)} label="Mod Env" color="#22d3ee" formatValue={(v) => `${Math.round(v)}%`} />
          </div>
        </section>
      );

    // AM SYNTH
    case 'ToneAM':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#14b8a6" title="AM Synthesis" />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <Knob value={params.harmonicity ?? 3} min={0.1} max={20} step={0.1} onChange={(v) => updateParam('harmonicity', v)} label="Harmonicity" color="#14b8a6" formatValue={(v) => v.toFixed(2)} />
            <Knob value={params.modulationDepth ?? 50} min={0} max={100} onChange={(v) => updateParam('modulationDepth', v)} label="Depth" color="#14b8a6" formatValue={(v) => `${Math.round(v)}%`} />
          </div>
        </section>
      );

    // PLUCK SYNTH
    case 'PluckSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#f59e0b" title="Pluck Parameters" />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <Knob value={params.attackNoise ?? 1} min={0} max={10} step={0.1} onChange={(v) => updateParam('attackNoise', v)} label="Attack" color="#f59e0b" formatValue={(v) => v.toFixed(1)} />
            <Knob value={params.dampening ?? 4000} min={100} max={10000} onChange={(v) => updateParam('dampening', v)} label="Dampening" color="#f59e0b" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
            <Knob value={params.resonance ?? 0.9} min={0.1} max={0.999} step={0.001} onChange={(v) => updateParam('resonance', v)} label="Resonance" color="#f59e0b" formatValue={(v) => v.toFixed(3)} />
          </div>
        </section>
      );

    // MEMBRANE SYNTH
    case 'MembraneSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#f97316" title="Membrane Parameters" />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <Knob value={params.pitchDecay ?? 0.05} min={0.001} max={1} step={0.001} onChange={(v) => updateParam('pitchDecay', v)} label="Pitch Decay" color="#f97316" formatValue={(v) => `${(v * 1000).toFixed(0)}ms`} />
            <Knob value={params.octaves ?? 10} min={0.5} max={20} step={0.5} onChange={(v) => updateParam('octaves', v)} label="Octaves" color="#f97316" formatValue={(v) => v.toFixed(1)} />
          </div>
        </section>
      );

    // METAL SYNTH
    case 'MetalSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#ef4444" title="Metal Parameters" />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <Knob value={params.frequency ?? 200} min={50} max={1000} onChange={(v) => updateParam('frequency', v)} label="Frequency" color="#ef4444" formatValue={(v) => `${Math.round(v)}Hz`} />
            <Knob value={params.harmonicity ?? 5.1} min={0.5} max={20} step={0.1} onChange={(v) => updateParam('harmonicity', v)} label="Harmonicity" color="#ef4444" formatValue={(v) => v.toFixed(1)} />
            <Knob value={params.modulationIndex ?? 32} min={1} max={100} onChange={(v) => updateParam('modulationIndex', v)} label="Mod Index" color="#ef4444" formatValue={(v) => Math.round(v).toString()} />
            <Knob value={params.resonance ?? 4000} min={100} max={8000} onChange={(v) => updateParam('resonance', v)} label="Resonance" color="#ef4444" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
          </div>
        </section>
      );

    // NOISE SYNTH
    case 'NoiseSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#6b7280" title="Noise Type" />
          <div className="flex gap-2">
            {['white', 'pink', 'brown'].map((type) => (
              <button
                key={type}
                onClick={() => updateParam('noiseType', type)}
                className={`flex-1 px-4 py-3 rounded-lg font-bold uppercase text-sm transition-all ${(params as Record<string, unknown>).noiseType === type || (!(params as Record<string, unknown>).noiseType && type === 'white') ? 'bg-dark-bgActive text-text-primary ring-2 ring-gray-400' : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover'}`}
              >
                {type}
              </button>
            ))}
          </div>
        </section>
      );

    // DUO SYNTH
    case 'DuoSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#8b5cf6" title="Duo Parameters" />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <Knob value={params.vibratoAmount ?? 0.5} min={0} max={1} step={0.01} onChange={(v) => updateParam('vibratoAmount', v)} label="Vibrato" color="#8b5cf6" formatValue={(v) => `${Math.round(v * 100)}%`} />
            <Knob value={params.vibratoRate ?? 5} min={0.1} max={20} step={0.1} onChange={(v) => updateParam('vibratoRate', v)} label="Vib Rate" color="#8b5cf6" formatValue={(v) => `${v.toFixed(1)}Hz`} />
            <Knob value={params.harmonicity ?? 1.5} min={0.5} max={4} step={0.1} onChange={(v) => updateParam('harmonicity', v)} label="Harmonicity" color="#8b5cf6" formatValue={(v) => v.toFixed(2)} />
          </div>
        </section>
      );

    // MONO SYNTH
    case 'MonoSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#ec4899" title="Mono Parameters" />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <Knob value={params.portamento ?? 0} min={0} max={1000} onChange={(v) => updateParam('portamento', v)} label="Glide" color="#ec4899" formatValue={(v) => `${Math.round(v)}ms`} />
          </div>
        </section>
      );

    // SUPERSAW
    case 'SuperSaw': {
      const ssConfig = instrument.superSaw || DEFAULT_SUPERSAW;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#f43f5e" title="SuperSaw" />
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <Knob value={ssConfig.voices} min={3} max={9} onChange={(v) => onChange({ superSaw: { ...ssConfig, voices: v } })} label="Voices" color="#f43f5e" formatValue={(v) => Math.round(v).toString()} />
            <Knob value={ssConfig.detune} min={0} max={100} onChange={(v) => onChange({ superSaw: { ...ssConfig, detune: v } })} label="Detune" color="#f43f5e" formatValue={(v) => `${Math.round(v)}`} />
            <Knob value={ssConfig.mix} min={0} max={100} onChange={(v) => onChange({ superSaw: { ...ssConfig, mix: v } })} label="Mix" color="#f43f5e" formatValue={(v) => `${Math.round(v)}%`} />
            <Knob value={ssConfig.stereoSpread} min={0} max={100} onChange={(v) => onChange({ superSaw: { ...ssConfig, stereoSpread: v } })} label="Width" color="#f43f5e" formatValue={(v) => `${Math.round(v)}%`} />
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">FILTER</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={ssConfig.filter.cutoff} min={20} max={20000} onChange={(v) => onChange({ superSaw: { ...ssConfig, filter: { ...ssConfig.filter, cutoff: v } } })} label="Cutoff" color="#f43f5e" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob value={ssConfig.filter.resonance} min={0} max={100} onChange={(v) => onChange({ superSaw: { ...ssConfig, filter: { ...ssConfig.filter, resonance: v } } })} label="Reso" color="#f43f5e" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={ssConfig.filter.envelopeAmount} min={-100} max={100} onChange={(v) => onChange({ superSaw: { ...ssConfig, filter: { ...ssConfig.filter, envelopeAmount: v } } })} label="Env Amt" color="#f43f5e" bipolar formatValue={(v) => `${Math.round(v)}%`} />
            </div>
          </div>
        </section>
      );
    }

    // POLYSYNTH
    case 'PolySynth': {
      const psConfig = instrument.polySynth || DEFAULT_POLYSYNTH;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#06b6d4" title="PolySynth" />
          <div className="flex gap-2 mb-3">
            {(['Synth', 'FMSynth', 'ToneAM'] as const).map((type) => (
              <button key={type} onClick={() => onChange({ polySynth: { ...psConfig, voiceType: type } })} className={`flex-1 px-2 py-1.5 rounded font-bold text-xs transition-all ${psConfig.voiceType === type ? 'bg-accent-highlight/20 border border-accent-highlight text-accent-highlight' : 'bg-dark-bgTertiary border border-dark-borderLight text-text-secondary hover:border-dark-borderLight'}`}>{type}</button>
            ))}
          </div>
          <div className="grid gap-3 mb-3">
            <Knob value={psConfig.voiceCount} min={1} max={16} onChange={(v) => onChange({ polySynth: { ...psConfig, voiceCount: Math.round(v) } })} label="Voices" color="#06b6d4" formatValue={(v) => Math.round(v).toString()} />
            <Knob value={psConfig.portamento} min={0} max={1000} onChange={(v) => onChange({ polySynth: { ...psConfig, portamento: v } })} label="Portamento" color="#06b6d4" formatValue={(v) => `${Math.round(v)}ms`} />
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">VOICE STEAL MODE</p>
            <div className="flex gap-2">
              {(['oldest', 'lowest', 'highest'] as const).map((mode) => (
                <button key={mode} onClick={() => onChange({ polySynth: { ...psConfig, stealMode: mode } })} className={`flex-1 px-2 py-1 rounded text-xs font-bold uppercase transition-all ${psConfig.stealMode === mode ? 'bg-accent-highlight/20 text-accent-highlight' : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'}`}>{mode}</button>
              ))}
            </div>
          </div>
        </section>
      );
    }

    // ORGAN
    case 'Organ': {
      const orgConfig = instrument.organ || DEFAULT_ORGAN;
      const drawbarLabels = ["16'", "5⅓'", "8'", "4'", "2⅔'", "2'", "1⅗'", "1⅓'", "1'"];
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#84cc16" title="Drawbars" />
          <div className="flex justify-between gap-1 mb-3">
            {orgConfig.drawbars.map((value, i) => (
              <div key={i} className="flex flex-col items-center">
                <Knob
                  value={value}
                  min={0}
                  max={8}
                  step={1}
                 
                  onChange={(v) => { 
                    const newDrawbars = [...orgConfig.drawbars] as typeof orgConfig.drawbars; 
                    newDrawbars[i] = Math.round(v); 
                    onChange({ organ: { ...orgConfig, drawbars: newDrawbars } }); 
                  }}
                  label={drawbarLabels[i]}
                  color="#84cc16"
                  formatValue={(v) => `${Math.round(v)}`}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 items-center pt-2 border-t border-dark-borderLight">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={orgConfig.rotary.enabled} onChange={(e) => onChange({ organ: { ...orgConfig, rotary: { ...orgConfig.rotary, enabled: e.target.checked } } })} className="w-4 h-4 rounded bg-dark-bgHover border-dark-borderLight" />
              <span className="text-xs text-text-secondary">ROTARY</span>
            </label>
            {orgConfig.rotary.enabled && (
              <div className="flex gap-1">
                {(['slow', 'fast'] as const).map((speed) => (
                  <button key={speed} onClick={() => onChange({ organ: { ...orgConfig, rotary: { ...orgConfig.rotary, speed } } })} className={`px-2 py-1 rounded text-xs font-bold uppercase transition-all ${orgConfig.rotary.speed === speed ? 'bg-lime-500/20 text-lime-400' : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'}`}>{speed}</button>
                ))}
              </div>
            )}
            <Knob value={orgConfig.keyClick} min={0} max={100} onChange={(v) => onChange({ organ: { ...orgConfig, keyClick: v } })} label="Click" color="#84cc16" formatValue={(v) => `${Math.round(v)}%`} />
          </div>
        </section>
      );
    }

    // DRUM MACHINE
    case 'DrumMachine': {
      const dmConfig = instrument.drumMachine || DEFAULT_DRUM_MACHINE;
      const drumType = dmConfig.drumType;

      const renderDrumParams = () => {
        switch (drumType) {
          case 'kick': {
            const kick = dmConfig.kick || DEFAULT_DRUM_MACHINE.kick!;
            return (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
                <Knob value={kick.pitch} min={30} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, pitch: v } } })} label="Pitch" color="#ef4444" formatValue={(v) => `${Math.round(v)}Hz`} />
                <Knob value={kick.decay} min={50} max={1000} onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, decay: v } } })} label="Decay" color="#ef4444" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={kick.tone} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, tone: v } } })} label="Tone" color="#ef4444" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={kick.drive} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, drive: v } } })} label="Drive" color="#ef4444" formatValue={(v) => `${Math.round(v)}%`} />
              </div>
            );
          }
          case 'snare': {
            const snare = dmConfig.snare || DEFAULT_DRUM_MACHINE.snare!;
            return (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
                <Knob value={snare.pitch} min={100} max={400} onChange={(v) => onChange({ drumMachine: { ...dmConfig, snare: { ...snare, pitch: v } } })} label="Pitch" color="#f97316" formatValue={(v) => `${Math.round(v)}Hz`} />
                <Knob value={snare.decay} min={50} max={500} onChange={(v) => onChange({ drumMachine: { ...dmConfig, snare: { ...snare, decay: v } } })} label="Decay" color="#f97316" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={snare.tone} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, snare: { ...snare, tone: v } } })} label="Tone" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={snare.snappy} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, snare: { ...snare, snappy: v } } })} label="Snappy" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
              </div>
            );
          }
          default:
            return <p className="text-text-muted text-sm">Select a drum type above</p>;
        }
      };

      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#ef4444" title={`${drumType.toUpperCase()} Parameters`} />
          {renderDrumParams()}
        </section>
      );
    }

    // CHIP SYNTH
    case 'ChipSynth': {
      const chipConfig = instrument.chipSynth || DEFAULT_CHIP_SYNTH;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#22d3ee" title="Chip Parameters" />
          <div className="flex gap-1 mb-3">
            {(['pulse1', 'pulse2', 'triangle', 'noise'] as const).map((ch) => (
              <button key={ch} onClick={() => onChange({ chipSynth: { ...chipConfig, channel: ch } })} className={`flex-1 px-2 py-1 rounded text-xs font-bold uppercase transition-all ${chipConfig.channel === ch ? 'bg-accent-highlight/20 text-accent-highlight ring-1 ring-accent-highlight' : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'}`}>{ch.replace('pulse', 'P')}</button>
            ))}
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <Knob value={chipConfig.bitDepth} min={2} max={16} onChange={(v) => onChange({ chipSynth: { ...chipConfig, bitDepth: Math.round(v) } })} label="Bits" color="#22d3ee" formatValue={(v) => `${Math.round(v)}`} />
            {(chipConfig.channel === 'pulse1' || chipConfig.channel === 'pulse2') && (
              <Knob value={chipConfig.pulse?.duty || 50} min={12.5} max={50} step={12.5} onChange={(v) => onChange({ chipSynth: { ...chipConfig, pulse: { duty: v as 12.5 | 25 | 50 } } })} label="Duty" color="#22d3ee" formatValue={(v) => `${v}%`} />
            )}
            <Knob value={chipConfig.vibrato.speed} min={0} max={20} step={0.5} onChange={(v) => onChange({ chipSynth: { ...chipConfig, vibrato: { ...chipConfig.vibrato, speed: v } } })} label="Vib Spd" color="#22d3ee" formatValue={(v) => `${v.toFixed(1)}Hz`} />
            <Knob value={chipConfig.vibrato.depth} min={0} max={100} onChange={(v) => onChange({ chipSynth: { ...chipConfig, vibrato: { ...chipConfig.vibrato, depth: v } } })} label="Vib Dep" color="#22d3ee" formatValue={(v) => `${Math.round(v)}%`} />
          </div>
        </section>
      );
    }

    // WOBBLE BASS
    case 'WobbleBass': {
      const wbConfig = instrument.wobbleBass || DEFAULT_WOBBLE_BASS;
      const modeOptions = [
        { value: 'classic' as const, label: 'CLS' },
        { value: 'reese' as const, label: 'RSE' },
        { value: 'fm' as const, label: 'FM' },
        { value: 'growl' as const, label: 'GRL' },
        { value: 'hybrid' as const, label: 'HYB' },
      ];
      const syncOptions = [
        { value: 'free' as const, label: 'Free' },
        { value: '1/4' as const, label: '1/4' },
        { value: '1/8' as const, label: '1/8' },
        { value: '1/16' as const, label: '1/16' },
      ];
      const distTypes = ['soft', 'hard', 'fuzz', 'bitcrush'] as const;
      const vowelsWb: VowelType[] = ['A', 'E', 'I', 'O', 'U'];
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border space-y-4">
          <SectionHeader color="#d946ef" title="Wobble Bass" />
          {/* Mode selector */}
          <div className="flex gap-1">
            {modeOptions.map((mode) => (
              <button key={mode.value} onClick={() => onChange({ wobbleBass: { ...wbConfig, mode: mode.value } })} className={`px-2 py-1 text-xs rounded transition-colors ${wbConfig.mode === mode.value ? 'bg-fuchsia-500 text-text-primary' : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'}`}>{mode.label}</button>
            ))}
          </div>
          {/* Oscillators */}
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">OSC 1 / OSC 2</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={wbConfig.osc1.level} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, osc1: { ...wbConfig.osc1, level: v } } })} label="O1 Lv" color="#d946ef" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={wbConfig.osc1.detune} min={-100} max={100} bipolar onChange={(v) => onChange({ wobbleBass: { ...wbConfig, osc1: { ...wbConfig.osc1, detune: v } } })} label="O1 Det" color="#d946ef" formatValue={(v) => `${Math.round(v)}¢`} />
              <Knob value={wbConfig.osc2.level} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, osc2: { ...wbConfig.osc2, level: v } } })} label="O2 Lv" color="#c026d3" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={wbConfig.osc2.detune} min={-100} max={100} bipolar onChange={(v) => onChange({ wobbleBass: { ...wbConfig, osc2: { ...wbConfig.osc2, detune: v } } })} label="O2 Det" color="#c026d3" formatValue={(v) => `${Math.round(v)}¢`} />
            </div>
          </div>
          {/* Sub + Unison */}
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">SUB / UNISON</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <button onClick={() => onChange({ wobbleBass: { ...wbConfig, sub: { ...wbConfig.sub, enabled: !wbConfig.sub.enabled } } })} className={`px-2 py-1.5 rounded text-xs font-bold transition-all ${wbConfig.sub.enabled ? 'bg-fuchsia-500/20 border border-fuchsia-500 text-fuchsia-400' : 'bg-dark-bgTertiary border border-dark-borderLight text-text-secondary'}`}>SUB</button>
              {wbConfig.sub.enabled && (
                <Knob value={wbConfig.sub.level} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, sub: { ...wbConfig.sub, level: v } } })} label="Sub Lv" color="#e879f9" formatValue={(v) => `${Math.round(v)}%`} />
              )}
              <Knob value={wbConfig.unison.voices} min={1} max={16} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, unison: { ...wbConfig.unison, voices: Math.round(v) } } })} label="Voices" color="#e879f9" formatValue={(v) => Math.round(v).toString()} />
              <Knob value={wbConfig.unison.detune} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, unison: { ...wbConfig.unison, detune: v } } })} label="Spread" color="#e879f9" formatValue={(v) => `${Math.round(v)}¢`} />
            </div>
          </div>
          {/* FM */}
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">FM</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <button onClick={() => onChange({ wobbleBass: { ...wbConfig, fm: { ...wbConfig.fm, enabled: !wbConfig.fm.enabled } } })} className={`px-2 py-1.5 rounded text-xs font-bold transition-all ${wbConfig.fm.enabled ? 'bg-fuchsia-500/20 border border-fuchsia-500 text-fuchsia-400' : 'bg-dark-bgTertiary border border-dark-borderLight text-text-secondary'}`}>FM</button>
              {wbConfig.fm.enabled && (<>
                <Knob value={wbConfig.fm.amount} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, fm: { ...wbConfig.fm, amount: v } } })} label="Amount" color="#f0abfc" formatValue={(v) => `${Math.round(v)}`} />
                <Knob value={wbConfig.fm.ratio} min={0.5} max={8} step={0.5} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, fm: { ...wbConfig.fm, ratio: v } } })} label="Ratio" color="#f0abfc" formatValue={(v) => `${v.toFixed(1)}`} />
                <Knob value={wbConfig.fm.envelope} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, fm: { ...wbConfig.fm, envelope: v } } })} label="FM Env" color="#f0abfc" formatValue={(v) => `${Math.round(v)}%`} />
              </>)}
            </div>
          </div>
          {/* Filter */}
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">FILTER</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={wbConfig.filter.cutoff} min={20} max={20000} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, filter: { ...wbConfig.filter, cutoff: v } } })} label="Cutoff" color="#d946ef" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob value={wbConfig.filter.resonance} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, filter: { ...wbConfig.filter, resonance: v } } })} label="Reso" color="#d946ef" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={wbConfig.filter.drive} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, filter: { ...wbConfig.filter, drive: v } } })} label="Drive" color="#d946ef" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={wbConfig.filterEnvelope.amount} min={-100} max={100} bipolar onChange={(v) => onChange({ wobbleBass: { ...wbConfig, filterEnvelope: { ...wbConfig.filterEnvelope, amount: v } } })} label="Env Amt" color="#d946ef" formatValue={(v) => `${Math.round(v)}%`} />
            </div>
          </div>
          {/* Wobble LFO */}
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">WOBBLE LFO</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <div className="flex flex-col items-center">
                <p className="text-[9px] text-text-muted mb-1">Sync</p>
                <CustomSelect value={wbConfig.wobbleLFO.sync} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, wobbleLFO: { ...wbConfig.wobbleLFO, sync: v as typeof wbConfig.wobbleLFO.sync } } })} className="bg-dark-bgTertiary text-text-primary text-xs px-2 py-1 rounded border border-dark-borderLight" options={syncOptions.map((opt) => ({ value: opt.value, label: opt.label }))} />
              </div>
              <Knob value={wbConfig.wobbleLFO.amount} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, wobbleLFO: { ...wbConfig.wobbleLFO, amount: v } } })} label="Filter" color="#ec4899" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={wbConfig.wobbleLFO.pitchAmount} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, wobbleLFO: { ...wbConfig.wobbleLFO, pitchAmount: v } } })} label="Pitch" color="#ec4899" formatValue={(v) => `${Math.round(v)}¢`} />
              <Knob value={wbConfig.wobbleLFO.fmAmount} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, wobbleLFO: { ...wbConfig.wobbleLFO, fmAmount: v } } })} label="FM Mod" color="#ec4899" formatValue={(v) => `${Math.round(v)}%`} />
            </div>
          </div>
          {/* Distortion */}
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">DISTORTION</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <button onClick={() => onChange({ wobbleBass: { ...wbConfig, distortion: { ...wbConfig.distortion, enabled: !wbConfig.distortion.enabled } } })} className={`px-2 py-1.5 rounded text-xs font-bold transition-all ${wbConfig.distortion.enabled ? 'bg-red-500/20 border border-red-500 text-red-400' : 'bg-dark-bgTertiary border border-dark-borderLight text-text-secondary'}`}>DIST</button>
              {wbConfig.distortion.enabled && (<>
                <div className="flex gap-1">
                  {distTypes.map((dt) => (
                    <button key={dt} onClick={() => onChange({ wobbleBass: { ...wbConfig, distortion: { ...wbConfig.distortion, type: dt } } })} className={`px-1.5 py-1 rounded text-[10px] font-bold uppercase transition-all ${wbConfig.distortion.type === dt ? 'bg-red-500/20 text-red-400' : 'bg-dark-bgTertiary text-text-muted'}`}>{dt}</button>
                  ))}
                </div>
                <Knob value={wbConfig.distortion.drive} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, distortion: { ...wbConfig.distortion, drive: v } } })} label="Drive" color="#ef4444" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={wbConfig.distortion.tone} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, distortion: { ...wbConfig.distortion, tone: v } } })} label="Tone" color="#ef4444" formatValue={(v) => `${Math.round(v)}%`} />
              </>)}
            </div>
          </div>
          {/* Formant (Growl) */}
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">FORMANT (GROWL)</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <button onClick={() => onChange({ wobbleBass: { ...wbConfig, formant: { ...wbConfig.formant, enabled: !wbConfig.formant.enabled } } })} className={`px-2 py-1.5 rounded text-xs font-bold transition-all ${wbConfig.formant.enabled ? 'bg-orange-500/20 border border-orange-500 text-orange-400' : 'bg-dark-bgTertiary border border-dark-borderLight text-text-secondary'}`}>GROWL</button>
              {wbConfig.formant.enabled && (<>
                <div className="flex gap-1">
                  {vowelsWb.map((v) => (
                    <button key={v} onClick={() => onChange({ wobbleBass: { ...wbConfig, formant: { ...wbConfig.formant, vowel: v } } })} className={`px-2 py-1 rounded text-xs font-bold transition-all ${wbConfig.formant.vowel === v ? 'bg-orange-500/20 text-orange-400' : 'bg-dark-bgTertiary text-text-muted'}`}>{v}</button>
                  ))}
                </div>
                <Knob value={wbConfig.formant.morph} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, formant: { ...wbConfig.formant, morph: v } } })} label="Morph" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={wbConfig.formant.lfoAmount} min={0} max={100} onChange={(v) => onChange({ wobbleBass: { ...wbConfig, formant: { ...wbConfig.formant, lfoAmount: v } } })} label="LFO" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
              </>)}
            </div>
          </div>
        </section>
      );
    }

    // BASIC SYNTH
    case 'Synth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#a855f7" title="Basic Synth" />
          <div className="text-center py-4">
            <p className="text-text-secondary text-sm">Simple polyphonic synthesizer</p>
            <p className="text-text-muted text-xs mt-2">
              Use the <span className="text-purple-400 font-medium">Oscillator</span>,{' '}
              <span className="text-purple-400 font-medium">Envelope</span>, and{' '}
              <span className="text-purple-400 font-medium">Filter</span> tabs to shape your sound.
            </p>
          </div>
          <div className="grid gap-3 mt-4">
            <Knob value={params.portamento ?? 0} min={0} max={1} step={0.01} onChange={(v) => updateParam('portamento', v)} label="Portamento" color="#a855f7" formatValue={(v) => `${(v * 1000).toFixed(0)}ms`} />
            <Knob value={params.volume ?? 0} min={-24} max={6} step={0.5} onChange={(v) => updateParam('volume', v)} label="Volume" color="#a855f7" formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`} />
          </div>
        </section>
      );

    // PWM SYNTH
    case 'PWMSynth': {
      const pwmConfig = instrument.pwmSynth || DEFAULT_PWM_SYNTH;
      const pwmWaveforms = ['sine', 'triangle', 'sawtooth'] as const;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border space-y-4">
          <SectionHeader color="#e879f9" title="PWM Synthesis" />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <Knob value={pwmConfig.pulseWidth} min={5} max={95} onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, pulseWidth: v } })} label="Width" color="#e879f9" formatValue={(v) => `${Math.round(v)}%`} />
            <Knob value={pwmConfig.pwmDepth} min={0} max={100} onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, pwmDepth: v } })} label="PWM Depth" color="#e879f9" formatValue={(v) => `${Math.round(v)}%`} />
            <Knob value={pwmConfig.pwmRate} min={0.1} max={20} step={0.1} onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, pwmRate: v } })} label="PWM Rate" color="#e879f9" formatValue={(v) => `${v.toFixed(1)}Hz`} />
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">PWM WAVEFORM</p>
            <div className="flex gap-1 mb-3">
              {pwmWaveforms.map((wf) => (
                <button key={wf} onClick={() => onChange({ pwmSynth: { ...pwmConfig, pwmWaveform: wf } })} className={`flex-1 px-2 py-1.5 rounded text-xs font-bold uppercase transition-all ${pwmConfig.pwmWaveform === wf ? 'bg-fuchsia-500/20 border border-fuchsia-500 text-fuchsia-400' : 'bg-dark-bgTertiary border border-dark-borderLight text-text-secondary hover:border-dark-borderLight'}`}>{wf}</button>
              ))}
            </div>
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">OSCILLATORS</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={pwmConfig.oscillators} min={1} max={3} onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, oscillators: Math.round(v) } })} label="Count" color="#d946ef" formatValue={(v) => Math.round(v).toString()} />
              <Knob value={pwmConfig.detune} min={0} max={50} onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, detune: v } })} label="Detune" color="#d946ef" formatValue={(v) => `${Math.round(v)}¢`} />
            </div>
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">FILTER</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={pwmConfig.filter.cutoff} min={20} max={20000} onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, filter: { ...pwmConfig.filter, cutoff: v } } })} label="Cutoff" color="#c084fc" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob value={pwmConfig.filter.resonance} min={0} max={100} onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, filter: { ...pwmConfig.filter, resonance: v } } })} label="Reso" color="#c084fc" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={pwmConfig.filter.envelopeAmount} min={-100} max={100} bipolar onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, filter: { ...pwmConfig.filter, envelopeAmount: v } } })} label="Env Amt" color="#c084fc" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={pwmConfig.filter.keyTracking} min={0} max={100} onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, filter: { ...pwmConfig.filter, keyTracking: v } } })} label="Key Trk" color="#c084fc" formatValue={(v) => `${Math.round(v)}%`} />
            </div>
          </div>
        </section>
      );
    }

    // STRING MACHINE
    case 'StringMachine': {
      const smConfig = instrument.stringMachine || DEFAULT_STRING_MACHINE;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border space-y-4">
          <SectionHeader color="#22c55e" title="String Machine" />
          <div>
            <p className="text-xs text-text-muted mb-2">SECTIONS</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={smConfig.sections.violin} min={0} max={100} onChange={(v) => onChange({ stringMachine: { ...smConfig, sections: { ...smConfig.sections, violin: v } } })} label="Violin" color="#4ade80" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={smConfig.sections.viola} min={0} max={100} onChange={(v) => onChange({ stringMachine: { ...smConfig, sections: { ...smConfig.sections, viola: v } } })} label="Viola" color="#22c55e" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={smConfig.sections.cello} min={0} max={100} onChange={(v) => onChange({ stringMachine: { ...smConfig, sections: { ...smConfig.sections, cello: v } } })} label="Cello" color="#16a34a" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={smConfig.sections.bass} min={0} max={100} onChange={(v) => onChange({ stringMachine: { ...smConfig, sections: { ...smConfig.sections, bass: v } } })} label="Bass" color="#15803d" formatValue={(v) => `${Math.round(v)}%`} />
            </div>
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">ENSEMBLE</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={smConfig.ensemble.depth} min={0} max={100} onChange={(v) => onChange({ stringMachine: { ...smConfig, ensemble: { ...smConfig.ensemble, depth: v } } })} label="Depth" color="#34d399" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={smConfig.ensemble.rate} min={0.5} max={6} step={0.1} onChange={(v) => onChange({ stringMachine: { ...smConfig, ensemble: { ...smConfig.ensemble, rate: v } } })} label="Rate" color="#34d399" formatValue={(v) => `${v.toFixed(1)}Hz`} />
              <Knob value={smConfig.ensemble.voices} min={2} max={6} onChange={(v) => onChange({ stringMachine: { ...smConfig, ensemble: { ...smConfig.ensemble, voices: Math.round(v) } } })} label="Voices" color="#34d399" formatValue={(v) => Math.round(v).toString()} />
            </div>
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">AMPLITUDE</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={smConfig.attack} min={10} max={2000} onChange={(v) => onChange({ stringMachine: { ...smConfig, attack: v } })} label="Attack" color="#6ee7b7" formatValue={(v) => `${Math.round(v)}ms`} />
              <Knob value={smConfig.release} min={100} max={5000} onChange={(v) => onChange({ stringMachine: { ...smConfig, release: v } })} label="Release" color="#6ee7b7" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`} />
              <Knob value={smConfig.brightness} min={0} max={100} onChange={(v) => onChange({ stringMachine: { ...smConfig, brightness: v } })} label="Bright" color="#6ee7b7" formatValue={(v) => `${Math.round(v)}%`} />
            </div>
          </div>
        </section>
      );
    }

    // FORMANT SYNTH
    case 'FormantSynth': {
      const fmtConfig = instrument.formantSynth || DEFAULT_FORMANT_SYNTH;
      const vowels: VowelType[] = ['A', 'E', 'I', 'O', 'U'];
      const morphModes = ['manual', 'lfo', 'envelope'] as const;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border space-y-4">
          <SectionHeader color="#f97316" title="Formant Synthesis" />
          <div>
            <p className="text-xs text-text-muted mb-2">VOWEL</p>
            <div className="flex gap-1 mb-3">
              {vowels.map((v) => (
                <button key={v} onClick={() => onChange({ formantSynth: { ...fmtConfig, vowel: v, formants: { ...fmtConfig.formants, ...VOWEL_FORMANTS[v] } } })} className={`flex-1 px-3 py-2 rounded text-sm font-bold transition-all ${fmtConfig.vowel === v ? 'bg-orange-500/20 border border-orange-500 text-orange-400' : 'bg-dark-bgTertiary border border-dark-borderLight text-text-secondary hover:border-dark-borderLight'}`}>{v}</button>
              ))}
            </div>
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">VOWEL MORPH</p>
            <div className="flex gap-1 mb-2">
              {vowels.map((v) => (
                <button key={v} onClick={() => onChange({ formantSynth: { ...fmtConfig, vowelMorph: { ...fmtConfig.vowelMorph, target: v } } })} className={`flex-1 px-2 py-1 rounded text-xs font-bold transition-all ${fmtConfig.vowelMorph.target === v ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500' : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'}`}>→{v}</button>
              ))}
            </div>
            <div className="flex gap-1 mb-3">
              {morphModes.map((mode) => (
                <button key={mode} onClick={() => onChange({ formantSynth: { ...fmtConfig, vowelMorph: { ...fmtConfig.vowelMorph, mode } } })} className={`flex-1 px-2 py-1 rounded text-xs font-bold uppercase transition-all ${fmtConfig.vowelMorph.mode === mode ? 'bg-orange-500/20 text-orange-400' : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'}`}>{mode}</button>
              ))}
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={fmtConfig.vowelMorph.amount} min={0} max={100} onChange={(v) => onChange({ formantSynth: { ...fmtConfig, vowelMorph: { ...fmtConfig.vowelMorph, amount: v } } })} label="Amount" color="#fb923c" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={fmtConfig.vowelMorph.rate} min={0} max={5} step={0.1} onChange={(v) => onChange({ formantSynth: { ...fmtConfig, vowelMorph: { ...fmtConfig.vowelMorph, rate: v } } })} label="Rate" color="#fb923c" formatValue={(v) => `${v.toFixed(1)}Hz`} />
            </div>
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">FORMANTS</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={fmtConfig.formants.f1} min={200} max={1200} onChange={(v) => onChange({ formantSynth: { ...fmtConfig, formants: { ...fmtConfig.formants, f1: v } } })} label="F1" color="#f97316" formatValue={(v) => `${Math.round(v)}Hz`} />
              <Knob value={fmtConfig.formants.f2} min={500} max={3000} onChange={(v) => onChange({ formantSynth: { ...fmtConfig, formants: { ...fmtConfig.formants, f2: v } } })} label="F2" color="#f97316" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob value={fmtConfig.formants.f3} min={1500} max={4000} onChange={(v) => onChange({ formantSynth: { ...fmtConfig, formants: { ...fmtConfig.formants, f3: v } } })} label="F3" color="#f97316" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob value={fmtConfig.formants.bandwidth} min={50} max={200} onChange={(v) => onChange({ formantSynth: { ...fmtConfig, formants: { ...fmtConfig.formants, bandwidth: v } } })} label="BW" color="#f97316" formatValue={(v) => `${Math.round(v)}Hz`} />
              <Knob value={fmtConfig.brightness} min={0} max={100} onChange={(v) => onChange({ formantSynth: { ...fmtConfig, brightness: v } })} label="Bright" color="#fb923c" formatValue={(v) => `${Math.round(v)}%`} />
            </div>
          </div>
        </section>
      );
    }

    // WAVETABLE
    case 'Wavetable': {
      const wtConfig = instrument.wavetable || DEFAULT_WAVETABLE;
      const morphSources = ['none', 'lfo', 'envelope'] as const;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border space-y-4">
          <SectionHeader color="#06b6d4" title="Wavetable" />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
            <Knob value={wtConfig.morphPosition} min={0} max={100} onChange={(v) => onChange({ wavetable: { ...wtConfig, morphPosition: v } })} label="Morph" color="#06b6d4" formatValue={(v) => `${Math.round(v)}%`} />
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">MORPH MODULATION</p>
            <div className="flex gap-1 mb-3">
              {morphSources.map((src) => (
                <button key={src} onClick={() => onChange({ wavetable: { ...wtConfig, morphModSource: src } })} className={`flex-1 px-2 py-1.5 rounded text-xs font-bold uppercase transition-all ${wtConfig.morphModSource === src ? 'bg-accent-highlight/20 border border-accent-highlight text-accent-highlight' : 'bg-dark-bgTertiary border border-dark-borderLight text-text-secondary hover:border-dark-borderLight'}`}>{src}</button>
              ))}
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={wtConfig.morphModAmount} min={0} max={100} onChange={(v) => onChange({ wavetable: { ...wtConfig, morphModAmount: v } })} label="Mod Amt" color="#22d3ee" formatValue={(v) => `${Math.round(v)}%`} />
              {wtConfig.morphModSource === 'lfo' && (
                <Knob value={wtConfig.morphLFORate} min={0.1} max={20} step={0.1} onChange={(v) => onChange({ wavetable: { ...wtConfig, morphLFORate: v } })} label="LFO Rate" color="#22d3ee" formatValue={(v) => `${v.toFixed(1)}Hz`} />
              )}
            </div>
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">UNISON</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={wtConfig.unison.voices} min={1} max={8} onChange={(v) => onChange({ wavetable: { ...wtConfig, unison: { ...wtConfig.unison, voices: Math.round(v) } } })} label="Voices" color="#67e8f9" formatValue={(v) => Math.round(v).toString()} />
              <Knob value={wtConfig.unison.detune} min={0} max={100} onChange={(v) => onChange({ wavetable: { ...wtConfig, unison: { ...wtConfig.unison, detune: v } } })} label="Detune" color="#67e8f9" formatValue={(v) => `${Math.round(v)}¢`} />
              <Knob value={wtConfig.unison.stereoSpread} min={0} max={100} onChange={(v) => onChange({ wavetable: { ...wtConfig, unison: { ...wtConfig.unison, stereoSpread: v } } })} label="Spread" color="#67e8f9" formatValue={(v) => `${Math.round(v)}%`} />
            </div>
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">FILTER</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={wtConfig.filter.cutoff} min={20} max={20000} onChange={(v) => onChange({ wavetable: { ...wtConfig, filter: { ...wtConfig.filter, cutoff: v } } })} label="Cutoff" color="#0891b2" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob value={wtConfig.filter.resonance} min={0} max={100} onChange={(v) => onChange({ wavetable: { ...wtConfig, filter: { ...wtConfig.filter, resonance: v } } })} label="Reso" color="#0891b2" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={wtConfig.filter.envelopeAmount} min={-100} max={100} bipolar onChange={(v) => onChange({ wavetable: { ...wtConfig, filter: { ...wtConfig.filter, envelopeAmount: v } } })} label="Env Amt" color="#0891b2" formatValue={(v) => `${Math.round(v)}%`} />
            </div>
          </div>
        </section>
      );
    }

    // GRANULAR SYNTH
    case 'GranularSynth': {
      const grConfig = instrument.granular || DEFAULT_GRANULAR;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border space-y-4">
          <SectionHeader color="#a78bfa" title="Granular Synthesis" />
          <div>
            <p className="text-xs text-text-muted mb-2">GRAIN</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={grConfig.grainSize} min={10} max={500} onChange={(v) => onChange({ granular: { ...grConfig, grainSize: v } })} label="Size" color="#a78bfa" formatValue={(v) => `${Math.round(v)}ms`} />
              <Knob value={grConfig.grainOverlap} min={0} max={100} onChange={(v) => onChange({ granular: { ...grConfig, grainOverlap: v } })} label="Overlap" color="#a78bfa" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={grConfig.density} min={1} max={16} onChange={(v) => onChange({ granular: { ...grConfig, density: Math.round(v) } })} label="Density" color="#a78bfa" formatValue={(v) => Math.round(v).toString()} />
              <button onClick={() => onChange({ granular: { ...grConfig, reverse: !grConfig.reverse } })} className={`px-3 py-2 rounded text-xs font-bold transition-all ${grConfig.reverse ? 'bg-purple-500/20 border border-purple-500 text-purple-400' : 'bg-dark-bgTertiary border border-dark-borderLight text-text-secondary hover:border-dark-borderLight'}`}>REV</button>
            </div>
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">PLAYBACK</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={grConfig.scanPosition} min={0} max={100} onChange={(v) => onChange({ granular: { ...grConfig, scanPosition: v } })} label="Position" color="#8b5cf6" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={grConfig.scanSpeed} min={-100} max={100} bipolar onChange={(v) => onChange({ granular: { ...grConfig, scanSpeed: v } })} label="Scan Spd" color="#8b5cf6" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={grConfig.playbackRate} min={0.25} max={4} step={0.01} onChange={(v) => onChange({ granular: { ...grConfig, playbackRate: v } })} label="Speed" color="#8b5cf6" formatValue={(v) => `${v.toFixed(2)}x`} />
              <Knob value={grConfig.detune} min={-1200} max={1200} bipolar onChange={(v) => onChange({ granular: { ...grConfig, detune: v } })} label="Detune" color="#8b5cf6" formatValue={(v) => `${Math.round(v)}¢`} />
            </div>
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">RANDOM</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={grConfig.randomPitch} min={0} max={100} onChange={(v) => onChange({ granular: { ...grConfig, randomPitch: v } })} label="Rnd Pitch" color="#7c3aed" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={grConfig.randomPosition} min={0} max={100} onChange={(v) => onChange({ granular: { ...grConfig, randomPosition: v } })} label="Rnd Pos" color="#7c3aed" formatValue={(v) => `${Math.round(v)}%`} />
            </div>
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">GRAIN ENVELOPE</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={grConfig.envelope.attack} min={1} max={100} onChange={(v) => onChange({ granular: { ...grConfig, envelope: { ...grConfig.envelope, attack: v } } })} label="Attack" color="#c4b5fd" formatValue={(v) => `${Math.round(v)}ms`} />
              <Knob value={grConfig.envelope.release} min={1} max={100} onChange={(v) => onChange({ granular: { ...grConfig, envelope: { ...grConfig.envelope, release: v } } })} label="Release" color="#c4b5fd" formatValue={(v) => `${Math.round(v)}ms`} />
            </div>
          </div>
          <div className="pt-3 border-t border-dark-borderLight">
            <p className="text-xs text-text-muted mb-2">FILTER</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}>
              <Knob value={grConfig.filter.cutoff} min={20} max={20000} onChange={(v) => onChange({ granular: { ...grConfig, filter: { ...grConfig.filter, cutoff: v } } })} label="Cutoff" color="#6d28d9" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob value={grConfig.filter.resonance} min={0} max={100} onChange={(v) => onChange({ granular: { ...grConfig, filter: { ...grConfig.filter, resonance: v } } })} label="Reso" color="#6d28d9" formatValue={(v) => `${Math.round(v)}%`} />
            </div>
          </div>
        </section>
      );
    }

    default:
      return null;
  }
}
