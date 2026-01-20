/**
 * VisualSynthEditor - Modern VST-style visual synthesizer editor
 * Features knobs, waveform displays, ADSR visualization, and filter curves
 */

import React from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_CHIP_SYNTH } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { ADSREnvelope } from '@components/ui/ADSREnvelope';
import { WaveformSelector } from '@components/ui/WaveformSelector';
import { FilterCurve } from '@components/ui/FilterCurve';
import { SampleEditor } from './SampleEditor';
import { ArpeggioEditor } from './ArpeggioEditor';
import { getSynthInfo } from '@constants/synthCategories';
import { SynthIcon } from './SynthIcon';

// Sample-based synth types
const SAMPLE_SYNTH_TYPES = ['Sampler', 'Player', 'GranularSynth'];

// Drum types for DrumMachine
const DRUM_TYPES = [
  { id: 'kick', label: 'KICK', icon: '🥁', description: '808-style bass kick' },
  { id: 'snare', label: 'SNARE', icon: '🪘', description: 'Punchy snare with noise' },
  { id: 'hihat', label: 'HI-HAT', icon: '🎛️', description: 'Metallic hi-hat' },
  { id: 'clap', label: 'CLAP', icon: '👏', description: 'Filtered noise clap' },
] as const;

interface VisualSynthEditorProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const VisualSynthEditor: React.FC<VisualSynthEditorProps> = ({
  instrument,
  onChange,
}) => {
  const isSampleBased = SAMPLE_SYNTH_TYPES.includes(instrument.synthType);
  const synthInfo = getSynthInfo(instrument.synthType);

  // Update helpers - ensure we have defaults when spreading optional types
  const updateOscillator = (key: string, value: unknown) => {
    const currentOsc = instrument.oscillator || { type: 'sawtooth', detune: 0, octave: 0 };
    onChange({
      oscillator: { ...currentOsc, [key]: value } as InstrumentConfig['oscillator'],
    });
  };

  const updateEnvelope = (key: string, value: number) => {
    const currentEnv = instrument.envelope || { attack: 10, decay: 200, sustain: 50, release: 1000 };
    onChange({
      envelope: { ...currentEnv, [key]: value } as InstrumentConfig['envelope'],
    });
  };

  const updateFilter = (key: string, value: unknown) => {
    const currentFilter = instrument.filter || { type: 'lowpass' as const, frequency: 2000, Q: 1, rolloff: -24 as const };
    onChange({
      filter: { ...currentFilter, [key]: value } as InstrumentConfig['filter'],
    });
  };

  return (
    <div className="bg-gradient-to-b from-[#1e1e1e] to-[#151515] min-h-full">
      {/* Header with synth info */}
      <div className="px-6 py-4 border-b border-gray-800 bg-[#1a1a1a]">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 ${synthInfo.color}`}>
            <SynthIcon iconName={synthInfo.icon} size={28} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">{synthInfo.name}</h2>
            <p className="text-sm text-gray-400">{synthInfo.description}</p>
          </div>
          <div className="flex gap-1">
            {synthInfo.bestFor.slice(0, 3).map((tag) => (
              <span key={tag} className="px-2 py-1 text-xs rounded-full bg-gray-800 text-gray-400">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Sample Editor for sample-based instruments */}
      {isSampleBased && (
        <div className="p-4">
          <SampleEditor instrument={instrument} onChange={onChange} />
        </div>
      )}

      {/* DrumMachine Type Selector */}
      {instrument.synthType === 'DrumMachine' && (
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-red-500 rounded-full" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">Drum Type</h3>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {DRUM_TYPES.map((drum) => {
              const isSelected = instrument.drumMachine?.drumType === drum.id;
              return (
                                  <button
                                    key={drum.id}
                                    onClick={() => onChange({
                                      drumMachine: {
                                        ...instrument.drumMachine,
                                        drumType: drum.id as 'kick' | 'snare' | 'hihat' | 'clap',
                                      },
                                    })}
                                    className={`                    flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all
                    ${isSelected
                      ? 'bg-red-500/20 border-red-500 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                    }
                  `}
                >
                  <span className="text-2xl mb-1">{drum.icon}</span>
                  <span className="text-xs font-bold">{drum.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-gray-500 text-center">
            {DRUM_TYPES.find(d => d.id === instrument.drumMachine?.drumType)?.description || 'Select a drum type'}
          </p>
        </div>
      )}

      {/* ChipSynth Arpeggio Editor */}
      {instrument.synthType === 'ChipSynth' && instrument.chipSynth && (
        <div className="px-4 pb-4">
          <ArpeggioEditor
            config={instrument.chipSynth.arpeggio || { enabled: false, speed: 15, pattern: [0, 4, 7] }}
            onChange={(arpeggio) => {
              const currentChip = instrument.chipSynth || DEFAULT_CHIP_SYNTH;
              onChange({
                chipSynth: {
                  ...currentChip,
                  arpeggio,
                },
              });
            }}
          />
        </div>
      )}

      {/* Main Controls Grid */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Oscillator Section */}
          {instrument.oscillator && !isSampleBased && (
            <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-blue-500 rounded-full" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">Oscillator</h3>
              </div>

              {/* Waveform Selector */}
              <div className="mb-4">
                <WaveformSelector
                  value={instrument.oscillator.type as 'sine' | 'square' | 'sawtooth' | 'triangle'}
                  onChange={(type) => updateOscillator('type', type)}
                  size="lg"
                  color="#4a9eff"
                />
              </div>

              {/* Oscillator Knobs */}
              <div className="flex justify-around items-end">
                <Knob
                  value={instrument.oscillator.detune || 0}
                  min={-100}
                  max={100}
                  onChange={(v) => updateOscillator('detune', v)}
                  label="Detune"
                  unit="¢"
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
          )}

          {/* Amplitude Envelope */}
          {instrument.envelope && (
            <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-green-500 rounded-full" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">Amplitude Envelope</h3>
              </div>

              <ADSREnvelope
                attack={instrument.envelope.attack}
                decay={instrument.envelope.decay}
                sustain={instrument.envelope.sustain}
                release={instrument.envelope.release}
                onChange={(param, value) => updateEnvelope(param, value)}
                color="#00ff88"
              />
            </section>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Filter Section */}
          {instrument.filter && (
            <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-red-500 rounded-full" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">Filter</h3>
              </div>

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
                        : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                      }
                    `}
                  >
                    {type.replace('pass', '')}
                  </button>
                ))}
              </div>

              <FilterCurve
                cutoff={instrument.filter.frequency}
                resonance={instrument.filter.Q}
                type={instrument.filter.type as 'lowpass' | 'highpass' | 'bandpass' | 'notch'}
                onCutoffChange={(v) => updateFilter('frequency', v)}
                onResonanceChange={(v) => updateFilter('Q', v)}
                color="#ff6b6b"
              />

              {/* Filter Knobs */}
              <div className="flex justify-around items-end mt-4">
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
            </section>
          )}

          {/* Output Section */}
          <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 bg-purple-500 rounded-full" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">Output</h3>
            </div>

            <div className="flex justify-around items-end">
              <Knob
                value={instrument.volume}
                min={-60}
                max={0}
                onChange={(v) => onChange({ volume: v })}
                label="Volume"
                unit="dB"
                size="lg"
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

          {/* Synth-Specific Parameters */}
          {renderSpecialParameters(instrument, onChange)}
        </div>
      </div>
    </div>
  );
};

