/**
 * SonicArrangerControls.tsx — Sonic Arranger instrument editor
 *
 * Exposes all SonicArrangerConfig parameters across 3 tabs:
 *  - Synthesis: effect mode, effect args, waveform display
 *  - Envelope: volume, fine tuning, ADSR table, AMF table
 *  - Modulation: vibrato, portamento, arpeggio tables
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { SonicArrangerConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';

interface SonicArrangerControlsProps {
  config: SonicArrangerConfig;
  onChange: (updates: Partial<SonicArrangerConfig>) => void;
}

type SATab = 'synthesis' | 'envelope' | 'modulation';

// ── Effect mode definitions ──────────────────────────────────────────────────

const EFFECT_MODES: { value: number; name: string }[] = [
  { value: 0,  name: 'None' },
  { value: 1,  name: 'Wave Negator' },
  { value: 2,  name: 'Free Negator' },
  { value: 3,  name: 'Rotate Vertical' },
  { value: 4,  name: 'Rotate Horizontal' },
  { value: 5,  name: 'Alien Voice' },
  { value: 6,  name: 'Poly Negator' },
  { value: 7,  name: 'Shack Wave 1' },
  { value: 8,  name: 'Shack Wave 2' },
  { value: 9,  name: 'Metamorph' },
  { value: 10, name: 'Laser' },
  { value: 11, name: 'Wave Alias' },
  { value: 12, name: 'Noise Generator 1' },
  { value: 13, name: 'Low Pass Filter 1' },
  { value: 14, name: 'Low Pass Filter 2' },
  { value: 15, name: 'Oszilator' },
  { value: 16, name: 'Noise Generator 2' },
  { value: 17, name: 'FM Drum' },
];

/** Context-sensitive label for effectArg1 based on the active effect mode. */
function arg1Label(mode: number): string {
  if (mode === 9 || mode === 15) return 'Target Wave';
  if (mode === 3 || mode === 11) return 'Delta';
  if (mode === 5 || mode === 7 || mode === 8) return 'Source Wave';
  return 'Arg 1';
}

/** Context-sensitive label for effectArg2 based on the active effect mode. */
function arg2Label(mode: number): string {
  if (mode === 10 || mode === 17) return 'Detune';
  return 'Start Pos';
}

/** Context-sensitive label for effectArg3 based on the active effect mode. */
function arg3Label(mode: number): string {
  if (mode === 10) return 'Repeats';
  if (mode === 17) return 'Threshold';
  return 'Stop Pos';
}

// ── Tiny canvas-based visualizations ─────────────────────────────────────────

/** Waveform line graph — 128 signed int8 samples rendered to a small canvas. */
const WaveformLineCanvas: React.FC<{
  data: number[];
  width: number;
  height: number;
  color: string;
}> = ({ data, width, height, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // centre line
    ctx.strokeStyle = 'var(--color-border)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (data.length === 0) return;

    // waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const len = Math.min(data.length, 128);
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * width;
      // data is signed int8 (-128..127), map to canvas Y (top=0, bottom=height)
      const y = ((1 - (data[i] + 128) / 255) * (height - 2)) + 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [data, width, height, color]);

  return <canvas ref={canvasRef} width={width} height={height} className="rounded" />;
};

/** Bar chart for ADSR table (128 uint8 values 0-255). */
const BarChart: React.FC<{
  data: number[];
  width: number;
  height: number;
  color: string;
  signed?: boolean;
}> = ({ data, width, height, color, signed }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    if (data.length === 0) return;

    const len = Math.min(data.length, 128);
    const barW = Math.max(1, width / len);

    if (signed) {
      // centre line
      ctx.strokeStyle = 'var(--color-border)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      ctx.fillStyle = color;
      for (let i = 0; i < len; i++) {
        const v = data[i]; // -128..127
        const normH = (Math.abs(v) / 128) * (height / 2);
        const x = (i / len) * width;
        if (v >= 0) {
          ctx.fillRect(x, height / 2 - normH, barW, normH);
        } else {
          ctx.fillRect(x, height / 2, barW, normH);
        }
      }
    } else {
      ctx.fillStyle = color;
      for (let i = 0; i < len; i++) {
        const v = data[i]; // 0-255
        const barH = (v / 255) * height;
        const x = (i / len) * width;
        ctx.fillRect(x, height - barH, barW, barH);
      }
    }
  }, [data, width, height, color, signed]);

  return <canvas ref={canvasRef} width={width} height={height} className="rounded" />;
};

// ── Component ────────────────────────────────────────────────────────────────

