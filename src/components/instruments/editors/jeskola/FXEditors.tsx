import React from 'react';
import { Knob } from '@components/controls/Knob';
import { Waves, Zap } from 'lucide-react';
import { SectionHeader, useBuzzmachineParam } from './shared';
import type { GeneratorEditorProps } from './shared';

// ============================================================================
// JESKOLA DELAY - Mono Delay
// ============================================================================

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
            <Waves size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Jeskola Delay</h2>
            <p className="text-xs text-text-secondary">Mono Delay by Oskari Tammelin</p>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#3b82f6" title="Time" />
          <div className="flex flex-wrap gap-3 items-end">
            <Knob value={length} min={1} max={65535} onChange={(v) => updateWord(1, 2, Math.round(v))} label="Length" size="lg" color="#3b82f6" formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex justify-center mt-4 gap-1">
            {unitLabels.map((label, idx) => (
              <button key={idx} onClick={() => updateParam(3, idx)} className={`px-2 py-1 text-xs rounded font-medium transition-all ${lengthUnit === idx ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500' : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'}`}>{label}</button>
            ))}
          </div>
        </section>
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#06b6d4" title="Mix" />
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-text-secondary">Dry Thru</span>
              <button onClick={() => updateParam(0, dryThru === 1 ? 0 : 1)} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${dryThru === 1 ? 'bg-accent-highlight/20 text-accent-highlight ring-1 ring-accent-highlight' : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'}`}>{dryThru === 1 ? 'ON' : 'OFF'}</button>
            </div>
            <Knob value={feedback} min={0} max={128} onChange={(v) => updateParam(4, Math.round(v))} label="Feedback" color="#06b6d4" formatValue={(v) => `${Math.round((v / 128) * 100)}%`} />
            <Knob value={wetOut} min={0} max={128} onChange={(v) => updateParam(5, Math.round(v))} label="Wet" color="#06b6d4" formatValue={(v) => `${Math.round((v / 128) * 100)}%`} />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// JESKOLA CROSS DELAY - Stereo Cross Delay
// ============================================================================

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
            <Waves size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Jeskola CrossDelay</h2>
            <p className="text-xs text-text-secondary">Stereo Cross Delay by Oskari Tammelin</p>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#ec4899" title="Stereo Time" />
          <div className="flex flex-wrap gap-3 items-end">
            <Knob value={leftLength} min={1} max={65535} onChange={(v) => updateWord(1, 2, Math.round(v))} label="Left" color="#ec4899" formatValue={(v) => Math.round(v).toString()} />
            <Knob value={rightLength} min={1} max={65535} onChange={(v) => updateWord(3, 4, Math.round(v))} label="Right" color="#a855f7" formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex justify-center mt-4 gap-1">
            {unitLabels.map((label, idx) => (
              <button key={idx} onClick={() => updateParam(5, idx)} className={`px-2 py-1 text-xs rounded font-medium transition-all ${lengthUnit === idx ? 'bg-pink-500/20 text-pink-400 ring-1 ring-pink-500' : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'}`}>{label}</button>
            ))}
          </div>
        </section>
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#8b5cf6" title="Mix" />
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-text-secondary">Dry Thru</span>
              <button onClick={() => updateParam(0, dryThru === 1 ? 0 : 1)} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${dryThru === 1 ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500' : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'}`}>{dryThru === 1 ? 'ON' : 'OFF'}</button>
            </div>
            <Knob value={feedback} min={0} max={128} onChange={(v) => updateParam(6, Math.round(v))} label="Feedback" color="#8b5cf6" formatValue={(v) => `${Math.round((v / 128) * 100)}%`} />
            <Knob value={wetOut} min={0} max={128} onChange={(v) => updateParam(7, Math.round(v))} label="Wet" color="#8b5cf6" formatValue={(v) => `${Math.round((v / 128) * 100)}%`} />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// JESKOLA FREEVERB - Reverb
// ============================================================================

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
            <Waves size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Jeskola Freeverb</h2>
            <p className="text-xs text-text-secondary">Freeverb Reverb by Oskari Tammelin</p>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#6366f1" title="Reverb Character" />
          <div className="flex flex-wrap gap-3 items-end">
            <Knob value={revTime} min={0} max={255} onChange={(v) => updateParam(0, Math.round(v))} label="Room Size" color="#6366f1" formatValue={(v) => `${Math.round(v / 2.55)}%`} />
            <Knob value={hiDamp} min={0} max={255} onChange={(v) => updateParam(1, Math.round(v))} label="Hi Damp" color="#6366f1" formatValue={(v) => `${Math.round(v / 2.55)}%`} />
            <Knob value={preDelay} min={0} max={255} onChange={(v) => updateParam(2, Math.round(v))} label="Pre-Delay" color="#6366f1" formatValue={(v) => `${Math.round(v)}ms`} />
          </div>
        </section>
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#8b5cf6" title="Filter" />
          <div className="flex flex-wrap gap-3 items-end">
            <Knob value={lowCut} min={0} max={255} onChange={(v) => updateParam(3, Math.round(v))} label="Low Cut" color="#8b5cf6" formatValue={(v) => `${Math.round(v / 2.55)}%`} />
            <Knob value={hiCut} min={0} max={255} onChange={(v) => updateParam(4, Math.round(v))} label="Hi Cut" color="#8b5cf6" formatValue={(v) => `${Math.round(v / 2.55)}%`} />
          </div>
        </section>
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#a855f7" title="Output" />
          <div className="flex flex-wrap gap-3 items-end">
            <Knob value={dryOut} min={0} max={255} onChange={(v) => updateParam(6, Math.round(v))} label="Dry" color="#a855f7" formatValue={(v) => `${Math.round(v / 2.55)}%`} />
            <Knob value={revOut} min={0} max={255} onChange={(v) => updateParam(5, Math.round(v))} label="Reverb" color="#a855f7" formatValue={(v) => `${Math.round(v / 2.55)}%`} />
          </div>
        </section>
      </div>
    </div>
  );
};

// ============================================================================
// JESKOLA DISTORTION - Asymmetric Distortion
// ============================================================================

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
            <Zap size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Jeskola Distortion</h2>
            <p className="text-xs text-text-secondary">Asymmetric Distortion by Oskari Tammelin</p>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#22c55e" title="Positive (+)" />
          <div className="flex flex-wrap gap-3 items-end">
            <Knob value={posThreshold} min={0} max={65535} onChange={(v) => updateWord(0, 1, Math.round(v))} label="Threshold" color="#22c55e" formatValue={(v) => `${Math.round(v / 655.35)}%`} />
            <Knob value={posClamp} min={0} max={65535} onChange={(v) => updateWord(2, 3, Math.round(v))} label="Clamp" color="#22c55e" formatValue={(v) => `${Math.round(v / 655.35)}%`} />
          </div>
        </section>
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#ef4444" title="Negative (-)" />
          <div className="flex flex-wrap gap-3 items-end">
            <Knob value={negThreshold} min={0} max={65535} onChange={(v) => updateWord(4, 5, Math.round(v))} label="Threshold" color="#ef4444" formatValue={(v) => `${Math.round(v / 655.35)}%`} />
            <Knob value={negClamp} min={0} max={65535} onChange={(v) => updateWord(6, 7, Math.round(v))} label="Clamp" color="#ef4444" formatValue={(v) => `${Math.round(v / 655.35)}%`} />
          </div>
        </section>
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#f97316" title="Output" />
          <div className="flex justify-center">
            <Knob value={amount} min={0} max={65535} onChange={(v) => updateWord(8, 9, Math.round(v))} label="Amount" size="lg" color="#f97316" formatValue={(v) => `${Math.round(v / 655.35)}%`} />
          </div>
        </section>
      </div>
    </div>
  );
};
