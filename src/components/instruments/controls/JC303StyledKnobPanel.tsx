import React, { useRef, useLayoutEffect, useState, memo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
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
  const [sections, setSections] = useState({
    mods: true,
    lfo: false,
    effects: false
  });
  
  // Use ref for config to prevent stale closures in throttled callbacks
  const configRef = useRef(config);
  configRef.current = config;

  // Auto-scale to fit parent width
  useLayoutEffect(() => {
    const updateScale = () => {
      if (containerRef.current?.parentElement) {
        const parentWidth = containerRef.current.parentElement.clientWidth;
        const panelWidth = 1080 + 32; // width + padding
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

  // Update helpers
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
      enabled: false, normalDecay: 200, accentDecay: 200, vegDecay: 3000, vegSustain: 0,
      softAttack: 0.3, filterTracking: 0, filterFM: 0, sweepSpeed: 'normal' as const,
      accentSweepEnabled: true, highResonance: false, muffler: 'off' as const,
    };
    onChange({ devilFish: { ...currentDF, [key]: value } });
  };

  const updateOverdrive = (key: string, value: any) => {
    const currentOD = configRef.current.overdrive || { amount: 0, dryWet: 100, modelIndex: 0 };
    onChange({ overdrive: { ...currentOD, [key]: value } });
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
      waveform: 0, rate: 0, contour: 0, pitchDepth: 0, pwmDepth: 0, filterDepth: 0,
    };
    onChange({ lfo: { ...currentLfo, [key]: value } });
  };

  const updateChorus = (key: string, value: any) => {
    const currentChorus = configRef.current.chorus || { enabled: false, mode: 1, mix: 30 };
    onChange({ chorus: { ...currentChorus, [key]: value } });
  };

  const updatePhaser = (key: string, value: any) => {
    const currentPhaser = configRef.current.phaser || { enabled: false, rate: 50, depth: 50, feedback: 30, mix: 30 };
    onChange({ phaser: { ...currentPhaser, [key]: value } });
  };

  const updateDelay = (key: string, value: any) => {
    const currentDelay = configRef.current.delay || { enabled: false, time: 250, feedback: 30, tone: 70, mix: 25, stereo: 50 };
    onChange({ delay: { ...currentDelay, [key]: value } });
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
      }}
      onClick={onToggle}
      className="group"
    >
      <div className={clsx(
        "flex items-center gap-1 px-3 py-0.5 rounded-full bg-black/40 border border-transparent group-hover:border-white/20 transition-all",
        colorClass, expanded ? "opacity-100" : "opacity-60"
      )}>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="text-[10px] font-bold uppercase tracking-[0.15em]">{label}</span>
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
  const MODS_H = 165;
  const LFO_H = 165;
  const FX_H = 175;

  const showMods = sections.mods;
  const showLfo = !isBuzz3o3 && sections.lfo;
  const showFx = !isBuzz3o3 && sections.effects;

  const modsShift = showMods ? 0 : -MODS_H;
  const lfoShift = modsShift + (showLfo ? 0 : -LFO_H);
  
  const totalHeight = ROW1_H + 
    (showMods ? MODS_H : 0) + 
    (showLfo ? LFO_H : 0) + 
    (showFx ? FX_H : 0);

  // Import/Export Handlers
  const handleImportPreset = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.xml';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = parseDb303Preset(event.target?.result as string);
          onChange({ ...configRef.current, ...parsed } as any);
        } catch (error) {
          alert('Failed to import preset.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleExportPreset = () => {
    try {
      const xml = convertToDb303Preset(configRef.current);
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `db303-preset-${Date.now()}.xml`;
      a.click(); URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export preset.');
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full overflow-visible flex justify-center py-4 select-none"
      style={{ minHeight: `${totalHeight * scale + 32}px`, transition: 'min-height 0.3s ease-out' }}
    >
      <div
        className="relative bg-[#1a1a1a] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-b-8 border-r-4 border-black/40 overflow-hidden"
        style={{
          width: '1080px', height: `${totalHeight}px`, 
          transform: `scale(${scale})`, transformOrigin: 'top center',
          background: 'linear-gradient(180deg, #252525 0%, #1a1a1a 100%)',
          transition: 'height 0.3s ease-out',
        }}
      >
        {/* --- PANEL DECORATIONS --- */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-1 bg-black/20"></div>
          <div className="absolute top-[110px] left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]"></div>
          
          <div style={labelStyle(40, 115, 120)} className="text-accent-primary opacity-80">Oscillator</div>
          <div style={labelStyle(200, 115, 680)} className="text-accent-primary opacity-80">Filter & Envelope</div>
          <div style={labelStyle(940, 115, 100)} className="text-accent-primary opacity-80">Output</div>

          {/* Modifications Header */}
          <div className="absolute left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]" style={{ top: '285px' }}></div>
          <SectionHeader 
            label="Modifications" expanded={showMods} 
            onToggle={() => setSections(s => ({ ...s, mods: !s.mods }))}
            x={40} y={292} width={1000} colorClass="text-red-500"
          />

          {/* LFO Header */}
          {!isBuzz3o3 && (
            <>
              <div className="absolute left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]" 
                style={{ top: `${285 + (showMods ? MODS_H : 0)}px`, transition: 'top 0.3s ease-out' }}></div>
              <SectionHeader 
                label="LFO (Modulation)" expanded={sections.lfo} 
                onToggle={() => setSections(s => ({ ...s, lfo: !s.lfo }))}
                x={40} y={292 + (showMods ? MODS_H : 0)} width={1000} colorClass="text-purple-500"
              />
            </>
          )}

          {/* Effects Header */}
          {!isBuzz3o3 && (
            <>
              <div className="absolute left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]" 
                style={{ top: `${285 + (showMods ? MODS_H : 0) + (showLfo ? LFO_H : 0)}px`, transition: 'top 0.3s ease-out' }}></div>
              <SectionHeader 
                label="Built-in Effects" expanded={sections.effects} 
                onToggle={() => setSections(s => ({ ...s, effects: !s.effects }))}
                x={40} y={292 + (showMods ? MODS_H : 0) + (showLfo ? LFO_H : 0)} width={1000} colorClass="text-green-500"
              />
            </>
          )}
        </div>

        {/* --- ROW 1: Main Controls (Always Visible) --- */}
        <div style={style(60, 140, 80, 80)} className="flex flex-col items-center justify-center">
          <span className={clsx("text-[9px] font-bold mb-1 transition-colors", config.oscillator.type === 'sawtooth' ? "text-cyan-400" : "text-gray-600")}>SAW</span>
          <Toggle label="" value={config.oscillator.type === 'square'} onChange={(v) => updateOscillator(v ? 'square' : 'sawtooth')} color="#00ffff" size="sm" />
          <span className={clsx("text-[9px] font-bold mt-1 transition-colors", config.oscillator.type === 'square' ? "text-cyan-400" : "text-gray-600")}>SQR</span>
        </div>

        <div style={style(24, 225, 35, 35)}><Knob value={config.oscillator.pulseWidth ?? 50} min={0} max={100} onChange={(v) => updateOscillatorParam('pulseWidth', v)} label="PWM" size="sm" color="#00cccc" /></div>
        <div style={style(74, 225, 35, 35)}><Knob value={config.oscillator.subOscGain ?? 0} min={0} max={100} onChange={(v) => updateOscillatorParam('subOscGain', v)} label="SubG" size="sm" color="#00cccc" /></div>
        <div style={style(124, 225, 35, 35)}><Knob value={config.oscillator.subOscBlend ?? 0} min={0} max={100} onChange={(v) => updateOscillatorParam('subOscBlend', v)} label="SubB" size="sm" color="#00cccc" /></div>
        <div style={style(210, 145, 65, 65)}><Knob value={config.tuning ?? 0} min={-100} max={100} bipolar onChange={updateTuning} label="Tune" size="md" color="#ffcc00" /></div>
        <div style={style(320, 145, 65, 65)}><Knob value={config.filter.cutoff} min={200} max={5000} logarithmic onChange={(v) => updateFilter('cutoff', v)} label="Cutoff" size="md" color="#ffcc00" /></div>
        <div style={style(430, 145, 65, 65)}><Knob value={config.filter.resonance} min={0} max={100} onChange={(v) => updateFilter('resonance', v)} label="Reso" size="md" color="#ffcc00" /></div>
        <div style={style(540, 145, 65, 65)}><Knob value={config.filterEnvelope.envMod} min={0} max={100} onChange={(v) => updateFilterEnvelope('envMod', v)} label="EnvMod" size="md" color="#ffcc00" /></div>
        <div style={style(650, 145, 65, 65)}><Knob value={config.filterEnvelope.decay} min={config.devilFish?.enabled ? 30 : 200} max={config.devilFish?.enabled ? 3000 : 2000} logarithmic onChange={(v) => updateFilterEnvelope('decay', v)} label="Decay" size="md" color="#ffcc00" /></div>
        <div style={style(760, 145, 65, 65)}><Knob value={config.accent.amount} min={0} max={100} onChange={(v) => updateAccent('amount', v)} label="Accent" size="md" color="#ffcc00" /></div>
        <div style={style(950, 145, 80, 80)}><Knob value={(volume ?? -12) + 60} min={0} max={100} onChange={(v) => onVolumeChange?.(v - 60)} label="Level" size="lg" color="#00ffff" /></div>

        {/* --- ROW 2: Modifications --- */}
        {!isBuzz3o3 && showMods && (
          <>
            <div style={style(52, 325, 50, 45)} className="flex flex-col items-center">
              <Toggle label="" value={config.devilFish?.enabled || false} onChange={(v) => updateDevilFish('enabled', v)} color="#ff3333" size="sm" />
              <span className="text-[8px] font-bold text-red-500 mt-1">ENABLE</span>
            </div>
            <div style={style(82, 295, 12, 12)} className={clsx("rounded-full border border-black/40 transition-all duration-300", config.devilFish?.enabled ? "bg-red-500 shadow-[0_0_10px_#ef4444]" : "bg-red-950")}></div>
            <div style={style(125, 325, 40, 40)}><Knob value={config.devilFish?.normalDecay || 200} min={30} max={3000} logarithmic onChange={(v) => updateDevilFish('normalDecay', v)} label="N.Dec" size="sm" color="#ff3333" /></div>
            <div style={style(195, 325, 40, 40)}><Knob value={config.devilFish?.accentDecay || 200} min={30} max={3000} logarithmic onChange={(v) => updateDevilFish('accentDecay', v)} label="A.Dec" size="sm" color="#ff3333" /></div>
            <div style={style(265, 325, 40, 40)}><Knob value={config.devilFish?.accentAttack ?? 3.0} min={0.3} max={30} logarithmic onChange={(v) => updateDevilFish('accentAttack', v)} label="A.Atk" size="sm" color="#ff3333" /></div>
            <div style={style(335, 325, 40, 40)}><Knob value={config.devilFish?.softAttack || 0.3} min={0.3} max={30} logarithmic onChange={(v) => updateDevilFish('softAttack', v)} label="S.Atk" size="sm" color="#ff3333" /></div>
            <div style={style(405, 325, 40, 40)}><Knob value={config.devilFish?.vegDecay ?? 3000} min={16} max={3000} logarithmic onChange={(v) => updateDevilFish('vegDecay', v)} label="V.Dec" size="sm" color="#ff3333" /></div>
            <div style={style(475, 325, 40, 40)}><Knob value={config.devilFish?.vegSustain ?? 0} min={0} max={100} onChange={(v) => updateDevilFish('vegSustain', v)} label="V.Sus" size="sm" color="#ff3333" /></div>
            <div style={style(545, 325, 40, 40)}><Knob value={config.slide?.time || 60} min={2} max={360} logarithmic onChange={updateSlide} label="Slide" size="sm" color="#ff3333" /></div>
            <div style={style(615, 325, 40, 40)}><Knob value={config.overdrive?.amount || 0} min={0} max={100} onChange={(v) => updateOverdrive('amount', v)} label="Drive" size="sm" color="#ff3333" /></div>
            <div style={style(680, 325, 40, 40)}><Knob value={config.overdrive?.amount || 0} min={0} max={100} onChange={(v) => updateOverdrive('amount', v)} label="Level" size="sm" color="#ff9900" /></div>
            <div style={style(740, 327, 140, 40)} className="flex flex-col">
              <label className="text-[8px] font-bold text-orange-500/70 mb-1 ml-1">MODEL</label>
              <select value={config.overdrive?.modelIndex ?? 0} onChange={(e) => updateOverdrive('modelIndex', parseInt(e.target.value))} className="bg-[#111] text-[10px] text-orange-400 border border-orange-900/30 rounded px-1 py-1 outline-none focus:border-orange-500">
                <option value={0}>Classic TS9</option><option value={1}>Plexi Drive</option><option value={2}>Modern High</option><option value={3}>Vintage Tube</option>
              </select>
            </div>
            <div style={style(900, 325, 40, 40)}><Knob value={config.overdrive?.dryWet ?? 100} min={0} max={100} onChange={(v) => updateOverdrive('dryWet', v)} label="Mix" size="sm" color="#ff9900" /></div>
            <div style={style(980, 325, 50, 45)} className="flex flex-col items-center">
              <Toggle label="" value={(config.overdrive?.amount ?? 0) > 0} onChange={(v) => updateOverdrive('amount', v ? 50 : 0)} color="#ff9900" size="sm" />
              <span className="text-[8px] font-bold text-orange-500 mt-1">BYPASS</span>
            </div>
            <div style={style(1010, 295, 12, 12)} className={clsx("rounded-full border border-black/40 transition-all duration-300", (config.overdrive?.amount ?? 0) > 0 ? "bg-orange-500 shadow-[0_0_10px_#f97316]" : "bg-orange-950")}></div>
            <div style={style(125, 400, 40, 40)}><Knob value={config.devilFish?.duffingAmount ?? 3} min={0} max={100} onChange={(v) => updateDevilFish('duffingAmount', v)} label="Duff" size="sm" color="#ff6666" /></div>
            <div style={style(195, 400, 40, 40)}><Knob value={config.devilFish?.lpBpMix ?? 0} min={0} max={100} onChange={(v) => updateDevilFish('lpBpMix', v)} label="LP/BP" size="sm" color="#ff6666" formatValue={(v) => v < 50 ? 'LP' : 'BP'} /></div>
            <div style={style(265, 400, 40, 40)}><Knob value={config.devilFish?.resTracking ?? 74.3} min={0} max={100} onChange={(v) => updateDevilFish('resTracking', v)} label="ResTrk" size="sm" color="#ff6666" /></div>
            <div style={style(335, 400, 40, 40)}><Knob value={config.devilFish?.ensembleAmount ?? 0} min={0} max={100} onChange={(v) => updateDevilFish('ensembleAmount', v)} label="Ensbl" size="sm" color="#ff6666" /></div>
            <div style={style(405, 400, 40, 40)}><Knob value={config.devilFish?.oversamplingOrder ?? 2} min={0} max={4} step={1} onChange={(v) => updateDevilFish('oversamplingOrder', Math.round(v))} label="O/S" size="sm" color="#ff6666" formatValue={(v) => ['Off', '2x', '4x', '8x', '16x'][Math.round(v)]} /></div>
          </>
        )}

        {/* --- ROW 2: BUZZ3O3 (Buzz Engine) --- */}
        {isBuzz3o3 && showMods && (
          <>
            <div style={style(52, 325, 50, 45)} className="flex flex-col items-center">
              <Toggle label="" value={(config.overdrive?.amount ?? 0) > 0} onChange={(v) => updateOverdrive('amount', v ? 50 : 0)} color="#00ffff" size="sm" />
              <span className="text-[8px] font-bold text-cyan-500 mt-1">DRIVE</span>
            </div>
            <div style={style(82, 295, 12, 12)} className={clsx("rounded-full border border-black/40 transition-all duration-300", (config.overdrive?.amount ?? 0) > 0 ? "bg-cyan-500 shadow-[0_0_10px_#06b6d4]" : "bg-cyan-950")}></div>
            <div style={style(147, 325, 40, 40)}><Knob value={config.overdrive?.amount || 0} min={0} max={100} onChange={(v) => updateOverdrive('amount', v)} label="Amount" size="sm" color="#00ffff" /></div>
            <div style={style(220, 320, 120, 50)} className="flex flex-col">
              <label className="text-[8px] font-bold text-cyan-500/70 mb-1 ml-1">MUFFLER</label>
              <select value={config.devilFish?.muffler ?? 'off'} onChange={(e) => updateDevilFish('muffler', e.target.value)} className="bg-[#111] text-[10px] text-cyan-400 border border-cyan-900/30 rounded px-1 py-1 outline-none focus:border-cyan-500">
                <option value="off">Off</option><option value="dark">Dark</option><option value="mid">Mid</option><option value="bright">Bright</option>
              </select>
            </div>
            <div style={style(360, 325, 50, 45)} className="flex flex-col items-center">
              <Toggle label="" value={config.devilFish?.highResonance ?? false} onChange={(v) => updateDevilFish('highResonance', v)} color="#00ffff" size="sm" />
              <span className="text-[8px] font-bold text-cyan-500 mt-1">HI-Q</span>
            </div>
            <div style={style(440, 325, 40, 40)}><Knob value={config.devilFish?.filterTracking ?? 0} min={0} max={100} onChange={(v) => updateDevilFish('filterTracking', v)} label="F.Trk" size="sm" color="#00ffff" /></div>
            <div style={style(520, 320, 250, 50)} className="flex flex-col justify-center text-[10px] text-gray-500">
              <span>Oomek Aggressor WASM</span><span className="text-cyan-600">+ Tone.js Effects Chain</span>
            </div>
          </>
        )}

        {/* --- ROW 3: LFO --- */}
        {showLfo && (
          <>
            <div style={style(60, 480, 65, 65, modsShift)}><Knob value={config.lfo?.waveform ?? 0} min={0} max={2} step={1} onChange={(v) => updateLfo('waveform', Math.round(v))} label="Wave" size="md" color="#a855f7" formatValue={(v) => ['Sine', 'Tri', 'Sqr'][Math.round(v)]} /></div>
            <div style={style(170, 480, 65, 65, modsShift)}><Knob value={config.lfo?.rate ?? 0} min={0} max={100} onChange={(v) => updateLfo('rate', v)} label="Rate" size="md" color="#a855f7" /></div>
            <div style={style(280, 480, 65, 65, modsShift)}><Knob value={config.lfo?.contour ?? 0} min={0} max={100} onChange={(v) => updateLfo('contour', v)} label="Contour" size="md" color="#a855f7" /></div>
            <div style={style(390, 480, 65, 65, modsShift)}><Knob value={config.lfo?.pitchDepth ?? 0} min={0} max={100} onChange={(v) => updateLfo('pitchDepth', v)} label="Pitch" size="md" color="#a855f7" /></div>
            <div style={style(500, 480, 65, 65, modsShift)}><Knob value={config.lfo?.pwmDepth ?? 0} min={0} max={100} onChange={(v) => updateLfo('pwmDepth', v)} label="PWM" size="md" color="#a855f7" /></div>
            <div style={style(610, 480, 65, 65, modsShift)}><Knob value={config.lfo?.filterDepth ?? 0} min={0} max={100} onChange={(v) => updateLfo('filterDepth', v)} label="Filter" size="md" color="#a855f7" /></div>
            <div style={style(720, 483, 300, 50, modsShift)} className="flex flex-col justify-center text-[10px] text-gray-500">
              <span>Modulation Source</span><span className="text-purple-500">Pitch • PWM • Filter Cutoff</span>
            </div>
          </>
        )}

        {/* --- ROW 4: Built-in Effects --- */}
        {showFx && (
          <>
            <div style={labelStyle(40, 615, 120, lfoShift)} className="text-green-400/60 text-[10px]">CHORUS</div>
            <div style={style(60, 635, 40, 40, lfoShift)}><Toggle value={config.chorus?.enabled ?? false} onChange={(v) => updateChorus('enabled', v)} label="On" size="sm" /></div>
            <div style={style(110, 635, 40, 40, lfoShift)}><Knob value={config.chorus?.mode ?? 1} min={0} max={2} step={1} onChange={(v) => updateChorus('mode', Math.round(v))} label="Mode" size="sm" color="#22c55e" formatValue={(v) => ['Sub', 'Med', 'Wide'][Math.round(v)]} /></div>
            <div style={style(160, 635, 40, 40, lfoShift)}><Knob value={config.chorus?.mix ?? 30} min={0} max={100} onChange={(v) => updateChorus('mix', v)} label="Mix" size="sm" color="#22c55e" /></div>
            
            <div style={labelStyle(245, 615, 120, lfoShift)} className="text-green-400/60 text-[10px]">PHASER</div>
            <div style={style(260, 635, 40, 40, lfoShift)}><Toggle value={config.phaser?.enabled ?? false} onChange={(v) => updatePhaser('enabled', v)} label="On" size="sm" /></div>
            <div style={style(310, 635, 40, 40, lfoShift)}><Knob value={config.phaser?.rate ?? 50} min={0} max={100} onChange={(v) => updatePhaser('rate', v)} label="Rate" size="sm" color="#22c55e" /></div>
            <div style={style(360, 635, 40, 40, lfoShift)}><Knob value={config.phaser?.depth ?? 50} min={0} max={100} onChange={(v) => updatePhaser('depth', v)} label="Depth" size="sm" color="#22c55e" /></div>
            <div style={style(410, 635, 40, 40, lfoShift)}><Knob value={config.phaser?.feedback ?? 30} min={0} max={100} onChange={(v) => updatePhaser('feedback', v)} label="FB" size="sm" color="#22c55e" /></div>
            <div style={style(460, 635, 40, 40, lfoShift)}><Knob value={config.phaser?.mix ?? 30} min={0} max={100} onChange={(v) => updatePhaser('mix', v)} label="Mix" size="sm" color="#22c55e" /></div>

            <div style={labelStyle(545, 615, 120, lfoShift)} className="text-green-400/60 text-[10px]">DELAY</div>
            <div style={style(560, 635, 40, 40, lfoShift)}><Toggle value={config.delay?.enabled ?? false} onChange={(v) => updateDelay('enabled', v)} label="On" size="sm" /></div>
            <div style={style(610, 635, 40, 40, lfoShift)}><Knob value={config.delay?.time ?? 250} min={0} max={2000} onChange={(v) => updateDelay('time', v)} label="Time" size="sm" color="#22c55e" formatValue={(v) => `${Math.round(v)}ms`} /></div>
            <div style={style(660, 635, 40, 40, lfoShift)}><Knob value={config.delay?.feedback ?? 30} min={0} max={100} onChange={(v) => updateDelay('feedback', v)} label="FB" size="sm" color="#22c55e" /></div>
            <div style={style(710, 635, 40, 40, lfoShift)}><Knob value={config.delay?.tone ?? 70} min={0} max={100} onChange={(v) => updateDelay('tone', v)} label="Tone" size="sm" color="#22c55e" /></div>
            <div style={style(760, 635, 40, 40, lfoShift)}><Knob value={config.delay?.mix ?? 25} min={0} max={100} onChange={(v) => updateDelay('mix', v)} label="Mix" size="sm" color="#22c55e" /></div>
            <div style={style(810, 635, 40, 40, lfoShift)}><Knob value={config.delay?.stereo ?? 50} min={0} max={100} onChange={(v) => updateDelay('stereo', v)} label="Stereo" size="sm" color="#22c55e" /></div>
          </>
        )}

        {/* Brand & Engine */}
        <div className="absolute top-4 left-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-accent-primary p-1 rounded"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg></div>
            <div className="flex flex-col -space-y-1">
              <span className="text-white font-black italic text-xl tracking-tighter">{config.engineType === 'db303' ? 'DB-303' : 'JC-303'}</span>
              <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">{config.engineType === 'db303' ? 'DB303 WASM Engine' : 'Open303 WASM Engine'}</span>
            </div>
          </div>
          <div className="h-8 w-px bg-gray-800"></div>
          <div className="flex flex-col">
            <label className="text-[8px] font-bold text-gray-500 mb-1">PRESET</label>
            <select value="" onChange={(e) => { const p = TB303_PRESETS.find(pr => pr.name === e.target.value); if (p?.tb303) onChange(p.tb303 as any); }} className="bg-[#111] text-[10px] text-accent-primary border border-gray-800 rounded px-2 py-1 outline-none focus:border-accent-primary transition-colors max-w-[120px]">
              <option value="" disabled>Load Preset...</option>{TB303_PRESETS.map((p) => (<option key={p.name} value={p.name}>{p.name}</option>))}
            </select>
          </div>
          <div className="h-8 w-px bg-gray-800"></div>
          <div className="flex flex-col">
            <label className="text-[8px] font-bold text-gray-500 mb-1">ENGINE</label>
            <select value={config.engineType || 'jc303'} onChange={(e) => onChange({ engineType: e.target.value as any })} className="bg-[#111] text-[10px] text-accent-primary border border-gray-800 rounded px-2 py-1 outline-none focus:border-accent-primary transition-colors">
              <option value="jc303">Open303 (JC-303)</option><option value="db303">DB303 (db303 variant)</option>
            </select>
          </div>
          <div className="h-8 w-px bg-gray-800"></div>
          <div className="flex gap-2">
            <button onClick={handleImportPreset} className="bg-[#111] text-[10px] text-green-500 border border-gray-800 rounded px-3 py-1 hover:bg-gray-900 hover:border-green-500/50 transition-colors font-bold">IMPORT</button>
            <button onClick={handleExportPreset} className="bg-[#111] text-[10px] text-blue-500 border border-gray-800 rounded px-3 py-1 hover:bg-gray-900 hover:border-blue-500/50 transition-colors font-bold">EXPORT</button>
          </div>
        </div>
        <div className="absolute bottom-2 right-4 text-[8px] text-gray-600 font-mono">V{CURRENT_VERSION}-WASM</div>
      </div>
    </div>
  );
});

JC303StyledKnobPanel.displayName = 'JC303StyledKnobPanel';