export const SonicArrangerControls: React.FC<SonicArrangerControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<SATab>('synthesis');

  // --- configRef pattern (from CLAUDE.md) ---
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#ff8844';
  const knob    = isCyan ? '#00ffff' : '#ffaa66';
  const dim     = isCyan ? '#004444' : '#331a00';
  const panelBg = isCyan ? 'bg-[#041510] border-accent-highlight/20' : 'bg-[#140a00] border-orange-900/30';

  const updateParam = useCallback((key: keyof SonicArrangerConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}>
      {label}
    </div>
  );

  // ── SYNTHESIS TAB ──────────────────────────────────────────────────────────

  const renderSynthesis = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Effect Mode selector */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Synthesis Effect" />
        <select
          value={config.effect}
          onChange={(e) => updateParam('effect', parseInt(e.target.value))}
          className="w-full text-xs font-mono border rounded px-2 py-1.5 mb-3"
          style={{ background: '#0a0a0a', borderColor: dim, color: accent }}
        >
          {EFFECT_MODES.map((m) => (
            <option key={m.value} value={m.value} style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}>
              {m.value}: {m.name}
            </option>
          ))}
        </select>

        {/* Effect argument knobs */}
        <div className="flex gap-3 flex-wrap">
          <Knob value={config.effectArg1} min={0} max={127} step={1}
            onChange={(v) => updateParam('effectArg1', Math.round(v))}
            label={arg1Label(config.effect)} color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.effectArg2} min={0} max={127} step={1}
            onChange={(v) => updateParam('effectArg2', Math.round(v))}
            label={arg2Label(config.effect)} color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.effectArg3} min={0} max={127} step={1}
            onChange={(v) => updateParam('effectArg3', Math.round(v))}
            label={arg3Label(config.effect)} color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.effectDelay} min={1} max={255} step={1}
            onChange={(v) => updateParam('effectDelay', Math.round(v))}
            label="Effect Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Waveform display */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Waveform" />
        <WaveformLineCanvas
          data={config.waveformData}
          width={320} height={72}
          color={accent}
        />
        <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted">
          <span>Wave #{config.waveformNumber}</span>
          <span>Length: {config.waveformLength} words</span>
        </div>
      </div>
    </div>
  );

  // ── ENVELOPE TAB ───────────────────────────────────────────────────────────

  const renderEnvelope = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Volume + Fine Tuning */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Volume & Tuning" />
        <div className="flex gap-4">
          <Knob value={config.volume} min={0} max={64} step={1}
            onChange={(v) => updateParam('volume', Math.round(v))}
            label="Volume" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.fineTuning} min={-128} max={127} step={1}
            onChange={(v) => updateParam('fineTuning', Math.round(v))}
            label="Fine Tune" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* ADSR Section */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="ADSR Envelope" />
        <BarChart
          data={config.adsrTable}
          width={320} height={56}
          color={accent}
        />
        <div className="flex gap-3 flex-wrap mt-3">
          <Knob value={config.adsrDelay} min={0} max={255} step={1}
            onChange={(v) => updateParam('adsrDelay', Math.round(v))}
            label="Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.adsrLength} min={0} max={127} step={1}
            onChange={(v) => updateParam('adsrLength', Math.round(v))}
            label="Length" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.adsrRepeat} min={0} max={127} step={1}
            onChange={(v) => updateParam('adsrRepeat', Math.round(v))}
            label="Repeat" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.sustainPoint} min={0} max={127} step={1}
            onChange={(v) => updateParam('sustainPoint', Math.round(v))}
            label="Sus Point" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.sustainDelay} min={0} max={255} step={1}
            onChange={(v) => updateParam('sustainDelay', Math.round(v))}
            label="Sus Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* AMF Section */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="AMF (Pitch Modulation)" />
        <BarChart
          data={config.amfTable}
          width={320} height={56}
          color={accent}
          signed
        />
        <div className="flex gap-3 mt-3">
          <Knob value={config.amfDelay} min={0} max={255} step={1}
            onChange={(v) => updateParam('amfDelay', Math.round(v))}
            label="Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.amfLength} min={0} max={127} step={1}
            onChange={(v) => updateParam('amfLength', Math.round(v))}
            label="Length" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.amfRepeat} min={0} max={127} step={1}
            onChange={(v) => updateParam('amfRepeat', Math.round(v))}
            label="Repeat" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
    </div>
  );

  // ── MODULATION TAB ─────────────────────────────────────────────────────────

  /** Update a single field in one arpeggio sub-table. */
  const updateArpField = useCallback(
    (index: 0 | 1 | 2, field: 'length' | 'repeat', value: number) => {
      const arps = configRef.current.arpeggios.map((a, i) =>
        i === index ? { ...a, [field]: value } : { ...a },
      ) as SonicArrangerConfig['arpeggios'];
      onChange({ ...configRef.current, arpeggios: arps });
    },
    [onChange],
  );

  /** Update a single value entry in one arpeggio sub-table. */
  const updateArpValue = useCallback(
    (tableIdx: 0 | 1 | 2, entryIdx: number, value: number) => {
      const arps = configRef.current.arpeggios.map((a, i) => {
        if (i !== tableIdx) return { ...a };
        const vals = [...a.values];
        vals[entryIdx] = value;
        return { ...a, values: vals };
      }) as SonicArrangerConfig['arpeggios'];
      onChange({ ...configRef.current, arpeggios: arps });
    },
    [onChange],
  );

  const renderModulation = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vibrato" />
        <div className="flex gap-3">
          <Knob value={config.vibratoDelay} min={0} max={255} step={1}
            onChange={(v) => updateParam('vibratoDelay', Math.round(v))}
            label="Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoSpeed} min={0} max={65535} step={1}
            onChange={(v) => updateParam('vibratoSpeed', Math.round(v))}
            label="Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoLevel} min={0} max={65535} step={1}
            onChange={(v) => updateParam('vibratoLevel', Math.round(v))}
            label="Level" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Portamento */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Portamento" />
        <div className="flex items-center gap-4">
          <Knob value={config.portamentoSpeed} min={0} max={65535} step={1}
            onChange={(v) => updateParam('portamentoSpeed', Math.round(v))}
            label="Speed" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <span className="text-[10px] text-text-muted">0 = disabled</span>
        </div>
      </div>

      {/* Arpeggio tables (3 sub-tables) */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Arpeggio Tables" />
        <div className="flex flex-col gap-3">
          {([0, 1, 2] as const).map((tIdx) => {
            const arp = config.arpeggios[tIdx];
            return (
              <div key={tIdx} className="rounded border p-2" style={{ borderColor: dim, background: '#0a0a0a' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold" style={{ color: accent }}>
                    Arp {tIdx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-text-muted">Len</label>
                    <input
                      type="number" min={0} max={14}
                      value={arp.length}
                      onChange={(e) => updateArpField(tIdx, 'length', Math.max(0, Math.min(14, parseInt(e.target.value) || 0)))}
                      className="w-10 text-[10px] font-mono text-center border rounded px-1 py-0.5"
                      style={{ background: 'var(--color-bg-secondary)', borderColor: dim, color: 'var(--color-text-secondary)' }}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-text-muted">Rep</label>
                    <input
                      type="number" min={0} max={14}
                      value={arp.repeat}
                      onChange={(e) => updateArpField(tIdx, 'repeat', Math.max(0, Math.min(14, parseInt(e.target.value) || 0)))}
                      className="w-10 text-[10px] font-mono text-center border rounded px-1 py-0.5"
                      style={{ background: 'var(--color-bg-secondary)', borderColor: dim, color: 'var(--color-text-secondary)' }}
                    />
                  </div>
                </div>
                {/* 14 value cells in a row */}
                <div className="flex gap-0.5">
                  {arp.values.slice(0, 14).map((val, vIdx) => {
                    const inRange = vIdx < arp.length;
                    const inLoop = arp.length > 0 && arp.repeat > 0 && vIdx >= (arp.length - arp.repeat) && vIdx < arp.length;
                    return (
                      <input
                        key={vIdx}
                        type="number" min={-128} max={127}
                        value={val}
                        onChange={(e) => updateArpValue(tIdx, vIdx, Math.max(-128, Math.min(127, parseInt(e.target.value) || 0)))}
                        className="w-7 text-[9px] font-mono text-center border rounded py-0.5"
                        style={{
                          background: inLoop ? accent + '18' : inRange ? '#111' : '#080808',
                          borderColor: inLoop ? accent + '44' : inRange ? 'var(--color-border-light)' : 'var(--color-bg-tertiary)',
                          color: inRange ? '#ccc' : '#444',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── Tab bar + render ───────────────────────────────────────────────────────

  const tabs = useMemo(() => [
    ['synthesis', 'Synthesis'],
    ['envelope', 'Envelope'],
    ['modulation', 'Modulation'],
  ] as const, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: dim }}>
        {tabs.map(([id, label]) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#140a00') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'synthesis'  && renderSynthesis()}
      {activeTab === 'envelope'   && renderEnvelope()}
      {activeTab === 'modulation' && renderModulation()}
    </div>
  );
};
