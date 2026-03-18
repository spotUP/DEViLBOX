/**
 * FZ Hardware UI — Casio FZ-1 (1987)
 * Professional white/light-gray sampler aesthetic
 */

import React, { useRef, useEffect } from 'react';
import { HWKnob, HWDisplay } from './MAMESharedKnob';

interface FZHardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const CYAN = '#06b6d4';
const TEAL = '#0891b2';

export const FZHardware: React.FC<FZHardwareProps> = ({ parameters, onParamChange }) => {
  const configRef = useRef(parameters);
  useEffect(() => { configRef.current = parameters; }, [parameters]);

  const p = (key: string, fallback: number) =>
    parameters[key] !== undefined ? parameters[key] : fallback;

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl select-none"
      style={{
        background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)',
        border: '2px solid #333',
      }}
    >
      {/* Top panel — Casio white strip */}
      <div
        className="px-5 py-3 border-b"
        style={{
          background: 'linear-gradient(90deg, #e8e8e8 0%, #f0f0f0 50%, #e8e8e8 100%)',
          borderColor: '#bbb',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div style={{ color: '#777', fontSize: 8, letterSpacing: '0.3em', textTransform: 'uppercase' }}>CASIO</div>
            <div style={{ color: '#1a1a1a', fontSize: 24, fontWeight: 900, letterSpacing: '0.05em' }}>FZ-1</div>
            <div style={{ color: '#555', fontSize: 7, letterSpacing: '0.2em' }}>FULL SAMPLING SYNTHESIZER</div>
          </div>

          {/* LCD panel */}
          <div
            className="rounded px-3 py-2"
            style={{
              background: '#8db88d',
              border: '1px solid #6a9a6a',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
              minWidth: 160,
            }}
          >
            <div style={{ color: '#1a2e1a', fontSize: 7, opacity: 0.7 }}>CASIO FZ-1  SAMPLING</div>
            <div style={{ color: '#1a2e1a', fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' }}>
              VOICE:{Math.round(p('voice', 0)).toString().padStart(2, '0')} VOL:{Math.round(p('volume', 0.8) * 100)}%
            </div>
            <div style={{ color: '#1a2e1a', fontSize: 7, opacity: 0.6 }}>
              16-BIT LINEAR  44.1KHZ
            </div>
          </div>
        </div>
      </div>

      {/* Main panel */}
      <div className="p-5">
        <div className="flex gap-8 items-start justify-center">

          {/* Output section */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: CYAN, fontSize: 8, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${CYAN}30` }}
            >
              OUTPUT
            </div>
            <div className="flex justify-center">
              <HWKnob
                label="Volume"
                value={p('volume', 0.8)}
                onChange={(v) => onParamChange('volume', v)}
                color={CYAN}
                size="lg"
                formatDisplay={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          </div>

          {/* Voice selection */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: CYAN, fontSize: 8, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${CYAN}30` }}
            >
              VOICE
            </div>
            <div className="flex flex-col items-center gap-3">
              <HWDisplay value={p('voice', 0)} label="Current Voice" color={TEAL} width={72} />
              <HWKnob
                label="Voice Select"
                value={p('voice', 0)}
                min={0}
                max={7}
                step={1}
                onChange={(v) => onParamChange('voice', Math.round(v))}
                color={CYAN}
                size="md"
                formatDisplay={(v) => `V${Math.round(v)}`}
              />
            </div>
          </div>

          {/* Bank buttons */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: CYAN, fontSize: 8, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${CYAN}30` }}
            >
              VOICE SELECT
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 8 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onParamChange('voice', i)}
                  className="rounded-sm font-mono font-bold transition-all"
                  style={{
                    width: 32,
                    height: 24,
                    fontSize: 9,
                    background: Math.round(p('voice', 0)) === i
                      ? `${CYAN}25`
                      : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${Math.round(p('voice', 0)) === i ? CYAN : 'rgba(255,255,255,0.1)'}`,
                    color: Math.round(p('voice', 0)) === i ? CYAN : 'rgba(255,255,255,0.4)',
                    boxShadow: Math.round(p('voice', 0)) === i ? `0 0 6px ${CYAN}30` : undefined,
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            {/* Sample type info */}
            <div
              className="mt-3 rounded px-2 py-1.5 text-center"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                SAMPLE FORMAT
              </div>
              <div style={{ color: CYAN, fontSize: 9, fontFamily: 'monospace', marginTop: 2 }}>
                16-BIT  •  2MB WAVE RAM
              </div>
            </div>
          </div>

          {/* Tuning */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: CYAN, fontSize: 8, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${CYAN}30` }}
            >
              TUNING
            </div>
            <HWKnob
              label="Pitch Fine"
              value={p('pitch_fine', 0)}
              min={-1}
              max={1}
              onChange={(v) => onParamChange('pitch_fine', v)}
              color={TEAL}
              size="md"
              formatDisplay={(v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}c`}
            />
          </div>

        </div>
      </div>

      {/* Bottom info */}
      <div
        className="px-5 py-1 text-center"
        style={{ background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          8 VOICES  •  16-BIT LINEAR PCM  •  MAX 2MB SAMPLE MEMORY  •  1987
        </div>
      </div>
    </div>
  );
};
