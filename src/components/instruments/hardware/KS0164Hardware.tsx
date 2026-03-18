/**
 * KS0164 Hardware UI — Samsung KS0164 32-Voice Wavetable GM Synth
 * Samsung blue/white design language
 */

import React, { useRef, useEffect } from 'react';
import { HWKnob, HWDisplay } from './MAMESharedKnob';

interface KS0164HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const INDIGO = '#6366f1';
const INDIGO_DIM = '#4338ca';

export const KS0164Hardware: React.FC<KS0164HardwareProps> = ({ parameters, onParamChange }) => {
  const configRef = useRef(parameters);
  useEffect(() => { configRef.current = parameters; }, [parameters]);

  const p = (key: string, fallback: number) =>
    parameters[key] !== undefined ? parameters[key] : fallback;

  const currentVoice = Math.round(p('voice', 0));

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl select-none"
      style={{
        background: 'linear-gradient(180deg, #0f0f1a 0%, #080810 100%)',
        border: '2px solid #1a1a2e',
      }}
    >
      {/* Samsung-style header */}
      <div
        className="px-5 py-3 border-b"
        style={{
          background: 'linear-gradient(90deg, #0a0a1e 0%, #12122e 50%, #0a0a1e 100%)',
          borderColor: `${INDIGO}25`,
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div style={{ color: `${INDIGO}80`, fontSize: 10, letterSpacing: '0.5em', textTransform: 'uppercase', fontStyle: 'italic' }}>
              SAMSUNG
            </div>
            <div style={{ color: '#c7d2fe', fontSize: 20, fontWeight: 900, letterSpacing: '0.1em' }}>KS0164</div>
            <div style={{ color: `${INDIGO}60`, fontSize: 7, letterSpacing: '0.2em' }}>32-VOICE WAVETABLE GM SYNTHESIZER</div>
          </div>

          {/* GM badge + display */}
          <div className="flex items-center gap-2">
            <div
              className="rounded px-2 py-1 text-center"
              style={{
                background: `${INDIGO}15`,
                border: `1px solid ${INDIGO}30`,
              }}
            >
              <div style={{ color: INDIGO, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em' }}>GM</div>
              <div style={{ color: `${INDIGO}60`, fontSize: 6, textTransform: 'uppercase' }}>MIDI</div>
            </div>
            <div
              className="rounded px-3 py-2 font-mono"
              style={{
                background: '#050508',
                border: `1px solid ${INDIGO}20`,
                minWidth: 120,
              }}
            >
              <div style={{ color: `${INDIGO}40`, fontSize: 7 }}>VOICE STATUS</div>
              <div style={{ color: INDIGO, fontSize: 13, fontWeight: 'bold', textShadow: `0 0 5px ${INDIGO}` }}>
                V{currentVoice.toString().padStart(2, '0')}
              </div>
              <div style={{ color: `${INDIGO}50`, fontSize: 8 }}>
                VOL {Math.round(p('volume', 0.8) * 100)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main panel */}
      <div className="p-5">
        <div className="flex gap-8 items-start justify-center">

          {/* Output */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: `${INDIGO}60`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${INDIGO}20` }}
            >
              MASTER VOLUME
            </div>
            <HWKnob
              label="Volume"
              value={p('volume', 0.8)}
              onChange={(v) => onParamChange('volume', v)}
              color={INDIGO}
              size="lg"
              formatDisplay={(v) => `${Math.round(v * 100)}%`}
            />
          </div>

          {/* Voice selector */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: `${INDIGO}60`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${INDIGO}20` }}
            >
              VOICE SELECT
            </div>
            <div className="flex flex-col items-center gap-3">
              <HWDisplay value={currentVoice} label="Voice" color={INDIGO} width={72} />
              <HWKnob
                label="Voice"
                value={p('voice', 0)}
                min={0}
                max={31}
                step={1}
                onChange={(v) => onParamChange('voice', Math.round(v))}
                color={INDIGO_DIM}
                size="md"
                formatDisplay={(v) => `V${Math.round(v).toString().padStart(2, '0')}`}
              />
            </div>
          </div>

          {/* 32-voice grid */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: `${INDIGO}60`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${INDIGO}20` }}
            >
              32 VOICES
            </div>
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
              {Array.from({ length: 32 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onParamChange('voice', i)}
                  className="rounded font-mono font-bold transition-all"
                  style={{
                    width: 22,
                    height: 18,
                    fontSize: 7,
                    background: currentVoice === i ? `${INDIGO}30` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${currentVoice === i ? INDIGO : 'rgba(255,255,255,0.07)'}`,
                    color: currentVoice === i ? INDIGO : 'rgba(255,255,255,0.25)',
                    boxShadow: currentVoice === i ? `0 0 4px ${INDIGO}30` : undefined,
                  }}
                >
                  {i.toString().padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>

          {/* Volume Ramp */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: `${INDIGO}80`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${INDIGO}20` }}
            >
              ENVELOPE
            </div>
            <HWKnob
              label="Ramp Speed"
              value={p('ramp_speed', 0.5)}
              onChange={(v) => onParamChange('ramp_speed', v)}
              color={INDIGO}
              size="md"
              formatDisplay={(v) => `${Math.round(v * 100)}%`}
            />
          </div>

        </div>

        {/* Specs */}
        <div
          className="mt-4 mx-auto rounded px-4 py-2"
          style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${INDIGO}15`, maxWidth: 420 }}
        >
          <div className="flex justify-around">
            <div className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>VOICES</div>
              <div style={{ color: INDIGO, fontSize: 9, fontFamily: 'monospace' }}>32 (64 INT)</div>
            </div>
            <div className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>FORMAT</div>
              <div style={{ color: INDIGO, fontSize: 9, fontFamily: 'monospace' }}>8/16-BIT PCM</div>
            </div>
            <div className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>CPU</div>
              <div style={{ color: INDIGO, fontSize: 9, fontFamily: 'monospace' }}>68000 INT</div>
            </div>
            <div className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>STANDARD</div>
              <div style={{ color: INDIGO, fontSize: 9, fontFamily: 'monospace' }}>GENERAL MIDI</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div
        className="px-5 py-1 text-center"
        style={{ background: 'rgba(0,0,0,0.5)', borderTop: `1px solid ${INDIGO}12` }}
      >
        <div style={{ color: `${INDIGO}25`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          SAMSUNG KS0164  •  32-VOICE WAVETABLE  •  GENERAL MIDI COMPATIBLE
        </div>
      </div>
    </div>
  );
};
