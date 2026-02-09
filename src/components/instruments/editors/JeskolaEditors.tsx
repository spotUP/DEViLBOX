/**
 * BuzzmachineGeneratorEditors - Visual editors for ALL Buzzmachine generators
 *
 * Provides VST-style knob-based interfaces for each generator machine type,
 * matching the design pattern from VisualSynthEditor and VisualTB303Editor.
 *
 * Generators:
 * - CyanPhaseDTMF
 * - ElenzilFrequencyBomb
 * - FSMKick / FSMKickXP
 * - JeskolaNoise / JeskolaTrilok
 * - MadBrain4FM2F / MadBrainDynamite6
 * - MakkM3
 * - OomekAggressor
 */

import React, { useCallback, useRef } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import {
  Drum,
  AudioWaveform,
  Phone,
  Bomb,
  Waves,
  Music,
  Cpu,
  Zap,
  Radio,
  FileUp,
  Layers,
} from 'lucide-react';

interface GeneratorEditorProps {
  config: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

/**
 * Section header component for consistency with VisualSynthEditor
 */
function SectionHeader({ color, title }: { color: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
      <h3 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h3>
    </div>
  );
}

/**
 * Hook for updating buzzmachine parameters
 */
const useBuzzmachineParam = (
  config: InstrumentConfig,
  onChange: (updates: Partial<InstrumentConfig>) => void
) => {
  const configRef = useRef(config);
  configRef.current = config;
  
  return useCallback(
    (paramIndex: number, value: number) => {
      const currentParams = configRef.current.buzzmachine?.parameters || {};
      const machineType = configRef.current.buzzmachine?.machineType || 'ArguruDistortion';
      onChange({
        buzzmachine: {
          machineType,
          ...configRef.current.buzzmachine,
          parameters: {
            ...currentParams,
            [paramIndex]: value,
          },
        },
      });
    },
    [onChange]
  );
};

// ============================================================================
// CYANPHASE DTMF - Dial Tone Generator
// ============================================================================

export const CyanPhaseDTMFEditor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  // Parameters: digit(0), length(1-2), volume(3)
  const digit = params[0] ?? 0;
  const length = ((params[1] ?? 100) | ((params[2] ?? 0) << 8));
  const volume = params[3] ?? 0x80;

  const digitLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#', 'A', 'B', 'C', 'D'];

