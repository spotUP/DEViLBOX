/**
 * HivelyControls.tsx - HivelyTracker / AHX instrument editor
 *
 * Ports the HivelyTracker instrument editor 1:1 with all parameters:
 * volume, wave length, ADSR envelope, vibrato, square wave modulation,
 * filter modulation, hard cut, and performance list editor.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { HivelyConfig, HivelyPerfEntryConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { EnvelopeVisualization, SectionLabel } from '@components/instruments/shared';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import {
  HIVELY_PERFLIST_COLUMNS,
  hivelyPerfListToFormatChannel,
  makePerfListCellChange,
} from '@/components/hively/hivelyAdapter';

interface HivelyControlsProps {
  config: HivelyConfig;
  instrumentId: number;
  onChange: (updates: Partial<HivelyConfig>) => void;
}

type HivelyTab = 'main' | 'perflist';

const WAVE_LENGTH_LABELS = ['4', '8', '16', '32', '64', '128'];

// Performance list effect names (reference grid)
const PL_FX_NAMES: Record<number, string> = {
  0x0: 'Filter', 0x1: 'Slide Up', 0x2: 'Slide Dn', 0x3: 'Square',
  0x4: 'Flt Mod', 0x5: 'Jump', 0x6: 'Raw Tri', 0x7: 'Raw Saw',
  0x8: 'Raw Sqr', 0x9: 'Raw Nse', 0xA: '--', 0xB: '--',
  0xC: 'Volume', 0xD: '--', 0xE: '--', 0xF: 'Speed',
};

export const HivelyControls: React.FC<HivelyControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<HivelyTab>('main');
  const [perfCursorY, setPerfCursorY] = useState(0);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor, dim: dimColor, panelBg, panelStyle } = useInstrumentColors('#44ff88', { knob: '#66ddaa', dim: '#1a3328' });
  // Update helpers using refs to avoid stale state
  const updateParam = useCallback(<K extends keyof HivelyConfig>(key: K, value: HivelyConfig[K]) => {
    onChange({ [key]: value } as Partial<HivelyConfig>);
  }, [onChange]);

  const updateEnvelope = useCallback((updates: Partial<HivelyConfig['envelope']>) => {
    onChange({ envelope: { ...configRef.current.envelope, ...updates } });
  }, [onChange]);

  const updatePerfList = useCallback((updates: Partial<HivelyConfig['performanceList']>) => {
    onChange({ performanceList: { ...configRef.current.performanceList, ...updates } });
  }, [onChange]);

  // Performance list row operations
  const insertPerfRow = useCallback((atIndex: number) => {
    const entries = [...configRef.current.performanceList.entries];
    if (entries.length >= 255) return;
    const blank: HivelyPerfEntryConfig = { note: 0, waveform: 0, fixed: false, fx: [0, 0], fxParam: [0, 0] };
    entries.splice(atIndex, 0, blank);
    onChange({ performanceList: { ...configRef.current.performanceList, entries } });
  }, [onChange]);

  const deletePerfRow = useCallback((atIndex: number) => {
    const entries = [...configRef.current.performanceList.entries];
    if (entries.length <= 1) return;
    entries.splice(atIndex, 1);
    onChange({ performanceList: { ...configRef.current.performanceList, entries } });
    if (perfCursorY >= entries.length) setPerfCursorY(entries.length - 1);
  }, [onChange, perfCursorY]);

  // ── Number input box (HVL style) ──
  const NumberBox: React.FC<{
    label: string; value: number; min: number; max: number;
    onChange: (v: number) => void; format?: 'dec' | 'hex'; width?: string;
  }> = ({ label, value, min, max, onChange: onBoxChange, width = '48px' }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-text-secondary w-16 text-right whitespace-nowrap">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value);
          if (!isNaN(v)) onBoxChange(Math.max(min, Math.min(max, v)));
        }}
        className="text-xs font-mono text-center border rounded px-1 py-0.5"
        style={{
          width,
          background: '#0a0f0c',
          borderColor: dimColor,
          color: accentColor,
        }}
      />
    </div>
  );

  // ── MAIN TAB ──
  const renderMainTab = () => (
    <div className="flex flex-col gap-4 p-3 overflow-y-auto synth-controls-flow" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Volume & Wave Length */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accentColor} label="Volume & Wave" />
        <div className="flex items-center gap-3">
          <Knob value={config.volume} min={0} max={64} step={1}
            onChange={(v) => updateParam('volume', Math.round(v))}
            label="Volume" color={knobColor} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-text-secondary uppercase tracking-wide">Wave Length</span>
            <div className="flex gap-1">
              {WAVE_LENGTH_LABELS.map((label, i) => (
                <button key={i}
                  onClick={() => updateParam('waveLength', i)}
                  className="px-2 py-1 text-xs font-mono rounded transition-colors"
                  style={{
                    background: config.waveLength === i ? accentColor : '#111',
                    color: config.waveLength === i ? '#000' : '#666',
                    border: `1px solid ${config.waveLength === i ? accentColor : 'var(--color-border-light)'}`,
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Envelope ADSR */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accentColor} label="Envelope" />
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.envelope.aFrames} min={1} max={255} step={1}
              onChange={(v) => updateEnvelope({ aFrames: Math.round(v) })}
              label="A.Time" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.envelope.aVolume} min={0} max={64} step={1}
              onChange={(v) => updateEnvelope({ aVolume: Math.round(v) })}
              label="A.Vol" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.envelope.dFrames} min={1} max={255} step={1}
              onChange={(v) => updateEnvelope({ dFrames: Math.round(v) })}
              label="D.Time" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.envelope.dVolume} min={0} max={64} step={1}
              onChange={(v) => updateEnvelope({ dVolume: Math.round(v) })}
              label="D.Vol" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.envelope.sFrames} min={1} max={255} step={1}
              onChange={(v) => updateEnvelope({ sFrames: Math.round(v) })}
              label="S.Time" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.envelope.rFrames} min={1} max={255} step={1}
              onChange={(v) => updateEnvelope({ rFrames: Math.round(v) })}
              label="R.Time" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.envelope.rVolume} min={0} max={64} step={1}
              onChange={(v) => updateEnvelope({ rVolume: Math.round(v) })}
              label="R.Vol" color={knobColor}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        </div>
        <div className="mt-2">
          <EnvelopeVisualization
            mode="steps"
            attackVol={config.envelope.aVolume}
            attackSpeed={config.envelope.aFrames}
            decayVol={config.envelope.dVolume}
            decaySpeed={config.envelope.dFrames}
            sustainVol={config.envelope.dVolume}
            sustainLen={config.envelope.sFrames}
            releaseVol={config.envelope.rVolume}
            releaseSpeed={config.envelope.rFrames}
            maxVol={64}
            color={knobColor}
            width={320}
            height={56}
          />
        </div>
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accentColor} label="Vibrato" />
        <div className="flex items-center gap-4">
          <Knob value={config.vibratoDelay} min={0} max={255} step={1}
            onChange={(v) => updateParam('vibratoDelay', Math.round(v))}
            label="Delay" color={knobColor}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob paramKey="hively.vibratoDepth" value={config.vibratoDepth} min={0} max={15} step={1}
            onChange={(v) => updateParam('vibratoDepth', Math.round(v))}
            label="Depth" color={knobColor}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob paramKey="hively.vibratoSpeed" value={config.vibratoSpeed} min={0} max={63} step={1}
            onChange={(v) => updateParam('vibratoSpeed', Math.round(v))}
            label="Speed" color={knobColor}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Square Wave Modulation */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accentColor} label="Square Modulation" />
        <div className="flex items-center gap-4">
          <Knob value={config.squareLowerLimit} min={0} max={255} step={1}
            onChange={(v) => updateParam('squareLowerLimit', Math.round(v))}
            label="Lower" color={knobColor}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.squareUpperLimit} min={0} max={255} step={1}
            onChange={(v) => updateParam('squareUpperLimit', Math.round(v))}
            label="Upper" color={knobColor}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob paramKey="hively.squareSpeed" value={config.squareSpeed} min={0} max={63} step={1}
            onChange={(v) => updateParam('squareSpeed', Math.round(v))}
            label="Speed" color={knobColor}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Filter Modulation */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accentColor} label="Filter Modulation" />
        <div className="flex items-center gap-4">
          <Knob value={config.filterLowerLimit} min={0} max={127} step={1}
            onChange={(v) => updateParam('filterLowerLimit', Math.round(v))}
            label="Lower" color={knobColor}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob paramKey="hively.filterUpper" value={config.filterUpperLimit} min={0} max={63} step={1}
            onChange={(v) => updateParam('filterUpperLimit', Math.round(v))}
            label="Upper" color={knobColor}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob paramKey="hively.filterSpeed" value={config.filterSpeed} min={0} max={63} step={1}
            onChange={(v) => updateParam('filterSpeed', Math.round(v))}
            label="Speed" color={knobColor}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Hard Cut */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accentColor} label="Hard Cut" />
        <div className="flex items-center gap-4">
          <button
            onClick={() => updateParam('hardCutRelease', !config.hardCutRelease)}
            className="px-3 py-1.5 text-xs font-mono rounded transition-colors"
            style={{
              background: config.hardCutRelease ? accentColor : '#111',
              color: config.hardCutRelease ? '#000' : '#666',
              border: `1px solid ${config.hardCutRelease ? accentColor : 'var(--color-border-light)'}`,
            }}>
            {config.hardCutRelease ? 'ON' : 'OFF'}
          </button>
          <Knob value={config.hardCutReleaseFrames} min={0} max={7} step={1}
            onChange={(v) => updateParam('hardCutReleaseFrames', Math.round(v))}
            label="Frames" color={knobColor}
            formatValue={(v) => Math.round(v).toString()}
            disabled={!config.hardCutRelease} />
        </div>
      </div>
    </div>
  );

  // ── PERFORMANCE LIST TAB — PatternEditorCanvas in format mode ──
  const perfListChannels = useMemo(
    () => hivelyPerfListToFormatChannel(config),
    [config]
  );
  const perfListCellChange = useMemo(
    () => makePerfListCellChange(config, onChange),
    [config, onChange]
  );

  const renderPerfListTab = () => {
    const entries = config.performanceList.entries;

    return (
      <div className="flex flex-col gap-2 p-3" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* Speed + controls */}
        <div className="flex items-center gap-3 mb-1">
          <NumberBox label="Speed" value={config.performanceList.speed}
            min={0} max={255} onChange={(v) => updatePerfList({ speed: v })} />
          <NumberBox label="Length" value={entries.length}
            min={1} max={255} onChange={() => {}} />
          <div className="flex gap-1 ml-auto">
            <button
              onClick={() => insertPerfRow(perfCursorY)}
              className="px-3 py-2 text-xs font-mono rounded border transition-colors hover:opacity-80 min-h-[36px]"
              style={{ borderColor: dimColor, color: accentColor, background: 'var(--color-bg-secondary)' }}
              title="Insert row (Shift+Enter)">
              +Row
            </button>
            <button
              onClick={() => deletePerfRow(perfCursorY)}
              className="px-3 py-2 text-xs font-mono rounded border transition-colors hover:opacity-80 min-h-[36px]"
              style={{ borderColor: dimColor, color: '#ff6666', background: 'var(--color-bg-secondary)' }}
              title="Delete row (Shift+Backspace)">
              -Row
            </button>
          </div>
        </div>

        {/* Pattern editor in format mode */}
        <div style={{ flex: 1, minHeight: 200 }}>
          <PatternEditorCanvas
            formatColumns={HIVELY_PERFLIST_COLUMNS}
            formatChannels={perfListChannels}
            formatCurrentRow={0}
            formatIsPlaying={false}
            onFormatCellChange={perfListCellChange}
            hideVUMeters={true}
          />
        </div>

        {/* Effect reference */}
        <div className="mt-2 p-2 rounded border text-[10px] font-mono grid grid-cols-4 gap-x-3 gap-y-1"
          style={{ borderColor: dimColor, color: 'var(--color-text-muted)' }}>
          {Object.entries(PL_FX_NAMES).map(([code, name]) => (
            <span key={code}>
              <span style={{ color: accentColor }}>{parseInt(code).toString(16).toUpperCase()}</span>
              ={name}
            </span>
          ))}
        </div>
      </div>
    );
  };


  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: dimColor }}>
        {([['main', 'Parameters'], ['perflist', 'Perf. List']] as const).map(([id, label]) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accentColor : '#666',
              borderBottom: activeTab === id ? `2px solid ${accentColor}` : '2px solid transparent',
              background: activeTab === id ? (isCyanTheme ? '#041510' : '#0a1a12') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'main' && renderMainTab()}
      {activeTab === 'perflist' && renderPerfListTab()}
    </div>
  );
};
