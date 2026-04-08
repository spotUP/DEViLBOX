/**
 * PixiEQEditors — GL-native EQ editors with vertical sliders + frequency response curve.
 * Mirrors the DOM EQ editors in EQModReverbEditors.tsx for the Pixi UI.
 *
 * Covers: ParametricEQ, EQ5Band, EQ8Band, EQ12Band, GEQ31, Kuiza, ZamEQ2, DynamicEQ
 */

import React from 'react';
import { PixiKnob, PixiLabel, PixiSlider } from '../../components';
import { PixiEQCurve, type PixiEQBand } from '../../components/PixiEQCurve';
import { usePixiTheme } from '../../theme';
import type { EffectConfig } from '@typedefs/instrument';

interface PixiEQEditorProps {
  effect: EffectConfig;
  onChange: (params: Record<string, number | string>) => void;
  onWetChange?: (wet: number) => void;
}

const CONTENT_W = 380;

function getNum(effect: EffectConfig, key: string, def: number): number {
  const v = effect.parameters[key];
  return typeof v === 'number' ? v : def;
}

function fmtFreq(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
}

// ============================================================================
// PARAMETRIC EQ (4-band peaking)
// ============================================================================

export const PixiParametricEQEditor: React.FC<PixiEQEditorProps> = ({ effect, onChange, onWetChange }) => {
  const theme = usePixiTheme();
  const bands = [
    { key: 'b1', defF: 100, color: 0xef4444, label: 'Band 1' },
    { key: 'b2', defF: 500, color: 0xf97316, label: 'Band 2' },
    { key: 'b3', defF: 2000, color: 0xeab308, label: 'Band 3' },
    { key: 'b4', defF: 8000, color: 0x22c55e, label: 'Band 4' },
  ];

  const eqBands: PixiEQBand[] = bands.map(b => ({
    type: 'peaking',
    freq: getNum(effect, `${b.key}Freq`, b.defF),
    gain: getNum(effect, `${b.key}Gain`, 0),
    q: getNum(effect, `${b.key}Q`, 0.7),
  }));

  return (
    <layoutContainer layout={{ width: CONTENT_W, flexDirection: 'column', gap: 8, padding: 8 }}>
      <PixiEQCurve bands={eqBands} width={CONTENT_W - 16} height={120} color={0xf97316} />
      {bands.map(b => (
        <layoutContainer key={b.key} layout={{
          width: CONTENT_W - 16, flexDirection: 'row', gap: 8, alignItems: 'center',
          justifyContent: 'space-around', padding: 4,
          borderRadius: 6, borderWidth: 1, borderColor: theme.border.color, backgroundColor: 0x000000,
        }}>
          <PixiLabel text={b.label} size="xs" color="textMuted" layout={{ width: 50 }} />
          <PixiKnob value={getNum(effect, `${b.key}Freq`, b.defF)} min={20} max={20000}
            onChange={v => onChange({ [`${b.key}Freq`]: v })} label="Freq" size="sm" color={b.color}
            logarithmic formatValue={fmtFreq} />
          <PixiSlider value={getNum(effect, `${b.key}Gain`, 0)} min={-18} max={18}
            onChange={v => onChange({ [`${b.key}Gain`]: v })} orientation="vertical"
            length={80} color={b.color} detent={0} showValue label="Gain"
            formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} />
          <PixiKnob value={getNum(effect, `${b.key}Q`, 0.7)} min={0.1} max={10}
            onChange={v => onChange({ [`${b.key}Q`]: v })} label="Q" size="sm" color={b.color}
            formatValue={v => v.toFixed(2)} />
        </layoutContainer>
      ))}
      {onWetChange && (
        <layoutContainer layout={{ width: CONTENT_W - 16, justifyContent: 'center', flexDirection: 'row' }}>
          <PixiKnob value={effect.wet} min={0} max={100} onChange={onWetChange}
            label="Mix" size="sm" formatValue={v => `${Math.round(v)}%`} />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

// ============================================================================
// EQ 5-BAND (low shelf + 3 peaks + high shelf)
// ============================================================================

export const PixiEQ5BandEditor: React.FC<PixiEQEditorProps> = ({ effect, onChange, onWetChange }) => {
  const theme = usePixiTheme();

  const eqBands: PixiEQBand[] = [
    { type: 'lowShelf', freq: getNum(effect, 'lowShelfFreq', 100), gain: getNum(effect, 'lowShelfGain', 0), q: 0.7 },
    { type: 'peaking', freq: getNum(effect, 'peak1Freq', 500), gain: getNum(effect, 'peak1Gain', 0), q: getNum(effect, 'peak1Q', 1) },
    { type: 'peaking', freq: getNum(effect, 'peak2Freq', 1500), gain: getNum(effect, 'peak2Gain', 0), q: getNum(effect, 'peak2Q', 1) },
    { type: 'peaking', freq: getNum(effect, 'peak3Freq', 5000), gain: getNum(effect, 'peak3Gain', 0), q: getNum(effect, 'peak3Q', 1) },
    { type: 'highShelf', freq: getNum(effect, 'highShelfFreq', 8000), gain: getNum(effect, 'highShelfGain', 0), q: 0.7 },
  ];

  const rows = [
    { label: 'Lo Shelf', fKey: 'lowShelfFreq', gKey: 'lowShelfGain', defF: 100, fMin: 20, fMax: 500, color: 0x059669 },
    { label: 'Peak 1', fKey: 'peak1Freq', gKey: 'peak1Gain', defF: 500, fMin: 20, fMax: 20000, color: 0x10b981 },
    { label: 'Peak 2', fKey: 'peak2Freq', gKey: 'peak2Gain', defF: 1500, fMin: 20, fMax: 20000, color: 0x34d399 },
    { label: 'Peak 3', fKey: 'peak3Freq', gKey: 'peak3Gain', defF: 5000, fMin: 20, fMax: 20000, color: 0x6ee7b7 },
    { label: 'Hi Shelf', fKey: 'highShelfFreq', gKey: 'highShelfGain', defF: 8000, fMin: 1000, fMax: 18000, color: 0x6ee7b7 },
  ];

  return (
    <layoutContainer layout={{ width: CONTENT_W, flexDirection: 'column', gap: 8, padding: 8 }}>
      <PixiEQCurve bands={eqBands} width={CONTENT_W - 16} height={120} color={0x10b981} />
      {rows.map(r => (
        <layoutContainer key={r.fKey} layout={{
          width: CONTENT_W - 16, flexDirection: 'row', gap: 8, alignItems: 'center',
          justifyContent: 'space-around', padding: 4,
          borderRadius: 6, borderWidth: 1, borderColor: theme.border.color, backgroundColor: 0x000000,
        }}>
          <PixiLabel text={r.label} size="xs" color="textMuted" layout={{ width: 55 }} />
          <PixiKnob value={getNum(effect, r.fKey, r.defF)} min={r.fMin} max={r.fMax}
            onChange={v => onChange({ [r.fKey]: v })} label="Freq" size="sm" color={r.color}
            logarithmic formatValue={fmtFreq} />
          <PixiSlider value={getNum(effect, r.gKey, 0)} min={-18} max={18}
            onChange={v => onChange({ [r.gKey]: v })} orientation="vertical"
            length={80} color={r.color} detent={0} showValue label="Gain"
            formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} />
        </layoutContainer>
      ))}
      {onWetChange && (
        <layoutContainer layout={{ width: CONTENT_W - 16, justifyContent: 'center', flexDirection: 'row' }}>
          <PixiKnob value={effect.wet} min={0} max={100} onChange={onWetChange}
            label="Mix" size="sm" formatValue={v => `${Math.round(v)}%`} />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

// ============================================================================
// EQ 8-BAND (HP + low shelf + 4 peaks + high shelf + LP)
// ============================================================================

export const PixiEQ8BandEditor: React.FC<PixiEQEditorProps> = ({ effect, onChange, onWetChange }) => {
  const theme = usePixiTheme();
  const peakDefaults = [250, 1000, 3500, 8000];
  const peakColors = [0x2563eb, 0x3b82f6, 0x60a5fa, 0x93c5fd];

  const eqBands: PixiEQBand[] = [
    { type: 'highpass', freq: getNum(effect, 'hpFreq', 20), gain: 0, q: 0.7 },
    { type: 'lowShelf', freq: getNum(effect, 'lowShelfFreq', 100), gain: getNum(effect, 'lowShelfGain', 0), q: 0.7 },
    ...[1, 2, 3, 4].map(b => ({
      type: 'peaking' as const,
      freq: getNum(effect, `peak${b}Freq`, peakDefaults[b - 1]),
      gain: getNum(effect, `peak${b}Gain`, 0),
      q: getNum(effect, `peak${b}Q`, 1),
    })),
    { type: 'highShelf' as const, freq: getNum(effect, 'highShelfFreq', 8000), gain: getNum(effect, 'highShelfGain', 0), q: 0.7 },
    { type: 'lowpass' as const, freq: getNum(effect, 'lpFreq', 20000), gain: 0, q: 0.7 },
  ];

  return (
    <layoutContainer layout={{ width: CONTENT_W, flexDirection: 'column', gap: 8, padding: 8 }}>
      <PixiEQCurve bands={eqBands} width={CONTENT_W - 16} height={130} color={0x3b82f6} dbRange={24} />
      {/* Filters */}
      <layoutContainer layout={{
        width: CONTENT_W - 16, flexDirection: 'row', gap: 8, justifyContent: 'center', padding: 4,
        borderRadius: 6, borderWidth: 1, borderColor: theme.border.color, backgroundColor: 0x000000,
      }}>
        <PixiKnob value={getNum(effect, 'hpFreq', 20)} min={20} max={2000}
          onChange={v => onChange({ hpFreq: v })} label="HP" size="sm" color={0x60a5fa}
          logarithmic formatValue={fmtFreq} />
        <PixiKnob value={getNum(effect, 'lpFreq', 20000)} min={1000} max={20000}
          onChange={v => onChange({ lpFreq: v })} label="LP" size="sm" color={0x60a5fa}
          logarithmic formatValue={fmtFreq} />
      </layoutContainer>
      {/* Shelves */}
      <layoutContainer layout={{
        width: CONTENT_W - 16, flexDirection: 'row', gap: 6, justifyContent: 'center',
        alignItems: 'center', padding: 4,
        borderRadius: 6, borderWidth: 1, borderColor: theme.border.color, backgroundColor: 0x000000,
      }}>
        <PixiKnob value={getNum(effect, 'lowShelfFreq', 100)} min={20} max={1000}
          onChange={v => onChange({ lowShelfFreq: v })} label="Lo F" size="sm" color={0x3b82f6}
          logarithmic formatValue={fmtFreq} />
        <PixiSlider value={getNum(effect, 'lowShelfGain', 0)} min={-36} max={36}
          onChange={v => onChange({ lowShelfGain: v })} orientation="vertical"
          length={70} color={0x3b82f6} detent={0} showValue label="Lo G"
          formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}`} />
        <PixiKnob value={getNum(effect, 'highShelfFreq', 8000)} min={1000} max={20000}
          onChange={v => onChange({ highShelfFreq: v })} label="Hi F" size="sm" color={0x60a5fa}
          logarithmic formatValue={fmtFreq} />
        <PixiSlider value={getNum(effect, 'highShelfGain', 0)} min={-36} max={36}
          onChange={v => onChange({ highShelfGain: v })} orientation="vertical"
          length={70} color={0x60a5fa} detent={0} showValue label="Hi G"
          formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}`} />
      </layoutContainer>
      {/* Peaks */}
      {[1, 2, 3, 4].map(b => (
        <layoutContainer key={b} layout={{
          width: CONTENT_W - 16, flexDirection: 'row', gap: 6, justifyContent: 'center',
          alignItems: 'center', padding: 4,
          borderRadius: 6, borderWidth: 1, borderColor: theme.border.color, backgroundColor: 0x000000,
        }}>
          <PixiLabel text={`P${b}`} size="xs" color="textMuted" layout={{ width: 20 }} />
          <PixiKnob value={getNum(effect, `peak${b}Freq`, peakDefaults[b - 1])} min={20} max={20000}
            onChange={v => onChange({ [`peak${b}Freq`]: v })} label="Freq" size="sm" color={peakColors[b - 1]}
            logarithmic formatValue={fmtFreq} />
          <PixiSlider value={getNum(effect, `peak${b}Gain`, 0)} min={-36} max={36}
            onChange={v => onChange({ [`peak${b}Gain`]: v })} orientation="vertical"
            length={70} color={peakColors[b - 1]} detent={0} showValue label="Gain"
            formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}`} />
          <PixiKnob value={getNum(effect, `peak${b}Q`, 1)} min={0.1} max={10}
            onChange={v => onChange({ [`peak${b}Q`]: v })} label="Q" size="sm" color={peakColors[b - 1]}
            formatValue={v => v.toFixed(1)} />
        </layoutContainer>
      ))}
      {onWetChange && (
        <layoutContainer layout={{ width: CONTENT_W - 16, justifyContent: 'center', flexDirection: 'row' }}>
          <PixiKnob value={effect.wet} min={0} max={100} onChange={onWetChange}
            label="Mix" size="sm" formatValue={v => `${Math.round(v)}%`} />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

// ============================================================================
// EQ 12-BAND (graphic EQ with vertical sliders)
// ============================================================================

const EQ12_FREQS = [30, 80, 160, 400, 800, 1500, 3000, 5000, 8000, 12000, 14000, 18000];

export const PixiEQ12BandEditor: React.FC<PixiEQEditorProps> = ({ effect, onChange, onWetChange }) => {
  const eqBands: PixiEQBand[] = EQ12_FREQS.map((freq, i) => ({
    type: 'peaking' as const,
    freq,
    gain: getNum(effect, `gain_${i}`, 0),
    q: getNum(effect, `q_${i}`, 1),
  }));

  return (
    <layoutContainer layout={{ width: CONTENT_W, flexDirection: 'column', gap: 8, padding: 8 }}>
      <PixiEQCurve bands={eqBands} width={CONTENT_W - 16} height={130} color={0x3b82f6} dbRange={24} />
      {/* Sliders row */}
      <layoutContainer layout={{
        width: CONTENT_W - 16, flexDirection: 'row', gap: 2, justifyContent: 'center',
        alignItems: 'flex-end', padding: 4,
      }}>
        {EQ12_FREQS.map((freq, i) => {
          const hue = Math.round(210 + (i / 11) * 60);
          const color = hslToHex(hue, 70, 55);
          return (
            <layoutContainer key={i} layout={{ flexDirection: 'column', gap: 2, alignItems: 'center' }}>
              <PixiSlider value={getNum(effect, `gain_${i}`, 0)} min={-36} max={36}
                onChange={v => onChange({ [`gain_${i}`]: v })} orientation="vertical"
                length={100} color={color} detent={0} />
              <PixiLabel text={fmtFreq(freq)} size="xs" color="textMuted" />
            </layoutContainer>
          );
        })}
      </layoutContainer>
      {onWetChange && (
        <layoutContainer layout={{ width: CONTENT_W - 16, justifyContent: 'center', flexDirection: 'row' }}>
          <PixiKnob value={effect.wet} min={0} max={100} onChange={onWetChange}
            label="Mix" size="sm" formatValue={v => `${Math.round(v)}%`} />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

// ============================================================================
// GEQ 31-BAND (graphic EQ)
// ============================================================================

const GEQ31_FREQS = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
  200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];

export const PixiGEQ31Editor: React.FC<PixiEQEditorProps> = ({ effect, onChange, onWetChange }) => {
  const eqBands: PixiEQBand[] = GEQ31_FREQS.map((freq, i) => ({
    type: 'peaking' as const,
    freq,
    gain: getNum(effect, `band_${i}`, 0),
    q: 2.5,
  }));

  return (
    <layoutContainer layout={{ width: CONTENT_W, flexDirection: 'column', gap: 8, padding: 8 }}>
      <PixiEQCurve bands={eqBands} width={CONTENT_W - 16} height={130} color={0x3b82f6} dbRange={12} />
      {/* Sliders — two rows of ~16 */}
      {[0, 16].map(startIdx => (
        <layoutContainer key={startIdx} layout={{
          width: CONTENT_W - 16, flexDirection: 'row', gap: 1, justifyContent: 'center',
          alignItems: 'flex-end', padding: 2,
        }}>
          {GEQ31_FREQS.slice(startIdx, Math.min(startIdx + 16, 31)).map((freq, j) => {
            const i = startIdx + j;
            const hue = Math.round(210 + (i / 30) * 60);
            const color = hslToHex(hue, 70, 55);
            return (
              <layoutContainer key={i} layout={{ flexDirection: 'column', gap: 1, alignItems: 'center' }}>
                <PixiSlider value={getNum(effect, `band_${i}`, 0)} min={-12} max={12}
                  onChange={v => onChange({ [`band_${i}`]: v })} orientation="vertical"
                  length={90} color={color} detent={0} />
                <PixiLabel text={freq >= 1000 ? `${(freq / 1000).toFixed(freq >= 10000 ? 0 : 1)}k` : `${freq}`}
                  size="xs" color="textMuted" />
              </layoutContainer>
            );
          })}
        </layoutContainer>
      ))}
      {onWetChange && (
        <layoutContainer layout={{ width: CONTENT_W - 16, justifyContent: 'center', flexDirection: 'row' }}>
          <PixiKnob value={effect.wet} min={0} max={100} onChange={onWetChange}
            label="Mix" size="sm" formatValue={v => `${Math.round(v)}%`} />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

// ============================================================================
// KUIZA (4-band EQ: low shelf + 2 peak + high shelf)
// ============================================================================

export const PixiKuizaEditor: React.FC<PixiEQEditorProps> = ({ effect, onChange, onWetChange }) => {
  const eqBands: PixiEQBand[] = [
    { type: 'lowShelf', freq: 200, gain: getNum(effect, 'low', 0), q: 0.7 },
    { type: 'peaking', freq: 800, gain: getNum(effect, 'lowMid', 0), q: 1 },
    { type: 'peaking', freq: 3000, gain: getNum(effect, 'highMid', 0), q: 1 },
    { type: 'highShelf', freq: 8000, gain: getNum(effect, 'high', 0), q: 0.7 },
  ];

  const sliders = [
    { key: 'low', label: 'Low', color: 0x0d9488 },
    { key: 'lowMid', label: 'Lo-Mid', color: 0x14b8a6 },
    { key: 'highMid', label: 'Hi-Mid', color: 0x2dd4bf },
    { key: 'high', label: 'High', color: 0x5eead4 },
  ];

  return (
    <layoutContainer layout={{ width: CONTENT_W, flexDirection: 'column', gap: 8, padding: 8 }}>
      <PixiEQCurve bands={eqBands} width={CONTENT_W - 16} height={120} color={0x14b8a6} />
      <layoutContainer layout={{
        width: CONTENT_W - 16, flexDirection: 'row', gap: 12, justifyContent: 'center',
        alignItems: 'flex-end', padding: 8,
      }}>
        {sliders.map(s => (
          <layoutContainer key={s.key} layout={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
            <PixiSlider value={getNum(effect, s.key, 0)} min={-18} max={18}
              onChange={v => onChange({ [s.key]: v })} orientation="vertical"
              length={100} color={s.color} detent={0} showValue
              formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} />
            <PixiLabel text={s.label} size="xs" color="textMuted" />
          </layoutContainer>
        ))}
      </layoutContainer>
      <layoutContainer layout={{ width: CONTENT_W - 16, flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
        <PixiKnob value={getNum(effect, 'gain', 0)} min={-12} max={12}
          onChange={v => onChange({ gain: v })} label="Gain" size="sm" color={0x99f6e4}
          formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} />
        {onWetChange && (
          <PixiKnob value={effect.wet} min={0} max={100} onChange={onWetChange}
            label="Mix" size="sm" formatValue={v => `${Math.round(v)}%`} />
        )}
      </layoutContainer>
    </layoutContainer>
  );
};

// ============================================================================
// ZAMEQ2 (2-band parametric)
// ============================================================================

export const PixiZamEQ2Editor: React.FC<PixiEQEditorProps> = ({ effect, onChange, onWetChange }) => {
  const theme = usePixiTheme();
  const bwToQ = (bw: number) => 1 / (2 * Math.sinh(Math.log(2) / 2 * bw));

  const eqBands: PixiEQBand[] = [
    { type: 'peaking', freq: getNum(effect, 'lowFreq', 200), gain: getNum(effect, 'lowGain', 0), q: bwToQ(getNum(effect, 'lowBw', 1)) },
    { type: 'peaking', freq: getNum(effect, 'highFreq', 4000), gain: getNum(effect, 'highGain', 0), q: bwToQ(getNum(effect, 'highBw', 1)) },
  ];

  const rows = [
    { label: 'Low', fKey: 'lowFreq', gKey: 'lowGain', bwKey: 'lowBw', defF: 200, fMin: 20, fMax: 2000, color: 0x0284c7 },
    { label: 'High', fKey: 'highFreq', gKey: 'highGain', bwKey: 'highBw', defF: 4000, fMin: 500, fMax: 16000, color: 0x38bdf8 },
  ];

  return (
    <layoutContainer layout={{ width: CONTENT_W, flexDirection: 'column', gap: 8, padding: 8 }}>
      <PixiEQCurve bands={eqBands} width={CONTENT_W - 16} height={120} color={0x0ea5e9} />
      {rows.map(r => (
        <layoutContainer key={r.fKey} layout={{
          width: CONTENT_W - 16, flexDirection: 'row', gap: 8, alignItems: 'center',
          justifyContent: 'space-around', padding: 4,
          borderRadius: 6, borderWidth: 1, borderColor: theme.border.color, backgroundColor: 0x000000,
        }}>
          <PixiLabel text={r.label} size="xs" color="textMuted" layout={{ width: 35 }} />
          <PixiKnob value={getNum(effect, r.fKey, r.defF)} min={r.fMin} max={r.fMax}
            onChange={v => onChange({ [r.fKey]: v })} label="Freq" size="sm" color={r.color}
            logarithmic formatValue={fmtFreq} />
          <PixiSlider value={getNum(effect, r.gKey, 0)} min={-18} max={18}
            onChange={v => onChange({ [r.gKey]: v })} orientation="vertical"
            length={80} color={r.color} detent={0} showValue label="Gain"
            formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} />
          <PixiKnob value={getNum(effect, r.bwKey, 1)} min={0.1} max={6}
            onChange={v => onChange({ [r.bwKey]: v })} label="BW" size="sm" color={r.color}
            formatValue={v => v.toFixed(1)} />
        </layoutContainer>
      ))}
      {onWetChange && (
        <layoutContainer layout={{ width: CONTENT_W - 16, justifyContent: 'center', flexDirection: 'row' }}>
          <PixiKnob value={effect.wet} min={0} max={100} onChange={onWetChange}
            label="Mix" size="sm" formatValue={v => `${Math.round(v)}%`} />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

// ============================================================================
// DYNAMIC EQ
// ============================================================================

export const PixiDynamicEQEditor: React.FC<PixiEQEditorProps> = ({ effect, onChange, onWetChange }) => {
  const theme = usePixiTheme();

  const eqBands: PixiEQBand[] = [
    { type: 'peaking', freq: getNum(effect, 'processFreq', 1000), gain: getNum(effect, 'maxGain', 0), q: getNum(effect, 'processQ', 1) },
  ];

  return (
    <layoutContainer layout={{ width: CONTENT_W, flexDirection: 'column', gap: 8, padding: 8 }}>
      <PixiEQCurve bands={eqBands} width={CONTENT_W - 16} height={100} color={0x8b5cf6} />
      {/* Detection */}
      <layoutContainer layout={{
        width: CONTENT_W - 16, flexDirection: 'row', gap: 8, justifyContent: 'center', padding: 4,
        borderRadius: 6, borderWidth: 1, borderColor: theme.border.color, backgroundColor: 0x000000,
      }}>
        <PixiKnob value={getNum(effect, 'detectFreq', 1000)} min={20} max={20000}
          onChange={v => onChange({ detectFreq: v })} label="Detect" size="sm" color={0x8b5cf6}
          logarithmic formatValue={fmtFreq} />
        <PixiKnob value={getNum(effect, 'detectQ', 1)} min={0.1} max={10}
          onChange={v => onChange({ detectQ: v })} label="Q" size="sm" color={0xa78bfa}
          formatValue={v => v.toFixed(1)} />
        <PixiKnob value={getNum(effect, 'threshold', -20)} min={-60} max={0}
          onChange={v => onChange({ threshold: v })} label="Thresh" size="sm" color={0xa78bfa}
          formatValue={v => `${v.toFixed(0)} dB`} />
      </layoutContainer>
      {/* Processing */}
      <layoutContainer layout={{
        width: CONTENT_W - 16, flexDirection: 'row', gap: 8, justifyContent: 'center', padding: 4,
        borderRadius: 6, borderWidth: 1, borderColor: theme.border.color, backgroundColor: 0x000000,
      }}>
        <PixiKnob value={getNum(effect, 'processFreq', 1000)} min={20} max={20000}
          onChange={v => onChange({ processFreq: v })} label="Proc F" size="sm" color={0xc4b5fd}
          logarithmic formatValue={fmtFreq} />
        <PixiKnob value={getNum(effect, 'processQ', 1)} min={0.1} max={10}
          onChange={v => onChange({ processQ: v })} label="Proc Q" size="sm" color={0xc4b5fd}
          formatValue={v => v.toFixed(1)} />
        <PixiSlider value={getNum(effect, 'maxGain', 0)} min={-18} max={18}
          onChange={v => onChange({ maxGain: v })} orientation="vertical"
          length={70} color={0xddd6fe} detent={0} showValue label="Max G"
          formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} />
      </layoutContainer>
      {/* Timing */}
      <layoutContainer layout={{
        width: CONTENT_W - 16, flexDirection: 'row', gap: 12, justifyContent: 'center', padding: 4,
        borderRadius: 6, borderWidth: 1, borderColor: theme.border.color, backgroundColor: 0x000000,
      }}>
        <PixiKnob value={getNum(effect, 'attack', 10)} min={0.1} max={200}
          onChange={v => onChange({ attack: v })} label="Atk" size="sm" color={0xddd6fe}
          formatValue={v => `${v.toFixed(1)}ms`} />
        <PixiKnob value={getNum(effect, 'release', 100)} min={5} max={2000}
          onChange={v => onChange({ release: v })} label="Rel" size="sm" color={0xede9fe}
          formatValue={v => `${Math.round(v)}ms`} />
        {onWetChange && (
          <PixiKnob value={effect.wet} min={0} max={100} onChange={onWetChange}
            label="Mix" size="sm" formatValue={v => `${Math.round(v)}%`} />
        )}
      </layoutContainer>
    </layoutContainer>
  );
};

// ============================================================================
// Utility: HSL to hex (for computed slider colors)
// ============================================================================

function hslToHex(h: number, s: number, l: number): number {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