  const updateWord = (lowIndex: number, highIndex: number, value: number) => {
    const low = value & 0xFF;
    const high = (value >> 8) & 0xFF;
    updateParam(lowIndex, low);
    updateParam(highIndex, high);
  };

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
            <Phone size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">CyanPhase DTMF</h2>
            <p className="text-xs text-gray-400">Dial Tone Generator by CyanPhase</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Digit Selector */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#06b6d4" title="Digit" />
          <div className="grid grid-cols-4 gap-2">
            {digitLabels.map((label, idx) => (
              <button
                key={idx}
                onClick={() => updateParam(0, idx)}
                className={`
                  py-3 rounded-lg font-bold text-lg transition-all
                  ${digit === idx
                    ? 'bg-cyan-500/20 text-cyan-400 ring-2 ring-cyan-500'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Output */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#3b82f6" title="Output" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={length}
              min={1}
              max={65535}
              onChange={(v) => updateWord(1, 2, Math.round(v))}
              label="Length"
              color="#3b82f6"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
            <Knob
              value={volume}
              min={0}
              max={255}
              onChange={(v) => updateParam(3, Math.round(v))}
              label="Volume"
              color="#3b82f6"
              formatValue={(v) => `${Math.round(v / 2.55)}%`}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// ELENZIL FREQUENCY BOMB - Frequency Sweep Generator
// ============================================================================

export const ElenzilFrequencyBombEditor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  // Parameters: startFreq(0-1), endFreq(2-3), freqAttack(4-5), attackUnit(6), volume(7), wave(8), wavePower(9)
  const startFreq = ((params[0] ?? 0) | ((params[1] ?? 4) << 8));
  const endFreq = ((params[2] ?? 100) | ((params[3] ?? 0) << 8));
  const freqAttack = ((params[4] ?? 10) | ((params[5] ?? 0) << 8));
  const attackUnit = params[6] ?? 4;
  const volume = params[7] ?? 0x80;
  const wave = params[8] ?? 0;
  const wavePower = params[9] ?? 1;

  const waveLabels = ['Sine', 'Saw', 'Square', 'Triangle', 'Noise'];
  const unitLabels = ['', 'ms', 'tick', '256th', 'sec'];

  const updateWord = (lowIndex: number, highIndex: number, value: number) => {
    const low = value & 0xFF;
    const high = (value >> 8) & 0xFF;
    updateParam(lowIndex, low);
    updateParam(highIndex, high);
  };

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-600">
            <Bomb size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Elenzil FrequencyBomb</h2>
            <p className="text-xs text-gray-400">Frequency Sweep Generator by Elenzil</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Frequency Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#f97316" title="Frequency Sweep" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={startFreq}
              min={0}
              max={65534}
              onChange={(v) => updateWord(0, 1, Math.round(v))}
              label="Start"
              color="#f97316"
              formatValue={(v) => `${Math.round(v)}Hz`}
            />
            <Knob
              value={endFreq}
              min={0}
              max={65534}
              onChange={(v) => updateWord(2, 3, Math.round(v))}
              label="End"
              color="#f97316"
              formatValue={(v) => `${Math.round(v)}Hz`}
            />
            <Knob
              value={freqAttack}
              min={0}
              max={65534}
              onChange={(v) => updateWord(4, 5, Math.round(v))}
              label={`Attack (${unitLabels[attackUnit] || 'ms'})`}
              color="#f97316"
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
          {/* Unit Selector */}
          <div className="flex justify-center mt-4 gap-1">
            {[1, 2, 3, 4].map((unit) => (
              <button
                key={unit}
                onClick={() => updateParam(6, unit)}
                className={`
                  px-3 py-1 text-xs rounded font-medium transition-all
                  ${attackUnit === unit
                    ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }
                `}
              >
                {unitLabels[unit]}
              </button>
            ))}
          </div>
        </section>

        {/* Waveform Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#ef4444" title="Waveform" />
          <div className="flex gap-2 mb-4">
            {waveLabels.map((label, idx) => (
              <button
                key={idx}
                onClick={() => updateParam(8, idx)}
                className={`
                  flex-1 py-2 rounded-lg font-bold text-xs transition-all
                  ${wave === idx
                    ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={wavePower}
              min={1}
              max={13}
              onChange={(v) => updateParam(9, Math.round(v))}
              label="Power"
              color="#ef4444"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={volume}
              min={0}
              max={0xF0}
              onChange={(v) => updateParam(7, Math.round(v))}
              label="Volume"
              color="#ef4444"
              formatValue={(v) => `${Math.round(v / 2.4)}%`}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// FSM KICK - Simple Kick Drum
// ============================================================================

export const FSMKickEditor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  // Parameters: Trigger(0), Start(1), End(2), T_DecTime(3), T_DecShape(4), A_DecTime(5)
  const startFreq = params[1] ?? 198;
  const endFreq = params[2] ?? 64;
  const toneDecTime = params[3] ?? 46;
  const toneDecShape = params[4] ?? 27;
  const ampDecTime = params[5] ?? 55;

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-red-600 to-orange-600">
            <Drum size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">FSM Kick</h2>
            <p className="text-xs text-gray-400">Kick Drum by Krzysztof Foltman</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Pitch Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#ef4444" title="Pitch" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={startFreq}
              min={1}
              max={240}
              onChange={(v) => updateParam(1, Math.round(v))}
              label="Start"
              color="#ef4444"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={endFreq}
              min={1}
              max={240}
              onChange={(v) => updateParam(2, Math.round(v))}
              label="End"
              color="#ef4444"
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
        </section>

        {/* Envelope Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#f97316" title="Envelope" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={toneDecTime}
              min={1}
              max={240}
              onChange={(v) => updateParam(3, Math.round(v))}
              label="Tone Dec"
              color="#f97316"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={toneDecShape}
              min={1}
              max={240}
              onChange={(v) => updateParam(4, Math.round(v))}
              label="Tone Shape"
              color="#f97316"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={ampDecTime}
              min={1}
              max={240}
              onChange={(v) => updateParam(5, Math.round(v))}
              label="Amp Dec"
              color="#f97316"
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// FSM KICKXP - Extended Kick Drum
// ============================================================================

export const FSMKickXPEditor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  // Parameters: Trigger(0), Start(1), End(2), Buzz(3), Click(4), Punch(5),
  //   T_DecRate(6), T_DecShape(7), B_DecRate(8), CP_DecRate(9), A_DecSlope(10), A_DecTime(11), A_RelSlope(12)
  const startFreq = params[1] ?? 145;
  const endFreq = params[2] ?? 50;
  const buzz = params[3] ?? 55;
  const click = params[4] ?? 28;
  const punch = params[5] ?? 47;
  const toneDecRate = params[6] ?? 30;
  const toneDecShape = params[7] ?? 27;
  const buzzDecRate = params[8] ?? 55;
  const cpDecRate = params[9] ?? 55;
  const ampDecSlope = params[10] ?? 1;
  const ampDecTime = params[11] ?? 32;
  const ampRelSlope = params[12] ?? 105;

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-red-600 to-pink-600">
            <Drum size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">FSM KickXP</h2>
            <p className="text-xs text-gray-400">Extended Kick Drum by FSM</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Pitch Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#ef4444" title="Pitch" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={startFreq}
              min={1}
              max={240}
              onChange={(v) => updateParam(1, Math.round(v))}
              label="Start"
              size="sm"
              color="#ef4444"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={endFreq}
              min={1}
              max={240}
              onChange={(v) => updateParam(2, Math.round(v))}
              label="End"
              size="sm"
              color="#ef4444"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={toneDecRate}
              min={1}
              max={240}
              onChange={(v) => updateParam(6, Math.round(v))}
              label="Dec Rate"
              size="sm"
              color="#ef4444"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={toneDecShape}
              min={1}
              max={240}
              onChange={(v) => updateParam(7, Math.round(v))}
              label="Dec Shape"
              size="sm"
              color="#ef4444"
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
        </section>

        {/* Character Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#f97316" title="Character" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={buzz}
              min={0}
              max={100}
              onChange={(v) => updateParam(3, Math.round(v))}
              label="Buzz"
              size="sm"
              color="#f97316"
              formatValue={(v) => `${Math.round(v)}%`}
            />
            <Knob
              value={click}
              min={0}
              max={100}
              onChange={(v) => updateParam(4, Math.round(v))}
              label="Click"
              size="sm"
              color="#f97316"
              formatValue={(v) => `${Math.round(v)}%`}
            />
            <Knob
              value={punch}
              min={0}
              max={100}
              onChange={(v) => updateParam(5, Math.round(v))}
              label="Punch"
              size="sm"
              color="#f97316"
              formatValue={(v) => `${Math.round(v)}%`}
            />
            <Knob
              value={buzzDecRate}
              min={1}
              max={240}
              onChange={(v) => updateParam(8, Math.round(v))}
              label="Buzz Dec"
              size="sm"
              color="#f97316"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={cpDecRate}
              min={1}
              max={240}
              onChange={(v) => updateParam(9, Math.round(v))}
              label="C+P Dec"
              size="sm"
              color="#f97316"
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
        </section>

        {/* Amplitude Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#eab308" title="Amplitude" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={ampDecSlope}
              min={1}
              max={240}
              onChange={(v) => updateParam(10, Math.round(v))}
              label="Dec Slope"
              color="#eab308"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={ampDecTime}
              min={1}
              max={240}
              onChange={(v) => updateParam(11, Math.round(v))}
              label="Dec Time"
              color="#eab308"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={ampRelSlope}
              min={1}
              max={240}
              onChange={(v) => updateParam(12, Math.round(v))}
              label="Rel Slope"
              color="#eab308"
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// JESKOLA TRILOK - 3-Voice Drum Machine
// ============================================================================

export const JeskolaTrilokEditor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  // Parameters: BD_Tone(0), BD_Decay(1), BD_Volume(2)
  const bdTone = params[0] ?? 64;
  const bdDecay = params[1] ?? 64;
  const bdVolume = params[2] ?? 0x80;

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-orange-600 to-red-700">
            <Drum size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Jeskola Trilok</h2>
            <p className="text-xs text-gray-400">Drum Machine by Oskari Tammelin</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Bass Drum Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#ef4444" title="Bass Drum" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={bdTone}
              min={0}
              max={127}
              onChange={(v) => updateParam(0, Math.round(v))}
              label="Tone"
              color="#ef4444"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={bdDecay}
              min={0}
              max={127}
              onChange={(v) => updateParam(1, Math.round(v))}
              label="Decay"
              color="#ef4444"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={bdVolume}
              min={0}
              max={254}
              onChange={(v) => updateParam(2, Math.round(v))}
              label="Volume"
              color="#ef4444"
              formatValue={(v) => `${Math.round(v / 2.54)}%`}
            />
          </div>
        </section>

        {/* Info */}
        <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
          <p className="text-xs text-gray-400 leading-relaxed">
            Trigger notes to play the bass drum. Use tracker note commands to control pitch and velocity.
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// JESKOLA NOISE - Noise Generator
// ============================================================================

export const JeskolaNoiseEditor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  // Parameters: Attack(0 word), Sustain(1 word), Release(2 word), Color(3 word), Volume(4 byte)
  // Word params are stored as single indices in the BUZZMACHINE_INFO
  const attack = params[0] ?? 16;
  const sustain = params[1] ?? 16;
  const release = params[2] ?? 512;
  const color = params[3] ?? 0x1000;
  const volume = params[4] ?? 0x80;

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-gray-500 to-gray-700">
            <AudioWaveform size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Jeskola Noise</h2>
            <p className="text-xs text-gray-400">Noise Generator by Oskari Tammelin</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Envelope Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#6b7280" title="Envelope" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={attack}
              min={1}
              max={65535}
              onChange={(v) => updateParam(0, Math.round(v))}
              label="Attack"
              color="#6b7280"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
            <Knob
              value={sustain}
              min={1}
              max={65535}
              onChange={(v) => updateParam(1, Math.round(v))}
              label="Sustain"
              color="#6b7280"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
            <Knob
              value={release}
              min={1}
              max={65535}
              onChange={(v) => updateParam(2, Math.round(v))}
              label="Release"
              color="#6b7280"
              formatValue={(v) => `${Math.round(v)}ms`}
            />
          </div>
        </section>

        {/* Tone Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#a855f7" title="Tone" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={color}
              min={0}
              max={0x1000}
              onChange={(v) => updateParam(3, Math.round(v))}
              label="Color"
              size="lg"
              color="#a855f7"
              formatValue={(v) => v < 0x555 ? 'Dark' : v < 0xAAA ? 'Mid' : 'Bright'}
            />
            <Knob
              value={volume}
              min={0}
              max={0xFE}
              onChange={(v) => updateParam(4, Math.round(v))}
              label="Volume"
              size="lg"
              color="#a855f7"
              formatValue={(v) => `${Math.round(v / 2.54)}%`}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// MADBRAIN 4FM2F - 4-Operator FM Synthesizer
// ============================================================================

export const MadBrain4FM2FEditor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  // Parameters: Routing(0), Osc4_Wave(1), Osc4_Freq(2), Osc4_Fine(3), Osc4_Vol(4)
  const routing = params[0] ?? 1;
  const osc4Wave = params[1] ?? 1;
  const osc4Freq = params[2] ?? 1;
  const osc4Fine = params[3] ?? 0;
  const osc4Vol = params[4] ?? 32;

  const waveLabels = ['', 'Sine', 'Tri', 'Saw', 'Square', 'Noise', 'S&H', 'Ramp', 'PW25', 'PW12', 'PW6', 'Harm2', 'Harm3', 'Harm4', 'Harm5', 'Harm6', 'Harm7'];

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600">
            <Cpu size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">MadBrain 4FM2F</h2>
            <p className="text-xs text-gray-400">4-Op FM Synth by MadBrain</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Routing Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#8b5cf6" title="FM Routing" />
          <div className="flex justify-center">
            <Knob
              value={routing}
              min={1}
              max={15}
              onChange={(v) => updateParam(0, Math.round(v))}
              label="Algorithm"
              size="lg"
              color="#8b5cf6"
              formatValue={(v) => `Alg ${Math.round(v)}`}
            />
          </div>
        </section>

        {/* Oscillator 4 Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#6366f1" title="Oscillator 4" />
          <div className="mb-4">
            <span className="text-xs text-gray-400 mb-2 block">Waveform</span>
            <select
              value={osc4Wave}
              onChange={(e) => updateParam(1, parseInt(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {waveLabels.slice(1).map((label, idx) => (
                <option key={idx + 1} value={idx + 1}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={osc4Freq}
              min={0}
              max={32}
              onChange={(v) => updateParam(2, Math.round(v))}
              label="Ratio"
              color="#6366f1"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={osc4Fine}
              min={0}
              max={0xFE}
              onChange={(v) => updateParam(3, Math.round(v))}
              label="Fine"
              color="#6366f1"
              bipolar
              formatValue={(v) => `${Math.round(v - 127)}`}
            />
            <Knob
              value={osc4Vol}
              min={0}
              max={64}
              onChange={(v) => updateParam(4, Math.round(v))}
              label="Volume"
              color="#6366f1"
              formatValue={(v) => `${Math.round(v / 0.64)}%`}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// MADBRAIN DYNAMITE6 - 6-Voice Synthesizer
// ============================================================================

export const MadBrainDynamite6Editor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  // Parameters: Coarse(0), Fine(1), Amp(2), Attack(3), Decay(4), Routing(5), Release(6 word)
  const coarse = params[0] ?? 0x80;
  const fine = params[1] ?? 0x80;
  const amp = params[2] ?? 0x20;
  const attack = params[3] ?? 0x04;
  const decay = params[4] ?? 0xFF;
  const routing = params[5] ?? 0;
  const release = params[6] ?? 0xF000;

  const routingLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-600">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">MadBrain Dynamite6</h2>
            <p className="text-xs text-gray-400">6-Voice Synth by MadBrain</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Pitch Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#eab308" title="Pitch" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={coarse}
              min={1}
              max={0xFF}
              onChange={(v) => updateParam(0, Math.round(v))}
              label="Coarse"
              color="#eab308"
              bipolar
              formatValue={(v) => `${Math.round(v - 128)}`}
            />
            <Knob
              value={fine}
              min={1}
              max={0xFF}
              onChange={(v) => updateParam(1, Math.round(v))}
              label="Fine"
              color="#eab308"
              bipolar
              formatValue={(v) => `${Math.round(v - 128)}`}
            />
          </div>
        </section>

        {/* Envelope Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#f97316" title="Envelope" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={attack}
              min={0}
              max={0xFE}
              onChange={(v) => updateParam(3, Math.round(v))}
              label="Attack"
              size="sm"
              color="#f97316"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={decay}
              min={1}
              max={0xFF}
              onChange={(v) => updateParam(4, Math.round(v))}
              label="Decay"
              size="sm"
              color="#f97316"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={release}
              min={1}
              max={0xFFFF}
              onChange={(v) => updateParam(6, Math.round(v))}
              label="Release"
              size="sm"
              color="#f97316"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={amp}
              min={1}
              max={0xFF}
              onChange={(v) => updateParam(2, Math.round(v))}
              label="Amp"
              size="sm"
              color="#f97316"
              formatValue={(v) => `${Math.round(v / 2.55)}%`}
            />
          </div>
        </section>

        {/* Routing Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#f59e0b" title="Routing" />
          <div className="flex flex-wrap gap-1 justify-center">
            {routingLabels.map((label, idx) => (
              <button
                key={idx}
                onClick={() => updateParam(5, idx)}
                className={`
                  w-10 h-10 rounded-lg font-bold text-sm transition-all
                  ${routing === idx
                    ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// MAKK M3 - 2-Oscillator Subtractive Synth
// ============================================================================

export const MakkM3Editor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  // Parameters: Osc1_Wave(0), PW1(1), Osc2_Wave(2), PW2(3), Mix(4), MixType(5),
  //   Semi_Detune(6), Fine_Detune(7), Glide(8), SubOsc_Wave(9), SubOsc_Vol(10)
  const osc1Wave = params[0] ?? 0;
  const pw1 = params[1] ?? 0x40;
  const osc2Wave = params[2] ?? 0;
  const pw2 = params[3] ?? 0x40;
  const mix = params[4] ?? 0x40;
  const mixType = params[5] ?? 0;
  const semiDetune = params[6] ?? 0x40;
  const fineDetune = params[7] ?? 0x40;
  const glide = params[8] ?? 0;
  const subOscWave = params[9] ?? 0;
  const subOscVol = params[10] ?? 0x40;

  const waveLabels = ['Sine', 'Tri', 'Saw', 'Square', 'Noise', 'S&H'];
  const mixTypeLabels = ['Add', 'Ring', 'AM', 'FM', 'Sync', 'HSync', 'Osc1', 'Osc2', 'Sub'];
  const subWaveLabels = ['Sine', 'Tri', 'Saw', 'Square', 'Noise'];

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-teal-600">
            <Music size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Makk M3</h2>
            <p className="text-xs text-gray-400">2-Osc Subtractive Synth by MAKK</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Oscillator 1 */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#22c55e" title="Oscillator 1" />
          <div className="flex gap-2 mb-3">
            {waveLabels.map((label, idx) => (
              <button
                key={idx}
                onClick={() => updateParam(0, idx)}
                className={`
                  flex-1 py-1.5 rounded text-xs font-bold transition-all
                  ${osc1Wave === idx
                    ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex justify-center">
            <Knob
              value={pw1}
              min={0}
              max={127}
              onChange={(v) => updateParam(1, Math.round(v))}
              label="Pulse Width"
              size="sm"
              color="#22c55e"
              formatValue={(v) => `${Math.round(v / 1.27)}%`}
            />
          </div>
        </section>

        {/* Oscillator 2 */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#14b8a6" title="Oscillator 2" />
          <div className="flex gap-2 mb-3">
            {waveLabels.map((label, idx) => (
              <button
                key={idx}
                onClick={() => updateParam(2, idx)}
                className={`
                  flex-1 py-1.5 rounded text-xs font-bold transition-all
                  ${osc2Wave === idx
                    ? 'bg-teal-500/20 text-teal-400 ring-1 ring-teal-500'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={pw2}
              min={0}
              max={127}
              onChange={(v) => updateParam(3, Math.round(v))}
              label="Pulse Width"
              size="sm"
              color="#14b8a6"
              formatValue={(v) => `${Math.round(v / 1.27)}%`}
            />
            <Knob
              value={semiDetune}
              min={0}
              max={127}
              onChange={(v) => updateParam(6, Math.round(v))}
              label="Semi"
              size="sm"
              color="#14b8a6"
              bipolar
              formatValue={(v) => `${Math.round(v - 64)}`}
            />
            <Knob
              value={fineDetune}
              min={0}
              max={127}
              onChange={(v) => updateParam(7, Math.round(v))}
              label="Fine"
              size="sm"
              color="#14b8a6"
              bipolar
              formatValue={(v) => `${Math.round(v - 64)}`}
            />
          </div>
        </section>

        {/* Mix + Sub */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#10b981" title="Mix & Sub" />
          <div className="flex gap-1 mb-3 flex-wrap">
            {mixTypeLabels.map((label, idx) => (
              <button
                key={idx}
                onClick={() => updateParam(5, idx)}
                className={`
                  px-2 py-1 rounded text-xs font-bold transition-all
                  ${mixType === idx
                    ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={mix}
              min={0}
              max={127}
              onChange={(v) => updateParam(4, Math.round(v))}
              label="Mix"
              size="sm"
              color="#10b981"
              formatValue={(v) => `${Math.round(v / 1.27)}%`}
            />
            <Knob
              value={glide}
              min={0}
              max={127}
              onChange={(v) => updateParam(8, Math.round(v))}
              label="Glide"
              size="sm"
              color="#10b981"
              formatValue={(v) => Math.round(v).toString()}
            />
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-gray-500 mb-1">Sub Wave</span>
              <select
                value={subOscWave}
                onChange={(e) => updateParam(9, parseInt(e.target.value))}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
              >
                {subWaveLabels.map((label, idx) => (
                  <option key={idx} value={idx}>{label}</option>
                ))}
              </select>
            </div>
            <Knob
              value={subOscVol}
              min={0}
              max={127}
              onChange={(v) => updateParam(10, Math.round(v))}
              label="Sub Vol"
              size="sm"
              color="#10b981"
              formatValue={(v) => `${Math.round(v / 1.27)}%`}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// OOMEK AGGRESSOR 3o3 - 303-Style Acid Synth
// ============================================================================

export const OomekAggressorEditor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  // Parameters: Osc_Type(0), Cutoff(1), Resonance(2), Env_Mod(3), Decay(4), Accent(5), Finetune(6), Volume(7)
  const oscType = params[0] ?? 0;
  const cutoff = params[1] ?? 0x78;
  const resonance = params[2] ?? 0x40;
  const envMod = params[3] ?? 0x40;
  const decay = params[4] ?? 0x40;
  const accent = params[5] ?? 0x40;
  const finetune = params[6] ?? 0x64;
  const volume = params[7] ?? 0x64;

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-red-500 to-orange-500">
            <Radio size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Oomek Aggressor 3o3</h2>
            <p className="text-xs text-gray-400">303-Style Acid Synth by Radoslaw Dutkiewicz</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Oscillator */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#ef4444" title="Oscillator" />
          <div className="flex gap-4 justify-center mb-4">
            <button
              onClick={() => updateParam(0, 0)}
              className={`
                flex-1 max-w-32 py-3 rounded-lg font-bold transition-all
                ${oscType === 0
                  ? 'bg-red-500/20 text-red-400 ring-2 ring-red-500'
                  : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }
              `}
            >
              SAW
            </button>
            <button
              onClick={() => updateParam(0, 1)}
              className={`
                flex-1 max-w-32 py-3 rounded-lg font-bold transition-all
                ${oscType === 1
                  ? 'bg-red-500/20 text-red-400 ring-2 ring-red-500'
                  : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }
              `}
            >
              SQUARE
            </button>
          </div>
          <div className="flex justify-center">
            <Knob
              value={finetune}
              min={0}
              max={0xC8}
              onChange={(v) => updateParam(6, Math.round(v))}
              label="Finetune"
              color="#ef4444"
              bipolar
              formatValue={(v) => `${Math.round(v - 100)}`}
            />
          </div>
        </section>

        {/* Filter */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#f97316" title="Filter" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={cutoff}
              min={0}
              max={0xF0}
              onChange={(v) => updateParam(1, Math.round(v))}
              label="Cutoff"
              color="#f97316"
              formatValue={(v) => `${Math.round(v / 2.4)}%`}
            />
            <Knob
              value={resonance}
              min={0}
              max={0x80}
              onChange={(v) => updateParam(2, Math.round(v))}
              label="Resonance"
              color="#f97316"
              formatValue={(v) => `${Math.round(v / 1.28)}%`}
            />
            <Knob
              value={envMod}
              min={0}
              max={0x80}
              onChange={(v) => updateParam(3, Math.round(v))}
              label="Env Mod"
              color="#f97316"
              formatValue={(v) => `${Math.round(v / 1.28)}%`}
            />
          </div>
        </section>

        {/* Envelope & Accent */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#eab308" title="Envelope & Output" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={decay}
              min={0}
              max={0x80}
              onChange={(v) => updateParam(4, Math.round(v))}
              label="Decay"
              color="#eab308"
              formatValue={(v) => `${Math.round(v / 1.28)}%`}
            />
            <Knob
              value={accent}
              min={0}
              max={0x80}
              onChange={(v) => updateParam(5, Math.round(v))}
              label="Accent"
              color="#eab308"
              formatValue={(v) => `${Math.round(v / 1.28)}%`}
            />
            <Knob
              value={volume}
              min={0}
              max={0xC8}
              onChange={(v) => updateParam(7, Math.round(v))}
              label="Volume"
              color="#eab308"
              formatValue={(v) => `${Math.round(v / 2)}%`}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// JESKOLA EFFECTS (keeping existing)
// ============================================================================

// Jeskola Delay
export const JeskolaDelayEditor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  const dryThru = params[0] ?? 1;
  const length = ((params[1] ?? 3) | ((params[2] ?? 0) << 8));
  const lengthUnit = params[3] ?? 0;
  const feedback = params[4] ?? 96;
  const wetOut = params[5] ?? 48;

  const unitLabels = ['tick', 'ms', 'sample', '1/256 tick'];

  const updateWord = (lowIndex: number, highIndex: number, value: number) => {
    const low = value & 0xFF;
    const high = (value >> 8) & 0xFF;
    updateParam(lowIndex, low);
    updateParam(highIndex, high);
  };

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600">
            <Waves size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Jeskola Delay</h2>
            <p className="text-xs text-gray-400">Mono Delay by Oskari Tammelin</p>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#3b82f6" title="Time" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob value={length} min={1} max={65535} onChange={(v) => updateWord(1, 2, Math.round(v))} label="Length" size="lg" color="#3b82f6" formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex justify-center mt-4 gap-1">
            {unitLabels.map((label, idx) => (
              <button key={idx} onClick={() => updateParam(3, idx)} className={`px-2 py-1 text-xs rounded font-medium transition-all ${lengthUnit === idx ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}>{label}</button>
            ))}
          </div>
        </section>
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#06b6d4" title="Mix" />
          <div className="flex flex-wrap gap-6 items-end">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-gray-400">Dry Thru</span>
              <button onClick={() => updateParam(0, dryThru === 1 ? 0 : 1)} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${dryThru === 1 ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}>{dryThru === 1 ? 'ON' : 'OFF'}</button>
            </div>
            <Knob value={feedback} min={0} max={128} onChange={(v) => updateParam(4, Math.round(v))} label="Feedback" color="#06b6d4" formatValue={(v) => `${Math.round((v / 128) * 100)}%`} />
            <Knob value={wetOut} min={0} max={128} onChange={(v) => updateParam(5, Math.round(v))} label="Wet" color="#06b6d4" formatValue={(v) => `${Math.round((v / 128) * 100)}%`} />
          </div>
        </section>
      </div>
    </div>
  );
};

// Jeskola CrossDelay
export const JeskolaCrossDelayEditor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  const dryThru = params[0] ?? 1;
  const leftLength = ((params[1] ?? 3) | ((params[2] ?? 0) << 8));
  const rightLength = ((params[3] ?? 3) | ((params[4] ?? 0) << 8));
  const lengthUnit = params[5] ?? 0;
  const feedback = params[6] ?? 96;
  const wetOut = params[7] ?? 48;

  const unitLabels = ['tick', 'ms', 'sample', '1/256 tick'];

  const updateWord = (lowIndex: number, highIndex: number, value: number) => {
    const low = value & 0xFF;
    const high = (value >> 8) & 0xFF;
    updateParam(lowIndex, low);
    updateParam(highIndex, high);
  };

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600">
            <Waves size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Jeskola CrossDelay</h2>
            <p className="text-xs text-gray-400">Stereo Cross Delay by Oskari Tammelin</p>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#ec4899" title="Stereo Time" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob value={leftLength} min={1} max={65535} onChange={(v) => updateWord(1, 2, Math.round(v))} label="Left" color="#ec4899" formatValue={(v) => Math.round(v).toString()} />
            <Knob value={rightLength} min={1} max={65535} onChange={(v) => updateWord(3, 4, Math.round(v))} label="Right" color="#a855f7" formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex justify-center mt-4 gap-1">
            {unitLabels.map((label, idx) => (
              <button key={idx} onClick={() => updateParam(5, idx)} className={`px-2 py-1 text-xs rounded font-medium transition-all ${lengthUnit === idx ? 'bg-pink-500/20 text-pink-400 ring-1 ring-pink-500' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}>{label}</button>
            ))}
          </div>
        </section>
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#8b5cf6" title="Mix" />
          <div className="flex flex-wrap gap-6 items-end">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-gray-400">Dry Thru</span>
              <button onClick={() => updateParam(0, dryThru === 1 ? 0 : 1)} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${dryThru === 1 ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}>{dryThru === 1 ? 'ON' : 'OFF'}</button>
            </div>
            <Knob value={feedback} min={0} max={128} onChange={(v) => updateParam(6, Math.round(v))} label="Feedback" color="#8b5cf6" formatValue={(v) => `${Math.round((v / 128) * 100)}%`} />
            <Knob value={wetOut} min={0} max={128} onChange={(v) => updateParam(7, Math.round(v))} label="Wet" color="#8b5cf6" formatValue={(v) => `${Math.round((v / 128) * 100)}%`} />
          </div>
        </section>
      </div>
    </div>
  );
};

// Jeskola Freeverb
export const JeskolaFreeverbEditor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  const revTime = params[0] ?? 200;
  const hiDamp = params[1] ?? 128;
  const preDelay = params[2] ?? 0;
  const lowCut = params[3] ?? 0;
  const hiCut = params[4] ?? 255;
  const revOut = params[5] ?? 64;
  const dryOut = params[6] ?? 255;

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600">
            <Waves size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Jeskola Freeverb</h2>
            <p className="text-xs text-gray-400">Freeverb Reverb by Oskari Tammelin</p>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#6366f1" title="Reverb Character" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob value={revTime} min={0} max={255} onChange={(v) => updateParam(0, Math.round(v))} label="Room Size" color="#6366f1" formatValue={(v) => `${Math.round(v / 2.55)}%`} />
            <Knob value={hiDamp} min={0} max={255} onChange={(v) => updateParam(1, Math.round(v))} label="Hi Damp" color="#6366f1" formatValue={(v) => `${Math.round(v / 2.55)}%`} />
            <Knob value={preDelay} min={0} max={255} onChange={(v) => updateParam(2, Math.round(v))} label="Pre-Delay" color="#6366f1" formatValue={(v) => `${Math.round(v)}ms`} />
          </div>
        </section>
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#8b5cf6" title="Filter" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob value={lowCut} min={0} max={255} onChange={(v) => updateParam(3, Math.round(v))} label="Low Cut" color="#8b5cf6" formatValue={(v) => `${Math.round(v / 2.55)}%`} />
            <Knob value={hiCut} min={0} max={255} onChange={(v) => updateParam(4, Math.round(v))} label="Hi Cut" color="#8b5cf6" formatValue={(v) => `${Math.round(v / 2.55)}%`} />
          </div>
        </section>
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#a855f7" title="Output" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob value={dryOut} min={0} max={255} onChange={(v) => updateParam(6, Math.round(v))} label="Dry" color="#a855f7" formatValue={(v) => `${Math.round(v / 2.55)}%`} />
            <Knob value={revOut} min={0} max={255} onChange={(v) => updateParam(5, Math.round(v))} label="Reverb" color="#a855f7" formatValue={(v) => `${Math.round(v / 2.55)}%`} />
          </div>
        </section>
      </div>
    </div>
  );
};

// Jeskola Distortion
export const JeskolaDistortionEditor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};

  const posThreshold = ((params[0] ?? 0) | ((params[1] ?? 96) << 8));
  const posClamp = ((params[2] ?? 0) | ((params[3] ?? 128) << 8));
  const negThreshold = ((params[4] ?? 0) | ((params[5] ?? 160) << 8));
  const negClamp = ((params[6] ?? 0) | ((params[7] ?? 128) << 8));
  const amount = ((params[8] ?? 0) | ((params[9] ?? 128) << 8));

  const updateWord = (lowIndex: number, highIndex: number, value: number) => {
    const low = value & 0xFF;
    const high = (value >> 8) & 0xFF;
    updateParam(lowIndex, low);
    updateParam(highIndex, high);
  };

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-red-600 to-orange-600">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Jeskola Distortion</h2>
            <p className="text-xs text-gray-400">Asymmetric Distortion by Oskari Tammelin</p>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#22c55e" title="Positive (+)" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob value={posThreshold} min={0} max={65535} onChange={(v) => updateWord(0, 1, Math.round(v))} label="Threshold" color="#22c55e" formatValue={(v) => `${Math.round(v / 655.35)}%`} />
            <Knob value={posClamp} min={0} max={65535} onChange={(v) => updateWord(2, 3, Math.round(v))} label="Clamp" color="#22c55e" formatValue={(v) => `${Math.round(v / 655.35)}%`} />
          </div>
        </section>
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#ef4444" title="Negative (-)" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob value={negThreshold} min={0} max={65535} onChange={(v) => updateWord(4, 5, Math.round(v))} label="Threshold" color="#ef4444" formatValue={(v) => `${Math.round(v / 655.35)}%`} />
            <Knob value={negClamp} min={0} max={65535} onChange={(v) => updateWord(6, 7, Math.round(v))} label="Clamp" color="#ef4444" formatValue={(v) => `${Math.round(v / 655.35)}%`} />
          </div>
        </section>
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#f97316" title="Output" />
          <div className="flex justify-center">
            <Knob value={amount} min={0} max={65535} onChange={(v) => updateWord(8, 9, Math.round(v))} label="Amount" size="lg" color="#f97316" formatValue={(v) => `${Math.round(v / 655.35)}%`} />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// MAKK M4 - 2-Oscillator Wavetable Synth
// ============================================================================

export const MakkM4Editor: React.FC<GeneratorEditorProps> = ({ config, onChange }) => {
  const updateParam = useBuzzmachineParam(config, onChange);
  const params = config.buzzmachine?.parameters || {};
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parameters: Osc1_Wave(0), Osc2_Wave(1), Mix(2), Detune(3), DetuneFine(4),
  //   Glide(5), Attack(6), Decay(7), Sustain(8), Release(9), Cutoff(10), Resonance(11)
  const osc1Wave = params[0] ?? 0;
  const osc2Wave = params[1] ?? 0;
  const mix = params[2] ?? 0x40;
  const detune = params[3] ?? 0x40;
  const glide = params[5] ?? 0;
  const cutoff = params[10] ?? 0xFF;
  const resonance = params[11] ?? 0;

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let wavetableData: number[] = [];
      if (file.name.endsWith('.h')) {
        const text = await file.text();
        wavetableData = text.split(/[\s,]+/).map(v => parseInt(v)).filter(v => !isNaN(v));
      } else {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const arrayBuffer = await file.arrayBuffer();
        const buffer = await audioCtx.decodeAudioData(arrayBuffer);
        const rawData = buffer.getChannelData(0);
        wavetableData = Array.from(rawData).map(v => Math.round((v + 1) / 2 * 255));
      }

      if (wavetableData.length > 0) {
        // Store in config for the engine to pick up
        onChange({
          buzzmachine: {
            ...config.buzzmachine!,
            customWaves: {
              ...(config.buzzmachine?.customWaves || {}),
              [osc1Wave]: wavetableData
            }
          }
        });
      }
    } catch (err) {
      console.error('Failed to import M4 wave:', err);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      {/* Header */}
      <div className="synth-editor-header px-4 py-3 bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
            <Layers size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Makk M4</h2>
            <p className="text-xs text-gray-400">2-Osc Wavetable Synth by MAKK</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Oscillators */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader color="#8b5cf6" title="Oscillators" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2 py-1 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded text-[10px] font-bold uppercase hover:bg-indigo-500/30 transition-colors"
            >
              <FileUp size={12} />
              Import Wave
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,.h"
              onChange={handleImport}
              className="hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Osc 1 Wave</label>
              <Knob
                value={osc1Wave}
                min={0}
                max={127}
                onChange={(v) => updateParam(0, Math.round(v))}
                label="Wave Index"
                color="#8b5cf6"
                formatValue={(v) => `Index ${Math.round(v)}`}
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Osc 2 Wave</label>
              <Knob
                value={osc2Wave}
                min={0}
                max={127}
                onChange={(v) => updateParam(1, Math.round(v))}
                label="Wave Index"
                color="#a855f7"
                formatValue={(v) => `Index ${Math.round(v)}`}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 items-end mt-6">
            <Knob
              value={mix}
              min={0}
              max={127}
              onChange={(v) => updateParam(2, Math.round(v))}
              label="Mix"
              color="#8b5cf6"
              formatValue={(v) => `${Math.round(v / 1.27)}%`}
            />
            <Knob
              value={detune}
              min={0}
              max={127}
              onChange={(v) => updateParam(3, Math.round(v))}
              label="Detune"
              color="#8b5cf6"
              bipolar
              formatValue={(v) => `${Math.round(v - 64)}`}
            />
            <Knob
              value={glide}
              min={0}
              max={127}
              onChange={(v) => updateParam(5, Math.round(v))}
              label="Glide"
              color="#8b5cf6"
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
        </section>

        {/* Filter */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
          <SectionHeader color="#ec4899" title="Filter" />
          <div className="flex flex-wrap gap-6 items-end">
            <Knob
              value={cutoff}
              min={0}
              max={255}
              onChange={(v) => updateParam(10, Math.round(v))}
              label="Cutoff"
              color="#ec4899"
              formatValue={(v) => `${Math.round(v / 2.55)}%`}
            />
            <Knob
              value={resonance}
              min={0}
              max={255}
              onChange={(v) => updateParam(11, Math.round(v))}
              label="Resonance"
              color="#ec4899"
              formatValue={(v) => `${Math.round(v / 2.55)}%`}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// FACTORY FUNCTION - Returns the appropriate editor for a machine type
// ============================================================================

type EditorComponent = React.FC<GeneratorEditorProps>;

const BUZZMACHINE_EDITORS: Record<string, EditorComponent> = {
  // Generators
  'CyanPhaseDTMF': CyanPhaseDTMFEditor,
  'ElenzilFrequencyBomb': ElenzilFrequencyBombEditor,
  'FSMKick': FSMKickEditor,
  'FSMKickXP': FSMKickXPEditor,
  'JeskolaNoise': JeskolaNoiseEditor,
  'JeskolaTrilok': JeskolaTrilokEditor,
  'MadBrain4FM2F': MadBrain4FM2FEditor,
  'MadBrainDynamite6': MadBrainDynamite6Editor,
  'MakkM3': MakkM3Editor,
  'MakkM4': MakkM4Editor,
  'OomekAggressor': OomekAggressorEditor,
  // Effects (Jeskola)
  'JeskolaDelay': JeskolaDelayEditor,
  'JeskolaCrossDelay': JeskolaCrossDelayEditor,
  'JeskolaFreeverb': JeskolaFreeverbEditor,
  'JeskolaDistortion': JeskolaDistortionEditor,
};

/**
 * Get the appropriate buzzmachine editor component for a machine type
 * @param machineType The buzzmachine type string
 * @returns The editor component or null if no dedicated editor exists
 */
export function getJeskolaEditor(machineType: string): EditorComponent | null {
  return BUZZMACHINE_EDITORS[machineType] || null;
}
