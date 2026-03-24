/**
 * GTUltraControls.tsx — GoatTracker Ultra instrument editor
 *
 * Two tabs:
 *   1. Instrument — ADSR, waveform, gate, vibrato, table pointers
 *   2. SID Monitor — Live register display from the running SID emulation
 *
 * Tables (wave/pulse/filter/speed) are edited in the order-matrix area,
 * not here. This component only manages per-instrument parameters.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { GTUltraConfig } from '@typedefs/instrument/exotic';
import { useGTUltraStore } from '@stores/useGTUltraStore';
import { useThemeStore } from '@stores';

interface GTUltraControlsProps {
  config: GTUltraConfig;
  instrumentId: number;
  onChange: (updates: Partial<GTUltraConfig>) => void;
}

type GTTab = 'instrument' | 'monitor';

// SID ADSR timing tables (milliseconds)
const ATTACK_MS  = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];
const DECAY_MS   = [6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3000, 9000, 15000, 24000];
const RELEASE_MS = DECAY_MS; // Same table for decay and release

// SID register layout for monitor display
const SID_VOICE_REGS = [
  { offset: 0, label: 'Freq Lo' },
  { offset: 1, label: 'Freq Hi' },
  { offset: 2, label: 'PW Lo' },
  { offset: 3, label: 'PW Hi' },
  { offset: 4, label: 'Control' },
  { offset: 5, label: 'AD' },
  { offset: 6, label: 'SR' },
] as const;

const SID_GLOBAL_REGS = [
  { offset: 21, label: 'FC Lo' },
  { offset: 22, label: 'FC Hi' },
  { offset: 23, label: 'Res/Filt' },
  { offset: 24, label: 'Mode/Vol' },
] as const;

const WAVEFORM_BITS = [
  { bit: 4, label: 'TRI', name: 'Triangle' },
  { bit: 5, label: 'SAW', name: 'Sawtooth' },
  { bit: 6, label: 'PUL', name: 'Pulse' },
  { bit: 7, label: 'NOI', name: 'Noise' },
] as const;

export const GTUltraControls: React.FC<GTUltraControlsProps> = ({
  config,
  instrumentId: _instrumentId,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<GTTab>('instrument');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const accentColor = isCyanTheme ? '#00ffff' : '#44ff88';
  const dimColor = isCyanTheme ? '#004444' : '#1a3328';
  const panelBg = isCyanTheme
    ? 'bg-[#041510] border-accent-highlight/20'
    : 'bg-[#0a1a12] border-green-900/30';

  // SID monitor data
  const sidRegisters = useGTUltraStore((s) => s.sidRegisters);
  const sidCount = useGTUltraStore((s) => s.sidCount);

  // Unpack ADSR nibbles from config bytes
  const attack  = (config.ad >> 4) & 0xF;
  const decay   = config.ad & 0xF;
  const sustain = (config.sr >> 4) & 0xF;
  const release = config.sr & 0xF;

  // Waveform + gate from firstwave byte
  const gate = !!(config.firstwave & 0x01);

  const setAttack = useCallback((v: number) => {
    const c = configRef.current;
    const d = c.ad & 0xF, s = (c.sr >> 4) & 0xF, r = c.sr & 0xF;
    onChange({ ad: (v << 4) | d, sr: (s << 4) | r });
  }, [onChange]);

  const setDecay = useCallback((v: number) => {
    const c = configRef.current;
    const a = (c.ad >> 4) & 0xF, s = (c.sr >> 4) & 0xF, r = c.sr & 0xF;
    onChange({ ad: (a << 4) | v, sr: (s << 4) | r });
  }, [onChange]);

  const setSustain = useCallback((v: number) => {
    const c = configRef.current;
    const a = (c.ad >> 4) & 0xF, d = c.ad & 0xF, r = c.sr & 0xF;
    onChange({ ad: (a << 4) | d, sr: (v << 4) | r });
  }, [onChange]);

  const setRelease = useCallback((v: number) => {
    const c = configRef.current;
    const a = (c.ad >> 4) & 0xF, d = c.ad & 0xF, s = (c.sr >> 4) & 0xF;
    onChange({ ad: (a << 4) | d, sr: (s << 4) | v });
  }, [onChange]);

  const toggleWaveBit = useCallback((bit: number) => {
    const c = configRef.current;
    onChange({ firstwave: c.firstwave ^ (1 << bit) });
  }, [onChange]);

  const toggleGate = useCallback(() => {
    const c = configRef.current;
    onChange({ firstwave: c.firstwave ^ 0x01 });
  }, [onChange]);

  // ADSR envelope shape for visualization (normalized 0-1)
  const envPoints = useMemo(() => {
    const ams = ATTACK_MS[attack];
    const dms = DECAY_MS[decay];
    const rms = RELEASE_MS[release];
    const sLevel = sustain / 15;
    const totalMs = ams + dms + Math.max(rms, 200); // add sustain hold period
    if (totalMs === 0) return '';

    const w = 180, h = 32;
    const scale = w / totalMs;
    const x1 = ams * scale;                       // end of attack
    const x2 = x1 + dms * scale;                  // end of decay
    const x3 = x2 + 200 * scale;                  // sustain hold
    const x4 = x3 + rms * scale;                  // end of release

    return `M0,${h} L${x1.toFixed(1)},0 L${x2.toFixed(1)},${(h * (1 - sLevel)).toFixed(1)} ` +
           `L${x3.toFixed(1)},${(h * (1 - sLevel)).toFixed(1)} L${x4.toFixed(1)},${h}`;
  }, [attack, decay, sustain, release]);

  // ── Section header helper ──
  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
      style={{ color: accentColor, opacity: 0.7 }}>
      {label}
    </div>
  );

  // ── Vertical slider for ADSR (0-15) ──
  const AdsrSlider: React.FC<{
    label: string; value: number; timeMs: number;
    onValueChange: (v: number) => void;
  }> = ({ label, value, timeMs, onValueChange }) => (
    <div className="flex flex-col items-center gap-0.5" style={{ width: 36 }}>
      <span className="text-[9px] font-mono" style={{ color: accentColor }}>
        {value.toString(16).toUpperCase()}
      </span>
      <input
        type="range"
        min={0} max={15} step={1}
        value={value}
        onChange={(e) => onValueChange(parseInt(e.target.value))}
        className="slider-vertical"
        style={{
          writingMode: 'vertical-lr' as React.CSSProperties['writingMode'],
          direction: 'rtl',
          width: 20,
          height: 64,
          accentColor,
        }}
      />
      <span className="text-[9px] font-bold text-text-secondary">{label}</span>
      <span className="text-[8px] text-text-secondary font-mono">
        {timeMs >= 1000 ? `${(timeMs / 1000).toFixed(1)}s` : `${timeMs}ms`}
      </span>
    </div>
  );

  // ── Number input box ──
  const NumberBox: React.FC<{
    label: string; value: number; min: number; max: number;
    onValueChange: (v: number) => void; width?: string; hex?: boolean;
  }> = ({ label, value, min, max, onValueChange, width = '48px', hex }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-text-secondary w-20 text-right whitespace-nowrap">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value);
          if (!isNaN(v)) onValueChange(Math.max(min, Math.min(max, v)));
        }}
        className="text-xs font-mono text-center border rounded px-1 py-0.5"
        style={{
          width,
          background: '#0a0f0c',
          borderColor: dimColor,
          color: accentColor,
        }}
      />
      {hex && (
        <span className="text-[9px] font-mono text-text-secondary">
          ${value.toString(16).toUpperCase().padStart(2, '0')}
        </span>
      )}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  //  TAB 1: Instrument
  // ══════════════════════════════════════════════════════════════════
  const renderInstrumentTab = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow"
      style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* ADSR */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="ADSR Envelope" />

        {/* Envelope shape visualization */}
        <div className="mb-2 rounded px-1" style={{ background: '#060a08' }}>
          <svg viewBox="0 0 180 32" width="100%" height={36} preserveAspectRatio="none">
            {envPoints && (
              <path d={envPoints} fill="none" stroke={accentColor} strokeWidth={1.5}
                opacity={0.8} />
            )}
          </svg>
        </div>

        <div className="flex justify-center gap-2">
          <AdsrSlider label="A" value={attack} timeMs={ATTACK_MS[attack]}
            onValueChange={setAttack} />
          <AdsrSlider label="D" value={decay} timeMs={DECAY_MS[decay]}
            onValueChange={setDecay} />
          <AdsrSlider label="S" value={sustain} timeMs={0}
            onValueChange={setSustain} />
          <AdsrSlider label="R" value={release} timeMs={RELEASE_MS[release]}
            onValueChange={setRelease} />
        </div>
        <div className="text-[9px] text-text-secondary text-center mt-1 font-mono">
          AD=${config.ad.toString(16).toUpperCase().padStart(2, '0')}{' '}
          SR=${config.sr.toString(16).toUpperCase().padStart(2, '0')}
        </div>
      </div>

      {/* Waveform */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Waveform" />
        <div className="flex flex-wrap gap-1.5 mb-2">
          {WAVEFORM_BITS.map(({ bit, label }) => {
            const active = !!(config.firstwave & (1 << bit));
            return (
              <button key={bit}
                onClick={() => toggleWaveBit(bit)}
                className="px-2.5 py-1 text-xs font-mono rounded transition-colors"
                style={{
                  background: active ? accentColor : '#111',
                  color: active ? '#000' : '#666',
                  border: `1px solid ${active ? accentColor : 'var(--color-border-light)'}`,
                }}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={gate}
              onChange={toggleGate}
              className="accent-current"
              style={{ accentColor }}
            />
            <span className="text-[10px] text-text-secondary">Gate on</span>
          </label>
          <span className="text-[9px] font-mono text-text-secondary ml-auto">
            ${config.firstwave.toString(16).toUpperCase().padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Gate Timer & Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Timing" />
        <div className="flex flex-col gap-2">
          <NumberBox label="Gate Timer" value={config.gatetimer}
            min={0} max={255} hex
            onValueChange={(v) => onChange({ gatetimer: v })} />
          <NumberBox label="Vibrato Delay" value={config.vibdelay}
            min={0} max={255} hex
            onValueChange={(v) => onChange({ vibdelay: v })} />
        </div>
      </div>

      {/* Table Pointers */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Table Pointers" />
        <div className="flex flex-col gap-2">
          <NumberBox label="Wave Table" value={config.wavePtr}
            min={0} max={255} hex
            onValueChange={(v) => onChange({ wavePtr: v })} />
          <NumberBox label="Pulse Table" value={config.pulsePtr}
            min={0} max={255} hex
            onValueChange={(v) => onChange({ pulsePtr: v })} />
          <NumberBox label="Filter Table" value={config.filterPtr}
            min={0} max={255} hex
            onValueChange={(v) => onChange({ filterPtr: v })} />
          <NumberBox label="Speed Table" value={config.speedPtr}
            min={0} max={255} hex
            onValueChange={(v) => onChange({ speedPtr: v })} />
        </div>
        <div className="text-[8px] text-text-secondary mt-1.5 opacity-60">
          0 = disabled (filter/speed). Edit tables in the order-matrix view.
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  //  TAB 2: SID Monitor
  // ══════════════════════════════════════════════════════════════════
  const renderMonitorTab = () => {
    const chipCount = sidCount ?? 1;
    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow"
        style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {Array.from({ length: chipCount }, (_, chipIdx) => (
          <div key={chipIdx} className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label={chipCount > 1 ? `SID ${chipIdx + 1}` : 'SID Registers'} />
            <div className="font-mono text-[10px]" style={{ lineHeight: '1.6' }}>
              {/* Voices 1-3 */}
              {[0, 1, 2].map((voice) => {
                const base = voice * 7;
                return (
                  <div key={voice} className="mb-1.5">
                    <div className="text-[9px] font-bold mb-0.5"
                      style={{ color: accentColor, opacity: 0.6 }}>
                      Voice {voice + 1}
                    </div>
                    <div className="grid gap-x-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
                      {SID_VOICE_REGS.map(({ offset, label }) => {
                        const reg = base + offset;
                        const val = sidRegisters[chipIdx]?.[reg] ?? 0;
                        return (
                          <React.Fragment key={reg}>
                            <span className="text-text-secondary text-right">
                              R{reg.toString().padStart(2, '0')} {label}
                            </span>
                            <span style={{ color: val > 0 ? accentColor : '#444' }}>
                              {val.toString(16).toUpperCase().padStart(2, '0')}
                            </span>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Global: Filter + Mode/Vol */}
              <div className="mt-1">
                <div className="text-[9px] font-bold mb-0.5"
                  style={{ color: accentColor, opacity: 0.6 }}>
                  Filter
                </div>
                <div className="grid gap-x-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
                  {SID_GLOBAL_REGS.map(({ offset, label }) => {
                    const val = sidRegisters[chipIdx]?.[offset] ?? 0;
                    return (
                      <React.Fragment key={offset}>
                        <span className="text-text-secondary text-right">
                          R{offset.toString().padStart(2, '0')} {label}
                        </span>
                        <span style={{ color: val > 0 ? accentColor : '#444' }}>
                          {val.toString(16).toUpperCase().padStart(2, '0')}
                        </span>
                      </React.Fragment>
                    );
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
  //  Root layout with tab bar
  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: dimColor }}>
        {([['instrument', 'Instrument'], ['monitor', 'SID Monitor']] as const).map(([id, label]) => (
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
      {activeTab === 'instrument' && renderInstrumentTab()}
      {activeTab === 'monitor' && renderMonitorTab()}
    </div>
  );
};
