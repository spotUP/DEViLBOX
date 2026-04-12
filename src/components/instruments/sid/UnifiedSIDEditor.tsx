import React, { useState, useCallback } from 'react';
import type { SIDInstrumentAdapter } from './SIDInstrumentAdapter';
import { SIDEnvelopeSection } from './SIDEnvelopeSection';
import { SIDWaveformSection } from './SIDWaveformSection';
import { SIDRegisterMonitor } from './SIDRegisterMonitor';
import { SectionLabel, NumBox } from '@components/instruments/shared';
import { hex2 } from '@/lib/sid/sidConstants';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';

type SIDTab = 'instrument' | 'tables' | 'monitor';

interface Props {
  adapter: SIDInstrumentAdapter;
}

const makeTableCol = (color: string) => [
  { key: 'left', label: 'L', charWidth: 2, type: 'hex' as const, hexDigits: 2 as const, color, emptyColor: '#334', emptyValue: 0, formatter: hex2 },
  { key: 'right', label: 'R', charWidth: 2, type: 'hex' as const, hexDigits: 2 as const, color, emptyColor: '#334', emptyValue: 0, formatter: hex2 },
];

export const UnifiedSIDEditor: React.FC<Props> = ({ adapter }) => {
  const [activeTab, setActiveTab] = useState<SIDTab>('instrument');

  const { isCyan: isCyanTheme, accent: accentColor, dim: dimColor, panelBg, panelStyle } =
    useInstrumentColors(adapter.accentColor, { dim: '#1a3328' });

  const adsr = adapter.getADSR();
  const waveform = adapter.getWaveform();
  const tableDefs = adapter.getTableDefs();
  const { features } = adapter;

  const onADSRChange = useCallback((partial: Record<string, number>) => {
    adapter.setADSR(partial);
  }, [adapter]);

  const onWaveformChange = useCallback((partial: Record<string, boolean>) => {
    adapter.setWaveform(partial);
  }, [adapter]);

  const tabs: [SIDTab, string][] = [
    ['instrument', 'Instrument'],
    ...(tableDefs.length > 0 ? [['tables', 'Tables'] as [SIDTab, string]] : []),
    ['monitor', 'SID Monitor'],
  ];

  const renderInstrumentTab = () => (
    <div className="grid gap-3 p-3 overflow-y-auto synth-controls-flow"
      style={{ maxHeight: 'calc(100vh - 280px)', gridTemplateColumns: `repeat(${waveform ? 3 : 2}, 1fr)` }}>

      <SIDEnvelopeSection
        adsr={adsr}
        onChange={onADSRChange}
        accentColor={accentColor}
        panelBg={panelBg}
        panelStyle={panelStyle}
        readOnly={!features.isEditable}
      />

      {waveform && (
        <SIDWaveformSection
          waveform={waveform}
          onChange={onWaveformChange}
          accentColor={accentColor}
          panelBg={panelBg}
          panelStyle={panelStyle}
          showControlBits={features.hasControlBits}
          readOnly={!features.isEditable}
        />
      )}

      <div className="flex flex-col gap-3">
        {tableDefs.length > 0 && (
          <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
            <SectionLabel color={accentColor} label="Table Pointers" />
            <div className="flex flex-col gap-2">
              {tableDefs.map((td) => (
                <NumBox key={td.key}
                  label={td.label}
                  value={adapter.getTablePointer(td.key)}
                  min={0} max={255} hex
                  color={accentColor} borderColor={dimColor} background="#0a0f0c"
                  onValueChange={(v) => adapter.setTablePointer(td.key, v)}
                />
              ))}
            </div>
            {!features.isEditable && (
              <div className="text-[8px] text-text-secondary mt-1.5 opacity-60">Read-only (format limitation)</div>
            )}
          </div>
        )}

        {features.hasDirectVibrato && (() => {
          const vib = adapter.getVibrato();
          if (!vib) return null;
          return (
            <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
              <SectionLabel color={accentColor} label="Vibrato" />
              <div className="flex flex-col gap-2">
                <NumBox label="Delay" value={vib.delay} min={0} max={255}
                  color={accentColor} borderColor={dimColor} background="#0a0f0c"
                  onValueChange={(v) => adapter.setVibrato({ delay: v })} />
                <NumBox label="Speed" value={vib.speed} min={0} max={63}
                  color={accentColor} borderColor={dimColor} background="#0a0f0c"
                  onValueChange={(v) => adapter.setVibrato({ speed: v })} />
                <NumBox label="Depth" value={vib.depth} min={0} max={63}
                  color={accentColor} borderColor={dimColor} background="#0a0f0c"
                  onValueChange={(v) => adapter.setVibrato({ depth: v })} />
              </div>
            </div>
          );
        })()}

        {features.hasDirectFilter && (() => {
          const filter = adapter.getFilter();
          if (!filter) return null;
          return (
            <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
              <SectionLabel color={accentColor} label="Filter" />
              <div className="flex flex-col gap-2">
                <NumBox label="Cutoff" value={filter.cutoff} min={0} max={255}
                  color={accentColor} borderColor={dimColor} background="#0a0f0c"
                  onValueChange={(v) => adapter.setFilter({ cutoff: v })} />
                <NumBox label="Resonance" value={filter.resonance} min={0} max={15}
                  color={accentColor} borderColor={dimColor} background="#0a0f0c"
                  onValueChange={(v) => adapter.setFilter({ resonance: v })} />
                <div className="flex gap-1.5">
                  {(['lp', 'hp', 'bp'] as const).map((mode) => (
                    <button key={mode} onClick={() => adapter.setFilter({ mode })}
                      className="px-2 py-0.5 text-[10px] font-mono rounded"
                      style={{
                        background: filter.mode === mode ? accentColor : '#111',
                        color: filter.mode === mode ? '#000' : '#666',
                        border: `1px solid ${filter.mode === mode ? accentColor : 'var(--color-border-light)'}`,
                      }}>
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );

  const renderTablesTab = () => {
    if (tableDefs.length === 0) return null;

    return (
      <div className="flex flex-1 min-h-0 gap-px" style={{ background: '#111' }}>
        {tableDefs.map((td) => {
          const tbl = adapter.getTable(td.key);
          if (!tbl) return null;
          const rows: Record<string, number>[] = [];
          for (let i = 0; i < tbl.rows; i++) {
            rows.push({ left: tbl.left[i] ?? 0, right: tbl.right[i] ?? 0 });
          }
          const channel = {
            label: td.label,
            patternLength: tbl.rows,
            rows,
            isPatternChannel: false,
          };
          const ptr = adapter.getTablePointer(td.key);
          const cols = makeTableCol(td.color);

          return (
            <div key={td.key} className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-1 px-1 py-0.5" style={{ background: '#060a08' }}>
                <span className="text-[9px] font-bold uppercase" style={{ color: td.color }}>{td.label}</span>
                <span className="text-[8px] font-mono" style={{ color: td.color, opacity: 0.6 }}>${hex2(ptr)}</span>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <PatternEditorCanvas
                  formatColumns={cols}
                  formatChannels={[channel]}
                  formatCurrentRow={0}
                  formatIsPlaying={false}
                  onFormatCellChange={features.isEditable
                    ? (_ch: number, row: number, colKey: string, value: number) => {
                        adapter.setTableEntry(td.key, row, colKey as 'left' | 'right', value);
                      }
                    : undefined}
                  hideVUMeters={true}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: dimColor }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accentColor : '#666',
              borderBottom: activeTab === id ? `2px solid ${accentColor}` : '2px solid transparent',
              background: activeTab === id ? (isCyanTheme ? '#041510' : '#0a1a12') : 'transparent',
            }}>
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center px-3 gap-2">
          <span className="text-[9px] text-text-secondary opacity-60">{adapter.formatName}</span>
          <span className="text-[10px] font-mono" style={{ color: accentColor }}>
            {adapter.instrumentName || `Inst ${adapter.instrumentIndex}`}
          </span>
        </div>
      </div>
      {activeTab === 'instrument' && renderInstrumentTab()}
      {activeTab === 'tables' && renderTablesTab()}
      {activeTab === 'monitor' && (
        <SIDRegisterMonitor
          getSidRegisters={(idx) => adapter.getSidRegisters(idx)}
          getSidCount={() => adapter.getSidCount()}
          refreshSidRegisters={() => adapter.refreshSidRegisters()}
          accentColor={accentColor}
          panelBg={panelBg}
          panelStyle={panelStyle}
          active={activeTab === 'monitor'}
        />
      )}
    </div>
  );
};
