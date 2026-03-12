/**
 * GTInstrumentPanel — SID instrument editor for GoatTracker Ultra.
 * 
 * Shows editable ADSR envelope, wave/pulse/filter table pointers,
 * vibrato, gate timer, first wave settings, and ADSR mini visualization.
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';

// SID ADSR timing tables (ms) — approximate for visualization
const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];
const DECAY_REL_MS = [6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3000, 9000, 15000, 24000];

export const GTInstrumentPanel: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const setCurrentInstrument = useGTUltraStore((s) => s.setCurrentInstrument);
  const engine = useGTUltraStore((s) => s.engine);

  const instr = instrumentData[currentInstrument];
  const adsrCanvasRef = useRef<HTMLCanvasElement>(null);

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

  // Draw ADSR mini visualization
  useEffect(() => {
    const canvas = adsrCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Normalize times to fit visualization
    const atkTime = ATTACK_MS[atk];
    const decTime = DECAY_REL_MS[dec];
    const susLevel = sus / 15;
    const relTime = DECAY_REL_MS[rel];
    const total = atkTime + decTime + relTime + 200; // 200ms sustain hold
    const susHold = 200;

    const xAtk = (atkTime / total) * w;
    const xDec = ((atkTime + decTime) / total) * w;
    const xSus = ((atkTime + decTime + susHold) / total) * w;
    const xRel = w;

    ctx.beginPath();
    ctx.strokeStyle = '#60e060';
    ctx.lineWidth = 1.5;
    ctx.moveTo(0, h);
    ctx.lineTo(xAtk, 2);           // Attack to peak
    ctx.lineTo(xDec, h - susLevel * (h - 4));  // Decay to sustain
    ctx.lineTo(xSus, h - susLevel * (h - 4));  // Sustain hold
    ctx.lineTo(xRel, h);           // Release to zero
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(xRel, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(96, 224, 96, 0.08)';
    ctx.fill();

    // Labels
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillStyle = '#555';
    ctx.fillText('A', xAtk / 2 - 2, h - 4);
    ctx.fillText('D', (xAtk + xDec) / 2 - 2, h - 4);
    ctx.fillText('S', (xDec + xSus) / 2 - 2, h - 4);
    ctx.fillText('R', (xSus + xRel) / 2 - 2, h - 4);
  }, [atk, dec, sus, rel]);

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
        <select
          value={currentInstrument}
          onChange={(e) => setCurrentInstrument(Number(e.target.value))}
          style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', padding: '1px 4px', fontSize: 11, flex: 1 }}
        >
          {Array.from({ length: 64 }, (_, i) => (
            <option key={i} value={i}>
              {i.toString(16).toUpperCase().padStart(2, '0')} - {instrumentData[i]?.name || `Instr ${i}`}
            </option>
          ))}
        </select>
      </div>

      {/* Instrument name (read-only for now — WASM doesn't expose name setter easily) */}
      <div style={{ display: 'flex', alignItems: 'center', height: 20, marginBottom: 4 }}>
        <span style={labelStyle}>Name</span>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{instr?.name || '—'}</span>
      </div>

      {/* ADSR visualization */}
      <canvas ref={adsrCanvasRef} width={width - 24} height={36}
        style={{ width: width - 24, height: 36, marginBottom: 4, borderRadius: 2 }} />

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

      {/* Table pointers */}
      <div style={{ color: 'var(--color-text-muted)', fontWeight: 'bold', fontSize: 10, marginBottom: 2 }}>TABLE POINTERS</div>
      {[
        { label: 'Wave Tbl', value: instr?.wavePtr ?? 0, type: 0 },
        { label: 'Pulse Tbl', value: instr?.pulsePtr ?? 0, type: 1 },
        { label: 'Filter Tbl', value: instr?.filterPtr ?? 0, type: 2 },
        { label: 'Speed Tbl', value: instr?.speedPtr ?? 0, type: 3 },
      ].map(({ label, value, type }) => (
        <div key={type} style={{ display: 'flex', alignItems: 'center', height: 20 }}>
          <span style={labelStyle}>{label}</span>
          <HexInput value={value} max={255} onChange={(v) => setTablePtr(type, v)} color="#ffcc00" />
        </div>
      ))}

      {/* Settings */}
      <div style={{ color: 'var(--color-text-muted)', fontWeight: 'bold', fontSize: 10, marginTop: 4, marginBottom: 2 }}>SETTINGS</div>
      <div style={{ display: 'flex', alignItems: 'center', height: 20 }}>
        <span style={labelStyle}>VibDelay</span>
        <span style={{ background: 'var(--color-bg-secondary)', color: '#60e060', border: '1px solid var(--color-border)', padding: '1px 4px', width: 36, textAlign: 'center', fontSize: 11 }}>
          {(instr?.vibdelay ?? 0).toString(16).toUpperCase().padStart(2, '0')}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', height: 20 }}>
        <span style={labelStyle}>GateTimer</span>
        <span style={{ background: 'var(--color-bg-secondary)', color: '#60e060', border: '1px solid var(--color-border)', padding: '1px 4px', width: 36, textAlign: 'center', fontSize: 11 }}>
          {(instr?.gatetimer ?? 0).toString(16).toUpperCase().padStart(2, '0')}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', height: 20 }}>
        <span style={labelStyle}>1st Wave</span>
        <HexInput value={instr?.firstwave ?? 0} max={255} onChange={setFirstwave} />
      </div>
    </div>
  );
};
