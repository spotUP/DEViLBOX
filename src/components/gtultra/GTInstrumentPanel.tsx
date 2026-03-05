/**
 * GTInstrumentPanel — SID instrument editor for GoatTracker Ultra.
 * 
 * Shows ADSR envelope, wave/pulse/filter table pointers,
 * vibrato, gate timer, and first wave settings.
 */

import React from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';

const LABEL_STYLE: React.CSSProperties = {
  color: '#666',
  fontSize: 10,
  width: 80,
  textAlign: 'right',
  paddingRight: 6,
};

const VALUE_STYLE: React.CSSProperties = {
  background: '#141414',
  color: '#60e060',
  border: '1px solid #222',
  padding: '1px 4px',
  width: 40,
  textAlign: 'center',
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 11,
};

export const GTInstrumentPanel: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const setCurrentInstrument = useGTUltraStore((s) => s.setCurrentInstrument);

  const instr = instrumentData[currentInstrument];

  const row = (label: string, value: number | string, color?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', height: 20 }}>
      <span style={LABEL_STYLE}>{label}</span>
      <span style={{ ...VALUE_STYLE, color: color || '#60e060' }}>
        {typeof value === 'number' ? value.toString(16).toUpperCase().padStart(2, '0') : value}
      </span>
    </div>
  );

  return (
    <div style={{
      width,
      height,
      overflow: 'auto',
      padding: 8,
      borderBottom: '1px solid #222',
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 11,
      background: '#0d0d0d',
      color: '#e0e0e0',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: '#888', fontWeight: 'bold', marginRight: 8, fontSize: 10 }}>INSTRUMENT</span>
        <select
          value={currentInstrument}
          onChange={(e) => setCurrentInstrument(Number(e.target.value))}
          style={{
            background: '#141414',
            color: '#e0e0e0',
            border: '1px solid #222',
            padding: '1px 4px',
            fontSize: 11,
            flex: 1,
          }}
        >
          {Array.from({ length: 64 }, (_, i) => (
            <option key={i} value={i}>
              {i.toString(16).toUpperCase().padStart(2, '0')} - {instrumentData[i]?.name || `Instr ${i}`}
            </option>
          ))}
        </select>
      </div>

      {/* Instrument name */}
      <div style={{ display: 'flex', alignItems: 'center', height: 22, marginBottom: 4 }}>
        <span style={LABEL_STYLE}>Name</span>
        <input
          type="text"
          value={instr?.name || ''}
          maxLength={16}
          readOnly
          style={{
            ...VALUE_STYLE,
            width: width - 110,
            textAlign: 'left',
            color: '#e0e0e0',
          }}
        />
      </div>

      {/* ADSR */}
      <div style={{ color: '#888', fontWeight: 'bold', fontSize: 10, marginTop: 4, marginBottom: 2 }}>ENVELOPE</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#666', fontSize: 9 }}>ATK</div>
          <span style={{ ...VALUE_STYLE, display: 'inline-block' }}>
            {((instr?.ad ?? 0) >> 4).toString(16).toUpperCase()}
          </span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#666', fontSize: 9 }}>DEC</div>
          <span style={{ ...VALUE_STYLE, display: 'inline-block' }}>
            {((instr?.ad ?? 0) & 0x0F).toString(16).toUpperCase()}
          </span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#666', fontSize: 9 }}>SUS</div>
          <span style={{ ...VALUE_STYLE, display: 'inline-block' }}>
            {((instr?.sr ?? 0) >> 4).toString(16).toUpperCase()}
          </span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#666', fontSize: 9 }}>REL</div>
          <span style={{ ...VALUE_STYLE, display: 'inline-block' }}>
            {((instr?.sr ?? 0) & 0x0F).toString(16).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Table pointers */}
      <div style={{ color: '#888', fontWeight: 'bold', fontSize: 10, marginTop: 4, marginBottom: 2 }}>TABLE POINTERS</div>
      {row('Wave Tbl', instr?.wavePtr ?? 0, '#ffcc00')}
      {row('Pulse Tbl', instr?.pulsePtr ?? 0, '#ffcc00')}
      {row('Filter Tbl', instr?.filterPtr ?? 0, '#ffcc00')}
      {row('Speed Tbl', instr?.speedPtr ?? 0, '#ffcc00')}

      {/* Other params */}
      <div style={{ color: '#888', fontWeight: 'bold', fontSize: 10, marginTop: 4, marginBottom: 2 }}>SETTINGS</div>
      {row('VibDelay', instr?.vibdelay ?? 0)}
      {row('GateTimer', instr?.gatetimer ?? 0)}
      {row('1st Wave', instr?.firstwave ?? 0)}
    </div>
  );
};
