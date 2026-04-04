/**
 * StartrekkerAMControls.tsx — Editable StarTrekker AM synthesis parameters
 *
 * Visual synth editor with knobs for the 5-phase ADSR envelope, waveform selector,
 * vibrato controls, and period shift. Changes sent to WASM engine in real-time.
 */

import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import type { StartrekkerAMConfig } from '@typedefs/instrument/exotic';
import { StartrekkerAMEngine } from '@/engine/startrekker-am/StartrekkerAMEngine';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { Waves, Activity, Zap, Radio } from 'lucide-react';

interface StartrekkerAMControlsProps {
  config: StartrekkerAMConfig | null;
  instrumentName: string;
  instrumentId?: number;
  onChange?: (config: StartrekkerAMConfig) => void;
}

const WAVEFORM_NAMES = ['Sine', 'Sawtooth', 'Square', 'Noise'];

// NT byte offsets for each parameter
const NT_OFFSETS: Record<keyof StartrekkerAMConfig, number> = {
  waveform: 26, basePeriod: 6,
  attackTarget: 8, attackRate: 10,
  attack2Target: 12, attack2Rate: 14,
  decayTarget: 16, decayRate: 18,
  sustainCount: 20, releaseRate: 24,
  vibFreqStep: 28, vibAmplitude: 30,
  periodShift: 34,
};

function EnvelopeViz({ config, accentColor }: { config: StartrekkerAMConfig; accentColor: string }) {
  const path = useMemo(() => {
    const w = 320, h = 72, maxAmpl = 256;
    const norm = (v: number) => Math.max(0, Math.min(1, (v + maxAmpl) / (maxAmpl * 2)));
    const startY = norm(Math.min(config.basePeriod, maxAmpl));
    const atkY = norm(config.attackTarget);
    const atk2Y = norm(config.attack2Target);
    const decY = norm(config.decayTarget);
    const atkRate = Math.max(1, Math.abs(config.attackRate));
    const atk2Rate = Math.max(1, Math.abs(config.attack2Rate));
    const decRate = Math.max(1, Math.abs(config.decayRate));
    const susLen = Math.max(1, config.sustainCount);
    const relRate = Math.max(1, Math.abs(config.releaseRate));
    const totalTime = (Math.abs(config.attackTarget - config.basePeriod) / atkRate)
      + (Math.abs(config.attack2Target - config.attackTarget) / atk2Rate)
      + (Math.abs(config.decayTarget - config.attack2Target) / decRate)
      + susLen + (Math.abs(config.decayTarget) / relRate);
    const scale = totalTime > 0 ? w / totalTime : w / 5;
    let x = 0;
    const pts: string[] = [];
    const toY = (v: number) => h - v * (h - 4) - 2;
    pts.push(`M 0 ${toY(startY).toFixed(1)}`);
    x += (Math.abs(config.attackTarget - config.basePeriod) / atkRate) * scale;
    pts.push(`L ${Math.min(x, w).toFixed(1)} ${toY(atkY).toFixed(1)}`);
    x += (Math.abs(config.attack2Target - config.attackTarget) / atk2Rate) * scale;
    pts.push(`L ${Math.min(x, w).toFixed(1)} ${toY(atk2Y).toFixed(1)}`);
    x += (Math.abs(config.decayTarget - config.attack2Target) / decRate) * scale;
    pts.push(`L ${Math.min(x, w).toFixed(1)} ${toY(decY).toFixed(1)}`);
    x += susLen * scale;
    pts.push(`L ${Math.min(x, w).toFixed(1)} ${toY(decY).toFixed(1)}`);
    x += (config.decayTarget > 0 ? Math.abs(config.decayTarget) / relRate : 10) * scale;
    pts.push(`L ${Math.min(x, w).toFixed(1)} ${toY(0).toFixed(1)}`);
    return pts.join(' ');
  }, [config]);

  // Fill path (same shape closed to bottom)
  const fillPath = path + ` L 320 72 L 0 72 Z`;

  return (
    <svg viewBox="0 0 320 72" className="w-full h-20 rounded-lg overflow-hidden">
      <defs>
        <linearGradient id="envGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <rect width="320" height="72" fill="rgba(0,0,0,0.4)" />
      {/* Grid */}
      <line x1="0" y1="36" x2="320" y2="36" stroke="rgba(255,255,255,0.06)" />
      <line x1="0" y1="18" x2="320" y2="18" stroke="rgba(255,255,255,0.03)" />
      <line x1="0" y1="54" x2="320" y2="54" stroke="rgba(255,255,255,0.03)" />
      {/* Envelope fill */}
      <path d={fillPath} fill="url(#envGrad)" />
      {/* Envelope line */}
      <path d={path} fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinejoin="round" />
      {/* Phase labels */}
      {['ATK', 'ATK2', 'DEC', 'SUS', 'REL'].map((label, i) => (
        <text key={label} x={16 + i * 62} y="68" fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="monospace">{label}</text>
      ))}
    </svg>
  );
}

