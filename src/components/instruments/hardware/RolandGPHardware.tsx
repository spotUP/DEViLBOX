/**
 * RolandGP Hardware UI — Roland TC6116 PCM (SC-88 Sound Canvas, 1994)
 * Dark gray Roland SC-88 with red accent and Roland logo
 */

import React, { useRef, useEffect } from 'react';
import { HWKnob, HWDisplay } from './MAMESharedKnob';

interface RolandGPHardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const RED = '#ef4444';
const RED_DIM = '#b91c1c';

export const RolandGPHardware: React.FC<RolandGPHardwareProps> = ({ parameters, onParamChange }) => {
  const configRef = useRef(parameters);
  useEffect(() => { configRef.current = parameters; }, [parameters]);

  const p = (key: string, fallback: number) =>
    parameters[key] !== undefined ? parameters[key] : fallback;

  const currentChannel = Math.round(p('voice', 0));

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl select-none"
      style={{
        background: 'linear-gradient(180deg, #1c1c1c 0%, #101010 100%)',
        border: '2px solid #2a2a2a',
      }}
    >
      {/* Header — Roland SC-88 faceplate */}
      <div
        className="px-5 py-3 border-b"
        style={{
          background: 'linear-gradient(90deg, #1a1a1a 0%, #242424 50%, #1a1a1a 100%)',
          borderColor: 'rgba(255,255,255,0.07)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Roland logo */}
            <div
              className="px-2 py-1 rounded"
              style={{
                background: RED,
                border: `1px solid ${RED_DIM}`,
              }}
            >
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 900, letterSpacing: '0.2em', fontStyle: 'italic' }}>Roland</div>
            </div>
            <div>
              <div style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 900, letterSpacing: '0.08em' }}>SC-88</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.2em' }}>SOUND CANVAS  •  TC6116 PCM</div>
            </div>
          </div>

          {/* SC display */}
          <div
            className="rounded px-3 py-2"
            style={{
              background: '#8fa88f',
              border: '1px solid #708a70',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
              minWidth: 170,
            }}
          >
            <div style={{ color: '#1a2e1a', fontSize: 7, opacity: 0.7, fontFamily: 'monospace' }}>ROLAND SC-88  GS/GM</div>
            <div style={{ color: '#0d1f0d', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold' }}>
              CH{currentChannel.toString().padStart(2, '0')}  VOL:{Math.round(p('volume', 0.8) * 100)}%
            </div>
            <div style={{ color: '#1a2e1a', fontSize: 8, fontFamily: 'monospace', opacity: 0.65 }}>
              CUT:{Math.round(p('cutoff', 1) * 100)}%
            </div>
          </div>
        </div>
      </div>

      {/* Main controls */}
      <div className="p-5">
        <div className="flex gap-6 items-start justify-center flex-wrap">

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
              color={RED}
              size="lg"
              formatDisplay={(v) => `${Math.round(v * 100)}%`}
            />
          </div>

          {/* Channel */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              CHANNEL
            </div>
            <div className="flex flex-col items-center gap-3">
              <HWDisplay value={currentChannel} label="Channel" color={RED} width={64} />
              <HWKnob
                label="Channel"
                value={p('voice', 0)}
                min={0}
                max={27}
                step={1}
                onChange={(v) => onParamChange('voice', Math.round(v))}
                color={RED_DIM}
                size="sm"
                formatDisplay={(v) => `${Math.round(v)}`}
              />
            </div>
          </div>

          {/* Envelope */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              ENVELOPE
            </div>
            <div className="flex gap-3 justify-center">
              <HWKnob
                label="Att Speed"
                value={p('vol1_speed', 0.5)}
                onChange={(v) => onParamChange('vol1_speed', v)}
                color={RED}
                size="sm"
                formatDisplay={(v) => `${Math.round(v * 100)}%`}
              />
              <HWKnob
                label="Rel Speed"
                value={p('vol2_speed', 0.5)}
                onChange={(v) => onParamChange('vol2_speed', v)}
                color={RED_DIM}
                size="sm"
                formatDisplay={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          </div>

          {/* Filter */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              FILTER
            </div>
            <div className="flex gap-3 justify-center">
              <HWKnob label="Cutoff" value={p('cutoff_tv', 1.0)} onChange={(v) => onParamChange('cutoff_tv', v)} color={RED} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}%`} />
              <HWKnob label="Cut Spd" value={p('cutoff_speed', 0.5)} onChange={(v) => onParamChange('cutoff_speed', v)} color={RED_DIM} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}%`} />
            </div>
          </div>

          {/* Playback Mode */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              PLAYBACK
            </div>
            <div className="flex flex-col gap-2 items-center">
              {[['ALT LOOP', 'alt_loop'], ['REVERSE', 'reverse']].map(([label, key]) => (
                <button
                  key={key}
                  onClick={() => onParamChange(key as string, p(key as string, 0) > 0.5 ? 0 : 1)}
                  className="rounded font-mono transition-all"
                  style={{
                    width: 72,
                    height: 20,
                    fontSize: 8,
                    background: p(key as string, 0) > 0.5 ? `${RED}35` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${p(key as string, 0) > 0.5 ? RED : 'rgba(255,255,255,0.12)'}`,
                    color: p(key as string, 0) > 0.5 ? RED : 'rgba(255,255,255,0.35)',
                    boxShadow: p(key as string, 0) > 0.5 ? `0 0 6px ${RED}30` : undefined,
                  }}
                >
                  {label as string}
                </button>
              ))}
            </div>
          </div>

          {/* 28-channel grid */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              28 CHANNELS
            </div>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {Array.from({ length: 28 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onParamChange('voice', i)}
                  className="rounded-sm font-mono transition-all"
                  style={{
                    width: 20,
                    height: 16,
                    fontSize: 6,
                    background: currentChannel === i ? `${RED}30` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${currentChannel === i ? RED : 'rgba(255,255,255,0.07)'}`,
                    color: currentChannel === i ? RED : 'rgba(255,255,255,0.25)',
                  }}
                >
                  {i.toString().padStart(2, '0')}
                </button>
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
          ROLAND TC6116  •  SC-88 SOUND CANVAS  •  GS/GM  •  28 CHANNELS  •  1994
        </div>
      </div>
    </div>
  );
};
