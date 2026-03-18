/**
 * SWP00 Hardware UI — Yamaha SWP00 AWM2 (MU50 XG Module, 1994)
 * Yamaha dark-gray desktop module aesthetic with XG branding
 */

import React, { useRef, useEffect } from 'react';
import { HWKnob, HWDisplay } from './MAMESharedKnob';

interface SWP00HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const PURPLE = '#a855f7';
const PURPLE_DIM = '#7c3aed';
const XG_BLUE = '#3b82f6';

export const SWP00Hardware: React.FC<SWP00HardwareProps> = ({ parameters, onParamChange }) => {
  const configRef = useRef(parameters);
  useEffect(() => { configRef.current = parameters; }, [parameters]);

  const p = (key: string, fallback: number) =>
    parameters[key] !== undefined ? parameters[key] : fallback;

  const currentVoice = Math.round(p('voice', 0));

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl select-none"
      style={{
        background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)',
        border: '2px solid #2a2a2a',
      }}
    >
      {/* Header — Yamaha MU50 faceplate */}
      <div
        className="px-5 py-3 border-b"
        style={{
          background: 'linear-gradient(90deg, #181818 0%, #222222 50%, #181818 100%)',
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Yamaha wordmark style */}
            <div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8, letterSpacing: '0.5em', textTransform: 'uppercase' }}>YAMAHA</div>
              <div style={{ color: '#e0e0e0', fontSize: 20, fontWeight: 900, letterSpacing: '0.1em' }}>MU50</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 7, letterSpacing: '0.2em' }}>XG TONE GENERATOR</div>
            </div>

            {/* XG logo */}
            <div
              className="rounded px-2 py-1"
              style={{
                background: XG_BLUE,
                border: '1px solid #60a5fa',
              }}
            >
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 900, letterSpacing: '0.1em', lineHeight: 1 }}>XG</div>
            </div>
          </div>

          {/* LCD */}
          <div
            className="rounded px-3 py-2"
            style={{
              background: '#8fa88f',
              border: '1px solid #708a70',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
              minWidth: 160,
            }}
          >
            <div style={{ color: '#1a2e1a', fontSize: 7, opacity: 0.7, fontFamily: 'monospace' }}>YAMAHA MU50 XG</div>
            <div style={{ color: '#0d1f0d', fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold' }}>
              V{currentVoice.toString().padStart(2, '0')} VOL:{Math.round(p('volume', 0.8) * 100)}%
            </div>
            <div style={{ color: '#1a2e1a', fontSize: 8, fontFamily: 'monospace', opacity: 0.7 }}>
              CUT:{Math.round(p('filter_cutoff', 1) * 100)}% RES:{Math.round(p('filter_resonance', 0.2) * 100)}%
            </div>
          </div>
        </div>
      </div>

      {/* Main controls */}
      <div className="p-5">
        <div className="flex gap-6 items-start justify-center">

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
              color={PURPLE}
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
              <HWDisplay value={currentVoice} label="Voice" color={PURPLE} width={64} />
              <HWKnob
                label="Voice"
                value={p('voice', 0)}
                min={0}
                max={31}
                step={1}
                onChange={(v) => onParamChange('voice', Math.round(v))}
                color={PURPLE_DIM}
                size="sm"
                formatDisplay={(v) => `${Math.round(v)}`}
              />
            </div>
          </div>

          {/* Filter section */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              CHAMBERLIN LPF
            </div>
            <div className="flex gap-4 justify-center">
              <HWKnob
                label="Cutoff"
                value={p('filter_cutoff', 1.0)}
                onChange={(v) => onParamChange('filter_cutoff', v)}
                color={PURPLE}
                size="md"
                formatDisplay={(v) => `${Math.round(v * 100)}%`}
              />
              <HWKnob
                label="Resonance"
                value={p('filter_resonance', 0.2)}
                onChange={(v) => onParamChange('filter_resonance', v)}
                color={PURPLE_DIM}
                size="md"
                formatDisplay={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          </div>

          {/* LFO section */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              LFO
            </div>
            <div className="flex gap-3 justify-center">
              <HWKnob label="Rate" value={p('lfo_rate', 0)} onChange={(v) => onParamChange('lfo_rate', v)} color={PURPLE} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}%`} />
              <HWKnob label="A-Mod" value={p('lfo_amod', 0)} onChange={(v) => onParamChange('lfo_amod', v)} color={PURPLE} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}%`} />
              <HWKnob label="F-Mod" value={p('lfo_fmod', 0)} onChange={(v) => onParamChange('lfo_fmod', v)} color={PURPLE_DIM} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}%`} />
            </div>
          </div>

          {/* ADSR section */}
          <div>
            <div
              className="text-center mb-3 pb-1"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, letterSpacing: '0.3em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              ENVELOPE
            </div>
            <div className="flex gap-3 justify-center">
              <HWKnob label="Attack" value={p('env_attack', 0.005)} onChange={(v) => onParamChange('env_attack', v)} color={PURPLE} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}`} />
              <HWKnob label="Decay" value={p('env_decay', 0.001)} onChange={(v) => onParamChange('env_decay', v)} color={PURPLE} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}`} />
              <HWKnob label="Sustain" value={p('env_sustain', 0.8)} onChange={(v) => onParamChange('env_sustain', v)} color={PURPLE} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}%`} />
              <HWKnob label="Release" value={p('env_release', 0.003)} onChange={(v) => onParamChange('env_release', v)} color={PURPLE_DIM} size="sm" formatDisplay={(v) => `${Math.round(v * 100)}`} />
            </div>
          </div>

          {/* Voice grid */}
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
                    background: currentVoice === i ? `${PURPLE}30` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${currentVoice === i ? PURPLE : 'rgba(255,255,255,0.07)'}`,
                    color: currentVoice === i ? PURPLE : 'rgba(255,255,255,0.25)',
                  }}
                >
                  {i.toString().padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* AWM2 specs */}
        <div
          className="mt-4 mx-auto rounded px-4 py-2"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.07)', maxWidth: 450 }}
        >
          <div className="flex justify-around">
            <div className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>ENGINE</div>
              <div style={{ color: PURPLE, fontSize: 9, fontFamily: 'monospace' }}>AWM2</div>
            </div>
            <div className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>VOICES</div>
              <div style={{ color: PURPLE, fontSize: 9, fontFamily: 'monospace' }}>32</div>
            </div>
            <div className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>FORMAT</div>
              <div style={{ color: PURPLE, fontSize: 9, fontFamily: 'monospace' }}>16/12/8 + DPCM</div>
            </div>
            <div className="text-center">
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.2em' }}>FILTER</div>
              <div style={{ color: PURPLE, fontSize: 9, fontFamily: 'monospace' }}>CHAMBERLIN</div>
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
          YAMAHA SWP00  •  AWM2 32-VOICE  •  CHAMBERLIN LPF  •  XG TONE GENERATOR  •  1994
        </div>
      </div>
    </div>
  );
};