function useAMPreview(config: StartrekkerAMConfig | null) {
  const oscRef = useRef<Tone.Oscillator | null>(null);
  const envRef = useRef<Tone.AmplitudeEnvelope | null>(null);
  return useCallback(async () => {
    if (!config) return;
    await Tone.start();
    if (oscRef.current) { try { oscRef.current.stop(); oscRef.current.dispose(); } catch { /* */ } }
    if (envRef.current) { try { envRef.current.dispose(); } catch { /* */ } }
    const wfTypes: OscillatorType[] = ['sine', 'sawtooth', 'square', 'square'];
    const wf = wfTypes[config.waveform] ?? 'sine';
    const osc = new Tone.Oscillator(262, wf).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: Math.max(0.01, config.attackRate > 0 ? 0.05 : 0.01),
      decay: Math.max(0.05, config.decayRate > 0 ? 0.2 : 0.05),
      sustain: config.sustainCount > 0 ? 0.5 : 0.3,
      release: Math.max(0.05, config.releaseRate > 0 ? 0.3 : 0.1),
    }).toDestination();
    osc.connect(env);
    oscRef.current = osc;
    envRef.current = env;
    osc.start();
    env.triggerAttackRelease(0.5);
    setTimeout(() => {
      try { osc.stop(); osc.dispose(); env.dispose(); } catch { /* */ }
      if (oscRef.current === osc) oscRef.current = null;
      if (envRef.current === env) envRef.current = null;
    }, 1000);
  }, [config]);
}

