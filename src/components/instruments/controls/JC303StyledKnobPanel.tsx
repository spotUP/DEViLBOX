import React from 'react';
import type { TB303Config } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { clsx } from 'clsx';

interface JC303StyledKnobPanelProps {
  config: TB303Config;
  onChange: (updates: Partial<TB303Config>) => void;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
}

export const JC303StyledKnobPanel: React.FC<JC303StyledKnobPanelProps> = ({
  config,
  onChange,
  volume,
  onVolumeChange,
}) => {
  // Update helpers
  const updateFilter = (key: string, value: number) => {
    onChange({
      filter: { ...config.filter, [key]: value },
    });
  };

  const updateFilterEnvelope = (key: string, value: number) => {
    onChange({
      filterEnvelope: { ...config.filterEnvelope, [key]: value },
    });
  };

  const updateAccent = (key: string, value: number) => {
    onChange({
      accent: { ...config.accent, [key]: value },
    });
  };

  const updateDevilFish = (key: string, value: any) => {
    const currentDF = config.devilFish || {
      enabled: false,
      normalDecay: 200,
      accentDecay: 200,
      vegDecay: 3000,
      vegSustain: 0,
      softAttack: 0.3,
      filterTracking: 0,
      filterFM: 0,
      sweepSpeed: 'normal' as const,
      accentSweepEnabled: true,
      highResonance: false,
      muffler: 'off' as const,
    };
    onChange({
      devilFish: { ...currentDF, [key]: value },
    });
  };

  const updateOverdrive = (key: string, value: number) => {
    const currentOD = config.overdrive || { amount: 0, dryWet: 100 };
    onChange({
      overdrive: { ...currentOD, [key]: value },
    });
  };

  // Coordinates from Gui.cpp
  // Canvas: 930x363
  
  // Helper for absolute positioning
  const style = (x: number, y: number, width: number, height: number) => ({
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`,
    position: 'absolute' as const,
  });

  return (
    <div className="w-full overflow-hidden flex justify-center bg-gray-900 p-4 rounded-lg">
      <div 
        className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-2xl border-4 border-gray-700"
        style={{ width: '930px', height: '363px', transformOrigin: 'top left' }}
      >
        {/* Background Image Placeholder / Styling */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" 
             style={{ backgroundImage: 'linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%, #333), linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%, #333)', backgroundSize: '20px 20px', backgroundPosition: '0 0, 10px 10px' }}>
        </div>
        
        {/* Logo / Easter Egg */}
        <div style={style(484, 16, 56, 77)} className="flex items-center justify-center opacity-50">
           <span className="text-yellow-500 text-4xl font-bold">😊</span>
        </div>

        {/* --- ROW 1: Large & Medium Knobs --- */}

        {/* Waveform (Knob in JC303, Switch in our config - mapped) */}
        {/* 46, 140, 70, 70 */}
        <div style={style(46, 140, 70, 70)}>
          <Knob
            value={config.oscillator.type === 'square' ? 100 : 0}
            min={0}
            max={100}
            onChange={(v) => onChange({ oscillator: { ...config.oscillator, type: v > 50 ? 'square' : 'sawtooth' } })}
            label="Wave"
            size="lg"
            color="#ffcc00"
            formatValue={(v) => v > 50 ? 'SQR' : 'SAW'}
          />
        </div>

        {/* Tuning: 188, 139, 60, 60 */}
        <div style={style(188, 139, 60, 60)}>
          <Knob
            value={config.tuning ?? 440} // Default 440 if undefined
            min={415}
            max={466}
            onChange={(v) => onChange({ tuning: v })}
            label="Tuning"
            size="md"
            color="#ffcc00"
          />
        </div>

        {/* Cutoff: 287, 139, 60, 60 */}
        <div style={style(287, 139, 60, 60)}>
          <Knob
            value={config.filter.cutoff}
            min={50}
            max={18000}
            onChange={(v) => updateFilter('cutoff', v)}
            label="Cutoff"
            size="md"
            color="#ffcc00"
          />
        </div>

        {/* Resonance: 386, 139, 60, 60 */}
        <div style={style(386, 139, 60, 60)}>
          <Knob
            value={config.filter.resonance}
            min={0}
            max={100}
            onChange={(v) => updateFilter('resonance', v)}
            label="Reso"
            size="md"
            color="#ffcc00"
          />
        </div>

        {/* Env Mod: 485, 139, 60, 60 */}
        <div style={style(485, 139, 60, 60)}>
          <Knob
            value={config.filterEnvelope.envMod}
            min={0}
            max={100}
            onChange={(v) => updateFilterEnvelope('envMod', v)}
            label="Env Mod"
            size="md"
            color="#ffcc00"
          />
        </div>

        {/* Decay: 584, 139, 60, 60 */}
        <div style={style(584, 139, 60, 60)}>
          <Knob
            value={config.filterEnvelope.decay}
            min={30}
            max={3000}
            onChange={(v) => updateFilterEnvelope('decay', v)}
            label="Decay"
            size="md"
            color="#ffcc00"
          />
        </div>

        {/* Accent: 683, 139, 60, 60 */}
        <div style={style(683, 139, 60, 60)}>
          <Knob
            value={config.accent.amount}
            min={0}
            max={100}
            onChange={(v) => updateAccent('amount', v)}
            label="Accent"
            size="md"
            color="#ffcc00"
          />
        </div>

        {/* Volume: 813, 140, 70, 70 */}
        <div style={style(813, 140, 70, 70)}>
          <Knob
            value={(volume ?? -12) + 60} // Map -60..0 to 0..60 approx
            min={0}
            max={100}
            onChange={(v) => onVolumeChange && onVolumeChange(v - 60)}
            label="Volume"
            size="lg"
            color="#ffcc00"
          />
        </div>


        {/* --- ROW 2: Mods & Overdrive --- */}

        {/* Mod Switch: 52, 273, 50, 18 */}
        <div style={style(52, 273, 50, 30)} className="flex flex-col items-center">
          <label className="text-[10px] text-gray-400 mb-1 font-bold">DEVIL</label>
          <Toggle
            label="Devil Fish"
            value={config.devilFish?.enabled || false}
            onChange={(v) => updateDevilFish('enabled', v)}
          />
        </div>
        {/* Mod LED: 82, 243, 15, 15 */}
        <div style={style(82, 243, 15, 15)} className={clsx("rounded-full shadow-lg border border-gray-800 transition-colors duration-200", config.devilFish?.enabled ? "bg-red-500 shadow-red-500/50" : "bg-red-900")}></div>


        {/* Normal Decay: 147, 273, 30, 30 */}
        <div style={{ ...style(147, 273, 30, 30), opacity: config.devilFish?.enabled ? 1 : 0.5 }}>
          <Knob
            value={config.devilFish?.normalDecay || 200}
            min={30}
            max={3000}
            onChange={(v) => config.devilFish?.enabled && updateDevilFish('normalDecay', v)}
            label="N.Dec"
            size="sm"
            color="#ff3333"
          />
        </div>

        {/* Accent Decay: 208, 273, 30, 30 */}
        <div style={{ ...style(208, 273, 30, 30), opacity: config.devilFish?.enabled ? 1 : 0.5 }}>
          <Knob
            value={config.devilFish?.accentDecay || 200}
            min={30}
            max={3000}
            onChange={(v) => config.devilFish?.enabled && updateDevilFish('accentDecay', v)}
            label="A.Dec"
            size="sm"
            color="#ff3333"
          />
        </div>

        {/* Feedback (Filter FM): 269, 273, 30, 30 */}
        <div style={{ ...style(269, 273, 30, 30), opacity: config.devilFish?.enabled ? 1 : 0.5 }}>
          <Knob
            value={config.devilFish?.filterFM || 0}
            min={0}
            max={100}
            onChange={(v) => config.devilFish?.enabled && updateDevilFish('filterFM', v)}
            label="F.FM"
            size="sm"
            color="#ff3333"
          />
        </div>

        {/* Soft Attack: 330, 273, 30, 30 */}
        <div style={{ ...style(330, 273, 30, 30), opacity: config.devilFish?.enabled ? 1 : 0.5 }}>
          <Knob
            value={config.devilFish?.softAttack || 0.3}
            min={0.3}
            max={30}
            onChange={(v) => config.devilFish?.enabled && updateDevilFish('softAttack', v)}
            label="S.Atk"
            size="sm"
            color="#ff3333"
          />
        </div>

        {/* Slide Time: 391, 273, 30, 30 */}
        <div style={style(391, 273, 30, 30)}>
          <Knob
            value={config.slide?.time || 60}
            min={10}
            max={500}
            onChange={(v) => onChange({ slide: { ...config.slide, time: v } })}
            label="Slide"
            size="sm"
            color="#ff3333"
          />
        </div>

        {/* Sqr Driver (Mapping to Overdrive Amount for now): 452, 273, 30, 30 */}
        <div style={style(452, 273, 30, 30)}>
          <Knob
            value={config.overdrive?.amount || 0}
            min={0}
            max={100}
            onChange={(v) => updateOverdrive('amount', v)}
            label="Drive"
            size="sm"
            color="#ff3333"
          />
        </div>

        {/* Overdrive Section */}
        
        {/* Drive Level: 566, 273, 30, 30 */}
        {/* Mapping to same overdrive amount for now, or maybe gain? */}
        <div style={style(566, 273, 30, 30)}>
          <Knob
            value={config.overdrive?.amount || 0}
            min={0}
            max={100}
            onChange={(v) => updateOverdrive('amount', v)}
            label="Lvl"
            size="sm"
            color="#ff3333"
          />
        </div>

        {/* Overdrive Dry/Wet: 749, 273, 30, 30 */}
        <div style={style(749, 273, 30, 30)}>
          <Knob
            value={config.overdrive?.dryWet ?? 100}
            min={0}
            max={100}
            onChange={(v) => updateOverdrive('dryWet', v)}
            label="Mix"
            size="sm"
            color="#ff3333"
          />
        </div>

        {/* Overdrive Switch: 826, 273, 50, 18 */}
        <div style={style(826, 273, 50, 30)} className="flex flex-col items-center">
          <label className="text-[10px] text-gray-400 mb-1 font-bold">DRIVE</label>
          <Toggle
            label="Overdrive"
            value={(config.overdrive?.amount ?? 0) > 0}
            onChange={(v) => updateOverdrive('amount', v ? 50 : 0)}
          />
        </div>
        {/* Overdrive LED: 856, 243, 15, 15 */}
        <div style={style(856, 243, 15, 15)} className={clsx("rounded-full shadow-lg border border-gray-800 transition-colors duration-200", (config.overdrive?.amount ?? 0) > 0 ? "bg-red-500 shadow-red-500/50" : "bg-red-900")}></div>

      </div>
    </div>
  );
};