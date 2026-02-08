import React, { useRef, useLayoutEffect, useState, memo } from 'react';
import type { TB303Config } from '@typedefs/instrument';
import { TB303_PRESETS } from '@constants/tb303Presets';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { clsx } from 'clsx';
import { CURRENT_VERSION } from '@generated/changelog';
import { parseDb303Preset, convertToDb303Preset } from '@lib/import/Db303PresetConverter';

interface JC303StyledKnobPanelProps {
  config: TB303Config;
  onChange: (updates: Partial<TB303Config>) => void;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  isBuzz3o3?: boolean;
}

export const JC303StyledKnobPanel: React.FC<JC303StyledKnobPanelProps> = memo(({
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
    const currentConfig = configRef.current;
    onChange({
      filter: { ...currentConfig.filter, [key]: value },
    });
  };

  const updateFilterEnvelope = (key: string, value: number) => {
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

  const updateOscillatorParam = (key: string, value: any) => {
    console.log(`[JC303 UI] Oscillator param update: ${key}=${value}`);
    const currentConfig = configRef.current;
    onChange({
      oscillator: { ...currentConfig.oscillator, [key]: value }
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

  const updateLfo = (key: string, value: any) => {
    console.log(`[JC303 UI] LFO update: ${key}=${value}`);
    const currentConfig = configRef.current;
    const currentLfo = currentConfig.lfo || {
      waveform: 0,
      rate: 0,
      contour: 0,
      pitchDepth: 0,
      pwmDepth: 0,
      filterDepth: 0,
    };
    onChange({
      lfo: { ...currentLfo, [key]: value },
    });
  };

  const updateChorus = (key: string, value: any) => {
    console.log(`[JC303 UI] Chorus update: ${key}=${value}`);
    const currentConfig = configRef.current;
    const currentChorus = currentConfig.chorus || {
      enabled: false,
      mode: 1,
      mix: 30,
    };
    onChange({
      chorus: { ...currentChorus, [key]: value },
    });
  };

  const updatePhaser = (key: string, value: any) => {
    console.log(`[JC303 UI] Phaser update: ${key}=${value}`);
    const currentConfig = configRef.current;
    const currentPhaser = currentConfig.phaser || {
      enabled: false,
      rate: 50,
      depth: 50,
      feedback: 30,
      mix: 30,
    };
    onChange({
      phaser: { ...currentPhaser, [key]: value },
    });
  };

  const updateDelay = (key: string, value: any) => {
    console.log(`[JC303 UI] Delay update: ${key}=${value}`);
    const currentConfig = configRef.current;
    const currentDelay = currentConfig.delay || {
      enabled: false,
      time: 250,
      feedback: 30,
      tone: 70,
      mix: 25,
      stereo: 50,
    };
    onChange({
      delay: { ...currentDelay, [key]: value },
    });
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

  // Import preset from XML file
  const handleImportPreset = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const xmlString = event.target?.result as string;
          const parsed = parseDb303Preset(xmlString);
          const mergedConfig = { ...config, ...parsed };
          onChange(mergedConfig as any);
          console.log('[JC303 UI] Preset imported successfully');
        } catch (error) {
          console.error('[JC303 UI] Failed to import preset:', error);
          alert('Failed to import preset. Please check the XML file format.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Export current preset as XML file
  const handleExportPreset = () => {
    try {
      const xml = convertToDb303Preset(config);
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `db303-preset-${Date.now()}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      console.log('[JC303 UI] Preset exported successfully');
    } catch (error) {
      console.error('[JC303 UI] Failed to export preset:', error);
      alert('Failed to export preset.');
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full overflow-visible flex justify-center py-4 select-none"
      style={{ minHeight: `${(isBuzz3o3 ? 340 : 580) * scale + 32}px` }}
    >
      <div
        className="relative bg-[#1a1a1a] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-b-8 border-r-4 border-black/40 overflow-hidden"
        style={{
          width: '930px',
          height: isBuzz3o3 ? '340px' : '480px', 
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
          {/* Section divider for second row */}
          <div className="absolute top-[230px] left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]"></div>
          {/* Section divider for third row (LFO) */}
          {!isBuzz3o3 && (
            <div className="absolute top-[350px] left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]"></div>
          )}

          {/* Group Labels */}
          <div style={labelStyle(40, 115, 100)} className="text-accent-primary opacity-80">Oscillator</div>
          <div style={labelStyle(180, 115, 580)} className="text-accent-primary opacity-80">Filter & Envelope</div>
          <div style={labelStyle(800, 115, 100)} className="text-accent-primary opacity-80">Output</div>

          {!isBuzz3o3 && (
            <>
              <div style={labelStyle(40, 238, 500)} className="text-red-500/70">Devil Fish Modifications</div>
              <div style={labelStyle(550, 238, 340)} className="text-orange-500/70">Neural Overdrive</div>
              <div style={labelStyle(40, 358, 880)} className="text-purple-500/70">LFO (Low Frequency Oscillator)</div>
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

        {/* Oscillator Enhancements (Sub-row below Waveform) */}
        {/* Pulse Width */}
        <div style={style(14, 215, 35, 35)}>
          <Knob
            value={config.oscillator.pulseWidth ?? 50}
            min={0}
            max={100}
            onChange={(v) => updateOscillatorParam('pulseWidth', v)}
            label="PWM"
            size="sm"
            color="#00cccc"
          />
        </div>

        {/* Sub Oscillator Gain */}
        <div style={style(54, 215, 35, 35)}>
          <Knob
            value={config.oscillator.subOscGain ?? 0}
            min={0}
            max={100}
            onChange={(v) => updateOscillatorParam('subOscGain', v)}
            label="SubG"
            size="sm"
            color="#00cccc"
          />
        </div>

        {/* Sub Oscillator Blend */}
        <div style={style(94, 215, 35, 35)}>
          <Knob
            value={config.oscillator.subOscBlend ?? 0}
            min={0}
            max={100}
            onChange={(v) => updateOscillatorParam('subOscBlend', v)}
            label="SubB"
            size="sm"
            color="#00cccc"
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
            min={200}
            max={5000}
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
            min={config.devilFish?.enabled ? 30 : 200}
            max={config.devilFish?.enabled ? 3000 : 2000}
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
            <div style={{ ...style(125, 273, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
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
            <div style={{ ...style(172, 273, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
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

            {/* Accent Attack */}
            <div style={{ ...style(219, 273, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
              <Knob
                value={config.devilFish?.accentAttack ?? 3.0}
                min={0.3}
                max={30}
                logarithmic
                onChange={(v) => config.devilFish?.enabled && updateDevilFish('accentAttack', v)}
                label="A.Atk"
                size="sm"
                color="#ff3333"
              />
            </div>

            {/* Soft Attack */}
            <div style={{ ...style(266, 273, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
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

            {/* VEG Decay */}
            <div style={{ ...style(313, 273, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
              <Knob
                value={config.devilFish?.vegDecay ?? 3000}
                min={16}
                max={3000}
                logarithmic
                onChange={(v) => config.devilFish?.enabled && updateDevilFish('vegDecay', v)}
                label="V.Dec"
                size="sm"
                color="#ff3333"
              />
            </div>

            {/* VEG Sustain */}
            <div style={{ ...style(360, 273, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
              <Knob
                value={config.devilFish?.vegSustain ?? 0}
                min={0}
                max={100}
                onChange={(v) => config.devilFish?.enabled && updateDevilFish('vegSustain', v)}
                label="V.Sus"
                size="sm"
                color="#ff3333"
              />
            </div>

            {/* Slide Time */}
            <div style={style(410, 273, 35, 35)}>
              <Knob
                value={config.slide?.time || 60}
                min={2}
                max={360}
                logarithmic
                onChange={(v) => updateSlide(v)}
                label="Slide"
                size="sm"
                color="#ff3333"
              />
            </div>

            {/* Drive Amount / Sqr Driver */}
            <div style={style(460, 273, 35, 35)}>
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

            {/* Extended Devil Fish Parameters (Sub-row) */}

            {/* Duffing Amount (Non-linear filter) */}
            <div style={{ ...style(125, 318, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
              <Knob
                value={config.devilFish?.duffingAmount ?? 3}
                min={0}
                max={100}
                onChange={(v) => config.devilFish?.enabled && updateDevilFish('duffingAmount', v)}
                label="Duff"
                size="sm"
                color="#ff6666"
              />
            </div>

            {/* LP/BP Mix */}
            <div style={{ ...style(172, 318, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
              <Knob
                value={config.devilFish?.lpBpMix ?? 0}
                min={0}
                max={100}
                onChange={(v) => config.devilFish?.enabled && updateDevilFish('lpBpMix', v)}
                label="LP/BP"
                size="sm"
                color="#ff6666"
                formatValue={(v) => v < 50 ? 'LP' : 'BP'}
              />
            </div>

            {/* Resonance Tracking */}
            <div style={{ ...style(219, 318, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
              <Knob
                value={config.devilFish?.resTracking ?? 74.3}
                min={0}
                max={100}
                onChange={(v) => config.devilFish?.enabled && updateDevilFish('resTracking', v)}
                label="ResTrk"
                size="sm"
                color="#ff6666"
              />
            </div>

            {/* Ensemble Amount */}
            <div style={{ ...style(266, 318, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
              <Knob
                value={config.devilFish?.ensembleAmount ?? 0}
                min={0}
                max={100}
                onChange={(v) => config.devilFish?.enabled && updateDevilFish('ensembleAmount', v)}
                label="Ensbl"
                size="sm"
                color="#ff6666"
              />
            </div>

            {/* Oversampling Order */}
            <div style={{ ...style(313, 318, 35, 35), opacity: config.devilFish?.enabled ? 1 : 0.3 }}>
              <Knob
                value={config.devilFish?.oversamplingOrder ?? 2}
                min={0}
                max={4}
                step={1}
                onChange={(v) => config.devilFish?.enabled && updateDevilFish('oversamplingOrder', Math.round(v))}
                label="O/S"
                size="sm"
                color="#ff6666"
                formatValue={(v) => ['Off', '2x', '4x', '8x', '16x'][Math.round(v)] || 'Off'}
              />
            </div>
          </>
        )}

        {/* --- ROW 2: BUZZ3O3 EFFECTS (External Effects Chain) --- */}
        {isBuzz3o3 && (
          <>
            {/* Section Label */}
            <div style={labelStyle(40, 238, 500)} className="text-cyan-500/70">External Effects Chain</div>

            {/* Overdrive Enable Toggle */}
            <div style={style(52, 273, 50, 45)} className="flex flex-col items-center">
              <Toggle
                label=""
                value={(config.overdrive?.amount ?? 0) > 0}
                onChange={(v) => updateOverdrive('amount', v ? 50 : 0)}
                color="#00ffff"
                size="sm"
              />
              <span className="text-[8px] font-bold text-cyan-500 mt-1">DRIVE</span>
            </div>

            {/* Overdrive LED */}
            <div
              style={style(82, 243, 12, 12)}
              className={clsx(
                "rounded-full border border-black/40 transition-all duration-300",
                (config.overdrive?.amount ?? 0) > 0
                  ? "bg-cyan-500 shadow-[0_0_10px_#06b6d4]"
                  : "bg-cyan-950"
              )}
            ></div>

            {/* Overdrive Amount */}
            <div style={{ ...style(147, 273, 35, 35), opacity: (config.overdrive?.amount ?? 0) > 0 ? 1 : 0.3 }}>
              <Knob
                value={config.overdrive?.amount || 0}
                min={0}
                max={100}
                onChange={(v) => updateOverdrive('amount', v)}
                label="Amount"
                size="sm"
                color="#00ffff"
              />
            </div>

            {/* Muffler Mode */}
            <div style={style(220, 268, 100, 50)} className="flex flex-col">
              <label className="text-[8px] font-bold text-cyan-500/70 mb-1 ml-1">MUFFLER</label>
              <select
                value={config.devilFish?.muffler ?? 'off'}
                onChange={(e) => updateDevilFish('muffler', e.target.value)}
                className="bg-[#111] text-[10px] text-cyan-400 border border-cyan-900/30 rounded px-1 py-1 outline-none focus:border-cyan-500"
              >
                <option value="off">Off</option>
                <option value="dark">Dark</option>
                <option value="mid">Mid</option>
                <option value="bright">Bright</option>
              </select>
            </div>

            {/* High Resonance Toggle */}
            <div style={style(340, 273, 50, 45)} className="flex flex-col items-center">
              <Toggle
                label=""
                value={config.devilFish?.highResonance ?? false}
                onChange={(v) => updateDevilFish('highResonance', v)}
                color="#00ffff"
                size="sm"
              />
              <span className="text-[8px] font-bold text-cyan-500 mt-1">HI-Q</span>
            </div>

            {/* Filter Tracking */}
            <div style={style(420, 273, 35, 35)}>
              <Knob
                value={config.devilFish?.filterTracking ?? 0}
                min={0}
                max={100}
                onChange={(v) => updateDevilFish('filterTracking', v)}
                label="F.Trk"
                size="sm"
                color="#00ffff"
              />
            </div>

            {/* Info Label */}
            <div style={style(500, 268, 200, 50)} className="flex flex-col justify-center text-[9px] text-gray-500">
              <span>Oomek Aggressor WASM</span>
              <span className="text-cyan-600">+ Tone.js Effects Chain</span>
            </div>
          </>
        )}

        {/* --- ROW 3: LFO (Low Frequency Oscillator) --- */}
        {!isBuzz3o3 && (
          <>
            {/* LFO Waveform */}
            <div style={style(52, 385, 60, 60)}>
              <Knob
                value={config.lfo?.waveform ?? 0}
                min={0}
                max={2}
                step={1}
                onChange={(v) => updateLfo('waveform', Math.round(v))}
                label="Wave"
                size="md"
                color="#a855f7"
                formatValue={(v) => ['Sine', 'Tri', 'Sqr'][Math.round(v)] || 'Sine'}
              />
            </div>

            {/* LFO Rate */}
            <div style={style(151, 385, 60, 60)}>
              <Knob
                value={config.lfo?.rate ?? 0}
                min={0}
                max={100}
                onChange={(v) => updateLfo('rate', v)}
                label="Rate"
                size="md"
                color="#a855f7"
              />
            </div>

            {/* LFO Contour */}
            <div style={style(250, 385, 60, 60)}>
              <Knob
                value={config.lfo?.contour ?? 0}
                min={0}
                max={100}
                onChange={(v) => updateLfo('contour', v)}
                label="Contour"
                size="md"
                color="#a855f7"
              />
            </div>

            {/* LFO Pitch Depth */}
            <div style={style(349, 385, 60, 60)}>
              <Knob
                value={config.lfo?.pitchDepth ?? 0}
                min={0}
                max={100}
                onChange={(v) => updateLfo('pitchDepth', v)}
                label="Pitch"
                size="md"
                color="#a855f7"
              />
            </div>

            {/* LFO PWM Depth */}
            <div style={style(448, 385, 60, 60)}>
              <Knob
                value={config.lfo?.pwmDepth ?? 0}
                min={0}
                max={100}
                onChange={(v) => updateLfo('pwmDepth', v)}
                label="PWM"
                size="md"
                color="#a855f7"
              />
            </div>

            {/* LFO Filter Depth */}
            <div style={style(547, 385, 60, 60)}>
              <Knob
                value={config.lfo?.filterDepth ?? 0}
                min={0}
                max={100}
                onChange={(v) => updateLfo('filterDepth', v)}
                label="Filter"
                size="md"
                color="#a855f7"
              />
            </div>

            {/* LFO Info */}
            <div style={style(650, 388, 260, 50)} className="flex flex-col justify-center text-[9px] text-gray-500">
              <span>Modulation Source</span>
              <span className="text-purple-500">Pitch • PWM • Filter Cutoff</span>
            </div>
          </>
        )}

        {/* --- ROW 4: Built-in Effects --- */}
        {!isBuzz3o3 && (
          <>
            {/* Row divider */}
            <div className="absolute top-[460px] left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]"></div>

            {/* Row label */}
            <div style={labelStyle(40, 468, 880)} className="text-green-500/70">Built-in Effects</div>

            {/* Chorus Section */}
            <div style={labelStyle(40, 490, 100)} className="text-green-400/60 text-[10px]">CHORUS</div>

            {/* Chorus Enable */}
            <div style={style(52, 495, 35, 35)}>
              <Toggle
                value={config.chorus?.enabled ?? false}
                onChange={(v) => updateChorus('enabled', v)}
                label="On"
                size="sm"
              />
            </div>

            {/* Chorus Mode */}
            <div style={style(95, 495, 35, 35)}>
              <Knob
                value={config.chorus?.mode ?? 1}
                min={0}
                max={2}
                step={1}
                onChange={(v) => updateChorus('mode', Math.round(v))}
                label="Mode"
                size="sm"
                color="#22c55e"
                formatValue={(v) => ['Sub', 'Med', 'Wide'][Math.round(v)] || 'Med'}
              />
            </div>

            {/* Chorus Mix */}
            <div style={style(138, 495, 35, 35)}>
              <Knob
                value={config.chorus?.mix ?? 30}
                min={0}
                max={100}
                onChange={(v) => updateChorus('mix', v)}
                label="Mix"
                size="sm"
                color="#22c55e"
              />
            </div>

            {/* Phaser Section */}
            <div style={labelStyle(215, 490, 100)} className="text-green-400/60 text-[10px]">PHASER</div>

            {/* Phaser Enable */}
            <div style={style(227, 495, 35, 35)}>
              <Toggle
                value={config.phaser?.enabled ?? false}
                onChange={(v) => updatePhaser('enabled', v)}
                label="On"
                size="sm"
              />
            </div>

            {/* Phaser Rate */}
            <div style={style(270, 495, 35, 35)}>
              <Knob
                value={config.phaser?.rate ?? 50}
                min={0}
                max={100}
                onChange={(v) => updatePhaser('rate', v)}
                label="Rate"
                size="sm"
                color="#22c55e"
              />
            </div>

            {/* Phaser Depth */}
            <div style={style(313, 495, 35, 35)}>
              <Knob
                value={config.phaser?.depth ?? 50}
                min={0}
                max={100}
                onChange={(v) => updatePhaser('depth', v)}
                label="Depth"
                size="sm"
                color="#22c55e"
              />
            </div>

            {/* Phaser Feedback */}
            <div style={style(356, 495, 35, 35)}>
              <Knob
                value={config.phaser?.feedback ?? 30}
                min={0}
                max={100}
                onChange={(v) => updatePhaser('feedback', v)}
                label="FB"
                size="sm"
                color="#22c55e"
              />
            </div>

            {/* Phaser Mix */}
            <div style={style(399, 495, 35, 35)}>
              <Knob
                value={config.phaser?.mix ?? 30}
                min={0}
                max={100}
                onChange={(v) => updatePhaser('mix', v)}
                label="Mix"
                size="sm"
                color="#22c55e"
              />
            </div>

            {/* Delay Section */}
            <div style={labelStyle(476, 490, 100)} className="text-green-400/60 text-[10px]">DELAY</div>

            {/* Delay Enable */}
            <div style={style(488, 495, 35, 35)}>
              <Toggle
                value={config.delay?.enabled ?? false}
                onChange={(v) => updateDelay('enabled', v)}
                label="On"
                size="sm"
              />
            </div>

            {/* Delay Time */}
            <div style={style(531, 495, 35, 35)}>
              <Knob
                value={config.delay?.time ?? 250}
                min={0}
                max={2000}
                onChange={(v) => updateDelay('time', v)}
                label="Time"
                size="sm"
                color="#22c55e"
                formatValue={(v) => `${Math.round(v)}ms`}
              />
            </div>

            {/* Delay Feedback */}
            <div style={style(574, 495, 35, 35)}>
              <Knob
                value={config.delay?.feedback ?? 30}
                min={0}
                max={100}
                onChange={(v) => updateDelay('feedback', v)}
                label="FB"
                size="sm"
                color="#22c55e"
              />
            </div>

            {/* Delay Tone */}
            <div style={style(617, 495, 35, 35)}>
              <Knob
                value={config.delay?.tone ?? 70}
                min={0}
                max={100}
                onChange={(v) => updateDelay('tone', v)}
                label="Tone"
                size="sm"
                color="#22c55e"
              />
            </div>

            {/* Delay Mix */}
            <div style={style(660, 495, 35, 35)}>
              <Knob
                value={config.delay?.mix ?? 25}
                min={0}
                max={100}
                onChange={(v) => updateDelay('mix', v)}
                label="Mix"
                size="sm"
                color="#22c55e"
              />
            </div>

            {/* Delay Stereo */}
            <div style={style(703, 495, 35, 35)}>
              <Knob
                value={config.delay?.stereo ?? 50}
                min={0}
                max={100}
                onChange={(v) => updateDelay('stereo', v)}
                label="Stereo"
                size="sm"
                color="#22c55e"
              />
            </div>
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
              <span className="text-white font-black italic text-xl tracking-tighter">
                {config.engineType === 'db303' ? 'DB-303' : 'JC-303'}
              </span>
              <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">
                {config.engineType === 'db303' ? 'DB303 WASM Engine' : 'Open303 WASM Engine'}
              </span>
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
                const engineType = e.target.value as 'jc303' | 'db303';
                console.log(`[JC303 UI] Engine change: ${engineType}`);
                onChange({ engineType });
              }}
              className="bg-[#111] text-[10px] text-accent-primary border border-gray-800 rounded px-2 py-1 outline-none focus:border-accent-primary transition-colors"
            >
              <option value="jc303">Open303 (JC-303)</option>
              <option value="db303">DB303 (db303 variant)</option>
            </select>
          </div>

          <div className="h-8 w-px bg-gray-800"></div>

          <div className="flex gap-2">
            <button
              onClick={handleImportPreset}
              className="bg-[#111] text-[10px] text-green-500 border border-gray-800 rounded px-3 py-1 hover:bg-gray-900 hover:border-green-500/50 transition-colors font-bold"
              title="Import db303 XML preset"
            >
              IMPORT
            </button>
            <button
              onClick={handleExportPreset}
              className="bg-[#111] text-[10px] text-blue-500 border border-gray-800 rounded px-3 py-1 hover:bg-gray-900 hover:border-blue-500/50 transition-colors font-bold"
              title="Export as db303 XML preset"
            >
              EXPORT
            </button>
          </div>
        </div>

        {/* Version info bottom right */}
        <div className="absolute bottom-2 right-4 text-[8px] text-gray-600 font-mono">
          V{CURRENT_VERSION}-WASM
        </div>

      </div>
    </div>
  );
});

JC303StyledKnobPanel.displayName = 'JC303StyledKnobPanel';
