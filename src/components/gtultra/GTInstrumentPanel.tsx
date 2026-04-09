/**
 * GTInstrumentPanel — SID instrument editor for GoatTracker Ultra.
 * 
 * Shows editable ADSR envelope, wave/pulse/filter table pointers,
 * vibrato, gate timer, first wave settings, and ADSR mini visualization.
 */

import React, { useCallback } from 'react';
import { CustomSelect } from '@components/common/CustomSelect';
import { useGTUltraStore } from '../../stores/useGTUltraStore';
import { EnvelopeVisualization } from '../instruments/shared';

export const GTInstrumentPanel: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const setCurrentInstrument = useGTUltraStore((s) => s.setCurrentInstrument);
  const engine = useGTUltraStore((s) => s.engine);

  const instr = instrumentData[currentInstrument];
  // Extract ADSR nibbles
  const atk = (instr?.ad ?? 0) >> 4;
  const dec = (instr?.ad ?? 0) & 0x0F;
  const sus = (instr?.sr ?? 0) >> 4;
  const rel = (instr?.sr ?? 0) & 0x0F;

  // Set a nibble in AD or SR
  const setADSR = useCallback((param: 'atk' | 'dec' | 'sus' | 'rel', value: number) => {
    if (!engine) return;
    const v = Math.max(0, Math.min(15, value));
    const ad = instr?.ad ?? 0;
    const sr = instr?.sr ?? 0;
    switch (param) {
      case 'atk': engine.setInstrumentAD(currentInstrument, (v << 4) | (ad & 0x0F)); break;
      case 'dec': engine.setInstrumentAD(currentInstrument, (ad & 0xF0) | v); break;
      case 'sus': engine.setInstrumentSR(currentInstrument, (v << 4) | (sr & 0x0F)); break;
      case 'rel': engine.setInstrumentSR(currentInstrument, (sr & 0xF0) | v); break;
    }
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument, instr?.ad, instr?.sr]);

  // Set table pointer (0=wave, 1=pulse, 2=filter, 3=speed)
  const setTablePtr = useCallback((tableType: number, value: number) => {
    if (!engine) return;
    engine.setInstrumentTablePtr(currentInstrument, tableType, Math.max(0, Math.min(255, value)));
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument]);

  // Set firstwave
  const setFirstwave = useCallback((value: number) => {
    if (!engine) return;
    engine.setInstrumentFirstwave(currentInstrument, Math.max(0, Math.min(255, value)));
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument]);

  // Hex input helper component
  const HexInput: React.FC<{
    value: number;
    max: number;
    onChange: (v: number) => void;
    digits?: number;
    color?: string;
  }> = ({ value, max, onChange, digits = 2, color = '#60e060' }) => (
    <input
      type="text"
      value={value.toString(16).toUpperCase().padStart(digits, '0')}
      maxLength={digits}
      onChange={(e) => {
        const v = parseInt(e.target.value, 16);
        if (!isNaN(v) && v >= 0 && v <= max) onChange(v);
      }}
      style={{
        background: 'var(--color-bg-secondary)',
        color,
        border: '1px solid var(--color-border)',
        padding: '1px 4px',
        width: digits === 1 ? 24 : 36,
        textAlign: 'center',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        outline: 'none',
      }}
      onFocus={(e) => e.target.select()}
    />
  );

  const labelStyle: React.CSSProperties = {
    color: 'var(--color-text-muted)', fontSize: 10, width: 80, textAlign: 'right', paddingRight: 6,
  };

  return (
    <div style={{
      width, height, overflow: 'auto', padding: 8, borderBottom: '1px solid var(--color-border)',
      fontFamily: '"JetBrains Mono", monospace', fontSize: 11, background: '#0d0d0d', color: 'var(--color-text-secondary)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: 'var(--color-text-muted)', fontWeight: 'bold', marginRight: 8, fontSize: 10 }}>INSTRUMENT</span>
        <CustomSelect
          value={String(currentInstrument)}
          onChange={(v) => setCurrentInstrument(Number(v))}
          options={Array.from({ length: 64 }, (_, i) => ({
            value: String(i),
            label: `${i.toString(16).toUpperCase().padStart(2, '0')} - ${instrumentData[i]?.name || `Instr ${i}`}`,
          }))}
        />
      </div>

      {/* Instrument name (read-only for now — WASM doesn't expose name setter easily) */}
      <div style={{ display: 'flex', alignItems: 'center', height: 20, marginBottom: 4 }}>
        <span style={labelStyle}>Name</span>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{instr?.name || '—'}</span>
      </div>

      {/* ADSR visualization */}
      <EnvelopeVisualization
        mode="sid"
        attack={atk}
        decay={dec}
        sustain={sus}
        release={rel}
        width="auto"
        height={36}
        color="#60e060"
      />

      {/* ADSR knobs */}
      <div style={{ color: 'var(--color-text-muted)', fontWeight: 'bold', fontSize: 10, marginBottom: 2 }}>ENVELOPE</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        {[
          { label: 'ATK', value: atk, param: 'atk' as const },
          { label: 'DEC', value: dec, param: 'dec' as const },
          { label: 'SUS', value: sus, param: 'sus' as const },
          { label: 'REL', value: rel, param: 'rel' as const },
        ].map(({ label, value, param }) => (
          <div key={param} style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>{label}</div>
            <HexInput value={value} max={15} digits={1} onChange={(v) => setADSR(param, v)} />
          </div>
        ))}
      </div>

      {/* Table pointers + Settings — 4-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px 12px', marginBottom: 4 }}>
        {/* Row 1: Section headers */}
        <div style={{ gridColumn: '1 / 3', color: 'var(--color-text-muted)', fontWeight: 'bold', fontSize: 10 }}>TABLE POINTERS</div>
        <div style={{ gridColumn: '3 / 5', color: 'var(--color-text-muted)', fontWeight: 'bold', fontSize: 10 }}>SETTINGS</div>

        {/* Row 2 */}
        <div style={{ display: 'flex', alignItems: 'center', height: 20 }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10, marginRight: 4 }}>Wave</span>
          <HexInput value={instr?.wavePtr ?? 0} max={255} onChange={(v) => setTablePtr(0, v)} color="#ffcc00" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 20 }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10, marginRight: 4 }}>Pulse</span>
          <HexInput value={instr?.pulsePtr ?? 0} max={255} onChange={(v) => setTablePtr(1, v)} color="#ffcc00" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 20 }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10, marginRight: 4 }}>VibDly</span>
          <span style={{ background: 'var(--color-bg-secondary)', color: '#60e060', border: '1px solid var(--color-border)', padding: '1px 4px', width: 36, textAlign: 'center', fontSize: 11 }}>
            {(instr?.vibdelay ?? 0).toString(16).toUpperCase().padStart(2, '0')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 20 }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10, marginRight: 4 }}>Gate</span>
          <span style={{ background: 'var(--color-bg-secondary)', color: '#60e060', border: '1px solid var(--color-border)', padding: '1px 4px', width: 36, textAlign: 'center', fontSize: 11 }}>
            {(instr?.gatetimer ?? 0).toString(16).toUpperCase().padStart(2, '0')}
          </span>
        </div>

        {/* Row 3 */}
        <div style={{ display: 'flex', alignItems: 'center', height: 20 }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10, marginRight: 4 }}>Filter</span>
          <HexInput value={instr?.filterPtr ?? 0} max={255} onChange={(v) => setTablePtr(2, v)} color="#ffcc00" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 20 }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10, marginRight: 4 }}>Speed</span>
          <HexInput value={instr?.speedPtr ?? 0} max={255} onChange={(v) => setTablePtr(3, v)} color="#ffcc00" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 20 }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10, marginRight: 4 }}>1stWv</span>
          <HexInput value={instr?.firstwave ?? 0} max={255} onChange={setFirstwave} />
        </div>
      </div>
    </div>
  );
};
