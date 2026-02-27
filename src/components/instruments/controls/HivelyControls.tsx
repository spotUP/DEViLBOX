/**
 * HivelyControls.tsx - HivelyTracker / AHX instrument editor
 *
 * Ports the HivelyTracker instrument editor 1:1 with all parameters:
 * volume, wave length, ADSR envelope, vibrato, square wave modulation,
 * filter modulation, hard cut, and performance list editor.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { HivelyConfig, HivelyPerfEntryConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { EnvelopeVisualization } from '@components/instruments/shared';

interface HivelyControlsProps {
  config: HivelyConfig;
  instrumentId: number;
  onChange: (updates: Partial<HivelyConfig>) => void;
}

type HivelyTab = 'main' | 'perflist';

const WAVE_LENGTH_LABELS = ['4', '8', '16', '32', '64', '128'];

// HVL note names (1-60, 0 = off)
const NOTE_NAMES = [
  '---',
  'C-1','C#1','D-1','D#1','E-1','F-1','F#1','G-1','G#1','A-1','A#1','B-1',
  'C-2','C#2','D-2','D#2','E-2','F-2','F#2','G-2','G#2','A-2','A#2','B-2',
  'C-3','C#3','D-3','D#3','E-3','F-3','F#3','G-3','G#3','A-3','A#3','B-3',
  'C-4','C#4','D-4','D#4','E-4','F-4','F#4','G-4','G#4','A-4','A#4','B-4',
  'C-5','C#5','D-5','D#5','E-5','F-5','F#5','G-5','G#5','A-5','A#5','B-5',
];

// Performance list effect names
const PL_FX_NAMES: Record<number, string> = {
  0x0: 'Filter',
  0x1: 'Slide Up',
  0x2: 'Slide Dn',
  0x3: 'Square',
  0x4: 'Flt Mod',
  0x5: 'Jump',
  0x6: 'Raw Tri',
  0x7: 'Raw Saw',
  0x8: 'Raw Sqr',
  0x9: 'Raw Nse',
  0xA: '--',
  0xB: '--',
  0xC: 'Volume',
  0xD: '--',
  0xE: '--',
  0xF: 'Speed',
};

export const HivelyControls: React.FC<HivelyControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<HivelyTab>('main');
  const [perfCursorY, setPerfCursorY] = useState(0);
  const perfListRef = useRef<HTMLDivElement>(null);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const accentColor = isCyanTheme ? '#00ffff' : '#44ff88';
  const knobColor = isCyanTheme ? '#00ffff' : '#66ddaa';
  const dimColor = isCyanTheme ? '#004444' : '#1a3328';
  const panelBg = isCyanTheme
    ? 'bg-[#041510] border-cyan-900/50'
    : 'bg-[#0a1a12] border-green-900/30';
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

  const updatePerfEntry = useCallback((index: number, updates: Partial<HivelyPerfEntryConfig>) => {
    const entries = [...configRef.current.performanceList.entries];
    entries[index] = { ...entries[index], ...updates };
    onChange({ performanceList: { ...configRef.current.performanceList, entries } });
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

  // ── Section header helper ──
  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accentColor, opacity: 0.7 }}>
      {label}
    </div>
  );

  // ── Number input box (HVL style) ──
  const NumberBox: React.FC<{
    label: string; value: number; min: number; max: number;
    onChange: (v: number) => void; format?: 'dec' | 'hex'; width?: string;
  }> = ({ label, value, min, max, onChange: onBoxChange, width = '48px' }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-400 w-16 text-right whitespace-nowrap">{label}</span>
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
    <div className="flex flex-col gap-4 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Volume & Wave Length */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Volume & Wave" />
        <div className="flex items-center gap-6">
          <Knob value={config.volume} min={0} max={64} step={1}
            onChange={(v) => updateParam('volume', Math.round(v))}
            label="Volume" color={knobColor} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-400 uppercase tracking-wide">Wave Length</span>
            <div className="flex gap-1">
              {WAVE_LENGTH_LABELS.map((label, i) => (
                <button key={i}
                  onClick={() => updateParam('waveLength', i)}
                  className="px-2 py-1 text-xs font-mono rounded transition-colors"
                  style={{
                    background: config.waveLength === i ? accentColor : '#111',
                    color: config.waveLength === i ? '#000' : '#666',
                    border: `1px solid ${config.waveLength === i ? accentColor : '#333'}`,
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Envelope ADSR */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Envelope" />
        <div className="mb-3">
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
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.envelope.aFrames} min={1} max={255} step={1}
              onChange={(v) => updateEnvelope({ aFrames: Math.round(v) })}
              label="A.Time" color={knobColor} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.envelope.aVolume} min={0} max={64} step={1}
              onChange={(v) => updateEnvelope({ aVolume: Math.round(v) })}
              label="A.Vol" color={knobColor} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.envelope.dFrames} min={1} max={255} step={1}
              onChange={(v) => updateEnvelope({ dFrames: Math.round(v) })}
              label="D.Time" color={knobColor} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.envelope.dVolume} min={0} max={64} step={1}
              onChange={(v) => updateEnvelope({ dVolume: Math.round(v) })}
              label="D.Vol" color={knobColor} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.envelope.sFrames} min={1} max={255} step={1}
              onChange={(v) => updateEnvelope({ sFrames: Math.round(v) })}
              label="S.Time" color={knobColor} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.envelope.rFrames} min={1} max={255} step={1}
              onChange={(v) => updateEnvelope({ rFrames: Math.round(v) })}
              label="R.Time" color={knobColor} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.envelope.rVolume} min={0} max={64} step={1}
              onChange={(v) => updateEnvelope({ rVolume: Math.round(v) })}
              label="R.Vol" color={knobColor} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        </div>
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vibrato" />
        <div className="flex items-center gap-4">
          <Knob value={config.vibratoDelay} min={0} max={255} step={1}
            onChange={(v) => updateParam('vibratoDelay', Math.round(v))}
            label="Delay" color={knobColor} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoDepth} min={0} max={15} step={1}
            onChange={(v) => updateParam('vibratoDepth', Math.round(v))}
            label="Depth" color={knobColor} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoSpeed} min={0} max={63} step={1}
            onChange={(v) => updateParam('vibratoSpeed', Math.round(v))}
            label="Speed" color={knobColor} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Square Wave Modulation */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Square Modulation" />
        <div className="flex items-center gap-4">
          <Knob value={config.squareLowerLimit} min={0} max={255} step={1}
            onChange={(v) => updateParam('squareLowerLimit', Math.round(v))}
            label="Lower" color={knobColor} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.squareUpperLimit} min={0} max={255} step={1}
            onChange={(v) => updateParam('squareUpperLimit', Math.round(v))}
            label="Upper" color={knobColor} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.squareSpeed} min={0} max={63} step={1}
            onChange={(v) => updateParam('squareSpeed', Math.round(v))}
            label="Speed" color={knobColor} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Filter Modulation */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Filter Modulation" />
        <div className="flex items-center gap-4">
          <Knob value={config.filterLowerLimit} min={0} max={127} step={1}
            onChange={(v) => updateParam('filterLowerLimit', Math.round(v))}
            label="Lower" color={knobColor} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.filterUpperLimit} min={0} max={63} step={1}
            onChange={(v) => updateParam('filterUpperLimit', Math.round(v))}
            label="Upper" color={knobColor} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.filterSpeed} min={0} max={63} step={1}
            onChange={(v) => updateParam('filterSpeed', Math.round(v))}
            label="Speed" color={knobColor} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Hard Cut */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Hard Cut" />
        <div className="flex items-center gap-4">
          <button
            onClick={() => updateParam('hardCutRelease', !config.hardCutRelease)}
            className="px-3 py-1.5 text-xs font-mono rounded transition-colors"
            style={{
              background: config.hardCutRelease ? accentColor : '#111',
              color: config.hardCutRelease ? '#000' : '#666',
              border: `1px solid ${config.hardCutRelease ? accentColor : '#333'}`,
            }}>
            {config.hardCutRelease ? 'ON' : 'OFF'}
          </button>
          <Knob value={config.hardCutReleaseFrames} min={0} max={7} step={1}
            onChange={(v) => updateParam('hardCutReleaseFrames', Math.round(v))}
            label="Frames" color={knobColor} size="sm"
            formatValue={(v) => Math.round(v).toString()}
            disabled={!config.hardCutRelease} />
        </div>
      </div>
    </div>
  );

  // ── PERFORMANCE LIST TAB ──
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
              className="px-2 py-1 text-[10px] font-mono rounded border transition-colors hover:opacity-80"
              style={{ borderColor: dimColor, color: accentColor, background: '#111' }}
              title="Insert row (Shift+Enter)">
              +Row
            </button>
            <button
              onClick={() => deletePerfRow(perfCursorY)}
              className="px-2 py-1 text-[10px] font-mono rounded border transition-colors hover:opacity-80"
              style={{ borderColor: dimColor, color: '#ff6666', background: '#111' }}
              title="Delete row (Shift+Backspace)">
              -Row
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex font-mono text-[10px] text-gray-500 px-1 border-b"
          style={{ borderColor: dimColor }}>
          <span className="w-8 text-center">#</span>
          <span className="w-10 text-center">Note</span>
          <span className="w-4 text-center">F</span>
          <span className="w-6 text-center">Wav</span>
          <span className="w-6 text-center">Fx1</span>
          <span className="w-8 text-center">P1</span>
          <span className="w-6 text-center">Fx2</span>
          <span className="w-8 text-center">P2</span>
        </div>

        {/* Performance list rows */}
        <div ref={perfListRef}
          className="overflow-y-auto font-mono text-xs"
          style={{ maxHeight: '380px' }}
          tabIndex={0}
          onKeyDown={(e) => handlePerfKeyDown(e)}>
          {entries.map((entry, i) => {
            const isSelected = i === perfCursorY;
            return (
              <div key={i}
                className="flex items-center px-1 cursor-pointer transition-colors"
                style={{
                  background: isSelected ? (isCyanTheme ? '#0a2020' : '#0f2818') : 'transparent',
                  borderLeft: isSelected ? `2px solid ${accentColor}` : '2px solid transparent',
                }}
                onClick={() => setPerfCursorY(i)}>
                {/* Row index */}
                <span className="w-8 text-center text-gray-600">{i.toString().padStart(3, '0')}</span>

                {/* Note */}
                <select className="w-10 text-center bg-transparent border-none outline-none cursor-pointer"
                  style={{ color: entry.note > 0 ? accentColor : '#444' }}
                  value={entry.note}
                  onChange={(e) => updatePerfEntry(i, { note: parseInt(e.target.value) })}>
                  {NOTE_NAMES.map((name, ni) => (
                    <option key={ni} value={ni} style={{ background: '#111', color: '#ccc' }}>{name}</option>
                  ))}
                </select>

                {/* Fixed */}
                <span className="w-4 text-center cursor-pointer"
                  style={{ color: entry.fixed ? '#ffaa00' : '#333' }}
                  onClick={(e) => { e.stopPropagation(); updatePerfEntry(i, { fixed: !entry.fixed }); }}>
                  {entry.fixed ? '*' : '.'}
                </span>

                {/* Waveform */}
                <select className="w-6 text-center bg-transparent border-none outline-none cursor-pointer"
                  style={{ color: entry.waveform > 0 ? '#aaddff' : '#444' }}
                  value={entry.waveform}
                  onChange={(e) => updatePerfEntry(i, { waveform: parseInt(e.target.value) })}>
                  <option value={0} style={{ background: '#111' }}>0</option>
                  <option value={1} style={{ background: '#111' }}>1</option>
                  <option value={2} style={{ background: '#111' }}>2</option>
                  <option value={3} style={{ background: '#111' }}>3</option>
                  <option value={4} style={{ background: '#111' }}>4</option>
                </select>

                {/* FX1 */}
                <select className="w-6 text-center bg-transparent border-none outline-none cursor-pointer"
                  style={{ color: entry.fx[0] > 0 ? '#ffcc66' : '#444' }}
                  value={entry.fx[0]}
                  onChange={(e) => updatePerfEntry(i, { fx: [parseInt(e.target.value), entry.fx[1]] })}>
                  {Array.from({ length: 16 }, (_, n) => (
                    <option key={n} value={n} style={{ background: '#111' }}>
                      {n.toString(16).toUpperCase()}
                    </option>
                  ))}
                </select>

                {/* FX Param 1 */}
                <input type="text" className="w-8 text-center bg-transparent border-none outline-none font-mono"
                  style={{ color: entry.fxParam[0] > 0 ? '#ffcc66' : '#444' }}
                  value={entry.fxParam[0].toString(16).toUpperCase().padStart(2, '0')}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 16);
                    if (!isNaN(v)) updatePerfEntry(i, { fxParam: [Math.min(255, v), entry.fxParam[1]] });
                  }}
                  maxLength={2} />

                {/* FX2 */}
                <select className="w-6 text-center bg-transparent border-none outline-none cursor-pointer"
                  style={{ color: entry.fx[1] > 0 ? '#cc99ff' : '#444' }}
                  value={entry.fx[1]}
                  onChange={(e) => updatePerfEntry(i, { fx: [entry.fx[0], parseInt(e.target.value)] })}>
                  {Array.from({ length: 16 }, (_, n) => (
                    <option key={n} value={n} style={{ background: '#111' }}>
                      {n.toString(16).toUpperCase()}
                    </option>
                  ))}
                </select>

                {/* FX Param 2 */}
                <input type="text" className="w-8 text-center bg-transparent border-none outline-none font-mono"
                  style={{ color: entry.fxParam[1] > 0 ? '#cc99ff' : '#444' }}
                  value={entry.fxParam[1].toString(16).toUpperCase().padStart(2, '0')}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 16);
                    if (!isNaN(v)) updatePerfEntry(i, { fxParam: [entry.fxParam[0], Math.min(255, v)] });
                  }}
                  maxLength={2} />
              </div>
            );
          })}
        </div>

        {/* Effect reference */}
        <div className="mt-2 p-2 rounded border text-[9px] font-mono grid grid-cols-4 gap-x-3 gap-y-0.5"
          style={{ borderColor: dimColor, color: '#555' }}>
          {Object.entries(PL_FX_NAMES).map(([code, name]) => (
            <span key={code}>
              <span style={{ color: '#888' }}>{parseInt(code).toString(16).toUpperCase()}</span>
              ={name}
            </span>
          ))}
        </div>
      </div>
    );
  };

  // Performance list keyboard navigation
  const handlePerfKeyDown = useCallback((e: React.KeyboardEvent) => {
    const entries = configRef.current.performanceList.entries;
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setPerfCursorY((y) => Math.max(0, y - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setPerfCursorY((y) => Math.min(entries.length - 1, y + 1));
        break;
      case 'PageUp':
        e.preventDefault();
        setPerfCursorY((y) => Math.max(0, y - 16));
        break;
      case 'PageDown':
        e.preventDefault();
        setPerfCursorY((y) => Math.min(entries.length - 1, y + 16));
        break;
      case 'Enter':
        if (e.shiftKey) {
          e.preventDefault();
          insertPerfRow(perfCursorY);
        }
        break;
      case 'Backspace':
        if (e.shiftKey) {
          e.preventDefault();
          deletePerfRow(perfCursorY);
        }
        break;
    }
  }, [perfCursorY, insertPerfRow, deletePerfRow]);

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
