/**
 * VisualSynthEditor - Modern VST-style visual synthesizer editor
 * Features knobs, waveform displays, ADSR visualization, and filter curves
 */

import React from 'react';
import type { InstrumentConfig, DrumType, DrumMachineType } from '@typedefs/instrument';
import {
  DEFAULT_CHIP_SYNTH,
  DEFAULT_WAVETABLE,
  DEFAULT_SUPERSAW,
  DEFAULT_POLYSYNTH,
  DEFAULT_ORGAN,
  DEFAULT_DRUM_MACHINE,
  DEFAULT_PWM_SYNTH,
  DEFAULT_STRING_MACHINE,
  DEFAULT_FORMANT_SYNTH,
  DEFAULT_GRANULAR,
} from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { ADSREnvelope } from '@components/ui/ADSREnvelope';
import { WaveformSelector } from '@components/ui/WaveformSelector';
import { FilterCurve } from '@components/ui/FilterCurve';
import { SampleEditor } from './SampleEditor';
import { ArpeggioEditor } from './ArpeggioEditor';
import { FurnaceEditor } from './FurnaceEditor';
import { getSynthInfo } from '@constants/synthCategories';
import * as LucideIcons from 'lucide-react';

// Sample-based synth types
const SAMPLE_SYNTH_TYPES = ['Sampler', 'Player', 'GranularSynth'];

// All drum types for DrumMachine (808/909 complete set)
const DRUM_TYPES = [
  { id: 'kick', label: 'KICK', icon: '🥁', description: 'Bass drum with pitch sweep' },
  { id: 'snare', label: 'SNARE', icon: '🪘', description: 'Body + noise snare' },
  { id: 'clap', label: 'CLAP', icon: '👏', description: 'Filtered noise clap' },
  { id: 'hihat', label: 'HI-HAT', icon: '🎩', description: 'Metallic hi-hat' },
  { id: 'tom', label: 'TOM', icon: '🪘', description: 'Pitched tom drum' },
  { id: 'conga', label: 'CONGA', icon: '🥁', description: 'Pure sine conga' },
  { id: 'rimshot', label: 'RIM', icon: '🔔', description: 'Resonant rimshot' },
  { id: 'clave', label: 'CLAVE', icon: '🪵', description: 'Woody clave click' },
  { id: 'cowbell', label: 'COWBELL', icon: '🔔', description: 'Dual-osc cowbell' },
  { id: 'maracas', label: 'MARACAS', icon: '🎵', description: 'Highpass noise shake' },
  { id: 'cymbal', label: 'CYMBAL', icon: '🥁', description: '3-band cymbal' },
] as const;

