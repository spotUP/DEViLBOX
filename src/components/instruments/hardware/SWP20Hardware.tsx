/**
 * SWP20 Hardware UI — Yamaha SWP20 AWM2 (MU80 XG Module, 1994)
 * Yamaha MU80 desktop module — wider than MU50, dual-part display
 */

import React, { useRef, useEffect } from 'react';
import { HWKnob, HWDisplay } from './MAMESharedKnob';

interface SWP20HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const VIOLET = '#8b5cf6';
const VIOLET_DIM = '#6d28d9';
const XG_BLUE = '#3b82f6';

export const SWP20Hardware: React.FC<SWP20HardwareProps> = ({ parameters, onParamChange }) => {
  const configRef = useRef(parameters);
  useEffect(() => { configRef.current = parameters; }, [parameters]);

  const p = (key: string, fallback: number) =>
    parameters[key] !== undefined ? parameters[key] : fallback;

  const currentVoice = Math.round(p('voice', 0));

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl select-none"
      style={{
        background: 'linear-gradient(180deg, #181818 0%, #0c0c0c 100%)',
        border: '2px solid #282828',
      }}
    >
      {/* Header — Yamaha MU80 faceplate */}
      <div
        className="px-5 py-3 border-b"
        style={{
          background: 'linear-gradient(90deg, #161616 0%, #202020 50%, #161616 100%)',
          borderColor: 'rgba(255,255,255,0.07)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8, letterSpacing: '0.5em', textTransform: 'uppercase' }}>YAMAHA</div>
              <div style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 900, letterSpacing: '0.1em' }}>MU80</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 7, letterSpacing: '0.2em' }}>XG TONE GENERATOR</div>
            </div>
            <div
              className="rounded px-2 py-1"
              style={{ background: XG_BLUE, border: '1px solid #60a5fa' }}
            >
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 900, letterSpacing: '0.1em', lineHeight: 1 }}>XG</div>
            </div>
          </div>

          {/* Dual-part display (MU80 feature) */}
          <div
            className="rounded px-3 py-2"
            style={{
              background: '#8fa88f',
              border: '1px solid #708a70',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
              minWidth: 180,
            }}
          >
            <div style={{ color: '#1a2e1a', fontSize: 7, opacity: 0.7, fontFamily: 'monospace' }}>YAMAHA MU80  XG / GM2</div>
            <div style={{ color: '#0d1f0d', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold' }}>
              V{currentVoice.toString().padStart(2, '0')}  VOL:{Math.round(p('volume', 0.8) * 100)}%
            </div>
            <div style={{ color: '#1a2e1a', fontSize: 8, fontFamily: 'monospace', opacity: 0.6 }}>
              AWM2  32 VOICES  MULTI
            </div>
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
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              MASTER
            </div>
            <HWKnob
              label="Volume"
              value={p('volume', 0.8)}
              onChange={(v) => onParamChange('volume', v)}
              color={VIOLET}
              size="lg"
              formatDisplay={(v) => `${Math.round(v * 100)}%`}
            />
          </div>

          {/* Voice */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              VOICE
            </div>
            <div className="flex flex-col items-center gap-3">
              <HWDisplay value={currentVoice} label="Voice" color={VIOLET} width={64} />
              <HWKnob
                label="Voice"
                value={p('voice', 0)}
                min={0}
                max={31}
                step={1}
                onChange={(v) => onParamChange('voice', Math.round(v))}
                color={VIOLET_DIM}
                size="sm"
                formatDisplay={(v) => `${Math.round(v)}`}
              />
            </div>
          </div>

          {/* 32-voice grid */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              32 VOICES
            </div>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
              {Array.from({ length: 32 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onParamChange('voice', i)}
                  className="rounded-sm font-mono transition-all"
                  style={{
                    width: 20,
                    height: 16,
                    fontSize: 6,
                    background: currentVoice === i ? `${VIOLET}30` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${currentVoice === i ? VIOLET : 'rgba(255,255,255,0.07)'}`,
                    color: currentVoice === i ? VIOLET : 'rgba(255,255,255,0.25)',
                  }}
                >
                  {i.toString().padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>

          {/* Sample Format Toggle */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: `${VIOLET}80`, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: `1px solid ${VIOLET}20` }}
            >
              SAMPLE FORMAT
            </div>
            <div className="flex flex-col gap-2 items-center">
              {[['16-BIT', 0], ['8-BIT', 1]].map(([label, val]) => (
                <button
                  key={val}
                  onClick={() => onParamChange('format', val as number)}
                  className="rounded font-mono transition-all"
                  style={{
                    width: 64,
                    height: 22,
                    fontSize: 9,
                    background: Math.round(p('format', 0)) === val ? `${VIOLET}35` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${Math.round(p('format', 0)) === val ? VIOLET : `${VIOLET}25`}`,
                    color: Math.round(p('format', 0)) === val ? VIOLET : `${VIOLET}60`,
                    boxShadow: Math.round(p('format', 0)) === val ? `0 0 6px ${VIOLET}30` : undefined,
                  }}
                >
                  {label as string}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-part info */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              SPECIFICATIONS
            </div>
            <div
              className="rounded p-2"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', minWidth: 100 }}
            >
              {[
                ['ENGINE', 'AWM2'],
                ['VOICES', '32'],
                ['PARTS', '16'],
                ['FORMAT', '16/8-BIT'],
                ['EFFECTS', 'MEG DSP'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 mb-0.5">
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase' }}>{k}</span>
                  <span style={{ color: VIOLET, fontSize: 7, fontFamily: 'monospace' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Bottom */}
      <div
        className="px-5 py-1 text-center"
        style={{ background: 'rgba(0,0,0,0.5)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          YAMAHA SWP20  •  AWM2 32-VOICE  •  XG / GM2 COMPATIBLE  •  MU80 TONE GENERATOR  •  1994
        </div>
      </div>
    </div>
  );
};
