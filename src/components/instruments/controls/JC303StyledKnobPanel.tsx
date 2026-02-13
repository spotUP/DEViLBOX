import React, { useRef, useLayoutEffect, useState, useEffect, useCallback, memo } from 'react';
import { Lightbulb } from 'lucide-react';
import type { TB303Config } from '@typedefs/instrument';
import { DEFAULT_TB303 } from '@typedefs/instrument';
import { TB303_PRESETS } from '@constants/tb303Presets';
import { Knob } from '@components/controls/Knob';
// Toggle import removed — no longer used in reference-matching layout
import { getToneEngine } from '@engine/ToneEngine';
import { useMIDIStore } from '@stores';
import { clsx } from 'clsx';
import { CURRENT_VERSION } from '@generated/changelog';

interface JC303StyledKnobPanelProps {
  config: TB303Config;
  onChange: (updates: Partial<TB303Config>) => void;
  onPresetLoad?: (preset: Record<string, unknown>) => void;
  isBuzz3o3?: boolean;
  instrumentId?: number;
  /** Optional action buttons rendered in the top-right corner of the panel */
  headerActions?: React.ReactNode;
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

// 303 Quick Tips - actionable acid sound design wisdom
const TB303_QUICK_TIPS = [
  "ACID SCREAM: Cutoff LOW (20-30%) + Resonance HIGH (90%+) + Env Mod HIGH (90%+) = maximum squelch",
  "The filter envelope is the soul of acid. Env Mod controls HOW FAR the filter sweeps, Decay controls HOW LONG",
  "For fat basslines, keep Resonance below 40% and Cutoff around 50%. Resonance scoops out the bass!",
  "Accent doesn't just add volume — it pushes the filter HARDER. Accent + high Env Mod = face-melting sweep",
  "Classic 303 trick: Set Cutoff to 0%, Env Mod to 100%, Resonance to 80%. Every note becomes a filter sweep from zero",
  "Slides are everything in acid. Enable Devil Fish mods and crank the Slide time for long, gliding portamento",
  "SAW wave = buzzy, aggressive acid. SQR wave = hollow, woody, more vintage. Mix with Sub Osc for both",
  "PWM on square wave adds movement and thickness. Automate it with the LFO for evolving textures",
  "Sub Oscillator adds weight without muddying the filter. Set SubG to 30-50% for solid low-end foundation",
  "Devil Fish 'Drive' pushes the filter into saturation. Even small amounts (10-20%) add analog warmth",
  "The Korg Ladder filter (in Mods) has a completely different character — darker, more aggressive self-oscillation",
  "For dub techno bass: Cutoff 40%, Reso 30%, Env Mod 50%, Decay 70%. Warm and deep, not screaming",
  "Quick reset: Double-click any knob to snap it back to its default value",
  "Try the Phaser effect at low mix (10-20%) for subtle stereo movement on your acid lines",
  "Delay + high feedback + short time = metallic resonance. Great for industrial acid textures",
  "LFO → Filter at slow rate creates classic auto-wah. Speed it up for ring-mod-like timbres",
  "Accent works best on every 2nd or 4th note. Too many accents = no accents. Let them breathe",
  "Diode character (in Mods) adds asymmetric distortion — the secret sauce of real 303 clones",
  "LP/BP mix blends lowpass and bandpass. Bandpass at high resonance creates nasal, vocal-like tones",
  "For TB-303 authenticity: SAW wave, Cutoff 25%, Reso 60%, Env Mod 75%, Decay 40%. Pure Roland acid",
];

/** Combined scope: filter response curve (always) + live waveform (when playing).
 *  Single canvas avoids z-index / layering issues between two transparent canvases. */
const DB303Scope: React.FC<{ config: TB303Config; instrumentId: number }> = memo(({ config, instrumentId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [logicalWidth, setLogicalWidth] = useState(200);
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; });
  const HEIGHT = 80;

  // Track container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) setLogicalWidth(Math.floor(r.width));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Setup canvas DPI
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = logicalWidth * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
  }, [logicalWidth]);

  // Animation frame — draws filter curve + waveform overlay
  const onFrame = useCallback((): boolean => {
    const ctx = ctxRef.current;
    if (!ctx) return false;
    const w = logicalWidth;
    const h = HEIGHT;
    const cfg = configRef.current;

    // Dark background
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, w, h);

    // --- Check for live audio first ---
    const engine = getToneEngine();
    const analyser = engine.getInstrumentAnalyser(instrumentId);
    let hasAudio = false;

    if (analyser) {
      const waveform = analyser.getWaveform();
      const hasActivity = analyser.hasActivity();
      if (hasActivity) {
        hasAudio = true;
        // Live waveform — draw instead of filter curve
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        const sliceW = w / waveform.length;
        for (let i = 0; i < waveform.length; i++) {
          const y = ((waveform[i] + 1) / 2) * h;
          if (i === 0) ctx.moveTo(i * sliceW, y); else ctx.lineTo(i * sliceW, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // --- Filter response curve (only when not playing) ---
    if (!hasAudio) {
      const cutoff = cfg.filter?.cutoff ?? 0.5;
      const resonance = cfg.filter?.resonance ?? 0;
      const envMod = cfg.filterEnvelope?.envMod ?? 0.5;
      const Q = 0.5 + resonance * 24.5;
      const zeroDbY = h * 0.45;
      const dbScale = h * 0.02;

      const mag = (f: number, fc: number, q: number): number => {
        if (fc <= 0.001) return f < 0.001 ? 1 : 0.0001;
        const ratio = f / fc;
        const r2 = ratio * ratio;
        return 1 / Math.max(Math.sqrt((1 - r2) * (1 - r2) + r2 / (q * q)), 0.0001);
      };

      const drawFilterCurve = (fc: number, q: number, style: string, lw: number, dash?: number[]) => {
        ctx.beginPath();
        ctx.strokeStyle = style;
        ctx.lineWidth = lw;
        if (dash) ctx.setLineDash(dash);
        else ctx.setLineDash([]);
        for (let i = 0; i < w; i++) {
          const f = i / w;
          const db = 20 * Math.log10(Math.max(mag(f, fc, q), 0.0001));
          const y = Math.max(2, Math.min(h - 2, zeroDbY - db * dbScale));
          if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };

      // EnvMod sweep ghost
      if (envMod > 0.02) {
        const sweepFc = Math.min(1, cutoff + envMod * (1 - cutoff));
        drawFilterCurve(sweepFc, Q, 'rgba(255, 204, 0, 0.12)', 1, [4, 4]);
      }
      // Main filter curve
      drawFilterCurve(cutoff, Q, 'rgba(255, 204, 0, 0.4)', 1.5);
      // Glow pass
      ctx.shadowColor = '#ffcc00';
      ctx.shadowBlur = 3;
      drawFilterCurve(cutoff, Q, 'rgba(255, 204, 0, 0.15)', 1);
      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle = 'rgba(255, 204, 0, 0.25)';
      ctx.font = '7px monospace';
      ctx.fillText('FILTER', 4, h - 4);
    }

    return hasAudio;
  }, [instrumentId, logicalWidth]);

  // 30fps animation
  useEffect(() => {
    let running = true;
    let lastFrame = 0;
    let raf: number;
    const loop = (ts: number) => {
      if (!running) return;
      if (ts - lastFrame >= 33) { // ~30fps
        lastFrame = ts;
        onFrame();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, [onFrame]);

  return (
    <div ref={containerRef} className="w-full" style={{ height: `${HEIGHT}px` }}>
      <canvas
        ref={canvasRef}
        className="rounded"
        style={{ width: '100%', height: `${HEIGHT}px`, display: 'block' }}
      />
    </div>
  );
});
DB303Scope.displayName = 'DB303Scope';

/** Diagnostics overlay — shows WASM readback values when window.DB303_TRACE = true */
const DB303DiagnosticsOverlay: React.FC<{ instrumentId: number }> = ({ instrumentId }) => {
  const [diag, setDiag] = useState<Record<string, number> | null>(null);
  const [traceEnabled, setTraceEnabled] = useState(false);

  useEffect(() => {
    const check = () => {
      setTraceEnabled(typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).DB303_TRACE);
    };
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!traceEnabled) { setDiag(null); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const { getToneEngine } = await import('@engine/ToneEngine');
        const engine = getToneEngine();
        const instrumentsMap = (engine as unknown as Record<string, Map<number, Record<string, (...args: unknown[]) => unknown>> | undefined>).instruments;
        const synthInstance = instrumentsMap?.get(instrumentId);
        if (synthInstance?.getDiagnostics) {
          const d = await synthInstance.getDiagnostics() as Record<string, number> | null;
          if (!cancelled && d && Object.keys(d).length > 0) setDiag(d);
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [instrumentId, traceEnabled]);

  if (!traceEnabled || !diag) return null;

  return (
    <div className="absolute inset-0 flex items-end pointer-events-none" style={{ fontSize: '8px', fontFamily: 'monospace' }}>
      <div className="bg-black/70 text-green-400 px-2 py-0.5 rounded-t flex gap-3 flex-wrap">
        {diag.cutoff !== undefined && <span>CUT:{(diag.cutoff as number).toFixed(3)}</span>}
        {diag.resonance !== undefined && <span>RES:{(diag.resonance as number).toFixed(3)}</span>}
        {diag.envMod !== undefined && <span>ENV:{(diag.envMod as number).toFixed(3)}</span>}
        {diag.volume !== undefined && <span>VOL:{(diag.volume as number).toFixed(3)}</span>}
        {diag.peakAmplitude !== undefined && <span>PEAK:{(diag.peakAmplitude as number).toFixed(4)}</span>}
        {diag.currentNote !== undefined && <span>NOTE:{diag.currentNote}</span>}
      </div>
    </div>
  );
};

type TB303Tab = 'osc' | 'mojo' | 'lfo' | 'devilfish' | 'fx';

export const JC303StyledKnobPanel: React.FC<JC303StyledKnobPanelProps> = memo(({
  config: rawConfig,
  onChange,
  onPresetLoad,
  isBuzz3o3 = false,
  instrumentId,
  headerActions,
}) => {
  // Defensive defaults — guard against partially-loaded configs from persistence
  const config: TB303Config = {
    ...DEFAULT_TB303,
    ...rawConfig,
    oscillator: { ...DEFAULT_TB303.oscillator, ...rawConfig.oscillator },
    filter: { ...DEFAULT_TB303.filter, ...rawConfig.filter },
    filterEnvelope: { ...DEFAULT_TB303.filterEnvelope, ...rawConfig.filterEnvelope },
    accent: { ...DEFAULT_TB303.accent, ...rawConfig.accent },
    slide: { ...DEFAULT_TB303.slide, ...rawConfig.slide },
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTabRaw] = useState<TB303Tab>('osc');

  // Clamp tab if isBuzz3o3 hides LFO/FX
  const effectiveTab = (isBuzz3o3 && (activeTab === 'lfo' || activeTab === 'fx')) ? 'osc' : activeTab;
  const setActiveTab = (tab: TB303Tab) => {
    // Prevent setting hidden tabs in Buzz3o3 mode
    if (isBuzz3o3 && (tab === 'lfo' || tab === 'fx')) return;
    setActiveTabRaw(tab);
  };

  // Use ref for config to prevent stale closures in throttled callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; });

  // Sync MIDI knob page when UI tab changes
  const setKnobPage = useMIDIStore(s => s.setKnobPage);
  useEffect(() => {
    const tabToPage: Record<TB303Tab, number> = { osc: 1, mojo: 2, lfo: 3, devilfish: 4, fx: 5 };
    const page = tabToPage[effectiveTab];
    if (page !== undefined) setKnobPage(page);
  }, [effectiveTab, setKnobPage]);

  // Cycling quick tips
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TB303_QUICK_TIPS.length));
  const [tipFading, setTipFading] = useState(false);
  const cycleTip = useCallback((direction: 1 | -1) => {
    setTipFading(true);
    setTimeout(() => {
      setTipIndex(i => (i + direction + TB303_QUICK_TIPS.length) % TB303_QUICK_TIPS.length);
      setTipFading(false);
    }, 200);
  }, []);
  useEffect(() => {
    const interval = setInterval(() => cycleTip(1), 12000);
    return () => clearInterval(interval);
  }, [cycleTip]);

  // Track container width for responsive layout
  const [containerWidth, setContainerWidth] = useState(1200);

  useLayoutEffect(() => {
    const updateWidth = () => {
      if (containerRef.current?.parentElement) {
        const parentWidth = containerRef.current.parentElement.clientWidth - 32;
        setContainerWidth(Math.max(1000, parentWidth));
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Update helpers - all receiving 0-1 from knobs
  const updateFilter = (key: string, value: number) => {
    onChange({ filter: { ...configRef.current.filter, [key]: value } });
  };

  const updateFilterEnvelope = (key: string, value: number) => {
    onChange({ filterEnvelope: { ...configRef.current.filterEnvelope, [key]: value } });
  };

  const updateAccent = (key: string, value: number) => {
    onChange({ accent: { ...configRef.current.accent, [key]: value } });
  };

  const updateDevilFish = (key: string, value: number | boolean | string) => {
    const currentDF = configRef.current.devilFish || {
      enabled: true, normalDecay: 0.5, accentDecay: 0.5, vegDecay: 0.5, vegSustain: 0,
      softAttack: 0, filterTracking: 0, filterFmDepth: 0, sweepSpeed: 'normal' as const,
      accentSweepEnabled: true, highResonance: false, muffler: 'off' as const,
    };
    onChange({ devilFish: { ...currentDF, [key]: value } as TB303Config['devilFish'] });
  };

  const updateOscillatorParam = (key: string, value: number | string) => {
    onChange({ oscillator: { ...configRef.current.oscillator, [key]: value } });
  };

  const updateSlide = (time: number) => {
    onChange({ slide: { ...configRef.current.slide, time } });
  };

  const updateTuning = (tuning: number) => {
    onChange({ tuning });
  };

  const updateLfo = (updates: Record<string, number | boolean>) => {
    const currentLfo = configRef.current.lfo || {
      waveform: 0, rate: 0, contour: 0, pitchDepth: 0, pwmDepth: 0, filterDepth: 0, stiffDepth: 0
    };
    onChange({ lfo: { ...currentLfo, ...updates } as TB303Config['lfo'] });
  };

  const updateChorus = (updates: Record<string, number | boolean>) => {
    const currentChorus = configRef.current.chorus || { enabled: false, mode: 1, mix: 0.3 };
    onChange({ chorus: { ...currentChorus, ...updates } as TB303Config['chorus'] });
  };

  const updateDelay = (key: string, value: number | boolean) => {
    const currentDelay = configRef.current.delay || { enabled: false, time: 3, feedback: 0, tone: 0.5, mix: 0, stereo: 0.75 };
    // Auto-enable delay when any param is adjusted (reference has no enable toggle)
    onChange({ delay: { ...currentDelay, enabled: true, [key]: value } as TB303Config['delay'] });
  };

  // Absolute positioning helpers for Row 1
  const style = (x: number, y: number, width: number, height: number) => ({
    left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`,
    position: 'absolute' as const,
  });

  const labelStyle = (x: number, y: number, width: number) => ({
    left: `${x}px`, top: `${y}px`, width: `${width}px`,
    position: 'absolute' as const, textAlign: 'center' as const,
    fontSize: '10px', fontWeight: 'bold', color: '#888',
    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
  });

  // Tab definitions
  const tabDefs: { id: TB303Tab; label: string; color: string; bgClass: string; textClass: string; ledOn?: boolean }[] = [
    { id: 'osc', label: 'OSC', color: '#06b6d4', bgClass: 'bg-cyan-500', textClass: 'text-cyan-400' },
    { id: 'mojo', label: 'MOJO', color: '#ff9900', bgClass: 'bg-orange-500', textClass: 'text-orange-400' },
    ...(!isBuzz3o3 ? [
      { id: 'lfo' as TB303Tab, label: 'LFO', color: '#a855f7', bgClass: 'bg-purple-500', textClass: 'text-purple-400', ledOn: config.lfo?.enabled || false },
    ] : []),
    { id: 'devilfish', label: 'DEVILFISH', color: '#ff3333', bgClass: 'bg-red-500', textClass: 'text-red-400' },
    ...(!isBuzz3o3 ? [
      { id: 'fx' as TB303Tab, label: 'FX', color: '#22c55e', bgClass: 'bg-green-500', textClass: 'text-green-400', ledOn: !!(config.chorus?.mode || config.delay?.mix) },
    ] : []),
  ];

  const totalHeight = 480;

  return (
    <div
      ref={containerRef}
      className="w-full overflow-visible flex justify-center py-4 select-none"
      style={{ minHeight: `${totalHeight + 32}px` }}
    >
      <div
        className="relative bg-[#1a1a1a] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-b-8 border-r-4 border-black/40 overflow-hidden"
        style={{
          width: `${containerWidth}px`, height: `${totalHeight}px`,
          background: 'linear-gradient(180deg, #252525 0%, #1a1a1a 100%)',
        }}
      >
        {/* --- PANEL DECORATIONS --- */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-1 bg-black/20"></div>
          <div className="absolute top-[110px] left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]"></div>
          <div style={labelStyle(40, 115, 600)} className="text-accent-primary opacity-80">Classic</div>
          <div className="absolute left-4 right-4 h-[2px] bg-black/40 shadow-[0_1px_0_rgba(255,255,255,0.05)]" style={{ top: '285px' }}></div>
        </div>

        {/* --- ROW 1: CLASSIC Controls (Always Visible) --- */}
        <div style={style(40, 145, 65, 80)}><Knob value={config.tuning ?? 0.5} min={0} max={1} defaultValue={0.5} bipolar onChange={updateTuning} label="Tone" size="md" color="#ffcc00" formatValue={v => (v - 0.5 > 0 ? '+' : '') + Math.round((v - 0.5) * 100) + 'c'} /></div>
        <div style={style(145, 140, 65, 100)}>
          <Knob value={config.filter.cutoff} min={0} max={1} defaultValue={0.5} onChange={(v) => updateFilter('cutoff', v)} label="Cutoff" size="md" color="#ffcc00" formatValue={v => Math.round(CUTOFF_MIN * Math.pow(CUTOFF_MAX / CUTOFF_MIN, v)) + ' Hz'} />
          <label className="flex items-center gap-1 justify-center mt-1 cursor-pointer">
            <input type="checkbox" checked={config.devilFish?.extendedCutoff || false} onChange={(e) => updateDevilFish('extendedCutoff', e.target.checked)} className="w-3 h-3 accent-yellow-500 rounded" />
            <span className="text-[8px] text-gray-400 uppercase">Wide</span>
          </label>
        </div>
        <div style={style(250, 145, 65, 80)}><Knob value={config.filter.resonance} min={0} max={1} defaultValue={0} onChange={(v) => updateFilter('resonance', v)} label="Reso" size="md" color="#ffcc00" formatValue={v => Math.round(v * 100) + '%'} /></div>
        <div style={style(355, 140, 65, 100)}>
          <Knob value={config.filterEnvelope.envMod} min={0} max={1} defaultValue={0.5} onChange={(v) => updateFilterEnvelope('envMod', v)} label="EnvMod" size="md" color="#ffcc00" formatValue={v => Math.round(v * 100) + '%'} />
          <label className="flex items-center gap-1 justify-center mt-1 cursor-pointer">
            <input type="checkbox" checked={config.devilFish?.extendedEnvMod || false} onChange={(e) => updateDevilFish('extendedEnvMod', e.target.checked)} className="w-3 h-3 accent-yellow-500 rounded" />
            <span className="text-[8px] text-gray-400 uppercase">Wide</span>
          </label>
        </div>
        <div style={style(460, 145, 65, 80)}><Knob value={config.filterEnvelope.decay} min={0} max={1} defaultValue={0.5} onChange={(v) => updateFilterEnvelope('decay', v)} label="Decay" size="md" color="#ffcc00" formatValue={v => Math.round(DECAY_MIN * Math.pow(DECAY_MAX / DECAY_MIN, v)) + ' ms'} /></div>
        <div style={style(565, 145, 65, 80)}><Knob value={config.accent.amount} min={0} max={1} defaultValue={0.5} onChange={(v) => updateAccent('amount', v)} label="Accent" size="md" color="#ffcc00" formatValue={v => Math.round(v * 100) + '%'} /></div>
        <div style={style(670, 145, 65, 80)}><Knob value={config.volume ?? 0.75} min={0} max={1} defaultValue={0.75} onChange={(v) => onChange({ volume: v })} label="Level" size="md" color="#00ffff" formatValue={v => Math.round(v * 100) + '%'} /></div>

        {/* --- TAB BAR --- */}
        <div style={{ position: 'absolute', left: 20, right: 20, top: 290, height: 30 }} className="flex items-center gap-1.5">
          {tabDefs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={clsx(
                "relative px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all duration-200",
                effectiveTab === t.id
                  ? `${t.bgClass} text-white border-transparent shadow-lg shadow-${t.id === 'osc' ? 'cyan' : t.id === 'mojo' ? 'orange' : t.id === 'devilfish' ? 'red' : t.id === 'lfo' ? 'purple' : 'green'}-500/30`
                  : `bg-black/40 ${t.textClass} border-white/10 hover:border-white/25 hover:bg-black/60`
              )}
            >
              {t.label}
              {t.ledOn !== undefined && (
                <span className={clsx(
                  "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-black/50 transition-all duration-300",
                  t.ledOn ? `${t.bgClass} shadow-[0_0_6px_${t.color}]` : "bg-gray-800"
                )} />
              )}
            </button>
          ))}
          {/* Page indicator for MIDI controller */}
          <span className="ml-auto text-[9px] text-gray-600 font-mono tracking-wider">
            {tabDefs.findIndex(t => t.id === effectiveTab) + 1}/{tabDefs.length}
          </span>
        </div>

        {/* --- TAB CONTENT --- */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 324, bottom: 30 }}>

          {/* OSC Tab — Oscillator controls */}
          {effectiveTab === 'osc' && (
            <div className="flex items-center gap-3 h-full px-6">
              <div style={{ width: '65px' }}><Knob value={config.oscillator.waveformBlend ?? (config.oscillator.type === 'square' ? 1 : 0)} min={0} max={1} defaultValue={0} onChange={(v) => updateOscillatorParam('waveformBlend', v)} label="Waveform" size="md" color="#06b6d4" formatValue={v => v < 0.05 ? 'SAW' : v > 0.95 ? 'SQR' : Math.round(v * 100) + '%'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.oscillator.pulseWidth ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateOscillatorParam('pulseWidth', v)} label="Pulse W" size="md" color="#06b6d4" formatValue={v => Math.round(50 + v * 49) + '%'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.oscillator.subOscGain ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateOscillatorParam('subOscGain', v)} label="Sub Osc" size="md" color="#06b6d4" formatValue={v => Math.round(v * 100) + '%'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.oscillator.subOscBlend ?? 1} min={0} max={1} defaultValue={1} onChange={(v) => updateOscillatorParam('subOscBlend', v)} label="Sub Wave" size="md" color="#06b6d4" formatValue={v => v < 0.5 ? '-2 Oct' : '-1 Oct'} /></div>
            </div>
          )}

          {/* MOJO Tab — Filter character shaping */}
          {effectiveTab === 'mojo' && (
            <div className="flex items-center gap-3 h-full px-6">
              <div style={{ width: '65px' }}><Knob value={config.devilFish?.passbandCompensation ?? 0.9} min={0} max={1} defaultValue={0.9} onChange={(v) => updateDevilFish('passbandCompensation', v)} label="Bass" size="md" color="#ff9900" formatValue={v => Math.round(v * 100) + '%'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.devilFish?.resTracking ?? 0.7} min={0} max={1} defaultValue={0.7} onChange={(v) => updateDevilFish('resTracking', v)} label="Rez" size="md" color="#ff9900" formatValue={v => Math.round(v * 100) + '%'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.devilFish?.filterInputDrive ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateDevilFish('filterInputDrive', v)} label="Satur" size="md" color="#ff9900" formatValue={v => (v * 10).toFixed(1)} /></div>
              <div className="w-px h-14 bg-gray-800 flex-shrink-0" />
              <div style={{ width: '65px' }}><Knob value={config.devilFish?.diodeCharacter ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateDevilFish('diodeCharacter', v)} label="Bite" size="md" color="#ff9900" formatValue={v => Math.round(v * 100) + '%'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.devilFish?.duffingAmount ?? 0} min={-1} max={1} defaultValue={0} bipolar onChange={(v) => updateDevilFish('duffingAmount', v)} label="Tension" size="md" color="#ff9900" formatValue={v => Math.round(v * 100) + '%'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.devilFish?.lpBpMix ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateDevilFish('lpBpMix', v)} label="LP/BP" size="md" color="#ff9900" formatValue={v => v < 0.05 ? 'LP' : v > 0.95 ? 'BP' : 'Mix'} /></div>
              <div className="w-px h-14 bg-gray-800 flex-shrink-0" />
              <div className="flex flex-col gap-1">
                <label className="text-[8px] font-bold text-orange-500/70">FILTER</label>
                <select value={config.devilFish?.filterSelect ?? 1} onChange={(e) => updateDevilFish('filterSelect', parseInt(e.target.value))} className="bg-[#111] text-[10px] text-orange-400 border border-orange-900/30 rounded px-1 py-1 outline-none focus:border-orange-500">
                  <option value={0}>DiodeLadder</option><option value={5}>MissThang-20</option>
                </select>
              </div>
            </div>
          )}

          {/* LFO Tab — Modulation */}
          {effectiveTab === 'lfo' && !isBuzz3o3 && (
            <div className="flex items-center gap-3 h-full px-6">
              {/* Waveform buttons */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <span className="text-[9px] font-bold text-purple-400/60 tracking-wider">WAVE</span>
                <div className="flex gap-1.5 items-center">
                  {[0, 1, 2, 3, 4, 5].map(w => (
                    <button key={w} onClick={() => updateLfo({ enabled: true, waveform: w })} className={clsx("w-10 h-8 text-[10px] font-bold rounded-md border-2 transition-all", config.lfo?.waveform === w ? "bg-purple-500 text-white border-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.4)]" : "bg-black/50 text-purple-400/50 border-purple-900/40 hover:border-purple-500/50 hover:text-purple-400")}>
                      {['TRI', 'SAW', 'SAW▼', 'SQR', 'S&H', 'NSE'][w]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-px h-14 bg-gray-800 flex-shrink-0" />
              <div style={{ width: '65px' }}><Knob value={config.lfo?.rate ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateLfo({ enabled: true, rate: v })} label="Rate" size="md" color="#a855f7" formatValue={v => { const r = LFO_RATE_MIN * Math.pow(LFO_RATE_MAX/LFO_RATE_MIN, v); return r >= 10 ? r.toFixed(1) + 'Hz' : r.toFixed(2) + 'Hz'; }} /></div>
              <div style={{ width: '65px' }}><Knob value={config.lfo?.contour ?? 0} min={-1} max={1} defaultValue={0} bipolar onChange={(v) => updateLfo({ enabled: true, contour: v })} label="Contour" size="md" color="#a855f7" formatValue={v => Math.round(v * 100) + '%'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.lfo?.pwmDepth ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateLfo({ enabled: true, pwmDepth: v })} label="PWM Mod" size="md" color="#a855f7" formatValue={v => Math.round(v * 100) + '%'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.lfo?.pitchDepth ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateLfo({ enabled: true, pitchDepth: v })} label="Pitch" size="md" color="#a855f7" formatValue={v => '+' + Math.round(v * 12) + ' semi'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.lfo?.filterDepth ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateLfo({ enabled: true, filterDepth: v })} label="Filter" size="md" color="#a855f7" formatValue={v => '+' + (v * 2).toFixed(1) + ' oct'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.lfo?.stiffDepth ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateLfo({ enabled: true, stiffDepth: v })} label="Tension" size="md" color="#a855f7" formatValue={v => Math.round(v * 100) + '%'} /></div>
            </div>
          )}

          {/* DEVILFISH Tab — Circuit modification params */}
          {effectiveTab === 'devilfish' && (
            <div className="flex items-center gap-3 h-full px-6">
              <div style={{ width: '65px' }}><Knob value={config.devilFish?.filterFmDepth ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateDevilFish('filterFmDepth', v)} label="Filt FM" size="md" color="#ff3333" formatValue={v => Math.round(v * 100) + '%'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.devilFish?.filterTracking ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateDevilFish('filterTracking', v)} label="Filt Trk" size="md" color="#ff3333" formatValue={v => Math.round(v * 100) + '%'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.slide?.time ?? 0.17} min={0} max={1} defaultValue={0.17} onChange={updateSlide} label="Slide" size="md" color="#ff3333" formatValue={v => Math.round(SLIDE_MIN * Math.pow(SLIDE_MAX / SLIDE_MIN, v)) + ' ms'} /></div>
              <div className="w-px h-14 bg-gray-800 flex-shrink-0" />
              <div style={{ width: '65px' }}><Knob value={config.devilFish?.softAttack ?? 0} min={0} max={1} defaultValue={0} onChange={(v) => updateDevilFish('softAttack', v)} label="S.Atk" size="md" color="#ff3333" formatValue={v => (0.3 * Math.pow(100, v)).toFixed(1) + ' ms'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.devilFish?.normalDecay ?? 0.5} min={0} max={1} defaultValue={0.5} onChange={(v) => updateDevilFish('normalDecay', v)} label="N.Dec" size="md" color="#ff3333" formatValue={v => Math.round(DECAY_MIN * Math.pow(DECAY_MAX / DECAY_MIN, v)) + ' ms'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.devilFish?.accentDecay ?? 0.5} min={0} max={1} defaultValue={0.5} onChange={(v) => updateDevilFish('accentDecay', v)} label="Acc Dec" size="md" color="#ff3333" formatValue={v => Math.round(DECAY_MIN * Math.pow(DECAY_MAX / DECAY_MIN, v)) + ' ms'} /></div>
              <div style={{ width: '65px' }}><Knob value={config.devilFish?.accentSoftAttack ?? 0.5} min={0} max={1} defaultValue={0.5} onChange={(v) => updateDevilFish('accentSoftAttack', v)} label="Acc Soft" size="md" color="#ff3333" formatValue={v => Math.round(v * 100) + '%'} /></div>
            </div>
          )}

          {/* FX Tab — Dimension + Delay (matching reference) */}
          {effectiveTab === 'fx' && !isBuzz3o3 && (
            <div className="flex items-start gap-5 h-full px-6 py-3">
              {/* Dimension (Chorus) */}
              <div className="flex flex-col gap-2">
                <span className="text-[9px] font-bold text-green-400/60 tracking-wider">DIMENSION</span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-400 flex-shrink-0">Mode</span>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4].map(m => {
                      const activeMode = (config.chorus?.enabled && (config.chorus?.mode ?? 0) > 0) ? (config.chorus?.mode ?? 0) : 0;
                      return (
                        <button key={m} onClick={() => updateChorus({ mode: m, enabled: m > 0 })}
                          className={clsx("px-2.5 py-1 text-[10px] font-bold rounded border transition-all",
                            activeMode === m ? "bg-green-500 text-white border-green-400" : "bg-black/50 text-green-400/50 border-green-900/40 hover:border-green-500/50"
                          )}>
                          {m === 0 ? 'Off' : m}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-400 flex-shrink-0 w-8">Mix</span>
                  <input type="range" min={0} max={1} step={0.01} value={config.chorus?.mix ?? 0.5}
                    onChange={(e) => updateChorus({ mix: parseFloat(e.target.value) })}
                    className="flex-1 h-1.5 accent-green-500 cursor-pointer" style={{ minWidth: '80px' }} />
                  <span className="text-[10px] text-gray-300 w-8 text-right tabular-nums">{Math.round((config.chorus?.mix ?? 0.5) * 100)}%</span>
                </div>
              </div>
              <div className="w-px self-stretch bg-gray-800 flex-shrink-0" />
              {/* Delay */}
              <div className="flex flex-col gap-1.5 flex-1">
                <span className="text-[9px] font-bold text-green-400/60 tracking-wider">DELAY</span>
                {([
                  { label: 'Time', key: 'time', min: 0, max: 16, step: 1, value: config.delay?.time ?? 3, fmt: (v: number) => `${v} 16ths` },
                  { label: 'Feedback', key: 'feedback', min: 0, max: 1, step: 0.01, value: config.delay?.feedback ?? 0.3, fmt: (v: number) => `${Math.round(v * 100)}%` },
                  { label: 'Tone', key: 'tone', min: 0, max: 1, step: 0.01, value: config.delay?.tone ?? 0.5, fmt: (v: number) => v < 0.4 ? 'LP' : v > 0.6 ? 'HP' : 'Bypass' },
                  { label: 'Mix', key: 'mix', min: 0, max: 1, step: 0.01, value: config.delay?.mix ?? 0, fmt: (v: number) => `${Math.round(v * 100)}%` },
                  { label: 'Spread', key: 'stereo', min: 0, max: 1, step: 0.01, value: config.delay?.stereo ?? 0.75, fmt: (v: number) => `${Math.round(v * 100)}%` },
                ] as const).map(s => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-400 w-14 flex-shrink-0">{s.label}</span>
                    <input type="range" min={s.min} max={s.max} step={s.step} value={s.value}
                      onChange={(e) => {
                        const raw = parseFloat(e.target.value);
                        updateDelay(s.key as string, 'convert' in s ? (s as { convert: (v: number) => number }).convert(raw) : raw);
                      }}
                      className="flex-1 h-1.5 accent-green-500 cursor-pointer" />
                    <span className="text-[10px] text-gray-300 w-14 text-right tabular-nums">{s.fmt(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
            <select value="" onChange={(e) => { const p = TB303_PRESETS.find(pr => pr.name === e.target.value); if (p) { if (onPresetLoad) { onPresetLoad(p); } else if (p.tb303) { onChange(p.tb303 as Partial<TB303Config>); } } }} className="bg-[#111] text-[10px] text-accent-primary border border-gray-800 rounded px-2 py-1 outline-none focus:border-accent-primary transition-colors max-w-[160px]">
              <option value="" disabled>Load Preset...</option>{TB303_PRESETS.map((p) => (<option key={p.name} value={p.name}>{p.name}{p.effects?.length ? ` [${p.effects.length} FX]` : ''}</option>))}
            </select>
          </div>
        </div>
        {/* Waveform Scope + Filter Response */}
        {instrumentId !== undefined && (
          <div className="absolute pointer-events-none" style={{ top: '10px', left: '480px', right: '20px', height: '80px' }}>
            <div className="viz-frame w-full h-full">
              <div className="viz-frame__content">
                <DB303Scope config={config} instrumentId={instrumentId} />
                <DB303DiagnosticsOverlay instrumentId={instrumentId} />
              </div>
              <div className="viz-frame__glass" />
              <div className="viz-frame__vignette" />
            </div>
          </div>
        )}
        {/* Header Actions (popout/collapse/close buttons) */}
        {headerActions && (
          <div className="absolute top-2 right-5 z-10 flex items-center gap-1">
            {headerActions}
          </div>
        )}

        {/* Quick Tips Bar */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-4 py-1.5 bg-black/50 border-t border-white/5">
          <Lightbulb size={12} className="text-yellow-500/70 flex-shrink-0" />
          <button onClick={() => cycleTip(-1)} className="text-gray-600 hover:text-gray-400 text-[10px] flex-shrink-0 px-0.5">&lsaquo;</button>
          <span
            className={clsx(
              "text-[10px] text-gray-400 flex-1 transition-opacity duration-200 min-w-0 truncate",
              tipFading ? "opacity-0" : "opacity-100"
            )}
            title={TB303_QUICK_TIPS[tipIndex]}
          >
            {TB303_QUICK_TIPS[tipIndex]}
          </span>
          <button onClick={() => cycleTip(1)} className="text-gray-600 hover:text-gray-400 text-[10px] flex-shrink-0 px-0.5">&rsaquo;</button>
          <span className="text-[7px] text-gray-600 font-mono flex-shrink-0 ml-2">V{CURRENT_VERSION}</span>
        </div>
      </div>
    </div>
  );
});

JC303StyledKnobPanel.displayName = 'JC303StyledKnobPanel';
