import React, { useRef } from 'react';
import { Knob } from '@components/controls/Knob';
import { Cpu, Zap, Music, Layers, FileUp } from 'lucide-react';
import { SectionHeader, useBuzzmachineParam } from './shared';
import type { GeneratorEditorProps } from './shared';
import { CustomSelect } from '@components/common/CustomSelect';

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
            <Cpu size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">MadBrain 4FM2F</h2>
            <p className="text-xs text-text-secondary">4-Op FM Synth by MadBrain</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Routing Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#6366f1" title="Oscillator 4" />
          <div className="mb-4">
            <span className="text-xs text-text-secondary mb-2 block">Waveform</span>
            <CustomSelect
              value={String(osc4Wave)}
              onChange={(v) => updateParam(1, parseInt(v))}
              className="w-full bg-dark-bgTertiary border border-dark-borderLight rounded-lg px-3 py-2 text-sm text-text-primary"
              options={waveLabels.slice(1).map((label, idx) => ({
                value: String(idx + 1),
                label,
              }))}
            />
          </div>
          <div className="flex flex-wrap gap-3 items-end">
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
            <Zap size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">MadBrain Dynamite6</h2>
            <p className="text-xs text-text-secondary">6-Voice Synth by MadBrain</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Pitch Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#eab308" title="Pitch" />
          <div className="flex flex-wrap gap-3 items-end">
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#f97316" title="Envelope" />
          <div className="flex flex-wrap gap-3 items-end">
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
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
                    : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
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
            <Music size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Makk M3</h2>
            <p className="text-xs text-text-secondary">2-Osc Subtractive Synth by MAKK</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Oscillator 1 */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
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
                    : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
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
              <span className="text-[10px] text-text-muted mb-1">Sub Wave</span>
              <CustomSelect
                value={String(subOscWave)}
                onChange={(v) => updateParam(9, parseInt(v))}
                className="bg-dark-bgTertiary border border-dark-borderLight rounded px-2 py-1 text-xs text-text-primary"
                options={subWaveLabels.map((label, idx) => ({
                  value: String(idx),
                  label,
                }))}
              />
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
        // Reuse the shared ToneEngine AudioContext for decoding.
        // Creating throwaway contexts leaks them and iOS limits to ~4-6.
        const { getDevilboxAudioContext } = await import('@utils/audio-context');
        let audioCtx: AudioContext;
        try { audioCtx = getDevilboxAudioContext(); } catch { audioCtx = new AudioContext(); }
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
            <Layers size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Makk M4</h2>
            <p className="text-xs text-text-secondary">2-Osc Wavetable Synth by MAKK</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Oscillators */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
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
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Osc 1 Wave</label>
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
              <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Osc 2 Wave</label>
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

          <div className="flex flex-wrap gap-3 items-end mt-6">
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#ec4899" title="Filter" />
          <div className="flex flex-wrap gap-3 items-end">
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
