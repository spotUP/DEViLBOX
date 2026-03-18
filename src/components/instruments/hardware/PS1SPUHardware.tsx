/**
 * PS1SPU Hardware UI — Sony PlayStation CXD2922BQ SPU (1994)
 * Dark Sony PlayStation aesthetic
 */

import React, { useRef, useEffect } from 'react';
import { HWKnob, HWDisplay } from './MAMESharedKnob';

interface PS1SPUHardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const BLUE = '#3b82f6';
const BLUE_DIM = '#1d4ed8';

export const PS1SPUHardware: React.FC<PS1SPUHardwareProps> = ({ parameters, onParamChange }) => {
  const configRef = useRef(parameters);
  useEffect(() => { configRef.current = parameters; }, [parameters]);

  const p = (key: string, fallback: number) =>
    parameters[key] !== undefined ? parameters[key] : fallback;

  const currentVoice = Math.round(p('voice', 0));

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl select-none"
      style={{
        background: 'linear-gradient(160deg, #1c1c2e 0%, #0d0d1a 100%)',
        border: '2px solid #252535',
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 border-b"
        style={{
          background: 'linear-gradient(90deg, #12122a 0%, #1a1a3a 50%, #12122a 100%)',
          borderColor: `${BLUE}25`,
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div style={{ color: `${BLUE}70`, fontSize: 8, letterSpacing: '0.4em', textTransform: 'uppercase' }}>SONY</div>
            <div style={{ color: '#e0e0ff', fontSize: 20, fontWeight: 900, letterSpacing: '0.05em' }}>PlayStation SPU</div>
            <div style={{ color: `${BLUE}60`, fontSize: 7, letterSpacing: '0.2em' }}>CXD2922BQ SOUND PROCESSING UNIT</div>
          </div>

          {/* PlayStation symbol buttons */}
          <div className="flex gap-2">
            {[
              { sym: '△', col: '#26ab45' },
              { sym: '○', col: '#e0506a' },
              { sym: '✕', col: '#5f9aea' },
              { sym: '□', col: '#c87cbf' },
            ].map(({ sym, col }) => (
              <div
                key={sym}
                className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm"
                style={{
                  background: '#0d0d1a',
                  border: `1px solid ${col}40`,
                  color: col,
                  textShadow: `0 0 6px ${col}`,
                  fontSize: 12,
                }}
              >
                {sym}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main controls */}
      <div className="p-5">
        <div className="flex gap-8 items-start justify-center">

          {/* Output */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: `${BLUE}80`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${BLUE}20` }}
            >
              OUTPUT LEVEL
            </div>
            <div className="flex justify-center">
              <HWKnob
                label="Volume"
                value={p('volume', 0.8)}
                onChange={(v) => onParamChange('volume', v)}
                color={BLUE}
                size="lg"
                formatDisplay={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          </div>

          {/* Voice selector */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: `${BLUE}80`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${BLUE}20` }}
            >
              VOICE SELECT
            </div>
            <div className="flex flex-col items-center gap-3">
              <HWDisplay value={currentVoice} label="Voice" color={BLUE} width={72} />
              <HWKnob
                label="Voice"
                value={p('voice', 0)}
                min={0}
                max={23}
                step={1}
                onChange={(v) => onParamChange('voice', Math.round(v))}
                color={BLUE_DIM}
                size="md"
                formatDisplay={(v) => `V${Math.round(v).toString().padStart(2, '0')}`}
              />
            </div>
          </div>

          {/* 24-voice grid */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: `${BLUE}80`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${BLUE}20` }}
            >
              24 VOICES
            </div>
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
              {Array.from({ length: 24 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onParamChange('voice', i)}
                  className="rounded font-mono font-bold transition-all"
                  style={{
                    width: 24,
                    height: 18,
                    fontSize: 7,
                    background: currentVoice === i ? `${BLUE}30` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${currentVoice === i ? BLUE : 'rgba(255,255,255,0.08)'}`,
                    color: currentVoice === i ? BLUE : 'rgba(255,255,255,0.3)',
                    boxShadow: currentVoice === i ? `0 0 4px ${BLUE}30` : undefined,
                  }}
                >
                  {i.toString().padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>

          {/* ADSR Envelope */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: `${BLUE}80`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${BLUE}20` }}
            >
              ENVELOPE
            </div>
            <div className="flex gap-3 justify-center">
              <HWKnob label="Attack" value={p('adsr_attack', 0.01)} onChange={(v) => onParamChange('adsr_attack', v)} color={BLUE} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}`} />
              <HWKnob label="Decay" value={p('adsr_decay', 0.1)} onChange={(v) => onParamChange('adsr_decay', v)} color={BLUE} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}`} />
              <HWKnob label="Sustain" value={p('adsr_sustain', 0.7)} onChange={(v) => onParamChange('adsr_sustain', v)} color={BLUE} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}%`} />
              <HWKnob label="Release" value={p('adsr_release', 0.2)} onChange={(v) => onParamChange('adsr_release', v)} color={BLUE} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}`} />
            </div>
          </div>

        </div>

        {/* ADPCM info */}
        <div
          className="mt-4 mx-auto rounded px-4 py-2 text-center"
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: `1px solid ${BLUE}15`,
            maxWidth: 380,
          }}
        >
          <div style={{ color: `${BLUE}50`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
            SPU CONFIGURATION
          </div>
          <div className="flex justify-around mt-1">
            <span style={{ color: BLUE, fontSize: 8, fontFamily: 'monospace' }}>4-BIT ADPCM</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8 }}>•</span>
            <span style={{ color: BLUE, fontSize: 8, fontFamily: 'monospace' }}>512KB SPU RAM</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8 }}>•</span>
            <span style={{ color: BLUE, fontSize: 8, fontFamily: 'monospace' }}>44.1KHZ</span>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div
        className="px-5 py-1 text-center"
        style={{ background: 'rgba(0,0,0,0.5)', borderTop: `1px solid ${BLUE}15` }}
      >
        <div style={{ color: `${BLUE}25`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          24 VOICES  •  ADPCM + ADSR  •  PITCH MODULATION  •  1994
        </div>
      </div>
    </div>
  );
};
