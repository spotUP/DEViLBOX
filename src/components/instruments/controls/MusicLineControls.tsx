/**
 * MusicLineControls — Editor panel for MusicLine Editor waveform instruments
 *
 * MusicLine Editor supports three single-cycle waveform types:
 *   1 = Sine
 *   2 = Sawtooth
 *   3 = Square
 *
 * Each waveform is a 32-sample loop played at PAL_C3_RATE (8287 Hz), producing
 * a C-3 fundamental when triggered at Amiga period 428.
 *
 * Allows changing the waveform type (regenerates the sample PCM in-place).
 */

import React, { useCallback, useRef, useEffect } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { WaveformThumbnail } from '../shared/WaveformThumbnail';
import { createSamplerInstrument } from '@lib/import/formats/AmigaUtils';
import { generateMusicLineWaveformPcm } from '@lib/import/formats/MusicLineParser';

// ── Constants ──────────────────────────────────────────────────────────────────

const PAL_C3_RATE = 8287;
const ML_WAVE_SAMPLES = 32;

const WAVE_DEFS = [
  { type: 1 as const, label: 'Sine',   thumbType: 'sine'   as const },
  { type: 2 as const, label: 'Saw',    thumbType: 'saw'    as const },
  { type: 3 as const, label: 'Square', thumbType: 'square' as const },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface MusicLineControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const MusicLineControls: React.FC<MusicLineControlsProps> = ({ instrument, onChange }) => {
  const instrumentRef = useRef(instrument);
  useEffect(() => { instrumentRef.current = instrument; }, [instrument]);

  const mlConfig = instrument.metadata?.mlSynthConfig;
  const waveformType: 1 | 2 | 3 = mlConfig?.waveformType ?? 1;
  const volume = mlConfig?.volume ?? 64;

  const handleWaveformChange = useCallback((newType: 1 | 2 | 3) => {
    const cur = instrumentRef.current;
    const pcm = generateMusicLineWaveformPcm(newType);
    const rebuilt = createSamplerInstrument(
      cur.id,
      cur.name,
      pcm,
      volume,
      PAL_C3_RATE,
      0,
      ML_WAVE_SAMPLES,
    );
    onChange({
      sample: rebuilt.sample,
      metadata: {
        ...cur.metadata,
        mlSynthConfig: { waveformType: newType, volume },
        displayType: WAVE_DEFS.find(w => w.type === newType)?.label
          ? `ML ${WAVE_DEFS.find(w => w.type === newType)!.label}`
          : cur.metadata?.displayType,
      },
    });
  }, [onChange, volume]);

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #0a0a12 0%, #060608 100%)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        fontFamily: 'monospace',
      }}
    >
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1e1e2e', paddingBottom: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: '#4a4a6a', textTransform: 'uppercase', marginBottom: 2 }}>
          MusicLine Editor
        </div>
        <div style={{ fontSize: 13, color: '#7a7a9a', fontFamily: 'sans-serif' }}>
          Single-cycle waveform · 32 samples · {PAL_C3_RATE} Hz
        </div>
      </div>

      {/* Waveform type selector */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: 2, color: '#4a4a6a', textTransform: 'uppercase', marginBottom: 10 }}>
          Waveform
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {WAVE_DEFS.map(({ type, label, thumbType }) => {
            const isActive = waveformType === type;
            return (
              <button
                key={type}
                onClick={() => handleWaveformChange(type)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 8px',
                  background: isActive ? '#1a1a2e' : '#0e0e18',
                  border: `1px solid ${isActive ? '#6060ff' : '#1e1e2e'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  outline: isActive ? '1px solid #3030a0' : 'none',
                  transition: 'border-color 0.12s',
                }}
              >
                <WaveformThumbnail
                  type={thumbType}
                  width={64}
                  height={28}
                  color={isActive ? '#8080ff' : '#404060'}
                />
                <span style={{
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  color: isActive ? '#a0a0ff' : '#4a4a6a',
                }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Info row */}
      <div style={{
        display: 'flex',
        gap: 24,
        padding: '10px 14px',
        background: '#0e0e18',
        border: '1px solid #1e1e2e',
        borderRadius: 6,
      }}>
        <InfoItem label="Volume" value={`${volume} / 64`} />
        <InfoItem label="Loop" value="Full cycle" />
        <InfoItem label="Tuning" value="Amiga period" />
        <InfoItem label="Base note" value="C-3" />
      </div>
    </div>
  );
};

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#4a4a6a' }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: '#7a7a9a', fontFamily: 'monospace' }}>
        {value}
      </span>
    </div>
  );
}
