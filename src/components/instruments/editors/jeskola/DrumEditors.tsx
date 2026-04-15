import React from 'react';
import { Knob } from '@components/controls/Knob';
import { Drum, Radio } from 'lucide-react';
import { SectionHeader, useBuzzmachineParam } from './shared';
import type { GeneratorEditorProps } from './shared';

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
            <Drum size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">FSM Kick</h2>
            <p className="text-xs text-text-secondary">Kick Drum by Krzysztof Foltman</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Pitch Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#ef4444" title="Pitch" />
          <div className="flex flex-wrap gap-3 items-end">
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#f97316" title="Envelope" />
          <div className="flex flex-wrap gap-3 items-end">
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
            <Drum size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">FSM KickXP</h2>
            <p className="text-xs text-text-secondary">Extended Kick Drum by FSM</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Pitch Section */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#ef4444" title="Pitch" />
          <div className="flex flex-wrap gap-3 items-end">
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#f97316" title="Character" />
          <div className="flex flex-wrap gap-3 items-end">
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#eab308" title="Amplitude" />
          <div className="flex flex-wrap gap-3 items-end">
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
            <Radio size={20} className="text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Oomek Aggressor 3o3</h2>
            <p className="text-xs text-text-secondary">303-Style Acid Synth by Radoslaw Dutkiewicz</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Oscillator */}
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#ef4444" title="Oscillator" />
          <div className="flex gap-4 justify-center mb-4">
            <button
              onClick={() => updateParam(0, 0)}
              className={`
                flex-1 max-w-32 py-3 rounded-lg font-bold transition-all
                ${oscType === 0
                  ? 'bg-red-500/20 text-red-400 ring-2 ring-red-500'
                  : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
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
                  : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary'
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#f97316" title="Filter" />
          <div className="flex flex-wrap gap-3 items-end">
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
        <section className="bg-[#1a1a1a] rounded-xl p-4 border border-dark-border">
          <SectionHeader color="#eab308" title="Envelope & Output" />
          <div className="flex flex-wrap gap-3 items-end">
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
