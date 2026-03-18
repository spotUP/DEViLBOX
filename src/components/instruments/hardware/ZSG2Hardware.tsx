/**
 * ZSG2 Hardware UI — ZOOM ZSG-2 (48-channel ADPCM ROM sampler)
 * Silver/black ZOOM rack effects unit aesthetic
 */

import React, { useRef, useEffect } from 'react';
import { HWKnob, HWDisplay } from './MAMESharedKnob';

interface ZSG2HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const GREEN = '#22c55e';
const GRAY = '#9ca3af';

export const ZSG2Hardware: React.FC<ZSG2HardwareProps> = ({ parameters, onParamChange }) => {
  const configRef = useRef(parameters);
  useEffect(() => { configRef.current = parameters; }, [parameters]);

  const p = (key: string, fallback: number) =>
    parameters[key] !== undefined ? parameters[key] : fallback;

  const currentChannel = Math.round(p('voice', 0));

  return (
    <div
      className="rounded overflow-hidden shadow-2xl select-none"
      style={{
        background: 'linear-gradient(180deg, #2d2d2d 0%, #1a1a1a 100%)',
        border: '2px solid #444',
      }}
    >
      {/* Header — ZOOM silver faceplate */}
      <div
        className="px-5 py-2 border-b"
        style={{
          background: 'linear-gradient(180deg, #d0d0d0 0%, #b8b8b8 50%, #c8c8c8 100%)',
          borderColor: '#888',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* ZOOM logo block */}
            <div
              className="rounded px-2 py-1 font-black"
              style={{
                background: '#111',
                color: '#fff',
                fontSize: 18,
                letterSpacing: '0.05em',
                lineHeight: 1,
              }}
            >
              ZOOM
            </div>
            <div>
              <div style={{ color: '#1a1a1a', fontSize: 13, fontWeight: 900, letterSpacing: '0.1em' }}>ZSG-2</div>
              <div style={{ color: '#555', fontSize: 7, letterSpacing: '0.2em', textTransform: 'uppercase' }}>48-CHANNEL ADPCM SAMPLER</div>
            </div>
          </div>

          {/* LED display */}
          <div
            className="rounded px-3 py-1.5 font-mono"
            style={{
              background: '#080808',
              border: '1px solid #333',
              minWidth: 120,
              boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)',
            }}
          >
            <div style={{ color: `${GREEN}50`, fontSize: 7 }}>ZSG-2</div>
            <div style={{ color: GREEN, fontSize: 13, fontWeight: 'bold', textShadow: `0 0 6px ${GREEN}` }}>
              CH {currentChannel.toString().padStart(2, '0')}
            </div>
            <div style={{ color: `${GREEN}60`, fontSize: 8 }}>
              VOL {Math.round(p('volume', 0.8) * 100)}%
            </div>
          </div>
        </div>
      </div>

      {/* Main panel */}
      <div className="p-4">
        <div className="flex gap-6 items-start justify-center">

          {/* Output */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: GRAY, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              OUTPUT
            </div>
            <HWKnob
              label="Volume"
              value={p('volume', 0.8)}
              onChange={(v) => onParamChange('volume', v)}
              color={GREEN}
              size="lg"
              formatDisplay={(v) => `${Math.round(v * 100)}%`}
            />
          </div>

          {/* Channel */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: GRAY, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              CHANNEL
            </div>
            <div className="flex flex-col items-center gap-3">
              <HWDisplay value={currentChannel} label="CH" color={GREEN} width={72} />
              <HWKnob
                label="Channel"
                value={p('voice', 0)}
                min={0}
                max={47}
                step={1}
                onChange={(v) => onParamChange('voice', Math.round(v))}
                color={GRAY}
                size="md"
                formatDisplay={(v) => `${Math.round(v)}`}
              />
            </div>
          </div>

          {/* 48-channel grid (displayed as 6×8) */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: GRAY, fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              48 CHANNELS
            </div>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
              {Array.from({ length: 48 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onParamChange('voice', i)}
                  className="rounded-sm font-mono transition-all"
                  style={{
                    width: 18,
                    height: 15,
                    fontSize: 6,
                    background: currentChannel === i ? `${GREEN}25` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${currentChannel === i ? GREEN : 'rgba(255,255,255,0.07)'}`,
                    color: currentChannel === i ? GREEN : 'rgba(255,255,255,0.25)',
                    boxShadow: currentChannel === i ? `0 0 3px ${GREEN}30` : undefined,
                  }}
                >
                  {i < 10 ? `0${i}` : i}
                </button>
              ))}
            </div>
          </div>

          {/* Filter */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: 'rgba(255,255,255,0.5)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              IIR FILTER
            </div>
            <HWKnob
              label="Cutoff"
              value={p('filter_cutoff', 1.0)}
              onChange={(v) => onParamChange('filter_cutoff', v)}
              color={GREEN}
              size="md"
              formatDisplay={(v) => `${Math.round(v * 100)}%`}
            />
          </div>

        </div>

        {/* Specs bar */}
        <div
          className="mt-4 mx-auto rounded px-4 py-2"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.07)', maxWidth: 420 }}
        >
          <div className="flex justify-around">
            <div className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>VOICES</div>
              <div style={{ color: GREEN, fontSize: 9, fontFamily: 'monospace' }}>48 CH</div>
            </div>
            <div className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>FORMAT</div>
              <div style={{ color: GREEN, fontSize: 9, fontFamily: 'monospace' }}>ADPCM 2:1</div>
            </div>
            <div className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>RATE</div>
              <div style={{ color: GREEN, fontSize: 9, fontFamily: 'monospace' }}>32.5KHZ</div>
            </div>
            <div className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>FILTER</div>
              <div style={{ color: GREEN, fontSize: 9, fontFamily: 'monospace' }}>IIR LPF</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div
        className="px-4 py-1 text-center"
        style={{ background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          ZOOM ZSG-2  •  48 CHANNELS  •  ROM-BASED ADPCM  •  IIR OUTPUT FILTER
        </div>
      </div>
    </div>
  );
};