/**
 * Render special parameters for specific synth types
 */
function renderSpecialParameters(
  instrument: InstrumentConfig,
  onChange: (updates: Partial<InstrumentConfig>) => void
): React.ReactNode {
  const params = instrument.parameters || {};

  const updateParam = (key: string, value: unknown) => {
    onChange({
      parameters: { ...params, [key]: value },
    });
  };

  switch (instrument.synthType) {
    case 'FMSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-cyan-500 rounded-full" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">FM Synthesis</h3>
          </div>
          <div className="flex justify-around items-end">
            <Knob
              value={params.modulationIndex || 10}
              min={0}
              max={50}
              onChange={(v) => updateParam('modulationIndex', v)}
              label="Mod Index"
              color="#22d3ee"
              formatValue={(v) => v.toFixed(1)}
            />
            <Knob
              value={params.harmonicity || 3}
              min={0.1}
              max={10}
              step={0.1}
              onChange={(v) => updateParam('harmonicity', v)}
              label="Harmonicity"
              color="#22d3ee"
              formatValue={(v) => v.toFixed(2)}
            />
          </div>
        </section>
      );

    case 'AMSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-teal-500 rounded-full" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">AM Synthesis</h3>
          </div>
          <div className="flex justify-center">
            <Knob
              value={params.harmonicity || 3}
              min={0.1}
              max={10}
              step={0.1}
              onChange={(v) => updateParam('harmonicity', v)}
              label="Harmonicity"
              size="lg"
              color="#14b8a6"
              formatValue={(v) => v.toFixed(2)}
            />
          </div>
        </section>
      );

    case 'PluckSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-amber-500 rounded-full" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">Pluck Parameters</h3>
          </div>
          <div className="flex justify-around items-end">
            <Knob
              value={params.dampening || 4000}
              min={100}
              max={10000}
              onChange={(v) => updateParam('dampening', v)}
              label="Dampening"
              color="#f59e0b"
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
            />
            <Knob
              value={params.resonance || 0.9}
              min={0}
              max={0.99}
              step={0.01}
              onChange={(v) => updateParam('resonance', v)}
              label="Resonance"
              color="#f59e0b"
              formatValue={(v) => v.toFixed(2)}
            />
          </div>
        </section>
      );

    case 'MembraneSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-orange-500 rounded-full" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">Membrane Parameters</h3>
          </div>
          <div className="flex justify-around items-end">
            <Knob
              value={params.pitchDecay || 0.05}
              min={0.001}
              max={0.5}
              step={0.001}
              onChange={(v) => updateParam('pitchDecay', v)}
              label="Pitch Decay"
              color="#f97316"
              formatValue={(v) => `${(v * 1000).toFixed(0)}ms`}
            />
            <Knob
              value={params.octaves || 10}
              min={0}
              max={20}
              onChange={(v) => updateParam('octaves', v)}
              label="Octaves"
              color="#f97316"
              formatValue={(v) => v.toFixed(0)}
            />
          </div>
        </section>
      );

    case 'NoiseSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-gray-500 rounded-full" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">Noise Type</h3>
          </div>
          <div className="flex gap-2">
            {['white', 'pink', 'brown'].map((type) => (
              <button
                key={type}
                onClick={() => updateParam('noiseType', type)}
                className={`
                  flex-1 px-4 py-3 rounded-lg font-bold uppercase text-sm transition-all
                  ${params.noiseType === type || (!params.noiseType && type === 'white')
                    ? 'bg-gray-600 text-white ring-2 ring-gray-400'
                    : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                  }
                `}
              >
                {type}
              </button>
            ))}
          </div>
        </section>
      );

    default:
      return null;
  }
}
