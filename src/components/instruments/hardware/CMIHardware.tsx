/**
 * CMI Hardware UI — Fairlight CMI IIx (1982)
 * Green phosphor terminal aesthetic
 */

import React, { useRef, useEffect } from 'react';
import { HWKnob, HWDisplay } from './MAMESharedKnob';

interface CMIHardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const GREEN = '#22c55e';
const AMBER = '#f59e0b';

export const CMIHardware: React.FC<CMIHardwareProps> = ({ parameters, onParamChange }) => {
  const configRef = useRef(parameters);
  useEffect(() => { configRef.current = parameters; }, [parameters]);

  const p = <K extends string>(key: K, fallback: number) =>
    parameters[key] !== undefined ? parameters[key] : fallback;

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl select-none"
      style={{
        background: 'linear-gradient(180deg, #0d0d0d 0%, #080808 100%)',
        border: '2px solid #1a1a1a',
        fontFamily: 'monospace',
      }}
    >
      {/* CRT Header */}
      <div
        className="px-5 py-3 border-b"
        style={{
          background: 'linear-gradient(90deg, #001a00 0%, #002200 50%, #001a00 100%)',
          borderColor: `${GREEN}30`,
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div style={{ color: `${GREEN}80`, fontSize: 8, letterSpacing: '0.4em', textTransform: 'uppercase' }}>FAIRLIGHT</div>
            <div style={{ color: GREEN, fontSize: 22, fontWeight: 900, letterSpacing: '0.1em', textShadow: `0 0 10px ${GREEN}` }}>CMI IIx</div>
            <div style={{ color: `${GREEN}60`, fontSize: 7, letterSpacing: '0.3em' }}>COMPUTER MUSICAL INSTRUMENT</div>
          </div>

          {/* CRT phosphor screen */}
          <div
            className="rounded px-4 py-2"
            style={{
              background: '#001200',
              border: `1px solid ${GREEN}30`,
              boxShadow: `inset 0 0 20px rgba(0,0,0,0.8), 0 0 8px ${GREEN}10`,
              minWidth: 160,
            }}
          >
            <div style={{ color: `${GREEN}40`, fontSize: 7 }}>FAIRLIGHT CMI IIx</div>
            <div style={{ color: GREEN, fontSize: 11, textShadow: `0 0 4px ${GREEN}` }}>
              VOICE {Math.round(p('voice', 0)).toString().padStart(2, '0')} &nbsp;
              VOL {Math.round(p('volume', 0.8) * 100).toString().padStart(3, ' ')}%
            </div>
            <div style={{ color: `${GREEN}50`, fontSize: 7, marginTop: 2 }}>
              PAGE R : REALTIME_____________
            </div>
            <div style={{ color: `${GREEN}30`, fontSize: 7 }}>
              &gt;_ SAMPLE READY
            </div>
          </div>
        </div>
      </div>

      {/* Main panel */}
      <div className="p-5" style={{ background: '#0a0a0a' }}>
        <div className="flex gap-8 items-start justify-center">

          {/* Output */}
          <div>
            <div style={{ color: `${GREEN}50`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${GREEN}20`, paddingBottom: 4, marginBottom: 10 }}>
              OUTPUT
            </div>
            <div className="flex gap-4 justify-center">
              <HWKnob
                label="Volume"
                value={p('volume', 0.8)}
                onChange={(v) => onParamChange('volume', v)}
                color={GREEN}
                size="lg"
                formatDisplay={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          </div>

          {/* Voice Select */}
          <div>
            <div style={{ color: `${GREEN}50`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${GREEN}20`, paddingBottom: 4, marginBottom: 10 }}>
              VOICE SELECT
            </div>
            <div className="flex flex-col items-center gap-3">
              <HWDisplay
                value={p('voice', 0)}
                label="Voice"
                color={GREEN}
                width={64}
              />
              <HWKnob
                label="Voice"
                value={p('voice', 0)}
                min={0}
                max={7}
                step={1}
                onChange={(v) => onParamChange('voice', Math.round(v))}
                color={AMBER}
                size="md"
                formatDisplay={(v) => `V${Math.round(v)}`}
              />
            </div>
          </div>

          {/* Waveform Select */}
          <div>
            <div style={{ color: `${GREEN}50`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${GREEN}20`, paddingBottom: 4, marginBottom: 10 }}>
              WAVEFORM
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(['SINE','SAW','SQR','TRI','ORGN','PLS','SOFT','HRM'] as const).map((label, i) => (
                <button
                  key={i}
                  onClick={() => onParamChange('waveform', i)}
                  className="rounded font-mono transition-all"
                  style={{
                    width: 38,
                    height: 20,
                    fontSize: 7,
                    background: Math.round(p('waveform', 0)) === i ? `${GREEN}35` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${Math.round(p('waveform', 0)) === i ? GREEN : `${GREEN}20`}`,
                    color: Math.round(p('waveform', 0)) === i ? GREEN : `${GREEN}50`,
                    boxShadow: Math.round(p('waveform', 0)) === i ? `0 0 6px ${GREEN}40` : undefined,
                    textShadow: Math.round(p('waveform', 0)) === i ? `0 0 4px ${GREEN}` : undefined,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Voice grid */}
          <div>
            <div style={{ color: `${GREEN}50`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${GREEN}20`, paddingBottom: 4, marginBottom: 10 }}>
              VOICE GRID
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 8 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onParamChange('voice', i)}
                  className="rounded font-mono font-bold transition-all"
                  style={{
                    width: 30,
                    height: 22,
                    fontSize: 8,
                    background: Math.round(p('voice', 0)) === i ? `${GREEN}30` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${Math.round(p('voice', 0)) === i ? GREEN : `${GREEN}20`}`,
                    color: Math.round(p('voice', 0)) === i ? GREEN : `${GREEN}50`,
                    boxShadow: Math.round(p('voice', 0)) === i ? `0 0 6px ${GREEN}40` : undefined,
                    textShadow: Math.round(p('voice', 0)) === i ? `0 0 4px ${GREEN}` : undefined,
                  }}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="px-5 py-1 text-center"
        style={{ background: '#050505', borderTop: `1px solid ${GREEN}15` }}
      >
        <div style={{ color: `${GREEN}30`, fontSize: 7, letterSpacing: '0.4em', textTransform: 'uppercase' }}>
          8-VOICE  •  8-BIT PCM  •  100kHz SAMPLE RATE  •  1982
        </div>
      </div>
    </div>
  );
};