export const StartrekkerAMControls: React.FC<StartrekkerAMControlsProps> = ({
  config,
  instrumentName,
  instrumentId,
  onChange,
}) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor } = useInstrumentColors('#00cccc', { knob: '#00dddd' });
  const sectionBorder = isCyanTheme ? 'border-accent-highlight/20' : 'border-[#1a3a3a]';
  const sectionBg = isCyanTheme ? 'bg-[#051515]' : 'bg-[#0a1a1a]';

  const updateParam = useCallback((key: keyof StartrekkerAMConfig, value: number) => {
    if (!configRef.current) return;
    const updated = { ...configRef.current, [key]: value };
    if (instrumentId && StartrekkerAMEngine.hasInstance()) {
      const offset = NT_OFFSETS[key];
      if (offset !== undefined) {
        const wasmVal = key === 'waveform' ? (value & 0x03) : (value & 0xFFFF);
        StartrekkerAMEngine.getInstance().setNtParam(instrumentId, offset, wasmVal);
      }
    }
    if (onChange) onChange(updated);
  }, [instrumentId, onChange]);

  const playPreview = useAMPreview(config);

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-text-muted gap-3">
        <Radio size={32} className="opacity-30" />
        <div className="text-lg font-bold">{instrumentName}</div>
        <div className="text-sm opacity-60">PCM sample instrument</div>
        <div className="text-xs opacity-40">AM parameters are stored in the .nt companion file</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2 p-2">
      {/* ── Waveform Section ── */}
      <div className={`p-2 rounded-lg border ${sectionBg} ${sectionBorder}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Waves size={16} style={{ color: accentColor }} />
            <h3 className="font-bold" style={{ color: accentColor }}>WAVEFORM</h3>
          </div>
          <button
            onClick={playPreview}
            className="px-3 py-1 rounded-full text-xs font-bold transition-all hover:scale-105"
            style={{ backgroundColor: accentColor + '20', color: accentColor, border: `1px solid ${accentColor}40` }}
          >
            Preview
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-center">
          {/* Waveform selector */}
          <div className="flex gap-2">
            {WAVEFORM_NAMES.map((name, i) => (
              <button
                key={i}
                onClick={() => updateParam('waveform', i)}
                className="w-12 h-12 rounded-lg border transition-all flex flex-col items-center justify-center gap-0.5"
                style={config.waveform === i ? {
                  borderColor: accentColor,
                  backgroundColor: accentColor + '15',
                  boxShadow: `0 0 12px ${accentColor}30`,
                } : {
                  borderColor: 'rgba(255,255,255,0.1)',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                }}
              >
                {i === 0 && <Waves size={14} color={config.waveform === i ? accentColor : '#555'} />}
                {i === 1 && <Activity size={14} color={config.waveform === i ? accentColor : '#555'} />}
                {i === 2 && <div className="w-3.5 h-3.5 border-t-2 border-r-2 border-b-0 border-l-2" style={{ borderColor: config.waveform === i ? accentColor : '#555' }} />}
                {i === 3 && <Zap size={14} color={config.waveform === i ? accentColor : '#555'} />}
                <span className="text-[8px] uppercase" style={{ color: config.waveform === i ? accentColor : '#555' }}>{name}</span>
              </button>
            ))}
          </div>

          <Knob value={config.periodShift} min={0} max={15} onChange={(v) => updateParam('periodShift', Math.round(v))}
            label="Shift" color={knobColor} formatValue={(v) => `${Math.round(v)}`} />
          <Knob value={config.basePeriod} min={0} max={512} onChange={(v) => updateParam('basePeriod', Math.round(v))}
            label="Base Amp" color={knobColor} formatValue={(v) => `${Math.round(v)}`} />
        </div>
      </div>

      {/* ── Envelope Section ── */}
      <div className={`p-2 rounded-lg border ${sectionBg} ${sectionBorder}`}>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} style={{ color: accentColor }} />
          <h3 className="font-bold" style={{ color: accentColor }}>ENVELOPE</h3>
          <span className="text-[10px] text-text-muted ml-auto">5-Phase ADSR</span>
        </div>

        <EnvelopeViz config={config} accentColor={accentColor} />

        <div className="grid grid-cols-5 gap-3 mt-4">
          {/* Attack 1 */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: accentColor }}>Attack 1</span>
            <Knob value={config.attackTarget} min={-256} max={256} onChange={(v) => updateParam('attackTarget', Math.round(v))}
              label="Target" color={knobColor} formatValue={(v) => `${Math.round(v)}`} />
            <Knob value={config.attackRate} min={0} max={128} onChange={(v) => updateParam('attackRate', Math.round(v))}
              label="Rate" color={knobColor} formatValue={(v) => `${Math.round(v)}`} />
          </div>

          {/* Attack 2 */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: accentColor }}>Attack 2</span>
            <Knob value={config.attack2Target} min={-256} max={256} onChange={(v) => updateParam('attack2Target', Math.round(v))}
              label="Target" color={knobColor} formatValue={(v) => `${Math.round(v)}`} />
            <Knob value={config.attack2Rate} min={0} max={128} onChange={(v) => updateParam('attack2Rate', Math.round(v))}
              label="Rate" color={knobColor} formatValue={(v) => `${Math.round(v)}`} />
          </div>

          {/* Decay */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: accentColor }}>Decay</span>
            <Knob value={config.decayTarget} min={-256} max={256} onChange={(v) => updateParam('decayTarget', Math.round(v))}
              label="Target" color={knobColor} formatValue={(v) => `${Math.round(v)}`} />
            <Knob value={config.decayRate} min={0} max={128} onChange={(v) => updateParam('decayRate', Math.round(v))}
              label="Rate" color={knobColor} formatValue={(v) => `${Math.round(v)}`} />
          </div>

          {/* Sustain */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: accentColor }}>Sustain</span>
            <Knob value={config.sustainCount} min={0} max={999} onChange={(v) => updateParam('sustainCount', Math.round(v))}
              label="Length" color={knobColor} formatValue={(v) => `${Math.round(v)}`} />
          </div>

          {/* Release */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: accentColor }}>Release</span>
            <Knob value={config.releaseRate} min={0} max={128} onChange={(v) => updateParam('releaseRate', Math.round(v))}
              label="Rate" color={knobColor} formatValue={(v) => `${Math.round(v)}`} />
          </div>
        </div>
      </div>

      {/* ── Vibrato Section ── */}
      <div className={`p-2 rounded-lg border ${sectionBg} ${sectionBorder}`}>
        <div className="flex items-center gap-2 mb-2">
          <Waves size={16} style={{ color: '#22c55e' }} />
          <h3 className="font-bold text-emerald-400">VIBRATO</h3>
        </div>

        <div className="flex gap-3 items-center justify-center">
          <Knob value={config.vibFreqStep} min={0} max={500} onChange={(v) => updateParam('vibFreqStep', Math.round(v))}
            label="Speed" color="#22c55e" formatValue={(v) => `${Math.round(v)}`} />
          <Knob value={Math.abs(config.vibAmplitude)} min={0} max={256} onChange={(v) => updateParam('vibAmplitude', Math.round(v) * (config.vibAmplitude < 0 ? -1 : 1))}
            label="Depth" color="#22c55e" formatValue={(v) => `${Math.round(v)}`} />
        </div>
      </div>
    </div>
  );
};
