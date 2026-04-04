/**
 * GTUltraControls.tsx — GoatTracker Ultra instrument editor
 *
 * Three tabs:
 *   1. Instrument — ADSR, waveform (+ sync/ring/test), gate, hard-restart,
 *      panning, vibrato, table pointers, effect cheatsheet
 *   2. Tables — Wave/Pulse/Filter/Speed table editors (PatternEditorCanvas)
 *   3. SID Monitor — Live register display from the running SID emulation
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { GTUltraConfig } from '@typedefs/instrument/exotic';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { useGTUltraStore } from '@stores/useGTUltraStore';
import { useThemeStore } from '@stores';

// ── Types ──

interface GTUltraControlsProps {
  config: GTUltraConfig;
  instrumentId: number;
  onChange: (updates: Partial<GTUltraConfig>) => void;
}

type GTTab = 'instrument' | 'tables' | 'monitor';

// ── Constants ──

const ATTACK_MS  = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];
const DECAY_MS   = [6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3000, 9000, 15000, 24000];
const RELEASE_MS = DECAY_MS;

const SID_VOICE_REGS = [
  { offset: 0, label: 'Freq Lo' }, { offset: 1, label: 'Freq Hi' },
  { offset: 2, label: 'PW Lo' }, { offset: 3, label: 'PW Hi' },
  { offset: 4, label: 'Control' }, { offset: 5, label: 'AD' }, { offset: 6, label: 'SR' },
] as const;

const SID_GLOBAL_REGS = [
  { offset: 21, label: 'FC Lo' }, { offset: 22, label: 'FC Hi' },
  { offset: 23, label: 'Res/Filt' }, { offset: 24, label: 'Mode/Vol' },
] as const;

const WAVEFORM_BITS = [
  { bit: 4, label: 'TRI', name: 'Triangle' },
  { bit: 5, label: 'SAW', name: 'Sawtooth' },
  { bit: 6, label: 'PUL', name: 'Pulse' },
  { bit: 7, label: 'NOI', name: 'Noise' },
] as const;

const WAVEFORM_EXTRAS = [
  { bit: 1, label: 'SYNC', name: 'Sync' },
  { bit: 2, label: 'RING', name: 'Ring Mod' },
  { bit: 3, label: 'TEST', name: 'Test Bit' },
] as const;

const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

// Table column definitions — each table has L/R hex columns
const makeTableCol = (color: string) => [
  { key: 'left', label: 'L', charWidth: 2, type: 'hex' as const, hexDigits: 2 as const, color, emptyColor: '#334', emptyValue: 0, formatter: hex2 },
  { key: 'right', label: 'R', charWidth: 2, type: 'hex' as const, hexDigits: 2 as const, color, emptyColor: '#334', emptyValue: 0, formatter: hex2 },
];

const TABLE_DEFS = [
  { key: 'wave' as const, label: 'Wave', color: '#60e060', ptrKey: 'wavePtr' as const, cols: makeTableCol('#60e060') },
  { key: 'pulse' as const, label: 'Pulse', color: '#ff8866', ptrKey: 'pulsePtr' as const, cols: makeTableCol('#ff8866') },
  { key: 'filter' as const, label: 'Filter', color: '#ffcc00', ptrKey: 'filterPtr' as const, cols: makeTableCol('#ffcc00') },
  { key: 'speed' as const, label: 'Speed', color: '#6699ff', ptrKey: 'speedPtr' as const, cols: makeTableCol('#6699ff') },
];

const EFFECT_REF = [
  '0=NOP', '1=PortaUp', '2=PortaDn', '3=TonePorta',
  '4=Vibrato', '5=SetAD', '6=SetSR', '7=SetWave',
  '8=WavPtr', '9=PulPtr', 'A=FilPtr', 'B=FilCtrl',
  'C=Cutoff', 'D=MasVol', 'E=FunkTmp', 'F=Tempo',
];

const WAVE_CMD_REF = [
  '01-0F=Delay', '10-DF=Waveform', 'E0-EF=Silent',
  'F0=NOP', 'F1=PortaUp', 'F2=PortaDn', 'F3=TonePorta',
  'F4=Vibrato', 'F5=SetAD', 'F6=SetSR', 'F7=SetWave',
  'F9=PulPtr', 'FA=FilPtr', 'FB=FilCtrl',
  'FC=Cutoff', 'FD=MasVol', 'FF=Jump',
];

// ── Component ──

export const GTUltraControls: React.FC<GTUltraControlsProps> = ({
  config,
  instrumentId: _instrumentId,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<GTTab>('instrument');
  const [showEffectRef, setShowEffectRef] = useState(false);
  const [showTableRef, setShowTableRef] = useState(false);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const accentColor = isCyanTheme ? '#00ffff' : '#44ff88';
  const dimColor = isCyanTheme ? '#004444' : '#1a3328';
  const panelBg = isCyanTheme ? 'bg-[#041510] border-accent-highlight/20' : 'bg-[#0a1a12] border-green-900/30';

  // Store data
  const sidRegisters = useGTUltraStore((s) => s.sidRegisters);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const tableData = useGTUltraStore((s) => s.tableData);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const isPlaying = useGTUltraStore((s) => s.playing);

  // ADSR
  const attack  = (config.ad >> 4) & 0xF;
  const decay   = config.ad & 0xF;
  const sustain = (config.sr >> 4) & 0xF;
  const release = config.sr & 0xF;
  const gate = !!(config.firstwave & 0x01);

  // Hard-restart from gatetimer bits 6-7
  const gateTimerValue = config.gatetimer & 0x3F;
  const hardRestartEnabled = !(config.gatetimer & 0x40);
  const hardRestartImmediate = !!(config.gatetimer & 0x80);

  // Panning (upper nibble = min, lower = max)
  const panVal = (config as unknown as Record<string, number>).pan ?? 0x88;
  const panMin = (panVal >> 4) & 0xF;
  const panMax = panVal & 0xF;

  // ADSR callbacks
  const setAttack = useCallback((v: number) => {
    const c = configRef.current; onChange({ ad: (v << 4) | (c.ad & 0xF) });
  }, [onChange]);
  const setDecay = useCallback((v: number) => {
    const c = configRef.current; onChange({ ad: (c.ad & 0xF0) | v });
  }, [onChange]);
  const setSustain = useCallback((v: number) => {
    const c = configRef.current; onChange({ sr: (v << 4) | (c.sr & 0xF) });
  }, [onChange]);
  const setRelease = useCallback((v: number) => {
    const c = configRef.current; onChange({ sr: (c.sr & 0xF0) | v });
  }, [onChange]);

  const toggleWaveBit = useCallback((bit: number) => {
    onChange({ firstwave: configRef.current.firstwave ^ (1 << bit) });
  }, [onChange]);
  const toggleGate = useCallback(() => {
    onChange({ firstwave: configRef.current.firstwave ^ 0x01 });
  }, [onChange]);

  // Envelope visualization
  const envPoints = useMemo(() => {
    const ams = ATTACK_MS[attack], dms = DECAY_MS[decay], rms = RELEASE_MS[release];
    const sLevel = sustain / 15;
    const totalMs = ams + dms + Math.max(rms, 200);
    if (totalMs === 0) return '';
    const w = 180, h = 64, scale = w / totalMs;
    const x1 = ams * scale, x2 = x1 + dms * scale, x3 = x2 + 200 * scale, x4 = x3 + rms * scale;
    return `M0,${h} L${x1.toFixed(1)},0 L${x2.toFixed(1)},${(h * (1 - sLevel)).toFixed(1)} L${x3.toFixed(1)},${(h * (1 - sLevel)).toFixed(1)} L${x4.toFixed(1)},${h}`;
  }, [attack, decay, sustain, release]);

  // ── Helpers ──
  const SectionLabel = ({ label }: { label: string }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
      style={{ color: accentColor, opacity: 0.7 }}>{label}</div>
  );

  const AdsrSlider = ({ label, value, timeMs, onValueChange }: {
    label: string; value: number; timeMs: number; onValueChange: (v: number) => void;
  }) => (
    <div className="flex flex-col items-center gap-0.5" style={{ width: 36 }}>
      <span className="text-[9px] font-mono" style={{ color: accentColor }}>{value.toString(16).toUpperCase()}</span>
      <input type="range" min={0} max={15} step={1} value={value}
        onChange={(e) => onValueChange(parseInt(e.target.value))}
        style={{ writingMode: 'vertical-lr' as React.CSSProperties['writingMode'], direction: 'rtl', width: 20, height: 64, accentColor }} />
      <span className="text-[9px] font-bold text-text-secondary">{label}</span>
      <span className="text-[8px] text-text-secondary font-mono">
        {timeMs >= 1000 ? `${(timeMs / 1000).toFixed(1)}s` : `${timeMs}ms`}
      </span>
    </div>
  );

  const NumBox = ({ label, value, min, max, hex, onValueChange }: {
    label: string; value: number; min: number; max: number; hex?: boolean; onValueChange: (v: number) => void;
  }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-text-secondary w-20 text-right whitespace-nowrap">{label}</span>
      <input type="number" value={value} min={min} max={max}
        onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) onValueChange(Math.max(min, Math.min(max, v))); }}
        className="text-xs font-mono text-center border rounded px-1 py-0.5"
        style={{ width: 48, background: '#0a0f0c', borderColor: dimColor, color: accentColor }} />
      {hex && <span className="text-[9px] font-mono text-text-secondary">${hex2(value)}</span>}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  //  TAB 1: Instrument
  // ══════════════════════════════════════════════════════════════════
  const renderInstrumentTab = () => (
    <div className="grid gap-3 p-3 overflow-y-auto synth-controls-flow"
      style={{ maxHeight: 'calc(100vh - 280px)', gridTemplateColumns: 'repeat(3, 1fr)' }}>

      {/* ADSR */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="ADSR Envelope" />
        <div className="mb-2 rounded px-1" style={{ background: '#060a08' }}>
          <svg viewBox="0 0 180 64" width="100%" height={72} preserveAspectRatio="none">
            {envPoints && <path d={envPoints} fill="none" stroke={accentColor} strokeWidth={1.5} opacity={0.8} />}
          </svg>
        </div>
        <div className="flex justify-center gap-2">
          <AdsrSlider label="A" value={attack} timeMs={ATTACK_MS[attack]} onValueChange={setAttack} />
          <AdsrSlider label="D" value={decay} timeMs={DECAY_MS[decay]} onValueChange={setDecay} />
          <AdsrSlider label="S" value={sustain} timeMs={0} onValueChange={setSustain} />
          <AdsrSlider label="R" value={release} timeMs={RELEASE_MS[release]} onValueChange={setRelease} />
        </div>
        <div className="text-[9px] text-text-secondary text-center mt-1 font-mono">
          AD=${hex2(config.ad)} SR=${hex2(config.sr)}
        </div>
      </div>

      {/* Column 1: Waveform */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Waveform" />
        <div className="flex flex-wrap gap-1.5 mb-2">
          {WAVEFORM_BITS.map(({ bit, label }) => {
            const active = !!(config.firstwave & (1 << bit));
            return (
              <button key={bit} onClick={() => toggleWaveBit(bit)}
                className="px-2.5 py-1 text-xs font-mono rounded transition-colors"
                style={{ background: active ? accentColor : '#111', color: active ? '#000' : '#666',
                  border: `1px solid ${active ? accentColor : 'var(--color-border-light)'}` }}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={gate} onChange={toggleGate} style={{ accentColor }} />
            <span className="text-[10px] text-text-secondary">Gate on</span>
          </label>
          <span className="text-[9px] font-mono text-text-secondary ml-auto">${hex2(config.firstwave)}</span>
        </div>
        <div className="flex gap-3 mt-2">
          {WAVEFORM_EXTRAS.map(({ bit, label, name }) => (
            <label key={bit} className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={!!(config.firstwave & (1 << bit))}
                onChange={() => toggleWaveBit(bit)} style={{ accentColor }} />
              <span className="text-[9px] text-text-secondary" title={name}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Column 2: Timing + Panning */}
      <div className="flex flex-col gap-3">
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Timing" />
          <div className="flex flex-col gap-2">
            <NumBox label="Gate Timer" value={gateTimerValue} min={0} max={63} hex
              onValueChange={(v) => onChange({ gatetimer: (configRef.current.gatetimer & 0xC0) | (v & 0x3F) })} />
            <div className="flex gap-4 ml-[84px]">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={hardRestartEnabled}
                  onChange={() => onChange({ gatetimer: configRef.current.gatetimer ^ 0x40 })} style={{ accentColor }} />
                <span className="text-[9px] text-text-secondary">Hard Restart</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={hardRestartImmediate}
                  onChange={() => onChange({ gatetimer: configRef.current.gatetimer ^ 0x80 })} style={{ accentColor }} />
                <span className="text-[9px] text-text-secondary">Immediate</span>
              </label>
            </div>
            <NumBox label="Vibrato Delay" value={config.vibdelay} min={0} max={255} hex
              onValueChange={(v) => onChange({ vibdelay: v })} />
          </div>
        </div>

        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Panning" />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-secondary w-12 text-right">Min</span>
              <input type="range" min={0} max={15} value={panMin}
                onChange={(e) => onChange({ pan: (parseInt(e.target.value) << 4) | panMax } as Partial<GTUltraConfig>)}
                style={{ flex: 1, accentColor }} />
              <span className="text-[9px] font-mono w-4" style={{ color: accentColor }}>{panMin.toString(16).toUpperCase()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-secondary w-12 text-right">Max</span>
              <input type="range" min={0} max={15} value={panMax}
                onChange={(e) => onChange({ pan: (panMin << 4) | parseInt(e.target.value) } as Partial<GTUltraConfig>)}
                style={{ flex: 1, accentColor }} />
              <span className="text-[9px] font-mono w-4" style={{ color: accentColor }}>{panMax.toString(16).toUpperCase()}</span>
            </div>
            <div className="text-[8px] text-text-secondary opacity-60 ml-14">0=Left 8=Center F=Right</div>
          </div>
        </div>
      </div>

      {/* Column 3: Table Pointers + Effects */}
      <div className="flex flex-col gap-3">
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Table Pointers" />
          <div className="flex flex-col gap-2">
            <NumBox label="Wave Table" value={config.wavePtr} min={0} max={255} hex onValueChange={(v) => onChange({ wavePtr: v })} />
            <NumBox label="Pulse Table" value={config.pulsePtr} min={0} max={255} hex onValueChange={(v) => onChange({ pulsePtr: v })} />
            <NumBox label="Filter Table" value={config.filterPtr} min={0} max={255} hex onValueChange={(v) => onChange({ filterPtr: v })} />
            <NumBox label="Speed Table" value={config.speedPtr} min={0} max={255} hex onValueChange={(v) => onChange({ speedPtr: v })} />
          </div>
          <div className="text-[8px] text-text-secondary mt-1.5 opacity-60">0 = disabled. Edit in Tables tab.</div>
        </div>

        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <button className="text-[10px] font-bold uppercase tracking-widest w-full text-left"
            style={{ color: accentColor, opacity: 0.7 }} onClick={() => setShowEffectRef(!showEffectRef)}>
            {showEffectRef ? '[-]' : '[+]'} Pattern Effects
          </button>
          {showEffectRef && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 font-mono text-[9px]">
              {EFFECT_REF.map((r) => <span key={r} style={{ color: '#999' }}>{r}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  //  TAB 2: Tables — All 4 stacked vertically
  // ══════════════════════════════════════════════════════════════════
  const allTableChannels = useMemo(() => {
    return TABLE_DEFS.map((td) => {
      const tbl = tableData?.[td.key];
      const rows: Record<string, number>[] = [];
      for (let i = 0; i < 255; i++) {
        rows.push({ left: tbl?.left[i] ?? 0, right: tbl?.right[i] ?? 0 });
      }
      return { label: td.label, patternLength: 255, rows, isPatternChannel: false };
    });
  }, [tableData]);

  const makeTableCellChange = useCallback((tableIdx: number) => {
    return (_ch: number, row: number, colKey: string, value: number) => {
      const engine = useGTUltraStore.getState().engine;
      if (!engine) return;
      const side = colKey === 'left' ? 0 : 1;
      engine.setTableEntry(tableIdx, side, row, value);
      const refresh = useGTUltraStore.getState().refreshAllTables;
      if (refresh) refresh();
    };
  }, []);

  // Get live table execution position from playback state
  // tablePositions is packed: wave | (pulse << 8) | (filter << 16) per voice
  // Use voice 0 as the display source (most common single-voice editing)
  const liveTablePos = useMemo(() => {
    const packed = playbackPos.tablePositions?.[0] ?? 0;
    return {
      wave: packed & 0xFF,
      pulse: (packed >> 8) & 0xFF,
      filter: (packed >> 16) & 0xFF,
      speed: 0, // speed table has no position tracker
    };
  }, [playbackPos.tablePositions]);

  const renderTablesTab = () => (
    <div className="flex flex-col h-full">
      {/* 4 tables side by side */}
      <div className="flex flex-1 min-h-0 gap-px" style={{ background: '#111' }}>
        {TABLE_DEFS.map((td, i) => {
          const ptr = config[td.ptrKey] ?? 0;
          // During playback, show live execution position; otherwise show instrument pointer
          const livePos = isPlaying ? (liveTablePos as Record<string, number>)[td.key] ?? 0 : 0;
          const currentRow = isPlaying && livePos > 0 ? livePos : ptr;
          return (
            <div key={td.key} className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-1 px-1 py-0.5" style={{ background: '#060a08' }}>
                <span className="text-[9px] font-bold uppercase" style={{ color: td.color }}>{td.label}</span>
                <span className="text-[8px] font-mono" style={{ color: td.color, opacity: 0.6 }}>
                  ${hex2(ptr)}{isPlaying && livePos > 0 ? ` @${hex2(livePos)}` : ''}
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <PatternEditorCanvas
                  formatColumns={td.cols}
                  formatChannels={[allTableChannels[i]]}
                  formatCurrentRow={currentRow}
                  formatIsPlaying={isPlaying}
                  onFormatCellChange={makeTableCellChange(i)}
                  hideVUMeters={true}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Command reference */}
      <div className="px-2 py-1 border-t" style={{ borderColor: dimColor }}>
        <button className="text-[9px] font-mono w-full text-left" style={{ color: '#666' }}
          onClick={() => setShowTableRef(!showTableRef)}>
          {showTableRef ? '[-]' : '[+]'} Wave Table Commands
        </button>
        {showTableRef && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 font-mono text-[8px]">
            {WAVE_CMD_REF.map((r) => <span key={r} style={{ color: '#777' }}>{r}</span>)}
          </div>
        )}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  //  TAB 3: SID Monitor
  // ══════════════════════════════════════════════════════════════════
  const renderMonitorTab = () => {
    const chipCount = sidCount ?? 1;
    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {Array.from({ length: chipCount }, (_, chipIdx) => (
          <div key={chipIdx} className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label={chipCount > 1 ? `SID ${chipIdx + 1}` : 'SID Registers'} />
            <div className="font-mono text-[10px]" style={{ lineHeight: '1.6' }}>
              {[0, 1, 2].map((voice) => {
                const base = voice * 7;
                return (
                  <div key={voice} className="mb-1.5">
                    <div className="text-[9px] font-bold mb-0.5" style={{ color: accentColor, opacity: 0.6 }}>Voice {voice + 1}</div>
                    <div className="grid gap-x-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
                      {SID_VOICE_REGS.map(({ offset, label }) => {
                        const reg = base + offset, val = sidRegisters[chipIdx]?.[reg] ?? 0;
                        return (<React.Fragment key={reg}>
                          <span className="text-text-secondary text-right">R{reg.toString().padStart(2, '0')} {label}</span>
                          <span style={{ color: val > 0 ? accentColor : '#444' }}>{hex2(val)}</span>
                        </React.Fragment>);
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="mt-1">
                <div className="text-[9px] font-bold mb-0.5" style={{ color: accentColor, opacity: 0.6 }}>Filter</div>
                <div className="grid gap-x-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
                  {SID_GLOBAL_REGS.map(({ offset, label }) => {
                    const val = sidRegisters[chipIdx]?.[offset] ?? 0;
                    return (<React.Fragment key={offset}>
                      <span className="text-text-secondary text-right">R{offset.toString().padStart(2, '0')} {label}</span>
                      <span style={{ color: val > 0 ? accentColor : '#444' }}>{hex2(val)}</span>
                    </React.Fragment>);
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════
  //  Root
  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: dimColor }}>
        {([['instrument', 'Instrument'], ['tables', 'Tables'], ['monitor', 'SID Monitor']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{ color: activeTab === id ? accentColor : '#666',
              borderBottom: activeTab === id ? `2px solid ${accentColor}` : '2px solid transparent',
              background: activeTab === id ? (isCyanTheme ? '#041510' : '#0a1a12') : 'transparent' }}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'instrument' && renderInstrumentTab()}
      {activeTab === 'tables' && renderTablesTab()}
      {activeTab === 'monitor' && renderMonitorTab()}
    </div>
  );
};
