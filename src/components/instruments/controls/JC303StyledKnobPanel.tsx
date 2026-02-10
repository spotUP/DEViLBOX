import React, { useRef, useLayoutEffect, useState, memo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { TB303Config } from '@typedefs/instrument';
import { TB303_PRESETS } from '@constants/tb303Presets';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { clsx } from 'clsx';
import { CURRENT_VERSION } from '@generated/changelog';

interface JC303StyledKnobPanelProps {
  config: TB303Config;
  onChange: (updates: Partial<TB303Config>) => void;
  isBuzz3o3?: boolean;
}

// Calibration constants from db303 source truth
const CUTOFF_MIN = 314;
const CUTOFF_MAX = 2394;
const DECAY_MIN = 200;
const DECAY_MAX = 2000;
const SLIDE_MIN = 2;
const SLIDE_MAX = 360;
const LFO_RATE_MIN = 0.05;
const LFO_RATE_MAX = 20;

export const JC303StyledKnobPanel: React.FC<JC303StyledKnobPanelProps> = memo(({
  config,
  onChange,
  isBuzz3o3 = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState({
    mods: false,    // Collapsed by default
    lfo: false,     // Collapsed by default
    effects: false  // Collapsed by default
  });
  
  // Use ref for config to prevent stale closures in throttled callbacks
  const configRef = useRef(config);
  configRef.current = config;

  // Track container width for responsive layout
  const [containerWidth, setContainerWidth] = useState(1200);

  useLayoutEffect(() => {
    const updateWidth = () => {
      if (containerRef.current?.parentElement) {
        const parentWidth = containerRef.current.parentElement.clientWidth - 32; // minus padding
        setContainerWidth(Math.max(1000, parentWidth)); // min 1000px
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Update helpers - all receiving 0-1 from knobs now
  const updateFilter = (key: string, value: number) => {
    onChange({ filter: { ...configRef.current.filter, [key]: value } });
  };

  const updateFilterEnvelope = (key: string, value: number) => {
    onChange({ filterEnvelope: { ...configRef.current.filterEnvelope, [key]: value } });
  };

  const updateAccent = (key: string, value: number) => {
    onChange({ accent: { ...configRef.current.accent, [key]: value } });
  };

  const updateDevilFish = (key: string, value: any) => {
    const currentDF = configRef.current.devilFish || {
      enabled: false, normalDecay: 0.5, accentDecay: 0.5, vegDecay: 0.5, vegSustain: 0,
      softAttack: 0, filterTracking: 0, filterFmDepth: 0, sweepSpeed: 'normal' as const,
      accentSweepEnabled: true, highResonance: false, muffler: 'off' as const,
    };
    onChange({ devilFish: { ...currentDF, [key]: value } as any });
  };

  const updateOscillator = (type: 'sawtooth' | 'square') => {
    onChange({ oscillator: { ...configRef.current.oscillator, type } });
  };

  const updateOscillatorParam = (key: string, value: any) => {
    onChange({ oscillator: { ...configRef.current.oscillator, [key]: value } });
  };

  const updateSlide = (time: number) => {
    onChange({ slide: { ...configRef.current.slide, time } });
  };

  const updateTuning = (tuning: number) => {
    onChange({ tuning });
  };

  const updateLfo = (key: string, value: any) => {
    const currentLfo = configRef.current.lfo || {
      waveform: 0, rate: 0, contour: 0, pitchDepth: 0, pwmDepth: 0, filterDepth: 0, stiffDepth: 0
    };
    onChange({ lfo: { ...currentLfo, [key]: value } as any });
  };

  const updateChorus = (key: string, value: any) => {
    const currentChorus = configRef.current.chorus || { enabled: false, mode: 1, mix: 0.3 };
    onChange({ chorus: { ...currentChorus, [key]: value } as any });
  };

  const updatePhaser = (key: string, value: any) => {
    const currentPhaser = configRef.current.phaser || { enabled: false, rate: 0.5, depth: 0.5, feedback: 0.3, mix: 0.3 };
    onChange({ phaser: { ...currentPhaser, [key]: value } as any });
  };

  const updateDelay = (key: string, value: any) => {
    const currentDelay = configRef.current.delay || { enabled: false, time: 0.25, feedback: 0.3, tone: 0.7, mix: 0.25, stereo: 0.5 };
    onChange({ delay: { ...currentDelay, [key]: value } as any });
  };

  const SectionHeader: React.FC<{ 
    label: string, 
    expanded: boolean, 
    onToggle: () => void, 
    x: number, 
    y: number, 
    width: number,
    colorClass?: string
  }> = ({ label, expanded, onToggle, x, y, width, colorClass = "text-accent-primary" }) => (
    <div 
      style={{
        left: `${x}px`, top: `${y}px`, width: `${width}px`,
        position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '4px', cursor: 'pointer', zIndex: 10,
        pointerEvents: 'auto',
      }}
      onClick={onToggle}
      className="group"
    >
      <div className={clsx(
        "flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/60 border border-white/10 group-hover:border-white/30 group-hover:bg-black/80 transition-all shadow-lg",
        colorClass, expanded ? "opacity-100" : "opacity-70"
      )}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-[11px] font-bold uppercase tracking-[0.15em]">{label}</span>
      </div>
    </div>
  );

  const style = (x: number, y: number, width: number, height: number, yOffset: number = 0) => ({
    left: `${x}px`, top: `${y + yOffset}px`, width: `${width}px`, height: `${height}px`,
    position: 'absolute' as const,
  });

  const labelStyle = (x: number, y: number, width: number, yOffset: number = 0) => ({
    left: `${x}px`, top: `${y + yOffset}px`, width: `${width}px`,
    position: 'absolute' as const, textAlign: 'center' as const,
    fontSize: '10px', fontWeight: 'bold', color: '#888',
    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
  });

  // Section heights
  const ROW1_H = 285;
  const HEADER_H = 40; // Height for collapsed section header button
  const MODS_H = 230; // Increased for Korg filter params row
  const LFO_H = 165;
  const FX_H = 175;

  const showMods = sections.mods;
  const showLfo = !isBuzz3o3 && sections.lfo;
  const showFx = !isBuzz3o3 && sections.effects;

  // Shift values to move content up when sections above are collapsed
  // modsShift affects LFO position based on whether mods section content is showing
  const modsShift = showMods ? 0 : -MODS_H;
  // lfoShift affects FX position based on whether mods+lfo content is showing  
  const lfoShift = modsShift + (showLfo ? 0 : -LFO_H);
  
  // Always include header height for each section so buttons remain visible when collapsed
  const totalHeight = ROW1_H + 
    HEADER_H + (showMods ? MODS_H : 0) + 
    (!isBuzz3o3 ? HEADER_H + (showLfo ? LFO_H : 0) : 0) + 
    (!isBuzz3o3 ? HEADER_H + (showFx ? FX_H : 0) : 0);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-visible flex justify-center py-4 select-none"
      style={{ minHeight: `${totalHeight + 32}px`, transition: 'min-height 0.3s ease-out' }}
    >
      <div
        className="relative bg-[#1a1a1a] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-b-8 border-r-4 border-black/40 overflow-hidden"
        style={{
          width: `${containerWidth}px`, height: `${totalHeight}px`,
          background: 'linear-gradient(180deg, #252525 0%, #1a1a1a 100%)',
          transition: 'all 0.3s ease-out',
        }}
      >
        {/* --- PANEL DECORATIONS --- */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-1 bg-black/20"></div>
          <div className="absolute top-[110px] left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]"></div>
          
          <div style={labelStyle(40, 115, 400)} className="text-accent-primary opacity-80">Filter & Envelope</div>
          <div style={labelStyle(670, 115, 80)} className="text-accent-primary opacity-80">Output</div>
          <div style={{ ...labelStyle(containerWidth - 360, 115, 320), textAlign: 'right', paddingRight: '20px' }} className="text-cyan-400 opacity-80">Oscillator</div>

          {/* Modifications Header */}
          <div className="absolute left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]" style={{ top: '285px' }}></div>
          <SectionHeader 
            label="Modifications" expanded={showMods} 
            onToggle={() => setSections(s => ({ ...s, mods: !s.mods }))}
            x={40} y={292} width={containerWidth - 80} colorClass="text-red-500"
          />

          {/* LFO Header */}
          {!isBuzz3o3 && (
            <>
              <div className="absolute left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]" 
                style={{ top: `${285 + HEADER_H + (showMods ? MODS_H : 0)}px`, transition: 'top 0.3s ease-out' }}></div>
              <SectionHeader 
                label="LFO (Modulation)" expanded={sections.lfo} 
                onToggle={() => setSections(s => ({ ...s, lfo: !s.lfo }))}
                x={40} y={292 + HEADER_H + (showMods ? MODS_H : 0)} width={containerWidth - 80} colorClass="text-purple-500"
              />
            </>
          )}

          {/* Effects Header */}
          {!isBuzz3o3 && (
            <>
              <div className="absolute left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]" 
                style={{ top: `${285 + HEADER_H + (showMods ? MODS_H : 0) + HEADER_H + (showLfo ? LFO_H : 0)}px`, transition: 'top 0.3s ease-out' }}></div>
              <SectionHeader 
                label="Built-in Effects" expanded={sections.effects} 
                onToggle={() => setSections(s => ({ ...s, effects: !s.effects }))}
                x={40} y={292 + HEADER_H + (showMods ? MODS_H : 0) + HEADER_H + (showLfo ? LFO_H : 0)} width={containerWidth - 80} colorClass="text-green-500"
              />
            </>
          )}
        </div>

        {/* --- ROW 1: Main Controls (Always Visible) --- */}
        {/* Main 303 Knobs (Left Side) */}
        <div style={style(40, 145, 65, 65)}><Knob value={config.tuning ?? 0.5} min={0} max={1} bipolar onChange={updateTuning} label="Tune" size="md" color="#ffcc00" formatValue={v => (v - 0.5 > 0 ? '+' : '') + Math.round((v - 0.5) * 100) + 'c'} /></div>
        <div style={style(145, 145, 65, 65)}><Knob value={config.filter.cutoff} min={0} max={1} onChange={(v) => updateFilter('cutoff', v)} label="Cutoff" size="md" color="#ffcc00" formatValue={v => Math.round(CUTOFF_MIN * Math.pow(CUTOFF_MAX / CUTOFF_MIN, v)) + ' Hz'} /></div>
        <div style={style(250, 145, 65, 65)}><Knob value={config.filter.resonance} min={0} max={1} onChange={(v) => updateFilter('resonance', v)} label="Reso" size="md" color="#ffcc00" formatValue={v => Math.round(v * 100) + '%'} /></div>
        <div style={style(355, 145, 65, 65)}><Knob value={config.filterEnvelope.envMod} min={0} max={1} onChange={(v) => updateFilterEnvelope('envMod', v)} label="EnvMod" size="md" color="#ffcc00" formatValue={v => Math.round(v * 100) + '%'} /></div>
        <div style={style(460, 145, 65, 65)}><Knob value={config.filterEnvelope.decay} min={0} max={1} onChange={(v) => updateFilterEnvelope('decay', v)} label="Decay" size="md" color="#ffcc00" formatValue={v => Math.round(DECAY_MIN * Math.pow(DECAY_MAX / DECAY_MIN, v)) + ' ms'} /></div>
        <div style={style(565, 145, 65, 65)}><Knob value={config.accent.amount} min={0} max={1} onChange={(v) => updateAccent('amount', v)} label="Accent" size="md" color="#ffcc00" formatValue={v => Math.round(v * 100) + '%'} /></div>
        <div style={style(670, 145, 80, 80)}><Knob value={config.volume ?? 0.75} min={0} max={1} onChange={(v) => onChange({ volume: v })} label="Level" size="lg" color="#00ffff" formatValue={v => Math.round(v * 100) + '%'} /></div>
        
        {/* Oscillator Controls (Right Side - Horizontal Layout) */}
        <div style={{ ...style(containerWidth - 360, 145, 320, 80), display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-end', paddingRight: '20px' }}>
          <div style={{ width: '40px' }}><Knob value={config.oscillator.pulseWidth ?? 1} min={0} max={1} onChange={(v) => updateOscillatorParam('pulseWidth', v)} label="PWM" size="sm" color="#00cccc" formatValue={v => Math.round(50 + v * 49) + '%'} /></div>
          <div style={{ width: '40px' }}><Knob value={config.oscillator.subOscGain ?? 0} min={0} max={1} onChange={(v) => updateOscillatorParam('subOscGain', v)} label="SubG" size="sm" color="#00cccc" formatValue={v => Math.round(v * 100) + '%'} /></div>
          <div style={{ width: '40px' }}><Knob value={config.oscillator.subOscBlend ?? 1} min={0} max={1} onChange={(v) => updateOscillatorParam('subOscBlend', v)} label="SubB" size="sm" color="#00cccc" formatValue={v => v < 0.5 ? 'Mix' : 'Add'} /></div>
          <div style={{ width: '40px' }}><Knob value={config.oscillator.pitchToPw ?? 0} min={0} max={1} onChange={(v) => updateOscillatorParam('pitchToPw', v)} label="P→PW" size="sm" color="#00cccc" formatValue={v => Math.round(v * 100) + '%'} /></div>
          <div className="flex flex-col items-center justify-center" style={{ minWidth: '60px' }}>
            <span className={clsx("text-[9px] font-bold mb-1 transition-colors", config.oscillator.type === 'sawtooth' ? "text-cyan-400" : "text-gray-600")}>SAW</span>
            <Toggle label="" value={config.oscillator.type === 'square'} onChange={(v) => updateOscillator(v ? 'square' : 'sawtooth')} color="#00ffff" size="sm" />
            <span className={clsx("text-[9px] font-bold mt-1 transition-colors", config.oscillator.type === 'square' ? "text-cyan-400" : "text-gray-600")}>SQR</span>
          </div>
        </div>

        {/* --- ROW 2: Modifications --- */}
        {showMods && (
          <>
            <div style={style(52, 325, 50, 45)} className="flex flex-col items-center">
              <Toggle label="" value={config.devilFish?.enabled || false} onChange={(v) => updateDevilFish('enabled', v)} color="#ff3333" size="sm" />
              <span className="text-[8px] font-bold text-red-500 mt-1">ENABLE</span>
            </div>
            <div style={style(82, 295, 12, 12)} className={clsx("rounded-full border border-black/40 transition-all duration-300", config.devilFish?.enabled ? "bg-red-500 shadow-[0_0_10px_#ef4444]" : "bg-red-950")}></div>
            <div style={style(125, 325, 40, 40)}><Knob value={config.devilFish?.normalDecay || 0.5} min={0} max={1} onChange={(v) => updateDevilFish('normalDecay', v)} label="N.Dec" size="sm" color="#ff3333" formatValue={v => Math.round(DECAY_MIN * Math.pow(DECAY_MAX / DECAY_MIN, v)) + ' ms'} /></div>
            <div style={style(195, 325, 40, 40)}><Knob value={config.devilFish?.accentDecay || 0.5} min={0} max={1} onChange={(v) => updateDevilFish('accentDecay', v)} label="A.Dec" size="sm" color="#ff3333" formatValue={v => Math.round(DECAY_MIN * Math.pow(DECAY_MAX / DECAY_MIN, v)) + ' ms'} /></div>
            <div style={style(265, 325, 40, 40)}><Knob value={config.devilFish?.softAttack || 0} min={0} max={1} onChange={(v) => updateDevilFish('softAttack', v)} label="S.Atk" size="sm" color="#ff3333" formatValue={v => (0.3 * Math.pow(100, v)).toFixed(1) + ' ms'} /></div>
            <div style={style(335, 325, 40, 40)}><Knob value={config.devilFish?.accentSoftAttack || 0.5} min={0} max={1} onChange={(v) => updateDevilFish('accentSoftAttack', v)} label="A.Atk" size="sm" color="#ff3333" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(405, 325, 40, 40)}><Knob value={config.devilFish?.passbandCompensation || 0.9} min={0} max={1} onChange={(v) => updateDevilFish('passbandCompensation', v)} label="Comp" size="sm" color="#ff3333" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(475, 325, 40, 40)}><Knob value={config.devilFish?.resTracking || 0.7} min={0} max={1} onChange={(v) => updateDevilFish('resTracking', v)} label="R.Trk" size="sm" color="#ff3333" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(545, 325, 40, 40)}><Knob value={config.slide?.time || 0.17} min={0} max={1} onChange={updateSlide} label="Slide" size="sm" color="#ff3333" formatValue={v => Math.round(SLIDE_MIN * Math.pow(SLIDE_MAX / SLIDE_MIN, v)) + ' ms'} /></div>
            <div style={style(615, 325, 40, 40)}><Knob value={config.devilFish?.filterInputDrive || 0} min={0} max={1} onChange={(v) => updateDevilFish('filterInputDrive', v)} label="Drive" size="sm" color="#ff3333" formatValue={v => (v * 10).toFixed(1)} /></div>
            
            {/* Extended Params */}
            <div style={style(680, 325, 40, 40)}><Knob value={config.devilFish?.diodeCharacter || 0} min={0} max={1} onChange={(v) => updateDevilFish('diodeCharacter', v)} label="Diode" size="sm" color="#ff9900" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(740, 325, 40, 40)}><Knob value={config.devilFish?.duffingAmount || 0} min={-1} max={1} bipolar onChange={(v) => updateDevilFish('duffingAmount', v)} label="Duff" size="sm" color="#ff9900" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(800, 325, 40, 40)}><Knob value={config.devilFish?.filterFmDepth || 0} min={0} max={1} onChange={(v) => updateDevilFish('filterFmDepth', v)} label="F.FM" size="sm" color="#ff9900" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(860, 325, 40, 40)}><Knob value={config.devilFish?.lpBpMix || 0} min={0} max={1} onChange={(v) => updateDevilFish('lpBpMix', v)} label="LP/BP" size="sm" color="#ff9900" formatValue={v => v < 0.05 ? 'LP' : v > 0.95 ? 'BP' : 'Mix'} /></div>
            <div style={style(920, 325, 40, 40)}><Knob value={config.devilFish?.filterTracking || 0} min={0} max={1} onChange={(v) => updateDevilFish('filterTracking', v)} label="K.Trk" size="sm" color="#ff9900" formatValue={v => Math.round(v * 100) + '%'} /></div>
            
            {/* Filter Mode Selector */}
            <div style={style(980, 320, 80, 50)} className="flex flex-col">
              <label className="text-[8px] font-bold text-orange-500/70 mb-1 ml-1">FILTER</label>
              <select value={config.devilFish?.filterSelect ?? 1} onChange={(e) => updateDevilFish('filterSelect', parseInt(e.target.value))} className="bg-[#111] text-[10px] text-orange-400 border border-orange-900/30 rounded px-1 py-1 outline-none focus:border-orange-500">
                <option value={1}>303 Lowpass</option><option value={5}>Korg Ladder</option>
              </select>
            </div>
            
            {/* --- ROW 2b: Korg Filter Params (shown when Korg filter selected) + Quality/Extras --- */}
            <div style={labelStyle(40, 380, 200)} className="text-cyan-400/60 text-[9px]">KORG FILTER</div>
            <div style={style(60, 395, 40, 40)}><Knob value={config.devilFish?.korgBite ?? 0} min={0} max={1} onChange={(v) => updateDevilFish('korgBite', v)} label="Bite" size="sm" color="#06b6d4" formatValue={v => Math.round(v * 100) + '%'} disabled={config.devilFish?.filterSelect !== 5} /></div>
            <div style={style(120, 395, 40, 40)}><Knob value={config.devilFish?.korgClip ?? 0} min={0} max={1} onChange={(v) => updateDevilFish('korgClip', v)} label="Clip" size="sm" color="#06b6d4" formatValue={v => Math.round(v * 100) + '%'} disabled={config.devilFish?.filterSelect !== 5} /></div>
            <div style={style(180, 395, 40, 40)}><Knob value={config.devilFish?.korgCrossmod ?? 0} min={0} max={1} onChange={(v) => updateDevilFish('korgCrossmod', v)} label="XMod" size="sm" color="#06b6d4" formatValue={v => Math.round(v * 100) + '%'} disabled={config.devilFish?.filterSelect !== 5} /></div>
            <div style={style(240, 395, 40, 40)}><Knob value={config.devilFish?.korgQSag ?? 0} min={0} max={1} onChange={(v) => updateDevilFish('korgQSag', v)} label="Q.Sag" size="sm" color="#06b6d4" formatValue={v => Math.round(v * 100) + '%'} disabled={config.devilFish?.filterSelect !== 5} /></div>
            <div style={style(300, 395, 40, 40)}><Knob value={config.devilFish?.korgSharpness ?? 0.5} min={0} max={1} onChange={(v) => updateDevilFish('korgSharpness', v)} label="Sharp" size="sm" color="#06b6d4" formatValue={v => Math.round(v * 100) + '%'} disabled={config.devilFish?.filterSelect !== 5} /></div>
            
            <div style={labelStyle(400, 380, 200)} className="text-yellow-400/60 text-[9px]">EXTRAS</div>
            <div style={style(420, 395, 40, 40)}><Knob value={config.devilFish?.stageNLAmount ?? 0} min={0} max={1} onChange={(v) => updateDevilFish('stageNLAmount', v)} label="StgNL" size="sm" color="#eab308" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(480, 395, 40, 40)}><Knob value={config.devilFish?.ensembleAmount ?? 0} min={0} max={1} onChange={(v) => updateDevilFish('ensembleAmount', v)} label="Ensem" size="sm" color="#eab308" formatValue={v => Math.round(v * 100) + '%'} /></div>
            
            <div style={labelStyle(560, 380, 200)} className="text-gray-400/60 text-[9px]">QUALITY</div>
            <div style={style(580, 390, 90, 45)} className="flex flex-col">
              <label className="text-[8px] font-bold text-gray-400/70 mb-1">OVERSAMPLE</label>
              <select value={config.devilFish?.oversamplingOrder ?? 0} onChange={(e) => updateDevilFish('oversamplingOrder', parseInt(e.target.value))} className="bg-[#111] text-[9px] text-gray-300 border border-gray-700 rounded px-1 py-0.5 outline-none focus:border-gray-500">
                <option value={0}>Off</option><option value={1}>2×</option><option value={2}>4×</option><option value={3}>8×</option><option value={4}>16×</option>
              </select>
            </div>
          </>
        )}

        {/* --- ROW 3: LFO --- */}
        {showLfo && (
          <>
            <div style={style(60, 480, 65, 65, modsShift)}><Knob value={config.lfo?.rate ?? 0} min={0} max={1} onChange={(v) => updateLfo('rate', v)} label="Rate" size="md" color="#a855f7" formatValue={v => { const r = LFO_RATE_MIN * Math.pow(LFO_RATE_MAX/LFO_RATE_MIN, v); return r >= 10 ? r.toFixed(1) + 'Hz' : r.toFixed(2) + 'Hz'; }} /></div>
            <div style={style(170, 480, 65, 65, modsShift)}><Knob value={config.lfo?.contour ?? 0} min={-1} max={1} bipolar onChange={(v) => updateLfo('contour', v)} label="Contour" size="md" color="#a855f7" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(280, 480, 65, 65, modsShift)}><Knob value={config.lfo?.pitchDepth ?? 0} min={0} max={1} onChange={(v) => updateLfo('pitchDepth', v)} label="Pitch" size="md" color="#a855f7" formatValue={v => '+' + Math.round(v * 12) + ' semi'} /></div>
            <div style={style(390, 480, 65, 65, modsShift)}><Knob value={config.lfo?.pwmDepth ?? 0} min={0} max={1} onChange={(v) => updateLfo('pwmDepth', v)} label="PWM" size="md" color="#a855f7" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(500, 480, 65, 65, modsShift)}><Knob value={config.lfo?.filterDepth ?? 0} min={0} max={1} onChange={(v) => updateLfo('filterDepth', v)} label="Filter" size="md" color="#a855f7" formatValue={v => '+' + (v * 2).toFixed(1) + ' oct'} /></div>
            <div style={style(610, 480, 65, 65, modsShift)}><Knob value={config.lfo?.stiffDepth ?? 0} min={0} max={1} onChange={(v) => updateLfo('stiffDepth', v)} label="Stiff" size="md" color="#a855f7" formatValue={v => Math.round(v * 100) + '%'} /></div>
            
            {/* LFO Waveform Buttons */}
            <div style={style(720, 483, 150, 50, modsShift)} className="flex gap-2 items-center">
              {[0, 1, 2].map(w => (
                <button key={w} onClick={() => updateLfo('waveform', w)} className={clsx("px-2 py-1 text-[10px] font-bold rounded border transition-all", config.lfo?.waveform === w ? "bg-purple-500 text-white border-purple-400" : "bg-black/40 text-purple-500/60 border-purple-900/30")}>
                  {['SIN', 'TRI', 'SQR'][w]}
                </button>
              ))}
            </div>
          </>
        )}

        {/* --- ROW 4: Built-in Effects --- */}
        {showFx && (
          <>
            <div style={labelStyle(40, 615, 120, lfoShift)} className="text-green-400/60 text-[10px]">CHORUS</div>
            <div style={style(60, 635, 40, 40, lfoShift)}><Toggle value={config.chorus?.enabled ?? false} onChange={(v) => updateChorus('enabled', v)} label="On" size="sm" /></div>
            <div style={style(100, 632, 50, 45, lfoShift)} className="flex flex-col">
              <select value={config.chorus?.mode ?? 1} onChange={(e) => updateChorus('mode', parseInt(e.target.value))} className="bg-[#111] text-[9px] text-green-400 border border-green-900/30 rounded px-1 py-0.5 outline-none focus:border-green-500">
                <option value={0}>Subtle</option><option value={1}>Medium</option><option value={2}>Wide</option>
              </select>
              <span className="text-[7px] text-gray-500 mt-0.5 text-center">MODE</span>
            </div>
            <div style={style(155, 635, 40, 40, lfoShift)}><Knob value={config.chorus?.mix ?? 0.5} min={0} max={1} onChange={(v) => updateChorus('mix', v)} label="Mix" size="sm" color="#22c55e" formatValue={v => Math.round(v * 100) + '%'} /></div>
            
            <div style={labelStyle(200, 615, 120, lfoShift)} className="text-green-400/60 text-[10px]">PHASER</div>
            <div style={style(220, 635, 40, 40, lfoShift)}><Knob value={config.phaser?.rate ?? 0.5} min={0} max={1} onChange={(v) => updatePhaser('rate', v)} label="Rate" size="sm" color="#22c55e" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(270, 635, 40, 40, lfoShift)}><Knob value={config.phaser?.depth ?? 0.7} min={0} max={1} onChange={(v) => updatePhaser('depth', v)} label="Width" size="sm" color="#22c55e" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(320, 635, 40, 40, lfoShift)}><Knob value={config.phaser?.feedback ?? 0} min={0} max={1} onChange={(v) => updatePhaser('feedback', v)} label="FB" size="sm" color="#22c55e" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(370, 635, 40, 40, lfoShift)}><Knob value={config.phaser?.mix ?? 0} min={0} max={1} onChange={(v) => updatePhaser('mix', v)} label="Mix" size="sm" color="#22c55e" formatValue={v => Math.round(v * 100) + '%'} /></div>

            <div style={labelStyle(460, 615, 120, lfoShift)} className="text-green-400/60 text-[10px]">DELAY</div>
            <div style={style(480, 635, 40, 40, lfoShift)}><Knob value={config.delay?.time ?? 0.5} min={0} max={1} onChange={(v) => updateDelay('time', v)} label="Time" size="sm" color="#22c55e" formatValue={v => (0.25 + v * 15.75).toFixed(2)} /></div>
            <div style={style(530, 635, 40, 40, lfoShift)}><Knob value={config.delay?.feedback ?? 0} min={0} max={1} onChange={(v) => updateDelay('feedback', v)} label="FB" size="sm" color="#22c55e" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(580, 635, 40, 40, lfoShift)}><Knob value={config.delay?.tone ?? 0.5} min={0} max={1} onChange={(v) => updateDelay('tone', v)} label="Tone" size="sm" color="#22c55e" formatValue={v => v < 0.4 ? 'LP' : v > 0.6 ? 'HP' : 'Bypass'} /></div>
            <div style={style(630, 635, 40, 40, lfoShift)}><Knob value={config.delay?.mix ?? 0} min={0} max={1} onChange={(v) => updateDelay('mix', v)} label="Mix" size="sm" color="#22c55e" formatValue={v => Math.round(v * 100) + '%'} /></div>
            <div style={style(680, 635, 40, 40, lfoShift)}><Knob value={config.delay?.stereo ?? 0.75} min={0} max={1} onChange={(v) => updateDelay('stereo', v)} label="Spread" size="sm" color="#22c55e" formatValue={v => Math.round(v * 100) + '%'} /></div>
          </>
        )}

        {/* Brand & Engine */}
        <div className="absolute top-4 left-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-accent-primary p-1 rounded"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg></div>
            <div className="flex flex-col -space-y-1">
              <span className="text-white font-black italic text-xl tracking-tighter">DB-303</span>
              <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">TB-303 WASM Engine</span>
            </div>
          </div>
          <div className="h-8 w-px bg-gray-800"></div>
          <div className="flex flex-col">
            <label className="text-[8px] font-bold text-gray-500 mb-1">PRESET</label>
            <select value="" onChange={(e) => { const p = TB303_PRESETS.find(pr => pr.name === e.target.value); if (p?.tb303) onChange(p.tb303 as any); }} className="bg-[#111] text-[10px] text-accent-primary border border-gray-800 rounded px-2 py-1 outline-none focus:border-accent-primary transition-colors max-w-[120px]">
              <option value="" disabled>Load Preset...</option>{TB303_PRESETS.map((p) => (<option key={p.name} value={p.name}>{p.name}</option>))}
            </select>
          </div>
        </div>
        <div className="absolute bottom-2 right-4 text-[8px] text-gray-600 font-mono">V{CURRENT_VERSION}-WASM</div>
      </div>
    </div>
  );
});

JC303StyledKnobPanel.displayName = 'JC303StyledKnobPanel';
