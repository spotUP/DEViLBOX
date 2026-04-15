import React from 'react';
import { Knob } from '@components/controls/Knob';
import { Drum, AudioWaveform, Phone, Bomb } from 'lucide-react';
import { SectionHeader, useBuzzmachineParam } from './shared';
import type { GeneratorEditorProps } from './shared';

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
            <Drum size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Jeskola Trilok</h2>
            <p className="text-xs text-text-secondary">Drum Machine by Oskari Tammelin</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Bass Drum Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#ef4444" title="Bass Drum" />
          <div className="flex flex-wrap gap-3 items-end">
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
        <div className="bg-dark-bgSecondary/50 rounded-lg p-4 border border-dark-border">
          <p className="text-xs text-text-secondary leading-relaxed">
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
            <AudioWaveform size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Jeskola Noise</h2>
            <p className="text-xs text-text-secondary">Noise Generator by Oskari Tammelin</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Envelope Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#6b7280" title="Envelope" />
          <div className="flex flex-wrap gap-3 items-end">
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#a855f7" title="Tone" />
          <div className="flex flex-wrap gap-3 items-end">
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
            <Phone size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">CyanPhase DTMF</h2>
            <p className="text-xs text-text-secondary">Dial Tone Generator by CyanPhase</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Digit Selector */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#06b6d4" title="Digit" />
          <div className="grid grid-cols-4 gap-2">
            {digitLabels.map((label, idx) => (
              <button
                key={idx}
                onClick={() => updateParam(0, idx)}
                className={`
                  py-3 rounded-lg font-bold text-lg transition-all
                  ${digit === idx
                    ? 'bg-accent-highlight/20 text-accent-highlight ring-2 ring-accent-highlight'
                    : 'bg-dark-bgTertiary text-text-secondary hover:text-text-secondary hover:bg-dark-bgHover'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Output */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#3b82f6" title="Output" />
          <div className="flex flex-wrap gap-3 items-end">
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
            <Bomb size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Elenzil FrequencyBomb</h2>
            <p className="text-xs text-text-secondary">Frequency Sweep Generator by Elenzil</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Frequency Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#f97316" title="Frequency Sweep" />
          <div className="flex flex-wrap gap-3 items-end">
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
                    : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
                  }
                `}
              >
                {unitLabels[unit]}
              </button>
            ))}
          </div>
        </section>

        {/* Waveform Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
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
                    : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 items-end">
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
