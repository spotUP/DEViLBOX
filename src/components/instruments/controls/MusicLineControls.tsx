/**
 * MusicLineControls — Info panel for MusicLine Editor waveform instruments.
 *
 * MusicLine waveform instruments store the SHAPE as actual PCM in the SMPL chunk.
 * The `inst_SmplType` field (stored as mlSynthConfig.waveformType) is a LOOP SIZE
 * selector, not a shape selector:
 *   1 → 32-sample loop  (8287/32  ≈ C3 at PAL C3 period)
 *   2 → 64-sample loop  (8287/64  ≈ C2)
 *   3 → 128-sample loop (8287/128 ≈ C1)
 *   4 → 256-sample loop (8287/256 ≈ C0)
 *
 * Because the waveform shape comes from the SMPL data (parsed at import time),
 * it cannot be regenerated from the type number alone, so this panel is read-only.
 */

import React from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';

// ── Constants ──────────────────────────────────────────────────────────────────

const PAL_C3_RATE = 8287;

const LOOP_SIZE_DEFS: Record<number, { samples: number; approxNote: string }> = {
  1: { samples: 32,  approxNote: 'C-3' },
  2: { samples: 64,  approxNote: 'C-2' },
  3: { samples: 128, approxNote: 'C-1' },
  4: { samples: 256, approxNote: 'C-0' },
  5: { samples: 256, approxNote: 'C-0' },
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface MusicLineControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const MusicLineControls: React.FC<MusicLineControlsProps> = ({ instrument }) => {
  const mlConfig = instrument.metadata?.mlSynthConfig;
  const waveformType: number = mlConfig?.waveformType ?? 3;
  const volume = mlConfig?.volume ?? 64;

  const loopDef = LOOP_SIZE_DEFS[waveformType] ?? { samples: 256, approxNote: '?' };
  const freq = Math.round(PAL_C3_RATE / loopDef.samples);

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
      {/* Loop size row */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: 2, color: '#4a4a6a', textTransform: 'uppercase', marginBottom: 10 }}>
          Waveform Loop
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: '#0e0e18',
          border: '1px solid #2a2a4a',
          borderRadius: 6,
        }}>
          {/* Loop size badge */}
          <div style={{
            padding: '6px 14px',
            background: '#1a1a30',
            border: '1px solid #6060ff',
            borderRadius: 4,
            fontSize: 18,
            fontWeight: 'bold',
            color: '#a0a0ff',
            letterSpacing: 1,
          }}>
            {loopDef.samples}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12, color: '#7a7a9a' }}>
              {loopDef.samples}-sample single-cycle waveform
            </span>
            <span style={{ fontSize: 10, color: '#4a4a6a' }}>
              Loop type {waveformType} · {freq} Hz fundamental at {loopDef.approxNote}
            </span>
          </div>
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
        <InfoItem label="Sample rate" value={`${PAL_C3_RATE} Hz`} />
        <InfoItem label="Loop" value="Full cycle" />
        <InfoItem label="Base note" value={loopDef.approxNote} />
      </div>

      {/* Note */}
      <div style={{
        fontSize: 9,
        color: '#3a3a5a',
        lineHeight: 1.6,
        letterSpacing: 0.5,
      }}>
        Waveform shape is stored as PCM in the song file and cannot be edited here.
        The loop type determines the playback pitch at a given note trigger.
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
