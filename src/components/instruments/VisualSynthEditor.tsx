/**
 * VisualSynthEditor - Modern VST-style visual synthesizer editor
 * Features knobs, waveform displays, ADSR visualization, and filter curves
 *
 * REFACTORED: Now uses tab-based layout to fit all controls on screen without scrolling
 */

import React, { useState } from 'react';
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
  DEFAULT_WOBBLE_BASS,
} from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { WaveformSelector } from '@components/ui/WaveformSelector';
import { FT2SampleEditor } from './FT2SampleEditor';
import { ArpeggioEditor } from './ArpeggioEditor';
import { FurnaceEditor } from './FurnaceEditor';
import { PresetDropdown } from './PresetDropdown';
import { LFOControls } from './LFOControls';
import { SynthEditorTabs, type SynthEditorTab } from './SynthEditorTabs';
import { getSynthInfo, SYNTH_INFO } from '@constants/synthCategories';
import { getSynthHelp } from '@constants/synthHelp';
import type { SynthType } from '@typedefs/instrument';
import * as LucideIcons from 'lucide-react';
import {
  InstrumentOscilloscope,
  InstrumentSpectrum,
  InstrumentLevelMeter,
  LiveADSRVisualizer,
  LiveFilterCurve,
  NoteActivityDisplay,
} from '@components/visualization';

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
  const [showHelp, setShowHelp] = useState(false);
  const [vizMode, setVizMode] = useState<'oscilloscope' | 'spectrum'>('oscilloscope');
  const [activeTab, setActiveTab] = useState<SynthEditorTab>('oscillator');
  const isSampleBased = SAMPLE_SYNTH_TYPES.includes(instrument.synthType);
  const synthInfo = getSynthInfo(instrument.synthType);
  const synthHelp = getSynthHelp(instrument.synthType);

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

  const updatePitchEnvelope = (key: string, value: number | boolean) => {
    const currentPitchEnv = instrument.pitchEnvelope || {
      enabled: false, amount: 12, attack: 0, decay: 50, sustain: 0, release: 100
    };
    onChange({
      pitchEnvelope: { ...currentPitchEnv, [key]: value },
    });
  };

  const updateFilter = (key: string, value: any) => {
    const currentFilter = instrument.filter || { type: 'lowpass' as const, frequency: 2000, Q: 1, rolloff: -24 as const };
    onChange({
      filter: { ...currentFilter, [key]: value },
    });
  };

  // Determine which tabs to hide based on synth type
  const getHiddenTabs = (): SynthEditorTab[] => {
    const hidden: SynthEditorTab[] = [];
    if (isSampleBased) {
      hidden.push('oscillator');
    }
    if (!instrument.oscillator && !isSampleBased) {
      hidden.push('oscillator');
    }
    // Hide special tab if no special parameters for this synth type
    const hasSpecialParams = renderSpecialParameters(instrument, onChange) !== null;
    if (!hasSpecialParams) {
      hidden.push('special');
    }
    return hidden;
  };

  // Render oscillator section content
  const renderOscillatorTab = () => {
    if (!instrument.oscillator || isSampleBased) return null;

    return (
      <div className="synth-tab-section p-4">
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
      </div>
    );
  };

  // Render envelope section content
  const renderEnvelopeTab = () => {
    return (
      <div className="synth-tab-section p-4 space-y-4">
        {/* Amplitude Envelope */}
        {instrument.envelope && (
          <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 bg-green-500 rounded-full" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">Amplitude Envelope</h3>
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <LiveADSRVisualizer
                  instrumentId={instrument.id}
                  attack={instrument.envelope.attack}
                  decay={instrument.envelope.decay}
                  sustain={instrument.envelope.sustain}
                  release={instrument.envelope.release}
                  width={200}
                  height={80}
                  color="#22c55e"
                  activeColor="#4ade80"
                  backgroundColor="#0a0a0a"
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
                  size="sm"
                  color="#22c55e"
                  formatValue={(v) => `${Math.round(v)}ms`}
                />
                <Knob
                  value={instrument.envelope.decay}
                  min={1}
                  max={2000}
                  onChange={(v) => updateEnvelope('decay', v)}
                  label="D"
                  size="sm"
                  color="#22c55e"
                  formatValue={(v) => `${Math.round(v)}ms`}
                />
                <Knob
                  value={instrument.envelope.sustain}
                  min={0}
                  max={100}
                  onChange={(v) => updateEnvelope('sustain', v)}
                  label="S"
                  size="sm"
                  color="#22c55e"
                  formatValue={(v) => `${Math.round(v)}%`}
                />
                <Knob
                  value={instrument.envelope.release}
                  min={1}
                  max={5000}
                  onChange={(v) => updateEnvelope('release', v)}
                  label="R"
                  size="sm"
                  color="#22c55e"
                  formatValue={(v) => `${Math.round(v)}ms`}
                />
              </div>
            </div>
          </section>
        )}

        {/* Pitch Envelope Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-orange-500 rounded-full" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">Pitch Envelope</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-gray-400">
                {instrument.pitchEnvelope?.enabled ? 'ON' : 'OFF'}
              </span>
              <input
                type="checkbox"
                checked={instrument.pitchEnvelope?.enabled || false}
                onChange={(e) => updatePitchEnvelope('enabled', e.target.checked)}
                className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-orange-500 focus:ring-orange-500 focus:ring-offset-0"
              />
            </label>
          </div>

          {/* Pitch Envelope Knobs */}
          <div className={`flex justify-around items-end ${!instrument.pitchEnvelope?.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <Knob
              value={instrument.pitchEnvelope?.amount || 12}
              min={-48}
              max={48}
              onChange={(v) => updatePitchEnvelope('amount', v)}
              label="Amt"
              size="sm"
              color="#f97316"
              formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}st`}
            />
            <Knob
              value={instrument.pitchEnvelope?.attack || 0}
              min={0}
              max={2000}
              onChange={(v) => updatePitchEnvelope('attack', v)}
              label="A"
              size="sm"
              color="#f97316"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
            <Knob
              value={instrument.pitchEnvelope?.decay || 50}
              min={1}
              max={2000}
              onChange={(v) => updatePitchEnvelope('decay', v)}
              label="D"
              size="sm"
              color="#f97316"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
            <Knob
              value={instrument.pitchEnvelope?.sustain || 0}
              min={-100}
              max={100}
              onChange={(v) => updatePitchEnvelope('sustain', v)}
              label="S"
              size="sm"
              color="#f97316"
              formatValue={(v) => `${Math.round(v)}%`}
            />
            <Knob
              value={instrument.pitchEnvelope?.release || 100}
              min={1}
              max={5000}
              onChange={(v) => updatePitchEnvelope('release', v)}
              label="R"
              size="sm"
              color="#f97316"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
          </div>
        </section>
      </div>
    );
  };

  // Render filter section content
  const renderFilterTab = () => {
    if (!instrument.filter) return null;

    return (
      <div className="synth-tab-section p-4">
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

          <div className="flex gap-4">
            <div className="flex-1">
              <LiveFilterCurve
                instrumentId={instrument.id}
                cutoff={instrument.filter.frequency}
                resonance={instrument.filter.Q}
                type={instrument.filter.type as 'lowpass' | 'highpass' | 'bandpass' | 'notch'}
                width={200}
                height={80}
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
  };

  // Render modulation section content
  const renderModulationTab = () => {
    if (isSampleBased) return null;

    return (
      <div className="synth-tab-section p-4">
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <LFOControls
            instrument={instrument}
            onChange={onChange}
          />
        </section>
      </div>
    );
  };

  // Render output section content
  const renderOutputTab = () => {
    return (
      <div className="synth-tab-section p-4">
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
      </div>
    );
  };

  // Render special section content
  const renderSpecialTab = () => {
    const specialContent = renderSpecialParameters(instrument, onChange);
    if (!specialContent) return null;

    return (
      <div className="synth-tab-section p-4 overflow-y-auto">
        {specialContent}
      </div>
    );
  };

  // Render content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'oscillator':
        return renderOscillatorTab();
      case 'envelope':
        return renderEnvelopeTab();
      case 'filter':
        return renderFilterTab();
      case 'modulation':
        return renderModulationTab();
      case 'output':
        return renderOutputTab();
      case 'special':
        return renderSpecialTab();
      default:
        return null;
    }
  };

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Header with synth info - FIXED */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 ${synthInfo.color}`}>
            <SynthIcon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">{synthInfo.name}</h2>
              {/* Quick Synth Type Selector */}
              <select
                value={instrument.synthType}
                onChange={(e) => onChange({ synthType: e.target.value as SynthType })}
                className="px-2 py-0.5 text-xs font-medium bg-gray-800 border border-gray-700 rounded text-gray-300 hover:border-gray-500 focus:border-blue-500 focus:outline-none cursor-pointer"
                title="Quick switch synth type"
              >
                {Object.values(SYNTH_INFO)
                  .sort((a, b) => a.shortName.localeCompare(b.shortName))
                  .map((synth) => (
                    <option key={synth.type} value={synth.type}>
                      {synth.shortName}
                    </option>
                  ))}
              </select>
            </div>
            <p className="text-xs text-gray-400 truncate">{synthInfo.description}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <PresetDropdown
              synthType={instrument.synthType}
              instrument={instrument}
              onChange={onChange}
            />
            <button
              onClick={() => setShowHelp(!showHelp)}
              className={`p-1.5 rounded transition-all ${
                showHelp
                  ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              title="Show help"
            >
              <LucideIcons.HelpCircle size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Live Visualization Panel - FIXED */}
      {!isSampleBased && (
        <div className="synth-editor-viz-header">
          {/* Oscilloscope / Spectrum Toggle */}
          <div className="flex bg-gray-900 rounded p-0.5">
            <button
              onClick={() => setVizMode('oscilloscope')}
              className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                vizMode === 'oscilloscope'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <LucideIcons.Activity size={12} className="inline mr-1" />
              Scope
            </button>
            <button
              onClick={() => setVizMode('spectrum')}
              className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                vizMode === 'spectrum'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <LucideIcons.BarChart2 size={12} className="inline mr-1" />
              FFT
            </button>
          </div>

          {/* Visualization Display */}
          <div className="flex-1 bg-black rounded overflow-hidden border border-gray-800" style={{ height: 60 }}>
            {vizMode === 'oscilloscope' ? (
              <InstrumentOscilloscope
                instrumentId={instrument.id}
                width={300}
                height={60}
                color="#4ade80"
                backgroundColor="#000000"
              />
            ) : (
              <InstrumentSpectrum
                instrumentId={instrument.id}
                width={300}
                height={60}
                barCount={48}
                color="#22c55e"
                colorEnd="#ef4444"
                backgroundColor="#000000"
              />
            )}
          </div>

          {/* Level Meter */}
          <InstrumentLevelMeter
            instrumentId={instrument.id}
            orientation="vertical"
            width={16}
            height={50}
          />

          {/* Note Activity Mini Display */}
          <NoteActivityDisplay
            width={80}
            height={24}
            octaveStart={3}
            octaveEnd={5}
            activeColor="#4ade80"
          />
        </div>
      )}

      {/* Collapsible Help Panel */}
      {showHelp && synthHelp && (
        <div className="px-4 py-3 bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-b border-gray-800 text-xs">
          <p className="text-gray-300 mb-2">{synthHelp.overview}</p>
          {synthHelp.tips.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {synthHelp.tips.slice(0, 3).map((tip, i) => (
                <li key={i} className="text-gray-400 bg-black/30 px-2 py-1 rounded">
                  {tip}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Sample Editor for sample-based instruments */}
      {isSampleBased && (
        <div className="flex-1 overflow-y-auto p-4">
          <FT2SampleEditor instrument={instrument} onChange={onChange} />
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
        <div className="p-4 border-b border-gray-800 space-y-3">
          {/* Machine Type (808/909) */}
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
                    flex-1 py-2 px-3 rounded font-bold text-sm transition-all
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

          {/* Drum Type Selector */}
          <div className="grid grid-cols-6 gap-1">
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
                    flex flex-col items-center justify-center p-1.5 rounded border transition-all
                    ${isSelected
                      ? 'bg-red-500/20 border-red-500 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                    }
                  `}
                >
                  <span className="text-sm">{drum.icon}</span>
                  <span className="text-[9px] font-bold">{drum.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ChipSynth Arpeggio Editor */}
      {instrument.synthType === 'ChipSynth' && instrument.chipSynth && (
        <div className="px-4 pb-2">
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

      {/* Tab Bar - FIXED */}
      {!isSampleBased && (
        <SynthEditorTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hiddenTabs={getHiddenTabs()}
        />
      )}

      {/* Tab Content - FILLS REMAINING SPACE */}
      {!isSampleBased && (
        <div className="synth-editor-content">
          {renderTabContent()}
        </div>
      )}
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
          <div className="flex flex-wrap justify-around items-end gap-3 mb-4">
            <Knob
              value={ssConfig.voices}
              min={3}
              max={9}
              onChange={(v) => onChange({ superSaw: { ...ssConfig, voices: v } })}
              label="Voices"
              size="sm"
              color="#f43f5e"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={ssConfig.detune}
              min={0}
              max={100}
              onChange={(v) => onChange({ superSaw: { ...ssConfig, detune: v } })}
              label="Detune"
              size="sm"
              color="#f43f5e"
              formatValue={(v) => `${Math.round(v)}¢`}
            />
            <Knob
              value={ssConfig.mix}
              min={0}
              max={100}
              onChange={(v) => onChange({ superSaw: { ...ssConfig, mix: v } })}
              label="Mix"
              size="sm"
              color="#f43f5e"
              formatValue={(v) => `${Math.round(v)}%`}
            />
            <Knob
              value={ssConfig.stereoSpread}
              min={0}
              max={100}
              onChange={(v) => onChange({ superSaw: { ...ssConfig, stereoSpread: v } })}
              label="Width"
              size="sm"
              color="#f43f5e"
              formatValue={(v) => `${Math.round(v)}%`}
            />
          </div>
          {/* Filter section */}
          <div className="pt-3 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-2">FILTER</p>
            <div className="flex justify-around items-end">
              <Knob
                value={ssConfig.filter.cutoff}
                min={20}
                max={20000}
                size="sm"
                onChange={(v) => onChange({ superSaw: { ...ssConfig, filter: { ...ssConfig.filter, cutoff: v } } })}
                label="Cutoff"
                color="#f43f5e"
                formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
              />
              <Knob
                value={ssConfig.filter.resonance}
                min={0}
                max={100}
                size="sm"
                onChange={(v) => onChange({ superSaw: { ...ssConfig, filter: { ...ssConfig.filter, resonance: v } } })}
                label="Reso"
                color="#f43f5e"
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Knob
                value={ssConfig.filter.envelopeAmount}
                min={-100}
                max={100}
                size="sm"
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
          <div className="flex gap-2 mb-3">
            {(['Synth', 'FMSynth', 'AMSynth'] as const).map((type) => (
              <button
                key={type}
                onClick={() => onChange({ polySynth: { ...psConfig, voiceType: type } })}
                className={`
                  flex-1 px-2 py-1.5 rounded font-bold text-xs transition-all
                  ${psConfig.voiceType === type
                    ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-400'
                    : 'bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-500'
                  }
                `}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="flex justify-around items-end mb-3">
            <Knob
              value={psConfig.voiceCount}
              min={1}
              max={16}
              size="sm"
              onChange={(v) => onChange({ polySynth: { ...psConfig, voiceCount: Math.round(v) } })}
              label="Voices"
              color="#06b6d4"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={psConfig.portamento}
              min={0}
              max={1000}
              size="sm"
              onChange={(v) => onChange({ polySynth: { ...psConfig, portamento: v } })}
              label="Portamento"
              color="#06b6d4"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
          </div>
          {/* Steal Mode */}
          <div className="pt-3 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-2">VOICE STEAL MODE</p>
            <div className="flex gap-2">
              {(['oldest', 'lowest', 'highest'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onChange({ polySynth: { ...psConfig, stealMode: mode } })}
                  className={`
                    flex-1 px-2 py-1 rounded text-xs font-bold uppercase transition-all
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
          <div className="flex justify-between gap-1 mb-3">
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
                  className="h-16 w-5 appearance-none bg-gray-700 rounded cursor-pointer"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                />
                <span className="text-[8px] text-gray-500 mt-1">{drawbarLabels[i]}</span>
                <span className="text-xs text-lime-400 font-mono">{value}</span>
              </div>
            ))}
          </div>
          {/* Rotary/Leslie */}
          <div className="flex gap-3 items-center pt-2 border-t border-gray-700">
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
              <div className="flex gap-1">
                {(['slow', 'fast'] as const).map((speed) => (
                  <button
                    key={speed}
                    onClick={() => onChange({ organ: { ...orgConfig, rotary: { ...orgConfig.rotary, speed } } })}
                    className={`
                      px-2 py-1 rounded text-xs font-bold uppercase transition-all
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
              <div className="flex flex-wrap justify-around items-end gap-2">
                <Knob value={kick.pitch} min={30} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, pitch: v } } })} label="Pitch" color="#ef4444" formatValue={(v) => `${Math.round(v)}Hz`} />
                <Knob value={kick.decay} min={50} max={1000} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, decay: v } } })} label="Decay" color="#ef4444" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={kick.tone} min={0} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, tone: v } } })} label="Tone" color="#ef4444" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={kick.drive} min={0} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, drive: v } } })} label="Drive" color="#ef4444" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={kick.envAmount} min={1} max={10} size="sm" step={0.1} onChange={(v) => onChange({ drumMachine: { ...dmConfig, kick: { ...kick, envAmount: v } } })} label="Env" color="#ef4444" formatValue={(v) => `${v.toFixed(1)}x`} />
              </div>
            );
          }
          case 'snare': {
            const snare = dmConfig.snare || DEFAULT_DRUM_MACHINE.snare!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-2">
                <Knob value={snare.pitch} min={100} max={400} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, snare: { ...snare, pitch: v } } })} label="Pitch" color="#f97316" formatValue={(v) => `${Math.round(v)}Hz`} />
                <Knob value={snare.decay} min={50} max={500} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, snare: { ...snare, decay: v } } })} label="Decay" color="#f97316" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={snare.tone} min={0} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, snare: { ...snare, tone: v } } })} label="Tone" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={snare.snappy} min={0} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, snare: { ...snare, snappy: v } } })} label="Snappy" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
              </div>
            );
          }
          case 'hihat': {
            const hh = dmConfig.hihat || DEFAULT_DRUM_MACHINE.hihat!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-2">
                <Knob value={hh.tone} min={0} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, hihat: { ...hh, tone: v } } })} label="Tone" color="#eab308" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={hh.decay} min={10} max={500} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, hihat: { ...hh, decay: v } } })} label="Decay" color="#eab308" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={hh.metallic} min={0} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, hihat: { ...hh, metallic: v } } })} label="Metal" color="#eab308" formatValue={(v) => `${Math.round(v)}%`} />
              </div>
            );
          }
          case 'clap': {
            const clap = dmConfig.clap || DEFAULT_DRUM_MACHINE.clap!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-2">
                <Knob value={clap.tone} min={0} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, clap: { ...clap, tone: v } } })} label="Tone" color="#a855f7" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={clap.decay} min={50} max={500} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, clap: { ...clap, decay: v } } })} label="Decay" color="#a855f7" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={clap.spread} min={5} max={50} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, clap: { ...clap, spread: v } } })} label="Spread" color="#a855f7" formatValue={(v) => `${Math.round(v)}ms`} />
              </div>
            );
          }
          case 'tom': {
            const tom = dmConfig.tom || DEFAULT_DRUM_MACHINE.tom!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-2">
                <Knob value={tom.pitch} min={60} max={400} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, tom: { ...tom, pitch: v } } })} label="Pitch" color="#22c55e" formatValue={(v) => `${Math.round(v)}Hz`} />
                <Knob value={tom.decay} min={50} max={500} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, tom: { ...tom, decay: v } } })} label="Decay" color="#22c55e" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={tom.tone} min={0} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, tom: { ...tom, tone: v } } })} label="Noise" color="#22c55e" formatValue={(v) => `${Math.round(v)}%`} />
              </div>
            );
          }
          case 'conga': {
            const conga = dmConfig.conga || DEFAULT_DRUM_MACHINE.conga!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-2">
                <Knob value={conga.pitch} min={150} max={500} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, conga: { ...conga, pitch: v } } })} label="Pitch" color="#14b8a6" formatValue={(v) => `${Math.round(v)}Hz`} />
                <Knob value={conga.decay} min={50} max={400} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, conga: { ...conga, decay: v } } })} label="Decay" color="#14b8a6" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={conga.tuning} min={0} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, conga: { ...conga, tuning: v } } })} label="Tuning" color="#14b8a6" formatValue={(v) => `${Math.round(v)}%`} />
              </div>
            );
          }
          case 'cowbell': {
            const cowbell = dmConfig.cowbell || DEFAULT_DRUM_MACHINE.cowbell!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-2">
                <Knob value={cowbell.decay} min={50} max={800} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, cowbell: { ...cowbell, decay: v } } })} label="Decay" color="#f59e0b" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={cowbell.filterFreq} min={1000} max={5000} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, cowbell: { ...cowbell, filterFreq: v } } })} label="Filter" color="#f59e0b" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
              </div>
            );
          }
          case 'rimshot': {
            const rim = dmConfig.rimshot || DEFAULT_DRUM_MACHINE.rimshot!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-2">
                <Knob value={rim.decay} min={10} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, rimshot: { ...rim, decay: v } } })} label="Decay" color="#ec4899" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={rim.filterQ} min={1} max={20} size="sm" step={0.5} onChange={(v) => onChange({ drumMachine: { ...dmConfig, rimshot: { ...rim, filterQ: v } } })} label="Reso" color="#ec4899" formatValue={(v) => v.toFixed(1)} />
                <Knob value={rim.saturation} min={1} max={5} size="sm" step={0.1} onChange={(v) => onChange({ drumMachine: { ...dmConfig, rimshot: { ...rim, saturation: v } } })} label="Sat" color="#ec4899" formatValue={(v) => `${v.toFixed(1)}x`} />
              </div>
            );
          }
          case 'clave': {
            const clave = dmConfig.clave || DEFAULT_DRUM_MACHINE.clave!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-2">
                <Knob value={clave.pitch} min={1000} max={4000} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, clave: { ...clave, pitch: v } } })} label="Pitch" color="#8b5cf6" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
                <Knob value={clave.decay} min={10} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, clave: { ...clave, decay: v } } })} label="Decay" color="#8b5cf6" formatValue={(v) => `${Math.round(v)}ms`} />
              </div>
            );
          }
          case 'maracas': {
            const maracas = dmConfig.maracas || DEFAULT_DRUM_MACHINE.maracas!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-2">
                <Knob value={maracas.decay} min={10} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, maracas: { ...maracas, decay: v } } })} label="Decay" color="#06b6d4" formatValue={(v) => `${Math.round(v)}ms`} />
                <Knob value={maracas.filterFreq} min={2000} max={10000} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, maracas: { ...maracas, filterFreq: v } } })} label="Bright" color="#06b6d4" formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
              </div>
            );
          }
          case 'cymbal': {
            const cymbal = dmConfig.cymbal || DEFAULT_DRUM_MACHINE.cymbal!;
            return (
              <div className="flex flex-wrap justify-around items-end gap-2">
                <Knob value={cymbal.tone} min={0} max={100} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, cymbal: { ...cymbal, tone: v } } })} label="Tone" color="#fbbf24" formatValue={(v) => `${Math.round(v)}%`} />
                <Knob value={cymbal.decay} min={500} max={7000} size="sm" onChange={(v) => onChange({ drumMachine: { ...dmConfig, cymbal: { ...cymbal, decay: v } } })} label="Decay" color="#fbbf24" formatValue={(v) => `${(v / 1000).toFixed(1)}s`} />
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
          <div className="flex gap-1 mb-3">
            {(['pulse1', 'pulse2', 'triangle', 'noise'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => onChange({ chipSynth: { ...chipConfig, channel: ch } })}
                className={`
                  flex-1 px-2 py-1 rounded text-xs font-bold uppercase transition-all
                  ${chipConfig.channel === ch
                    ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }
                `}
              >
                {ch.replace('pulse', 'P')}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-around items-end gap-2">
            <Knob
              value={chipConfig.bitDepth}
              min={2}
              max={16}
              size="sm"
              onChange={(v) => onChange({ chipSynth: { ...chipConfig, bitDepth: Math.round(v) } })}
              label="Bits"
              color="#22d3ee"
              formatValue={(v) => `${Math.round(v)}`}
            />
            {(chipConfig.channel === 'pulse1' || chipConfig.channel === 'pulse2') && (
              <Knob
                value={chipConfig.pulse?.duty || 50}
                min={12.5}
                max={50}
                size="sm"
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
              size="sm"
              step={0.5}
              onChange={(v) => onChange({ chipSynth: { ...chipConfig, vibrato: { ...chipConfig.vibrato, speed: v } } })}
              label="Vib Spd"
              color="#22d3ee"
              formatValue={(v) => `${v.toFixed(1)}Hz`}
            />
            <Knob
              value={chipConfig.vibrato.depth}
              min={0}
              max={100}
              size="sm"
              onChange={(v) => onChange({ chipSynth: { ...chipConfig, vibrato: { ...chipConfig.vibrato, depth: v } } })}
              label="Vib Dep"
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
          <div className="flex flex-wrap justify-around items-end gap-2 mb-3">
            <Knob value={pwmConfig.pulseWidth} min={5} max={95} size="sm" onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, pulseWidth: v } })} label="Width" color="#d946ef" formatValue={(v) => `${Math.round(v)}%`} />
            <Knob value={pwmConfig.pwmDepth} min={0} max={100} size="sm" onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, pwmDepth: v } })} label="Depth" color="#d946ef" formatValue={(v) => `${Math.round(v)}%`} />
            <Knob value={pwmConfig.pwmRate} min={0.1} max={20} size="sm" step={0.1} onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, pwmRate: v } })} label="Rate" color="#d946ef" formatValue={(v) => `${v.toFixed(1)}Hz`} />
            <Knob value={pwmConfig.oscillators} min={1} max={3} size="sm" onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, oscillators: Math.round(v) } })} label="Oscs" color="#d946ef" formatValue={(v) => Math.round(v).toString()} />
            <Knob value={pwmConfig.detune} min={0} max={50} size="sm" onChange={(v) => onChange({ pwmSynth: { ...pwmConfig, detune: v } })} label="Detune" color="#d946ef" formatValue={(v) => `${Math.round(v)}¢`} />
          </div>
          {/* PWM Waveform */}
          <div className="pt-2 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-2">LFO SHAPE</p>
            <div className="flex gap-1">
              {(['sine', 'triangle', 'sawtooth'] as const).map((shape) => (
                <button
                  key={shape}
                  onClick={() => onChange({ pwmSynth: { ...pwmConfig, pwmWaveform: shape } })}
                  className={`
                    flex-1 px-2 py-1 rounded text-xs font-bold uppercase transition-all
                    ${pwmConfig.pwmWaveform === shape
                      ? 'bg-fuchsia-500/20 text-fuchsia-400'
                      : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                    }
                  `}
                >
                  {shape.slice(0, 3)}
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
          <div className="flex justify-around items-end gap-1 mb-3">
            {(['violin', 'viola', 'cello', 'bass'] as const).map((section) => (
              <Knob
                key={section}
                value={strConfig.sections[section]}
                min={0}
                max={100}
                size="sm"
                onChange={(v) => onChange({ stringMachine: { ...strConfig, sections: { ...strConfig.sections, [section]: v } } })}
                label={section.slice(0, 3).toUpperCase()}
                color="#10b981"
                formatValue={(v) => `${Math.round(v)}%`}
              />
            ))}
          </div>
          {/* Ensemble/Chorus */}
          <div className="pt-2 border-t border-gray-700">
            <div className="flex justify-around items-end">
              <Knob value={strConfig.ensemble.depth} min={0} max={100} size="sm" onChange={(v) => onChange({ stringMachine: { ...strConfig, ensemble: { ...strConfig.ensemble, depth: v } } })} label="Depth" color="#10b981" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={strConfig.ensemble.rate} min={0.5} max={6} size="sm" step={0.1} onChange={(v) => onChange({ stringMachine: { ...strConfig, ensemble: { ...strConfig.ensemble, rate: v } } })} label="Rate" color="#10b981" formatValue={(v) => `${v.toFixed(1)}Hz`} />
              <Knob value={strConfig.brightness} min={0} max={100} size="sm" onChange={(v) => onChange({ stringMachine: { ...strConfig, brightness: v } })} label="Bright" color="#10b981" formatValue={(v) => `${Math.round(v)}%`} />
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
          <div className="flex gap-1 mb-3">
            {vowels.map((v) => (
              <button
                key={v}
                onClick={() => onChange({ formantSynth: { ...fmtConfig, vowel: v } })}
                className={`
                  flex-1 py-2 rounded font-bold text-sm transition-all
                  ${fmtConfig.vowel === v
                    ? 'bg-pink-500/20 text-pink-400 ring-1 ring-pink-500'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }
                `}
              >
                {v}
              </button>
            ))}
          </div>
          {/* Morph Controls */}
          <div className="pt-2 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-2">MORPH TO</p>
            <div className="flex gap-1 mb-3">
              {vowels.map((v) => (
                <button
                  key={v}
                  onClick={() => onChange({ formantSynth: { ...fmtConfig, vowelMorph: { ...fmtConfig.vowelMorph, target: v } } })}
                  className={`
                    flex-1 py-1 rounded text-xs font-bold transition-all
                    ${fmtConfig.vowelMorph.target === v
                      ? 'bg-pink-500/10 text-pink-300'
                      : 'bg-gray-800 text-gray-600 hover:text-gray-400'
                    }
                  `}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex justify-around items-end">
              <Knob value={fmtConfig.vowelMorph.amount} min={0} max={100} size="sm" onChange={(v) => onChange({ formantSynth: { ...fmtConfig, vowelMorph: { ...fmtConfig.vowelMorph, amount: v } } })} label="Amount" color="#f472b6" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={fmtConfig.vowelMorph.rate} min={0} max={5} size="sm" step={0.1} onChange={(v) => onChange({ formantSynth: { ...fmtConfig, vowelMorph: { ...fmtConfig.vowelMorph, rate: v } } })} label="Rate" color="#f472b6" formatValue={(v) => `${v.toFixed(1)}Hz`} />
              <Knob value={fmtConfig.brightness} min={0} max={100} size="sm" onChange={(v) => onChange({ formantSynth: { ...fmtConfig, brightness: v } })} label="Bright" color="#f472b6" formatValue={(v) => `${Math.round(v)}%`} />
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
          <div className="flex flex-wrap justify-around items-end gap-2 mb-3">
            <Knob value={wtConfig.morphPosition} min={0} max={100} onChange={(v) => onChange({ wavetable: { ...wtConfig, morphPosition: v } })} label="Morph" color="#6366f1" formatValue={(v) => `${Math.round(v)}%`} />
            <Knob value={wtConfig.morphLFORate} min={0.1} max={20} size="sm" step={0.1} onChange={(v) => onChange({ wavetable: { ...wtConfig, morphLFORate: v } })} label="LFO Rate" color="#6366f1" formatValue={(v) => `${v.toFixed(1)}Hz`} />
            <Knob value={wtConfig.morphModAmount} min={0} max={100} size="sm" onChange={(v) => onChange({ wavetable: { ...wtConfig, morphModAmount: v } })} label="Mod Amt" color="#6366f1" formatValue={(v) => `${Math.round(v)}%`} />
          </div>
          {/* Unison */}
          <div className="pt-2 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-2">UNISON</p>
            <div className="flex justify-around items-end">
              <Knob value={wtConfig.unison.voices} min={1} max={8} size="sm" onChange={(v) => onChange({ wavetable: { ...wtConfig, unison: { ...wtConfig.unison, voices: Math.round(v) } } })} label="Voices" color="#6366f1" formatValue={(v) => Math.round(v).toString()} />
              <Knob value={wtConfig.unison.detune} min={0} max={100} size="sm" onChange={(v) => onChange({ wavetable: { ...wtConfig, unison: { ...wtConfig.unison, detune: v } } })} label="Detune" color="#6366f1" formatValue={(v) => `${Math.round(v)}¢`} />
              <Knob value={wtConfig.unison.stereoSpread} min={0} max={100} size="sm" onChange={(v) => onChange({ wavetable: { ...wtConfig, unison: { ...wtConfig.unison, stereoSpread: v } } })} label="Spread" color="#6366f1" formatValue={(v) => `${Math.round(v)}%`} />
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
          <div className="flex flex-wrap justify-around items-end gap-2 mb-3">
            <Knob value={grConfig.grainSize} min={10} max={500} size="sm" onChange={(v) => onChange({ granular: { ...grConfig, grainSize: v } })} label="Size" color="#f97316" formatValue={(v) => `${Math.round(v)}ms`} />
            <Knob value={grConfig.grainOverlap} min={0} max={100} size="sm" onChange={(v) => onChange({ granular: { ...grConfig, grainOverlap: v } })} label="Overlap" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
            <Knob value={grConfig.playbackRate} min={0.25} max={4} size="sm" step={0.05} onChange={(v) => onChange({ granular: { ...grConfig, playbackRate: v } })} label="Speed" color="#f97316" formatValue={(v) => `${v.toFixed(2)}x`} />
            <Knob value={grConfig.scanPosition} min={0} max={100} size="sm" onChange={(v) => onChange({ granular: { ...grConfig, scanPosition: v } })} label="Pos" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
          </div>
          {/* Randomization */}
          <div className="pt-2 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-2">RANDOMIZATION</p>
            <div className="flex justify-around items-end">
              <Knob value={grConfig.randomPitch} min={0} max={100} size="sm" onChange={(v) => onChange({ granular: { ...grConfig, randomPitch: v } })} label="Pitch" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={grConfig.randomPosition} min={0} max={100} size="sm" onChange={(v) => onChange({ granular: { ...grConfig, randomPosition: v } })} label="Pos" color="#f97316" formatValue={(v) => `${Math.round(v)}%`} />
              <Knob value={grConfig.density} min={1} max={16} size="sm" onChange={(v) => onChange({ granular: { ...grConfig, density: Math.round(v) } })} label="Density" color="#f97316" formatValue={(v) => Math.round(v).toString()} />
            </div>
          </div>
        </section>
      );
    }

    // =========================================================================
    // WOBBLE BASS - Dubstep/DnB Bass Synth
    // =========================================================================
    case 'WobbleBass': {
      const wbConfig = instrument.wobbleBass || DEFAULT_WOBBLE_BASS;
      const modeOptions: { value: typeof wbConfig.mode; label: string }[] = [
        { value: 'classic', label: 'CLS' },
        { value: 'reese', label: 'RSE' },
        { value: 'fm', label: 'FM' },
        { value: 'growl', label: 'GRL' },
        { value: 'hybrid', label: 'HYB' },
      ];
      const syncOptions: { value: typeof wbConfig.wobbleLFO.sync; label: string }[] = [
        { value: 'free', label: 'Free' },
        { value: '1/4', label: '1/4' },
        { value: '1/8', label: '1/8' },
        { value: '1/16', label: '1/16' },
      ];
      return (
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#d946ef" title="Wobble Bass" />

          {/* Mode selector */}
          <div className="flex gap-1 mb-3">
            {modeOptions.map((mode) => (
              <button
                key={mode.value}
                onClick={() => onChange({ wobbleBass: { ...wbConfig, mode: mode.value } })}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  wbConfig.mode === mode.value
                    ? 'bg-fuchsia-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Filter + LFO */}
          <div className="flex flex-wrap justify-around items-end gap-2 mb-3">
            <Knob value={wbConfig.filter.cutoff} min={20} max={20000} size="sm" onChange={(v) => onChange({ wobbleBass: { ...wbConfig, filter: { ...wbConfig.filter, cutoff: v } } })} label="Cutoff" color="#d946ef" formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`} />
            <Knob value={wbConfig.filter.resonance} min={0} max={20} size="sm" onChange={(v) => onChange({ wobbleBass: { ...wbConfig, filter: { ...wbConfig.filter, resonance: v } } })} label="Reso" color="#d946ef" formatValue={(v) => v.toFixed(1)} />
            <div className="flex flex-col items-center">
              <p className="text-[9px] text-gray-500 mb-1">Sync</p>
              <select
                value={wbConfig.wobbleLFO.sync}
                onChange={(e) => onChange({ wobbleBass: { ...wbConfig, wobbleLFO: { ...wbConfig.wobbleLFO, sync: e.target.value as typeof wbConfig.wobbleLFO.sync } } })}
                className="bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-700"
              >
                {syncOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <Knob value={wbConfig.wobbleLFO.amount} min={0} max={100} size="sm" onChange={(v) => onChange({ wobbleBass: { ...wbConfig, wobbleLFO: { ...wbConfig.wobbleLFO, amount: v } } })} label="Wobble" color="#ec4899" formatValue={(v) => `${Math.round(v)}%`} />
          </div>

          {/* Sub + Distortion */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-700">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={wbConfig.sub.enabled}
                onChange={(e) => onChange({ wobbleBass: { ...wbConfig, sub: { ...wbConfig.sub, enabled: e.target.checked } } })}
                className="w-3 h-3 rounded bg-gray-700 border-gray-600"
              />
              <span className="text-xs text-gray-400">Sub</span>
            </label>
            <Knob value={wbConfig.sub.level} min={0} max={100} size="sm" onChange={(v) => onChange({ wobbleBass: { ...wbConfig, sub: { ...wbConfig.sub, level: v } } })} label="" color="#f43f5e" formatValue={(v) => `${Math.round(v)}%`} />
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={wbConfig.distortion.enabled}
                onChange={(e) => onChange({ wobbleBass: { ...wbConfig, distortion: { ...wbConfig.distortion, enabled: e.target.checked } } })}
                className="w-3 h-3 rounded bg-gray-700 border-gray-600"
              />
              <span className="text-xs text-gray-400">Dist</span>
            </label>
            <Knob value={wbConfig.distortion.drive} min={0} max={100} size="sm" onChange={(v) => onChange({ wobbleBass: { ...wbConfig, distortion: { ...wbConfig.distortion, drive: v } } })} label="" color="#ef4444" formatValue={(v) => `${Math.round(v)}%`} />
          </div>
        </section>
      );
    }

    default:
      return null;
  }
}
