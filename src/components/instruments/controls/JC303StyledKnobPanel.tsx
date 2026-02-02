import React, { useRef, useLayoutEffect, useState } from 'react';
import type { TB303Config } from '@typedefs/instrument';
import { TB303_PRESETS } from '@constants/tb303Presets';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { clsx } from 'clsx';
import { CURRENT_VERSION } from '@generated/changelog';

interface JC303StyledKnobPanelProps {
  config: TB303Config;
  onChange: (updates: Partial<TB303Config>) => void;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  isBuzz3o3?: boolean;
}

export const JC303StyledKnobPanel: React.FC<JC303StyledKnobPanelProps> = ({
  config,
  onChange,
  volume,
  onVolumeChange,
  isBuzz3o3 = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  
  // Use ref for config to prevent stale closures in throttled callbacks
  const configRef = useRef(config);
  configRef.current = config;

  // Auto-scale to fit parent width
  useLayoutEffect(() => {
    const updateScale = () => {
      if (containerRef.current?.parentElement) {
        const parentWidth = containerRef.current.parentElement.clientWidth;
        const panelWidth = 930 + 32; // width + padding
        if (parentWidth < panelWidth) {
          setScale(parentWidth / panelWidth);
        } else {
          setScale(1);
        }
      }
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Update helpers using ref to ensure fresh state
  const updateFilter = (key: string, value: number) => {
    console.log(`[JC303 UI] Filter update: ${key}=${value}`);
    const currentConfig = configRef.current;
    onChange({
      filter: { ...currentConfig.filter, [key]: value },
    });
  };

  const updateFilterEnvelope = (key: string, value: number) => {
    console.log(`[JC303 UI] FilterEnv update: ${key}=${value}`);
    const currentConfig = configRef.current;
    onChange({
      filterEnvelope: { ...currentConfig.filterEnvelope, [key]: value },
    });
  };

  const updateAccent = (key: string, value: number) => {
    console.log(`[JC303 UI] Accent update: ${key}=${value}`);
    const currentConfig = configRef.current;
    onChange({
      accent: { ...currentConfig.accent, [key]: value },
    });
  };

  const updateDevilFish = (key: string, value: any) => {
    console.log(`[JC303 UI] DevilFish update: ${key}=${value}`);
    const currentConfig = configRef.current;
    const currentDF = currentConfig.devilFish || {
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

  const updateOverdrive = (key: string, value: any) => {
    console.log(`[JC303 UI] Overdrive update: ${key}=${value}`);
    const currentConfig = configRef.current;
    const currentOD = currentConfig.overdrive || { amount: 0, dryWet: 100, modelIndex: 0 };
    onChange({
      overdrive: { ...currentOD, [key]: value },
    });
  };

  const updateOscillator = (type: 'sawtooth' | 'square') => {
    console.log(`[JC303 UI] Oscillator update: type=${type}`);
    const currentConfig = configRef.current;
    onChange({ 
      oscillator: { ...currentConfig.oscillator, type } 
    });
  };

  const updateSlide = (time: number) => {
    console.log(`[JC303 UI] Slide update: time=${time}`);
    const currentConfig = configRef.current;
    onChange({ 
      slide: { ...currentConfig.slide, time } 
    });
  };

  const updateTuning = (tuning: number) => {
    console.log(`[JC303 UI] Tuning update: cents=${tuning}`);
    // Tuning is a top-level property so we can just send it directly
    // but using the pattern for consistency
    onChange({ tuning });
  };

  // Coordinates from Gui.cpp (930x363)
  const style = (x: number, y: number, width: number, height: number) => ({
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`,
    position: 'absolute' as const,
  });

  const labelStyle = (x: number, y: number, width: number) => ({
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    position: 'absolute' as const,
    textAlign: 'center' as const,
    fontSize: '9px',
    fontWeight: 'bold',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  });

  return (
    <div 
      ref={containerRef}
      className="w-full overflow-visible flex justify-center py-4 select-none"
      style={{ minHeight: `${(isBuzz3o3 ? 235 : 363) * scale + 32}px` }}
    >
      <div 
        className="relative bg-[#1a1a1a] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-b-8 border-r-4 border-black/40 overflow-hidden"
        style={{ 
          width: '930px', 
          height: isBuzz3o3 ? '235px' : '363px', 
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          background: 'linear-gradient(180deg, #252525 0%, #1a1a1a 100%)',
        }}
      >
        {/* --- PANEL DECORATIONS --- */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top groove */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-black/20"></div>
          {/* Main section dividers */}
          <div className="absolute top-[110px] left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]"></div>
          {!isBuzz3o3 && <div className="absolute top-[230px] left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]"></div>}
          
          {/* Group Labels */}
          <div style={labelStyle(40, 115, 100)} className="text-accent-primary opacity-80">Oscillator</div>
          <div style={labelStyle(180, 115, 580)} className="text-accent-primary opacity-80">Filter & Envelope</div>
          <div style={labelStyle(800, 115, 100)} className="text-accent-primary opacity-80">Output</div>
          
          {!isBuzz3o3 && (
            <>
              <div style={labelStyle(40, 238, 500)} className="text-red-500/70">Devil Fish Modifications</div>
              <div style={labelStyle(550, 238, 340)} className="text-orange-500/70">Neural Overdrive</div>
            </>
          )}
        </div>

        {/* --- ROW 1: Main Controls --- */}

        {/* Waveform Blend */}
        <div style={style(46, 140, 70, 70)}>
          <Knob
            value={typeof config.oscillator.type === 'string' ? (config.oscillator.type === 'square' ? 100 : 0) : 0}
            min={0}
            max={100}
            onChange={(v) => updateOscillator(v > 50 ? 'square' : 'sawtooth')}
            label="Wave"
            size="lg"
            color="#00ffff"
            formatValue={(v) => v > 50 ? 'SQR' : 'SAW'}
          />
        </div>

        {/* Tuning */}
        <div style={style(188, 139, 60, 60)}>
          <Knob
            value={config.tuning ?? 0}
            min={-100}
            max={100}
            bipolar
            onChange={updateTuning}
            label="Tune"
            size="md"
            color="#ffcc00"
          />
        </div>

        {/* Cutoff */}
        <div style={style(287, 139, 60, 60)}>
          <Knob
            value={config.filter.cutoff}
            min={50}
            max={18000}
            logarithmic
            onChange={(v) => updateFilter('cutoff', v)}
            label="Cutoff"
            size="md"
            color="#ffcc00"
          />
        </div>

        {/* Resonance */}
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

        {/* Env Mod */}
        <div style={style(485, 139, 60, 60)}>
          <Knob
            value={config.filterEnvelope.envMod}
            min={0}
            max={100}
            onChange={(v) => updateFilterEnvelope('envMod', v)}
            label="EnvMod"
            size="md"
            color="#ffcc00"
          />
        </div>

        {/* Decay */}
        <div style={style(584, 139, 60, 60)}>
          <Knob
            value={config.filterEnvelope.decay}
            min={30}
            max={3000}
            logarithmic
            onChange={(v) => updateFilterEnvelope('decay', v)}
            label="Decay"
            size="md"
            color="#ffcc00"
          />
        </div>

        {/* Accent */}
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

        {/* Volume */}
        <div style={style(813, 140, 70, 70)}>
          <Knob
            value={(volume ?? -12) + 60}
            min={0}
            max={100}
            onChange={(v) => {
              const db = v - 60;
              console.log(`[JC303 UI] Level change: ${db}dB`);
              onVolumeChange?.(db);
            }}
            label="Level"
            size="lg"
            color="#00ffff"
          />
        </div>


        {/* --- ROW 2: Modifications --- */}
        {!isBuzz3o3 && (
          <>
            {/* Devil Fish Toggle */}
            <div style={style(52, 273, 50, 45)} className="flex flex-col items-center">
              <Toggle
                label=""
                value={config.devilFish?.enabled || false}
                onChange={(v) => updateDevilFish('enabled', v)}
                color="#ff3333"
                size="sm"
              />
              <span className="text-[8px] font-bold text-red-500 mt-1">ENABLE</span>
            </div>
            
            {/* Status LED */}
            <div 
              style={style(82, 243, 12, 12)} 
              className={clsx(
                "rounded-full border border-black/40 transition-all duration-300", 
                config.devilFish?.enabled 
                  ? "bg-red-500 shadow-[0_0_10px_#ef4444]" 
                  : "bg-red-950"
              )}
            ></div>

            {/* Normal Decay */}
            <div style={{ ...style(147, 273, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
              <Knob
                value={config.devilFish?.normalDecay || 200}
                min={30}
                max={3000}
                logarithmic
                onChange={(v) => config.devilFish?.enabled && updateDevilFish('normalDecay', v)}
                label="N.Dec"
                size="sm"
                color="#ff3333"
              />
            </div>

            {/* Accent Decay */}
            <div style={{ ...style(208, 273, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
              <Knob
                value={config.devilFish?.accentDecay || 200}
                min={30}
                max={3000}
                logarithmic
                onChange={(v) => config.devilFish?.enabled && updateDevilFish('accentDecay', v)}
                label="A.Dec"
                size="sm"
                color="#ff3333"
              />
            </div>

            {/* Filter FM (Feedback) */}
            <div style={{ ...style(269, 273, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
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

            {/* Soft Attack */}
            <div style={{ ...style(330, 273, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
              <Knob
                value={config.devilFish?.softAttack || 0.3}
                min={0.3}
                max={30}
                logarithmic
                onChange={(v) => config.devilFish?.enabled && updateDevilFish('softAttack', v)}
                label="S.Atk"
                size="sm"
                color="#ff3333"
              />
            </div>

            {/* Slide Time */}
            <div style={style(391, 273, 35, 35)}>
              <Knob
                value={config.slide?.time || 60}
                min={10}
                max={500}
                onChange={(v) => updateSlide(v)}
                label="Slide"
                size="sm"
                color="#ff3333"
              />
            </div>

            {/* Drive Amount / Sqr Driver */}
            <div style={style(452, 273, 35, 35)}>
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

            {/* --- NEURAL OVERDRIVE SECTION --- */}
            
            {/* Overdrive Level */}
            <div style={style(566, 273, 35, 35)}>
              <Knob
                value={config.overdrive?.amount || 0}
                min={0}
                max={100}
                onChange={(v) => updateOverdrive('amount', v)}
                label="Level"
                size="sm"
                color="#ff9900"
              />
            </div>

            {/* Model Selector */}
            <div style={style(615, 275, 120, 40)} className="flex flex-col">
              <label className="text-[8px] font-bold text-orange-500/70 mb-1 ml-1">MODEL</label>
              <select 
                value={config.overdrive?.modelIndex ?? 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  console.log(`[JC303 UI] Overdrive model change: ${val}`);
                  updateOverdrive('modelIndex', val);
                }}
                className="bg-[#111] text-[10px] text-orange-400 border border-orange-900/30 rounded px-1 py-1 outline-none focus:border-orange-500"
              >
                <option value={0}>Classic TS9</option>
                <option value={1}>Plexi Drive</option>
                <option value={2}>Modern High</option>
                <option value={3}>Vintage Tube</option>
              </select>
            </div>

            {/* Dry/Wet Mix */}
            <div style={style(749, 273, 35, 35)}>
              <Knob
                value={config.overdrive?.dryWet ?? 100}
                min={0}
                max={100}
                onChange={(v) => updateOverdrive('dryWet', v)}
                label="Mix"
                size="sm"
                color="#ff9900"
              />
            </div>

            {/* Overdrive Enable Toggle */}
            <div style={style(826, 273, 50, 45)} className="flex flex-col items-center">
              <Toggle
                label=""
                value={(config.overdrive?.amount ?? 0) > 0}
                onChange={(v) => updateOverdrive('amount', v ? 50 : 0)}
                color="#ff9900"
                size="sm"
              />
              <span className="text-[8px] font-bold text-orange-500 mt-1">BYPASS</span>
            </div>

            {/* Overdrive LED */}
            <div 
              style={style(856, 243, 12, 12)} 
              className={clsx(
                "rounded-full border border-black/40 transition-all duration-300", 
                (config.overdrive?.amount ?? 0) > 0
                  ? "bg-orange-500 shadow-[0_0_10px_#f97316]" 
                  : "bg-orange-950"
              )}
            ></div>
          </>
        )}

        {/* Brand/Signature & Engine Selector */}
        <div className="absolute top-4 left-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-accent-primary p-1 rounded">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <div className="flex flex-col -space-y-1">
              <span className="text-white font-black italic text-xl tracking-tighter">JC-303</span>
              <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">Open303 WASM Engine</span>
            </div>
          </div>

          <div className="h-8 w-px bg-gray-800"></div>

          <div className="flex flex-col">
            <label className="text-[8px] font-bold text-gray-500 mb-1">PRESET</label>
            <select 
              value=""
              onChange={(e) => {
                const presetId = e.target.value;
                if (!presetId) return;
                const preset = TB303_PRESETS.find(p => p.name === presetId); // Preset ID is name in selector
                if (preset && preset.tb303) {
                  console.log(`[JC303 UI] Preset load: ${preset.name}`);
                  onChange(preset.tb303 as any);
                }
              }}
              className="bg-[#111] text-[10px] text-accent-primary border border-gray-800 rounded px-2 py-1 outline-none focus:border-accent-primary transition-colors max-w-[120px]"
            >
              <option value="" disabled>Load Preset...</option>
              {TB303_PRESETS.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="h-8 w-px bg-gray-800"></div>

          <div className="flex flex-col">
            <label className="text-[8px] font-bold text-gray-500 mb-1">ENGINE</label>
            <select 
              value={config.engineType || 'jc303'}
              onChange={(e) => {
                const val = e.target.value as any;
                console.log(`[JC303 UI] Engine change: ${val}`);
                onChange({ engineType: val });
              }}
              className="bg-[#111] text-[10px] text-accent-primary border border-gray-800 rounded px-2 py-1 outline-none focus:border-accent-primary transition-colors"
            >
              <option value="jc303">JC-303 (WASM)</option>
              <option value="accurate">Open303 (JS)</option>
              <option value="tonejs">Tone.js (Legacy)</option>
            </select>
          </div>
        </div>

        {/* Version info bottom right */}
        <div className="absolute bottom-2 right-4 text-[8px] text-gray-600 font-mono">
          V{CURRENT_VERSION}-WASM
        </div>

      </div>
    </div>
  );
};
