/**
 * RonKlarenControls.tsx -- Ron Klaren Sound Module instrument editor
 *
 * Exposes all RonKlarenConfig parameters: oscillator phase, vibrato,
 * 4-point ADSR envelope, and waveform display.
 *
 * Sections:
 *  - Oscillator: phaseSpeed, phaseLengthInWords, phaseValue, phaseDirection, phasePosition
 *  - Vibrato: vibratoSpeed, vibratoDepth, vibratoDelay
 *  - ADSR: 4-point envelope (point + increment per stage)
 *  - Waveform: visual display of PCM data (read-only)
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { RonKlarenConfig } from '@/types/instrument/exotic';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel } from '@components/instruments/shared';
import { RonKlarenEngine } from '@/engine/ronklaren/RonKlarenEngine';

interface RonKlarenControlsProps {
  config: RonKlarenConfig;
  onChange: (updates: Partial<RonKlarenConfig>) => void;
}

type RKTab = 'main' | 'adsr' | 'waveform';

const ADSR_LABELS = ['Attack', 'Decay', 'Sustain', 'Release'];

export const RonKlarenControls: React.FC<RonKlarenControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<RKTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#66bbff', { knob: '#88ccff', dim: '#001a33' });

  const upd = useCallback(<K extends keyof RonKlarenConfig>(key: K, value: RonKlarenConfig[K]) => {
    onChange({ [key]: value } as Partial<RonKlarenConfig>);

    // Push numeric values to the running WASM engine
    if (typeof value === 'number' && RonKlarenEngine.hasInstance()) {
      RonKlarenEngine.getInstance().setInstrumentParam(0, key, value);
    }
    if (typeof value === 'boolean' && RonKlarenEngine.hasInstance()) {
      RonKlarenEngine.getInstance().setInstrumentParam(0, key, value ? 1 : 0);
    }
  }, [onChange]);

  const updateAdsrEntry = useCallback((index: number, field: 'point' | 'increment', value: number) => {
    const newAdsr = configRef.current.adsr.map((e, i) =>
      i === index ? { ...e, [field]: value } : { ...e }
    );
    onChange({ adsr: newAdsr });

    // Push to WASM: C params are "adsrPoint0"-"adsrPoint3" / "adsrIncrement0"-"adsrIncrement3"
    if (RonKlarenEngine.hasInstance()) {
      const paramName = field === 'point' ? `adsrPoint${index}` : `adsrIncrement${index}`;
      RonKlarenEngine.getInstance().setInstrumentParam(0, paramName, value);
    }
  }, [onChange]);

  // -- MAIN TAB ---
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Oscillator / Phase" />
        <div className="flex flex-wrap gap-4">
          <Knob value={config.phaseSpeed} min={0} max={255} step={1}
            onChange={(v) => upd('phaseSpeed', Math.round(v))}
            label="Phase Speed" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.phaseLengthInWords} min={0} max={255} step={1}
            onChange={(v) => upd('phaseLengthInWords', Math.round(v))}
            label="Phase Length" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.phaseValue} min={-128} max={127} step={1}
            onChange={(v) => upd('phaseValue', Math.round(v))}
            label="Phase Value" color={knob} formatValue={(v) => {
              const n = Math.round(v);
              return n > 0 ? `+${n}` : n.toString();
            }} />
          <Knob value={config.phasePosition} min={0} max={255} step={1}
            onChange={(v) => upd('phasePosition', Math.round(v))}
            label="Phase Pos" color={knob} formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div className="flex items-center gap-3 mt-3">
          <label className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider" style={{ color: accent }}>
            <input
              type="checkbox"
              checked={config.phaseDirection}
              onChange={(e) => upd('phaseDirection', e.target.checked)}
              className="accent-current"
              style={{ accentColor: accent }}
            />
            Reverse Direction
          </label>
          <span className="text-[10px] font-mono" style={{ color: '#666' }}>
            {config.isSample ? '(Sample mode)' : '(Synthesis mode)'}
          </span>
        </div>
      </div>

      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Vibrato" />
        <div className="flex gap-4">
          <Knob value={config.vibratoDelay} min={0} max={255} step={1}
            onChange={(v) => upd('vibratoDelay', Math.round(v))}
            label="Delay" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoSpeed} min={0} max={255} step={1}
            onChange={(v) => upd('vibratoSpeed', Math.round(v))}
            label="Speed" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoDepth} min={0} max={255} step={1}
            onChange={(v) => upd('vibratoDepth', Math.round(v))}
            label="Depth" color={knob} formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
    </div>
  );

  // -- ADSR TAB ---
  const renderAdsr = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="4-Point Envelope" />
        <div className="grid grid-cols-4 gap-4">
          {config.adsr.map((entry, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: accent }}>
                {ADSR_LABELS[i] ?? `Stage ${i + 1}`}
              </span>
              <Knob value={entry.point} min={0} max={255} step={1}
                onChange={(v) => updateAdsrEntry(i, 'point', Math.round(v))}
                label="Level" color={knob} formatValue={(v) => Math.round(v).toString()} />
              <Knob value={entry.increment} min={0} max={255} step={1}
                onChange={(v) => updateAdsrEntry(i, 'increment', Math.round(v))}
                label="Rate" color={knob} formatValue={(v) => Math.round(v).toString()} />
            </div>
          ))}
        </div>
        {/* Simple envelope visualization */}
        <AdsrVisual adsr={config.adsr} color={accent} dim={dim} />
      </div>
    </div>
  );

  // -- WAVEFORM TAB ---
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveData = config.waveformData;

  useEffect(() => {
    if (activeTab !== 'waveform') return;
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#000a1a';
    ctx.fillRect(0, 0, W, H);

    // Center line
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    if (!waveData || waveData.length === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '11px monospace';
      ctx.fillText('(no waveform data)', 8, H / 2 - 6);
      return;
    }

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.max(1, Math.floor(waveData.length / W));
    for (let x = 0; x < W; x++) {
      const i = Math.min(waveData.length - 1, x * step);
      const s = waveData[i];
      const y = H / 2 - (s / 128) * (H / 2 - 2);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [activeTab, waveData, accent, dim]);

  const renderWaveform = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Waveform Data (read-only)" />
        <canvas
          ref={waveCanvasRef}
          width={480}
          height={96}
          className="w-full rounded"
          style={{ background: '#000a1a', border: `1px solid ${dim}`, imageRendering: 'pixelated' }}
        />
        <div className="mt-2 text-[10px] font-mono" style={{ color: '#888' }}>
          {waveData && waveData.length > 0
            ? `${waveData.length} bytes (${config.phaseLengthInWords} words)`
            : 'No waveform data'}
        </div>
      </div>
    </div>
  );

  const TABS: { id: RKTab; label: string }[] = [
    { id: 'main',     label: 'Oscillator' },
    { id: 'adsr',     label: 'Envelope' },
    { id: 'waveform', label: 'Waveform' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center border-b" style={{ borderColor: dim }}>
        {TABS.map(({ id, label }) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? '#001520' : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'main'     && renderMain()}
      {activeTab === 'adsr'     && renderAdsr()}
      {activeTab === 'waveform' && renderWaveform()}
    </div>
  );
};

// -- Simple ADSR curve visualization ---
const AdsrVisual: React.FC<{
  adsr: Array<{ point: number; increment: number }>;
  color: string;
  dim: string;
}> = ({ adsr, color, dim: dimColor }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#000a1a';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const x = (W / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // Draw envelope curve through 4 ADSR points
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Start at 0
    ctx.moveTo(0, H);

    // Each segment uses increment as duration (higher = faster), point as target level
    const segW = W / 4;
    for (let i = 0; i < Math.min(adsr.length, 4); i++) {
      const x = segW * (i + 1);
      const y = H - (adsr[i].point / 255) * (H - 4);
      ctx.lineTo(x, y);
    }

    ctx.stroke();

    // Labels
    ctx.fillStyle = color + '88';
    ctx.font = '9px monospace';
    const labels = ['A', 'D', 'S', 'R'];
    for (let i = 0; i < Math.min(adsr.length, 4); i++) {
      ctx.fillText(labels[i], segW * i + 4, 12);
    }
  }, [adsr, color, dimColor]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={48}
      className="w-full mt-2 rounded"
      style={{ background: '#000a1a', border: `1px solid ${dimColor}` }}
    />
  );
};