// Machine types for drum synthesis character
const MACHINE_TYPES = [
  { id: '808', label: 'TR-808', description: 'Classic analog warmth' },
  { id: '909', label: 'TR-909', description: 'Punchy digital-analog hybrid' },
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

  // Get icon component
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || LucideIcons.Music2;
  };
  const SynthIcon = getIcon(synthInfo.icon);

  // Update helpers - ensure we have defaults when spreading optional types
  const updateOscillator = (key: string, value: any) => {
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

  const updateFilter = (key: string, value: any) => {
    const currentFilter = instrument.filter || { type: 'lowpass' as const, frequency: 2000, Q: 1, rolloff: -24 as const };
    onChange({
      filter: { ...currentFilter, [key]: value },
    });
  };

  return (
    <div className="bg-gradient-to-b from-[#1e1e1e] to-[#151515] min-h-full">
      {/* Header with synth info */}
      <div className="px-6 py-4 border-b border-gray-800 bg-[#1a1a1a]">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 ${synthInfo.color}`}>
            <SynthIcon size={28} />
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

      {/* Furnace Instrument Editor */}
      {instrument.synthType === 'Furnace' && instrument.furnace && (
        <div className="p-4 border-b border-gray-800">
          <FurnaceEditor
            config={instrument.furnace}
            onChange={(furnace) => onChange({ furnace: { ...instrument.furnace!, ...furnace } })}
          />
        </div>
      )}

      {/* DrumMachine Full Editor */}
      {instrument.synthType === 'DrumMachine' && (
        <div className="p-4 border-b border-gray-800 space-y-4">
          {/* Machine Type (808/909) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-orange-500 rounded-full" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">Machine</h3>
            </div>
            <div className="flex gap-2">
              {MACHINE_TYPES.map((machine) => {
                const isSelected = instrument.drumMachine?.machineType === machine.id;
                return (
                  <button
                    key={machine.id}
                    onClick={() => onChange({
                      drumMachine: {
                        ...instrument.drumMachine,
                        drumType: instrument.drumMachine?.drumType || 'kick',
                        machineType: machine.id as DrumMachineType,
                      },
                    })}
                    className={`
                      flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-all
                      ${isSelected
                        ? 'bg-orange-500/20 border-2 border-orange-500 text-orange-400'
                        : 'bg-gray-800 border-2 border-gray-700 text-gray-400 hover:border-gray-500'
                      }
                    `}
                  >
                    {machine.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Drum Type Selector */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-red-500 rounded-full" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">Drum Type</h3>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {DRUM_TYPES.map((drum) => {
                const isSelected = instrument.drumMachine?.drumType === drum.id;
                return (
                  <button
                    key={drum.id}
                    onClick={() => onChange({
                      drumMachine: {
                        ...instrument.drumMachine,
                        machineType: instrument.drumMachine?.machineType || '909',
                        drumType: drum.id as DrumType,
                      },
                    })}
                    className={`
                      flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all
                      ${isSelected
                        ? 'bg-red-500/20 border-red-500 text-white'
                        : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                      }
                    `}
                  >
                    <span className="text-lg">{drum.icon}</span>
                    <span className="text-[10px] font-bold">{drum.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ChipSynth Arpeggio Editor */}
      {instrument.synthType === 'ChipSynth' && instrument.chipSynth && (
        <div className="px-4 pb-4">
          <ArpeggioEditor
            config={instrument.chipSynth.arpeggio || { enabled: false, speed: 15, speedUnit: 'hz', steps: [{ noteOffset: 0 }, { noteOffset: 4 }, { noteOffset: 7 }], mode: 'loop' }}
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
                  value={instrument.oscillator.type as any}
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
                type={instrument.filter.type as any}
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
 * Section header component for consistency
 */
function SectionHeader({ color, title }: { color: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className={`w-1 h-4 rounded-full`} style={{ backgroundColor: color }} />
      <h3 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h3>
    </div>
  );
}

/**
 * Render special parameters for specific synth types
 */
function renderSpecialParameters(
  instrument: InstrumentConfig,
  onChange: (updates: Partial<InstrumentConfig>) => void
): React.ReactNode {
  const params = instrument.parameters || {};

  const updateParam = (key: string, value: any) => {
    onChange({
      parameters: { ...params, [key]: value },
    });
  };

  switch (instrument.synthType) {
    // =========================================================================
    // FM SYNTH - Frequency Modulation
    // =========================================================================
    case 'FMSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#22d3ee" title="FM Synthesis" />
          <div className="flex justify-around items-end">
            <Knob
              value={params.modulationIndex ?? 10}
              min={0}
              max={100}
              onChange={(v) => updateParam('modulationIndex', v)}
              label="Mod Index"
              color="#22d3ee"
              formatValue={(v) => v.toFixed(1)}
            />
            <Knob
              value={params.harmonicity ?? 3}
              min={0.1}
              max={20}
              step={0.1}
              onChange={(v) => updateParam('harmonicity', v)}
              label="Harmonicity"
              color="#22d3ee"
              formatValue={(v) => v.toFixed(2)}
            />
            <Knob
              value={params.modulationEnvAmount ?? 50}
              min={0}
              max={100}
              onChange={(v) => updateParam('modulationEnvAmount', v)}
              label="Mod Env"
              color="#22d3ee"
              formatValue={(v) => `${Math.round(v)}%`}
            />
          </div>
        </section>
      );

    // =========================================================================
    // AM SYNTH - Amplitude Modulation
    // =========================================================================
    case 'AMSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#14b8a6" title="AM Synthesis" />
          <div className="flex justify-around items-end">
            <Knob
              value={params.harmonicity ?? 3}
              min={0.1}
              max={20}
              step={0.1}
              onChange={(v) => updateParam('harmonicity', v)}
              label="Harmonicity"
              color="#14b8a6"
              formatValue={(v) => v.toFixed(2)}
            />
            <Knob
              value={params.modulationDepth ?? 50}
              min={0}
              max={100}
              onChange={(v) => updateParam('modulationDepth', v)}
              label="Depth"
              color="#14b8a6"
              formatValue={(v) => `${Math.round(v)}%`}
            />
          </div>
        </section>
      );

    // =========================================================================
    // PLUCK SYNTH - Karplus-Strong String
    // =========================================================================
    case 'PluckSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#f59e0b" title="Pluck Parameters" />
          <div className="flex justify-around items-end">
            <Knob
              value={params.attackNoise ?? 1}
              min={0}
              max={10}
              step={0.1}
              onChange={(v) => updateParam('attackNoise', v)}
              label="Attack"
              color="#f59e0b"
              formatValue={(v) => v.toFixed(1)}
            />
            <Knob
              value={params.dampening ?? 4000}
              min={100}
              max={10000}
              onChange={(v) => updateParam('dampening', v)}
              label="Dampening"
              color="#f59e0b"
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
            />
            <Knob
              value={params.resonance ?? 0.9}
              min={0.1}
              max={0.999}
              step={0.001}
              onChange={(v) => updateParam('resonance', v)}
              label="Resonance"
              color="#f59e0b"
              formatValue={(v) => v.toFixed(3)}
            />
          </div>
        </section>
      );

    // =========================================================================
    // MEMBRANE SYNTH - Drums/Percussion
    // =========================================================================
    case 'MembraneSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#f97316" title="Membrane Parameters" />
          <div className="flex justify-around items-end">
            <Knob
              value={params.pitchDecay ?? 0.05}
              min={0.001}
              max={1}
              step={0.001}
              onChange={(v) => updateParam('pitchDecay', v)}
              label="Pitch Decay"
              color="#f97316"
              formatValue={(v) => `${(v * 1000).toFixed(0)}ms`}
            />
            <Knob
              value={params.octaves ?? 10}
              min={0.5}
              max={20}
              step={0.5}
              onChange={(v) => updateParam('octaves', v)}
              label="Octaves"
              color="#f97316"
              formatValue={(v) => v.toFixed(1)}
            />
          </div>
        </section>
      );

    // =========================================================================
    // METAL SYNTH - Metallic/Bell Sounds
    // =========================================================================
    case 'MetalSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#ef4444" title="Metal Parameters" />
          <div className="flex justify-around items-end">
            <Knob
              value={params.frequency ?? 200}
              min={50}
              max={1000}
              onChange={(v) => updateParam('frequency', v)}
              label="Frequency"
              color="#ef4444"
              formatValue={(v) => `${Math.round(v)}Hz`}
            />
            <Knob
              value={params.harmonicity ?? 5.1}
              min={0.5}
              max={20}
              step={0.1}
              onChange={(v) => updateParam('harmonicity', v)}
              label="Harmonicity"
              color="#ef4444"
              formatValue={(v) => v.toFixed(1)}
            />
            <Knob
              value={params.modulationIndex ?? 32}
              min={1}
              max={100}
              onChange={(v) => updateParam('modulationIndex', v)}
              label="Mod Index"
              color="#ef4444"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={params.resonance ?? 4000}
              min={100}
              max={8000}
              onChange={(v) => updateParam('resonance', v)}
              label="Resonance"
              color="#ef4444"
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
            />
          </div>
        </section>
      );

    // =========================================================================
    // NOISE SYNTH
    // =========================================================================
    case 'NoiseSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#6b7280" title="Noise Type" />
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

    // =========================================================================
    // DUO SYNTH - Two-Voice Synthesis
    // =========================================================================
    case 'DuoSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#8b5cf6" title="Duo Parameters" />
          <div className="flex justify-around items-end">
            <Knob
              value={params.vibratoAmount ?? 0.5}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => updateParam('vibratoAmount', v)}
              label="Vibrato"
              color="#8b5cf6"
              formatValue={(v) => `${Math.round(v * 100)}%`}
            />
            <Knob
              value={params.vibratoRate ?? 5}
              min={0.1}
              max={20}
              step={0.1}
              onChange={(v) => updateParam('vibratoRate', v)}
              label="Vib Rate"
              color="#8b5cf6"
              formatValue={(v) => `${v.toFixed(1)}Hz`}
            />
            <Knob
              value={params.harmonicity ?? 1.5}
              min={0.5}
              max={4}
              step={0.1}
              onChange={(v) => updateParam('harmonicity', v)}
              label="Harmonicity"
              color="#8b5cf6"
              formatValue={(v) => v.toFixed(2)}
            />
          </div>
        </section>
      );

    // =========================================================================
    // MONO SYNTH - Monophonic with Glide
    // =========================================================================
    case 'MonoSynth':
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#ec4899" title="Mono Parameters" />
          <div className="flex justify-around items-end">
            <Knob
              value={params.portamento ?? 0}
              min={0}
              max={1000}
              onChange={(v) => updateParam('portamento', v)}
              label="Glide"
              color="#ec4899"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
          </div>
        </section>
      );

    // =========================================================================
    // SUPERSAW - Massive Detuned Sawtooths
    // =========================================================================
    case 'SuperSaw': {
      const ssConfig = instrument.superSaw || DEFAULT_SUPERSAW;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#f43f5e" title="SuperSaw" />
          <div className="flex flex-wrap justify-around items-end gap-4">
            <Knob
              value={ssConfig.voices}
              min={3}
              max={9}
              onChange={(v) => onChange({ superSaw: { ...ssConfig, voices: v } })}
              label="Voices"
              color="#f43f5e"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={ssConfig.detune}
              min={0}
              max={100}
              onChange={(v) => onChange({ superSaw: { ...ssConfig, detune: v } })}
              label="Detune"
              color="#f43f5e"
              formatValue={(v) => `${Math.round(v)}¢`}
            />
            <Knob
              value={ssConfig.mix}
              min={0}
              max={100}
              onChange={(v) => onChange({ superSaw: { ...ssConfig, mix: v } })}
              label="Mix"
              color="#f43f5e"
              formatValue={(v) => `${Math.round(v)}%`}
            />
            <Knob
              value={ssConfig.stereoSpread}
              min={0}
              max={100}
              onChange={(v) => onChange({ superSaw: { ...ssConfig, stereoSpread: v } })}
              label="Width"
              color="#f43f5e"
              formatValue={(v) => `${Math.round(v)}%`}
            />
          </div>
          {/* Filter section */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-3">FILTER</p>
            <div className="flex justify-around items-end">
              <Knob
                value={ssConfig.filter.cutoff}
                min={20}
                max={20000}
                onChange={(v) => onChange({ superSaw: { ...ssConfig, filter: { ...ssConfig.filter, cutoff: v } } })}
                label="Cutoff"
                color="#f43f5e"
                formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
              />
              <Knob
                value={ssConfig.filter.resonance}
                min={0}
                max={100}
                onChange={(v) => onChange({ superSaw: { ...ssConfig, filter: { ...ssConfig.filter, resonance: v } } })}
                label="Reso"
                color="#f43f5e"
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Knob
                value={ssConfig.filter.envelopeAmount}
                min={-100}
                max={100}
                onChange={(v) => onChange({ superSaw: { ...ssConfig, filter: { ...ssConfig.filter, envelopeAmount: v } } })}
                label="Env Amt"
                color="#f43f5e"
                bipolar
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          </div>
        </section>
      );
    }

    // =========================================================================
    // POLYSYNTH - Voice Management
    // =========================================================================
    case 'PolySynth': {
      const psConfig = instrument.polySynth || DEFAULT_POLYSYNTH;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#06b6d4" title="PolySynth" />
          {/* Voice Type Selection */}
          <div className="flex gap-2 mb-4">
            {(['Synth', 'FMSynth', 'AMSynth'] as const).map((type) => (
              <button
                key={type}
                onClick={() => onChange({ polySynth: { ...psConfig, voiceType: type } })}
                className={`
                  flex-1 px-3 py-2 rounded-lg font-bold text-xs transition-all
                  ${psConfig.voiceType === type
                    ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-400'
                    : 'bg-gray-800 border-2 border-gray-700 text-gray-400 hover:border-gray-500'
                  }
                `}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="flex justify-around items-end">
            <Knob
              value={psConfig.voiceCount}
              min={1}
              max={16}
              onChange={(v) => onChange({ polySynth: { ...psConfig, voiceCount: Math.round(v) } })}
              label="Voices"
              color="#06b6d4"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={psConfig.portamento}
              min={0}
              max={1000}
              onChange={(v) => onChange({ polySynth: { ...psConfig, portamento: v } })}
              label="Portamento"
              color="#06b6d4"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
          </div>
          {/* Steal Mode */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-2">VOICE STEAL MODE</p>
            <div className="flex gap-2">
              {(['oldest', 'lowest', 'highest'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onChange({ polySynth: { ...psConfig, stealMode: mode } })}
                  className={`
                    flex-1 px-2 py-1.5 rounded text-xs font-bold uppercase transition-all
                    ${psConfig.stealMode === mode
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                    }
                  `}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </section>
      );
    }

    // =========================================================================
    // ORGAN - Hammond Drawbars
    // =========================================================================
    case 'Organ': {
      const orgConfig = instrument.organ || DEFAULT_ORGAN;
      const drawbarLabels = ["16'", "5⅓'", "8'", "4'", "2⅔'", "2'", "1⅗'", "1⅓'", "1'"];
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#84cc16" title="Drawbars" />
          {/* Drawbar Sliders */}
          <div className="flex justify-between gap-1 mb-4">
            {orgConfig.drawbars.map((value, i) => (
              <div key={i} className="flex flex-col items-center">
                <input
                  type="range"
                  min={0}
                  max={8}
                  value={value}
                  onChange={(e) => {
                    const newDrawbars = [...orgConfig.drawbars] as typeof orgConfig.drawbars;
                    newDrawbars[i] = parseInt(e.target.value);
                    onChange({ organ: { ...orgConfig, drawbars: newDrawbars } });
                  }}
                  className="h-20 w-6 appearance-none bg-gray-700 rounded cursor-pointer"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                />
                <span className="text-[9px] text-gray-500 mt-1">{drawbarLabels[i]}</span>
                <span className="text-xs text-lime-400 font-mono">{value}</span>
              </div>
            ))}
          </div>
          {/* Rotary/Leslie */}
          <div className="flex gap-4 items-center pt-3 border-t border-gray-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={orgConfig.rotary.enabled}
                onChange={(e) => onChange({ organ: { ...orgConfig, rotary: { ...orgConfig.rotary, enabled: e.target.checked } } })}
                className="w-4 h-4 rounded bg-gray-700 border-gray-600"
              />
              <span className="text-xs text-gray-400">ROTARY</span>
            </label>
            {orgConfig.rotary.enabled && (
              <div className="flex gap-2">
                {(['slow', 'fast'] as const).map((speed) => (
                  <button
                    key={speed}
                    onClick={() => onChange({ organ: { ...orgConfig, rotary: { ...orgConfig.rotary, speed } } })}
                    className={`
                      px-3 py-1 rounded text-xs font-bold uppercase transition-all
                      ${orgConfig.rotary.speed === speed
                        ? 'bg-lime-500/20 text-lime-400'
                        : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                      }
                    `}
                  >
                    {speed}
                  </button>
                ))}
              </div>
            )}
            <Knob
              value={orgConfig.keyClick}
              min={0}
              max={100}
              onChange={(v) => onChange({ organ: { ...orgConfig, keyClick: v } })}
              label="Click"
              size="sm"
              color="#84cc16"
              formatValue={(v) => `${Math.round(v)}%`}
            />
          </div>
        </section>
      );
    }

    // =========================================================================
    // DRUM MACHINE - 808/909 Parameters
    // =========================================================================
    case 'DrumMachine': {
      const dmConfig = instrument.drumMachine || DEFAULT_DRUM_MACHINE;
      const drumType = dmConfig.drumType;

      // Render drum-specific parameters based on type
      const renderDrumParams = () => {
        switch (drumType) {
          case 'kick': {
            const kick = dmConfig.kick || DEFAULT_DRUM_MACHINE.kick!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-3">
                <Knob value={kick.pitch} min={30} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, pitch: v } } })} label="Pitch" color="#ef4444" formatValue={(v) => `${Math.round(v)}Hz`} />
                <Knob value={kick.decay} min={50} max={1000} onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, decay: v } } })} label="Decay" color="#ef4444" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={kick.tone} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, tone: v } } })} label="Tone" color="#ef4444" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={kick.drive} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, drive: v } } })} label="Drive" color="#ef4444" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={kick.envAmount} min={1} max={10} step={0.1} onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, envAmount: v } } })} label="Pitch Env" color="#ef4444" formatValue={(v) => `${v.toFixed(1)}x`} />
              </div>
            );
          }
          case 'snare': {
            const snare = dmConfig.snare || DEFAULT_DRUM_MACHINE.snare!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-3">
                <Knob value={snare.pitch} min={100} max={400} onChange={(v) => onChange({ drumMachine: { ...dmConfig, snare: { ...snare, pitch: v } } })} label="Pitch" color="#f97316" formatValue={(v) => `${Math.round(v)}Hz`} />
                <Knob value={snare.decay} min={50} max={500} onChange={(v) => onChange({ drumMachine: { ...dmConfig, snare: { ...snare, decay: v } } })} label="Decay" color="#f97316" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={snare.tone} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, snare: { ...snare, tone: v } } })} label="Tone" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={snare.snappy} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, snare: { ...snare, snappy: v } } })} label="Snappy" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
              </div>
            );
          }
          case 'hihat': {
            const hh = dmConfig.hihat || DEFAULT_DRUM_MACHINE.hihat!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-3">
                <Knob value={hh.tone} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, hihat: { ...hh, tone: v } } })} label="Tone" color="#eab308" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={hh.decay} min={10} max={500} onChange={(v) => onChange({ drumMachine: { ...dmConfig, hihat: { ...hh, decay: v } } })} label="Decay" color="#eab308" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={hh.metallic} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, hihat: { ...hh, metallic: v } } })} label="Metallic" color="#eab308" formatValue={(v) => `${Math.round(v)}%`} />
              </div>
            );
          }
          case 'clap': {
            const clap = dmConfig.clap || DEFAULT_DRUM_MACHINE.clap!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-3">
                <Knob value={clap.tone} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, clap: { ...clap, tone: v } } })} label="Tone" color="#a855f7" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={clap.decay} min={50} max={500} onChange={(v) => onChange({ drumMachine: { ...dmConfig, clap: { ...clap, decay: v } } })} label="Decay" color="#a855f7" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={clap.spread} min={5} max={50} onChange={(v) => onChange({ drumMachine: { ...dmConfig, clap: { ...clap, spread: v } } })} label="Spread" color="#a855f7" formatValue={(v) => `${Math.round(v)}ms`} />
              </div>
            );
          }
          case 'tom': {
            const tom = dmConfig.tom || DEFAULT_DRUM_MACHINE.tom!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-3">
                <Knob value={tom.pitch} min={60} max={400} onChange={(v) => onChange({ drumMachine: { ...dmConfig, tom: { ...tom, pitch: v } } })} label="Pitch" color="#22c55e" formatValue={(v) => `${Math.round(v)}Hz`} />
                <Knob value={tom.decay} min={50} max={500} onChange={(v) => onChange({ drumMachine: { ...dmConfig, tom: { ...tom, decay: v } } })} label="Decay" color="#22c55e" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={tom.tone} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, tom: { ...tom, tone: v } } })} label="Noise" color="#22c55e" formatValue={(v) => `${Math.round(v)}%`} />
              </div>
            );
          }
          case 'conga': {
            const conga = dmConfig.conga || DEFAULT_DRUM_MACHINE.conga!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-3">
                <Knob value={conga.pitch} min={150} max={500} onChange={(v) => onChange({ drumMachine: { ...dmConfig, conga: { ...conga, pitch: v } } })} label="Pitch" color="#14b8a6" formatValue={(v) => `${Math.round(v)}Hz`} />
                <Knob value={conga.decay} min={50} max={400} onChange={(v) => onChange({ drumMachine: { ...dmConfig, conga: { ...conga, decay: v } } })} label="Decay" color="#14b8a6" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={conga.tuning} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, conga: { ...conga, tuning: v } } })} label="Tuning" color="#14b8a6" formatValue={(v) => `${Math.round(v)}%`} />
              </div>
            );
          }
          case 'cowbell': {
            const cowbell = dmConfig.cowbell || DEFAULT_DRUM_MACHINE.cowbell!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-3">
                <Knob value={cowbell.decay} min={50} max={800} onChange={(v) => onChange({ drumMachine: { ...dmConfig, cowbell: { ...cowbell, decay: v } } })} label="Decay" color="#f59e0b" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={cowbell.filterFreq} min={1000} max={5000} onChange={(v) => onChange({ drumMachine: { ...dmConfig, cowbell: { ...cowbell, filterFreq: v } } })} label="Filter" color="#f59e0b" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
              </div>
            );
          }
          case 'rimshot': {
            const rim = dmConfig.rimshot || DEFAULT_DRUM_MACHINE.rimshot!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-3">
                <Knob value={rim.decay} min={10} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, rimshot: { ...rim, decay: v } } })} label="Decay" color="#ec4899" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={rim.filterQ} min={1} max={20} step={0.5} onChange={(v) => onChange({ drumMachine: { ...dmConfig, rimshot: { ...rim, filterQ: v } } })} label="Resonance" color="#ec4899" formatValue={(v) => v.toFixed(1)} />
                <Knob value={rim.saturation} min={1} max={5} step={0.1} onChange={(v) => onChange({ drumMachine: { ...dmConfig, rimshot: { ...rim, saturation: v } } })} label="Saturation" color="#ec4899" formatValue={(v) => `${v.toFixed(1)}x`} />
              </div>
            );
          }
          case 'clave': {
            const clave = dmConfig.clave || DEFAULT_DRUM_MACHINE.clave!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-3">
                <Knob value={clave.pitch} min={1000} max={4000} onChange={(v) => onChange({ drumMachine: { ...dmConfig, clave: { ...clave, pitch: v } } })} label="Pitch" color="#8b5cf6" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
                <Knob value={clave.decay} min={10} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, clave: { ...clave, decay: v } } })} label="Decay" color="#8b5cf6" formatValue={(v) => `${Math.round(v)}ms`} />
              </div>
            );
          }
          case 'maracas': {
            const maracas = dmConfig.maracas || DEFAULT_DRUM_MACHINE.maracas!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-3">
                <Knob value={maracas.decay} min={10} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, maracas: { ...maracas, decay: v } } })} label="Decay" color="#06b6d4" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={maracas.filterFreq} min={2000} max={10000} onChange={(v) => onChange({ drumMachine: { ...dmConfig, maracas: { ...maracas, filterFreq: v } } })} label="Brightness" color="#06b6d4" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
              </div>
            );
          }
          case 'cymbal': {
            const cymbal = dmConfig.cymbal || DEFAULT_DRUM_MACHINE.cymbal!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-3">
                <Knob value={cymbal.tone} min={0} max={100} onChange={(v) => onChange({ drumMachine: { ...dmConfig, cymbal: { ...cymbal, tone: v } } })} label="Tone" color="#fbbf24" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={cymbal.decay} min={500} max={7000} onChange={(v) => onChange({ drumMachine: { ...dmConfig, cymbal: { ...cymbal, decay: v } } })} label="Decay" color="#fbbf24" formatValue={(v) => `${(v / 1000).toFixed(1)}s`} />
              </div>
            );
          }
          default:
            return null;
        }
      };

      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#ef4444" title={`${drumType.toUpperCase()} Parameters`} />
          {renderDrumParams()}
        </section>
      );
    }

    // =========================================================================
    // CHIP SYNTH - 8-bit Parameters
    // =========================================================================
    case 'ChipSynth': {
      const chipConfig = instrument.chipSynth || DEFAULT_CHIP_SYNTH;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#22d3ee" title="Chip Parameters" />
          {/* Channel Selection */}
          <div className="flex gap-2 mb-4">
            {(['pulse1', 'pulse2', 'triangle', 'noise'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => onChange({ chipSynth: { ...chipConfig, channel: ch } })}
                className={`
                  flex-1 px-2 py-1.5 rounded text-xs font-bold uppercase transition-all
                  ${chipConfig.channel === ch
                    ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }
                `}
              >
                {ch.replace('pulse', 'PLS')}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-around items-end gap-3">
            <Knob
              value={chipConfig.bitDepth}
              min={2}
              max={16}
              onChange={(v) => onChange({ chipSynth: { ...chipConfig, bitDepth: Math.round(v) } })}
              label="Bit Depth"
              color="#22d3ee"
              formatValue={(v) => `${Math.round(v)} bit`}
            />
            {(chipConfig.channel === 'pulse1' || chipConfig.channel === 'pulse2') && (
              <Knob
                value={chipConfig.pulse?.duty || 50}
                min={12.5}
                max={50}
                step={12.5}
                onChange={(v) => onChange({ chipSynth: { ...chipConfig, pulse: { duty: v as 12.5 | 25 | 50 } } })}
                label="Duty"
                color="#22d3ee"
                formatValue={(v) => `${v}%`}
              />
            )}
            <Knob
              value={chipConfig.vibrato.speed}
              min={0}
              max={20}
              step={0.5}
              onChange={(v) => onChange({ chipSynth: { ...chipConfig, vibrato: { ...chipConfig.vibrato, speed: v } } })}
              label="Vib Speed"
              color="#22d3ee"
              formatValue={(v) => `${v.toFixed(1)}Hz`}
            />
            <Knob
              value={chipConfig.vibrato.depth}
              min={0}
              max={100}
              onChange={(v) => onChange({ chipSynth: { ...chipConfig, vibrato: { ...chipConfig.vibrato, depth: v } } })}
              label="Vib Depth"
              color="#22d3ee"
              formatValue={(v) => `${Math.round(v)}%`}
            />
          </div>
        </section>
      );
    }

    // =========================================================================
    // PWM SYNTH - Pulse Width Modulation
    // =========================================================================
    case 'PWMSynth': {
      const pwmConfig = instrument.pwmSynth || DEFAULT_PWM_SYNTH;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#d946ef" title="PWM Parameters" />
          <div className="flex flex-wrap justify-around items-end gap-3">
            <Knob
              value={pwmConfig.pulseWidth}
              min={5}
              max={95}
              onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, pulseWidth: v } })}
              label="Width"
              color="#d946ef"
              formatValue={(v) => `${Math.round(v)}%`}
            />
            <Knob
              value={pwmConfig.pwmDepth}
              min={0}
              max={100}
              onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, pwmDepth: v } })}
              label="Depth"
              color="#d946ef"
              formatValue={(v) => `${Math.round(v)}%`}
            />
            <Knob
              value={pwmConfig.pwmRate}
              min={0.1}
              max={20}
              step={0.1}
              onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, pwmRate: v } })}
              label="Rate"
              color="#d946ef"
              formatValue={(v) => `${v.toFixed(1)}Hz`}
            />
            <Knob
              value={pwmConfig.oscillators}
              min={1}
              max={3}
              onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, oscillators: Math.round(v) } })}
              label="Oscillators"
              color="#d946ef"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={pwmConfig.detune}
              min={0}
              max={50}
              onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, detune: v } })}
              label="Detune"
              color="#d946ef"
              formatValue={(v) => `${Math.round(v)}¢`}
            />
          </div>
          {/* PWM Waveform */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-2">PWM LFO SHAPE</p>
            <div className="flex gap-2">
              {(['sine', 'triangle', 'sawtooth'] as const).map((shape) => (
                <button
                  key={shape}
                  onClick={() => onChange({ pwmSynth: { ...pwmConfig, pwmWaveform: shape } })}
                  className={`
                    flex-1 px-2 py-1.5 rounded text-xs font-bold uppercase transition-all
                    ${pwmConfig.pwmWaveform === shape
                      ? 'bg-fuchsia-500/20 text-fuchsia-400'
                      : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                    }
                  `}
                >
                  {shape}
                </button>
              ))}
            </div>
          </div>
        </section>
      );
    }

    // =========================================================================
    // STRING MACHINE - Vintage Ensemble Strings
    // =========================================================================
    case 'StringMachine': {
      const strConfig = instrument.stringMachine || DEFAULT_STRING_MACHINE;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#10b981" title="String Sections" />
          {/* Section Levels */}
          <div className="flex justify-around items-end gap-2 mb-4">
            {(['violin', 'viola', 'cello', 'bass'] as const).map((section) => (
              <div key={section} className="flex flex-col items-center">
                <Knob
                  value={strConfig.sections[section]}
                  min={0}
                  max={100}
                  onChange={(v) => onChange({ stringMachine: { ...strConfig, sections: { ...strConfig.sections, [section]: v } } })}
                  label={section.charAt(0).toUpperCase() + section.slice(1)}
                  size="sm"
                  color="#10b981"
                  formatValue={(v) => `${Math.round(v)}%`}
                />
              </div>
            ))}
          </div>
          {/* Ensemble/Chorus */}
          <div className="pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-3">ENSEMBLE</p>
            <div className="flex justify-around items-end">
              <Knob
                value={strConfig.ensemble.depth}
                min={0}
                max={100}
                onChange={(v) => onChange({ stringMachine: { ...strConfig, ensemble: { ...strConfig.ensemble, depth: v } } })}
                label="Depth"
                color="#10b981"
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Knob
                value={strConfig.ensemble.rate}
                min={0.5}
                max={6}
                step={0.1}
                onChange={(v) => onChange({ stringMachine: { ...strConfig, ensemble: { ...strConfig.ensemble, rate: v } } })}
                label="Rate"
                color="#10b981"
                formatValue={(v) => `${v.toFixed(1)}Hz`}
              />
              <Knob
                value={strConfig.brightness}
                min={0}
                max={100}
                onChange={(v) => onChange({ stringMachine: { ...strConfig, brightness: v } })}
                label="Brightness"
                color="#10b981"
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          </div>
        </section>
      );
    }

    // =========================================================================
    // FORMANT SYNTH - Vowel Synthesis
    // =========================================================================
    case 'FormantSynth': {
      const fmtConfig = instrument.formantSynth || DEFAULT_FORMANT_SYNTH;
      const vowels = ['A', 'E', 'I', 'O', 'U'] as const;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#f472b6" title="Formant Synthesis" />
          {/* Vowel Selection */}
          <div className="flex gap-2 mb-4">
            {vowels.map((v) => (
              <button
                key={v}
                onClick={() => onChange({ formantSynth: { ...fmtConfig, vowel: v } })}
                className={`
                  flex-1 py-3 rounded-lg font-bold text-lg transition-all
                  ${fmtConfig.vowel === v
                    ? 'bg-pink-500/20 text-pink-400 ring-2 ring-pink-500'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }
                `}
              >
                {v}
              </button>
            ))}
          </div>
          {/* Morph Controls */}
          <div className="pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-3">VOWEL MORPH</p>
            <div className="flex gap-2 mb-4">
              {vowels.map((v) => (
                <button
                  key={v}
                  onClick={() => onChange({ formantSynth: { ...fmtConfig, vowelMorph: { ...fmtConfig.vowelMorph, target: v } } })}
                  className={`
                    flex-1 py-1.5 rounded text-xs font-bold transition-all
                    ${fmtConfig.vowelMorph.target === v
                      ? 'bg-pink-500/10 text-pink-300'
                      : 'bg-gray-800 text-gray-600 hover:text-gray-400'
                    }
                  `}
                >
                  →{v}
                </button>
              ))}
            </div>
            <div className="flex justify-around items-end">
              <Knob
                value={fmtConfig.vowelMorph.amount}
                min={0}
                max={100}
                onChange={(v) => onChange({ formantSynth: { ...fmtConfig, vowelMorph: { ...fmtConfig.vowelMorph, amount: v } } })}
                label="Amount"
                color="#f472b6"
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Knob
                value={fmtConfig.vowelMorph.rate}
                min={0}
                max={5}
                step={0.1}
                onChange={(v) => onChange({ formantSynth: { ...fmtConfig, vowelMorph: { ...fmtConfig.vowelMorph, rate: v } } })}
                label="Rate"
                color="#f472b6"
                formatValue={(v) => `${v.toFixed(1)}Hz`}
              />
              <Knob
                value={fmtConfig.brightness}
                min={0}
                max={100}
                onChange={(v) => onChange({ formantSynth: { ...fmtConfig, brightness: v } })}
                label="Brightness"
                color="#f472b6"
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          </div>
        </section>
      );
    }

    // =========================================================================
    // WAVETABLE SYNTH
    // =========================================================================
    case 'Wavetable': {
      const wtConfig = instrument.wavetable || DEFAULT_WAVETABLE;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#6366f1" title="Wavetable" />
          <div className="flex flex-wrap justify-around items-end gap-3">
            <Knob
              value={wtConfig.morphPosition}
              min={0}
              max={100}
              onChange={(v) => onChange({ wavetable: { ...wtConfig, morphPosition: v } })}
              label="Morph"
              size="lg"
              color="#6366f1"
              formatValue={(v) => `${Math.round(v)}%`}
            />
            <Knob
              value={wtConfig.morphLFORate}
              min={0.1}
              max={20}
              step={0.1}
              onChange={(v) => onChange({ wavetable: { ...wtConfig, morphLFORate: v } })}
              label="LFO Rate"
              color="#6366f1"
              formatValue={(v) => `${v.toFixed(1)}Hz`}
            />
            <Knob
              value={wtConfig.morphModAmount}
              min={0}
              max={100}
              onChange={(v) => onChange({ wavetable: { ...wtConfig, morphModAmount: v } })}
              label="Mod Amt"
              color="#6366f1"
              formatValue={(v) => `${Math.round(v)}%`}
            />
          </div>
          {/* Unison */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-3">UNISON</p>
            <div className="flex justify-around items-end">
              <Knob
                value={wtConfig.unison.voices}
                min={1}
                max={8}
                onChange={(v) => onChange({ wavetable: { ...wtConfig, unison: { ...wtConfig.unison, voices: Math.round(v) } } })}
                label="Voices"
                color="#6366f1"
                formatValue={(v) => Math.round(v).toString()}
              />
              <Knob
                value={wtConfig.unison.detune}
                min={0}
                max={100}
                onChange={(v) => onChange({ wavetable: { ...wtConfig, unison: { ...wtConfig.unison, detune: v } } })}
                label="Detune"
                color="#6366f1"
                formatValue={(v) => `${Math.round(v)}¢`}
              />
              <Knob
                value={wtConfig.unison.stereoSpread}
                min={0}
                max={100}
                onChange={(v) => onChange({ wavetable: { ...wtConfig, unison: { ...wtConfig.unison, stereoSpread: v } } })}
                label="Spread"
                color="#6366f1"
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          </div>
        </section>
      );
    }

    // =========================================================================
    // GRANULAR SYNTH
    // =========================================================================
    case 'GranularSynth': {
      const grConfig = instrument.granular || DEFAULT_GRANULAR;
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#f97316" title="Granular Parameters" />
          <div className="flex flex-wrap justify-around items-end gap-3">
            <Knob
              value={grConfig.grainSize}
              min={10}
              max={500}
              onChange={(v) => onChange({ granular: { ...grConfig, grainSize: v } })}
              label="Grain Size"
              color="#f97316"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
            <Knob
              value={grConfig.grainOverlap}
              min={0}
              max={100}
              onChange={(v) => onChange({ granular: { ...grConfig, grainOverlap: v } })}
              label="Overlap"
              color="#f97316"
              formatValue={(v) => `${Math.round(v)}%`}
            />
            <Knob
              value={grConfig.playbackRate}
              min={0.25}
              max={4}
              step={0.05}
              onChange={(v) => onChange({ granular: { ...grConfig, playbackRate: v } })}
              label="Speed"
              color="#f97316"
              formatValue={(v) => `${v.toFixed(2)}x`}
            />
            <Knob
              value={grConfig.scanPosition}
              min={0}
              max={100}
              onChange={(v) => onChange({ granular: { ...grConfig, scanPosition: v } })}
              label="Position"
              color="#f97316"
              formatValue={(v) => `${Math.round(v)}%`}
            />
          </div>
          {/* Randomization */}
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-3">RANDOMIZATION</p>
            <div className="flex justify-around items-end">
              <Knob
                value={grConfig.randomPitch}
                min={0}
                max={100}
                onChange={(v) => onChange({ granular: { ...grConfig, randomPitch: v } })}
                label="Pitch Rand"
                color="#f97316"
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Knob
                value={grConfig.randomPosition}
                min={0}
                max={100}
                onChange={(v) => onChange({ granular: { ...grConfig, randomPosition: v } })}
                label="Pos Rand"
                color="#f97316"
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Knob
                value={grConfig.density}
                min={1}
                max={16}
                onChange={(v) => onChange({ granular: { ...grConfig, density: Math.round(v) } })}
                label="Density"
                color="#f97316"
                formatValue={(v) => Math.round(v).toString()}
              />
            </div>
          </div>
        </section>
      );
    }

    default:
      return null;
  }
}
