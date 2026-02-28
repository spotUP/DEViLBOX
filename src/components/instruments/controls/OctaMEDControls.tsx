/**
 * OctaMEDControls.tsx — OctaMED SynthInstr editor
 *
 * Exposes all OctaMEDConfig parameters: playback knobs (volume, table speeds,
 * vibrato), vol command table, wf command table, and waveform preview.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { OctaMEDConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { SequenceEditor } from '@components/instruments/shared';
import { UADEChipEditor } from '@engine/uade/UADEChipEditor';
import { UADEEngine } from '@engine/uade/UADEEngine';

interface OctaMEDControlsProps {
  config: OctaMEDConfig;
  onChange: (updates: Partial<OctaMEDConfig>) => void;
  uadeChipRam?: UADEChipRamInfo;
}

type OMTab = 'params' | 'voltbl' | 'wftbl' | 'waveform';

// Classify a voltbl byte for display purposes
function voltblCellClass(v: number): 'loop' | 'stop' | 'wait' | 'vol' {
  if (v === 0xff) return 'loop';
  if (v === 0xfe) return 'stop';
  if (v >= 0x80 && v <= 0xbf) return 'wait';
  return 'vol';
}

// Classify a wftbl byte for display purposes
function wftblCellClass(v: number): 'loop' | 'stop' | 'wait' | 'wavesel' | 'other' {
  if (v === 0xff) return 'loop';
  if (v === 0xfe) return 'stop';
  if (v >= 0x80 && v <= 0xbf) return 'wait';
  if (v >= 0x00 && v <= 0x09) return 'wavesel';
  return 'other';
}

export const OctaMEDControls: React.FC<OctaMEDControlsProps> = ({ config, onChange, uadeChipRam }) => {
  const [activeTab, setActiveTab] = useState<OMTab>('params');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Lazy chip editor singleton — only created when uadeChipRam is present
  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  function getEditor(): UADEChipEditor | null {
    if (!uadeChipRam) return null;
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }

  const handleExport = useCallback(() => {
    const editor = getEditor();
    if (!editor || !uadeChipRam) return;
    void editor.exportModule(uadeChipRam.moduleBase, uadeChipRam.moduleSize, 'module.med');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uadeChipRam]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  const upd = useCallback(<K extends keyof OctaMEDConfig>(key: K, value: OctaMEDConfig[K]) => {
    onChange({ [key]: value } as Partial<OctaMEDConfig>);

    // Write-back to chip RAM so edits take effect in the running UADE player
    const editor = getEditor();
    if (!editor || !uadeChipRam) return;
    const base = uadeChipRam.instrBase;

    if (key === 'voltblSpeed') {
      void editor.writeU8(base + 18, value as number);
    } else if (key === 'wfSpeed') {
      void editor.writeU8(base + 19, value as number);
    } else if (key === 'loopStart') {
      // loopStart stored as bytes in config; chip RAM stores words
      void editor.writeU16(base + 10, Math.floor((value as number) / 2));
    } else if (key === 'loopLen') {
      // loopLen stored as bytes in config; chip RAM stores words
      void editor.writeU16(base + 12, Math.floor((value as number) / 2));
    } else if (key === 'voltbl') {
      void editor.writeBlock(base + 22, Array.from(value as Uint8Array));
    } else if (key === 'wftbl') {
      void editor.writeBlock(base + 150, Array.from(value as Uint8Array));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange, uadeChipRam]);

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div
      className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}
    >
      {label}
    </div>
  );

  // ── PARAMS TAB ──
  const renderParams = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Playback section */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Playback" />
        <div className="flex flex-wrap gap-4">
          <Knob
            value={config.volume}
            min={0}
            max={64}
            step={1}
            onChange={(v) => upd('volume', Math.round(v))}
            label="Volume"
            color={knob}
            size="md"
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.voltblSpeed}
            min={0}
            max={15}
            step={1}
            onChange={(v) => upd('voltblSpeed', Math.round(v))}
            label="Vol Tbl Speed"
            color={knob}
            size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.wfSpeed}
            min={0}
            max={15}
            step={1}
            onChange={(v) => upd('wfSpeed', Math.round(v))}
            label="WF Speed"
            color={knob}
            size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibratoSpeed}
            min={0}
            max={255}
            step={1}
            onChange={(v) => upd('vibratoSpeed', Math.round(v))}
            label="Vibrato Speed"
            color={knob}
            size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
        </div>
        <div className="mt-2 text-[10px] text-gray-600">
          Vol Tbl Speed / WF Speed: 0 = execute every output block
        </div>
      </div>

      {/* Loop reference section */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Loop (read-only reference)" />
        <div className="flex gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>
              Loop Start
            </span>
            <span className="text-sm font-mono" style={{ color: dim === '#004444' ? '#00cccc' : '#3399cc' }}>
              {config.loopStart} bytes
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>
              Loop Length
            </span>
            <span className="text-sm font-mono" style={{ color: dim === '#004444' ? '#00cccc' : '#3399cc' }}>
              {config.loopLen} bytes
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  // ── VOL TABLE TAB ──
  const renderVoltbl = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vol Command Table (128 bytes)" />

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-3 text-[10px] font-mono">
          <span style={{ color: accent }}>FF = loop at current volume</span>
          <span style={{ color: '#ff4444' }}>FE = stop</span>
          <span style={{ color: '#888' }}>00–40 = set volume (0–64)</span>
          <span style={{ color: '#aaa' }}>80–BF = wait N ticks</span>
        </div>

        <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
          {Array.from(config.voltbl).map((v, i) => {
            const cls = voltblCellClass(v);
            let bg = '#111';
            let color = '#555';
            if (cls === 'loop')  { bg = '#001a1a'; color = accent; }
            if (cls === 'stop')  { bg = '#1a0000'; color = '#ff4444'; }
            if (cls === 'wait')  { bg = '#0a0a0a'; color = '#777'; }
            if (cls === 'vol' && v > 0) { bg = '#001022'; color = '#3399cc'; }

            return (
              <div key={i} className="flex flex-col items-center">
                <span className="text-[8px] font-mono mb-0.5" style={{ color: '#333' }}>
                  {i.toString(16).padStart(2, '0').toUpperCase()}
                </span>
                <input
                  type="number"
                  value={v}
                  min={0}
                  max={255}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      const newArr = new Uint8Array(configRef.current.voltbl);
                      newArr[i] = Math.max(0, Math.min(255, val));
                      upd('voltbl', newArr);
                    }
                  }}
                  className="text-[9px] font-mono text-center border rounded py-0.5"
                  style={{
                    width: '100%',
                    background: bg,
                    borderColor: cls !== 'vol' || v > 0 ? dim : '#1a1a1a',
                    color,
                    minWidth: 0,
                    padding: '2px 1px',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── WF TABLE TAB ──
  const renderWftbl = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="WF Command Table (128 bytes)" />

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-3 text-[10px] font-mono">
          <span style={{ color: accent }}>FF = loop</span>
          <span style={{ color: '#ff4444' }}>FE = stop</span>
          <span style={{ color: '#44cc88' }}>00–09 = select waveform 0–9</span>
          <span style={{ color: '#aaa' }}>80–BF = wait N ticks</span>
        </div>

        <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
          {Array.from(config.wftbl).map((v, i) => {
            const cls = wftblCellClass(v);
            let bg = '#111';
            let color = '#555';
            if (cls === 'loop')    { bg = '#001a1a'; color = accent; }
            if (cls === 'stop')    { bg = '#1a0000'; color = '#ff4444'; }
            if (cls === 'wait')    { bg = '#0a0a0a'; color = '#777'; }
            if (cls === 'wavesel') { bg = '#001a08'; color = '#44cc88'; }

            return (
              <div key={i} className="flex flex-col items-center">
                <span className="text-[8px] font-mono mb-0.5" style={{ color: '#333' }}>
                  {i.toString(16).padStart(2, '0').toUpperCase()}
                </span>
                <input
                  type="number"
                  value={v}
                  min={0}
                  max={255}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      const newArr = new Uint8Array(configRef.current.wftbl);
                      newArr[i] = Math.max(0, Math.min(255, val));
                      upd('wftbl', newArr);
                    }
                  }}
                  className="text-[9px] font-mono text-center border rounded py-0.5"
                  style={{
                    width: '100%',
                    background: bg,
                    borderColor: cls !== 'other' ? dim : '#1a1a1a',
                    color,
                    minWidth: 0,
                    padding: '2px 1px',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── WAVEFORM TAB ── editable waveform data with SequenceEditor
  const renderWaveform = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {config.waveforms.map((wf, idx) => (
        <div key={idx} className={`rounded-lg border p-3 ${panelBg}`}>
          <div
            className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: accent, opacity: 0.7 }}
          >
            Wave {idx + 1}
          </div>
          <SequenceEditor
            label={`Wave ${idx + 1}`}
            data={Array.from(wf)}
            onChange={(d) => {
              const newWaveforms = configRef.current.waveforms.map((w, i) =>
                i === idx ? new Int8Array(d) : w
              );
              onChange({ waveforms: newWaveforms });
            }}
            min={-128} max={127}
            bipolar
            fixedLength
            color={knob}
            height={72}
          />
        </div>
      ))}

      {config.waveforms.length === 0 && (
        <div className="text-xs text-gray-600 p-3">No waveforms defined.</div>
      )}
    </div>
  );

  const TAB_LABELS: [OMTab, string][] = [
    ['params',   'Parameters'],
    ['voltbl',   'Vol Table'],
    ['wftbl',    'WF Table'],
    ['waveform', 'Waveforms'],
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b items-center" style={{ borderColor: dim }}>
        {TAB_LABELS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#000e1a') : 'transparent',
            }}
          >
            {label}
          </button>
        ))}
        {uadeChipRam && (
          <button
            onClick={handleExport}
            className="ml-auto px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border rounded transition-colors"
            style={{
              color: accent,
              borderColor: dim,
              background: 'transparent',
              marginRight: '8px',
            }}
          >
            Export .med (Amiga)
          </button>
        )}
      </div>

      {activeTab === 'params'   && renderParams()}
      {activeTab === 'voltbl'   && renderVoltbl()}
      {activeTab === 'wftbl'    && renderWftbl()}
      {activeTab === 'waveform' && renderWaveform()}
    </div>
  );
};
