/**
 * Oidos Hardware UI - Oidos Additive Synthesizer
 *
 * Green-themed minimalist additive synth panel from 4k/64k intro scene.
 * Random seed generation, modal synthesis, and spectral filtering.
 */

import React from 'react';
import { useKnobImperative } from '@components/controls/useKnobImperative';

interface OidosHardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const OKnob: React.FC<{
  label: string;
  value: number;
  color?: string;
  onChange: (value: number) => void;
  paramKey?: string;
}> = ({ label, value, color = '#33ff66', onChange, paramKey }) => {
  const angle = -135 + value * 270;
  const indicatorRef = useKnobImperative<HTMLDivElement>({ paramKey });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    onChange(Math.round(Math.max(0, Math.min(1, value + (e.deltaY < 0 ? 0.02 : -0.02))) * 100) / 100);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = value;
    const onMove = (ev: MouseEvent) => {
      onChange(Math.round(Math.max(0, Math.min(1, startVal + (startY - ev.clientY) / 150)) * 100) / 100);
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div className="flex flex-col items-center gap-0.5 w-14">
      <div
        className="w-9 h-9 rounded-full border-2 cursor-pointer relative"
        style={{ borderColor: color, background: '#081a08' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        title={`${label}: ${Math.round(value * 100)}%`}
      >
        <div
          ref={indicatorRef}
          className="absolute w-0.5 h-3.5 rounded-full"
          style={{ background: color, top: '2px', left: '50%', transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: 'bottom center' }}
        />
      </div>
      <div className="text-[7px] font-bold uppercase tracking-wide text-center" style={{ color }}>{label}</div>
      <div className="text-[7px] text-green-800 font-mono">{Math.round(value * 100)}%</div>
    </div>
  );
};

const Section: React.FC<{ label: string; color?: string; children: React.ReactNode }> = ({ label, color = '#33ff66', children }) => (
  <div className="bg-black/30 rounded p-2">
    <div className="text-[9px] font-bold uppercase tracking-[0.2em] mb-1.5 pb-0.5 border-b" style={{ color, borderColor: `${color}30` }}>{label}</div>
    <div className="flex flex-wrap gap-1 justify-center">{children}</div>
  </div>
);

export const OidosHardware: React.FC<OidosHardwareProps> = ({ parameters, onParamChange }) => {
  const p = (key: string, def = 0.5) => parameters[key] ?? def;
  const set = (key: string) => (v: number) => onParamChange(key, v);

  return (
    <div className="rounded-lg overflow-hidden shadow-2xl" style={{ background: 'linear-gradient(180deg, #061206 0%, #0a1f0a 50%, #061206 100%)', maxWidth: '580px' }}>
      {/* Header */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: '#030a03', borderBottom: '2px solid #33ff6640' }}>
        <div className="text-[10px] text-green-800 tracking-[0.3em] uppercase font-light">Additive</div>
        <div className="text-xl font-black tracking-wider" style={{ color: '#33ff66' }}>OIDOS</div>
        <div className="text-[10px] text-green-900 tracking-widest">4K SYNTH</div>
      </div>

      <div className="p-3 space-y-3">
        {/* Sound Generation */}
        <Section label="GENERATION" color="#ff9933">
          <OKnob label="SEED" value={p('seed')} color="#ff9933" onChange={set('seed')} />
          <OKnob label="MODES" value={p('modes', 0.4)} color="#ff9933" onChange={set('modes')} />
          <OKnob label="FAT" value={p('fat', 0.1)} color="#ff9933" onChange={set('fat')} />
          <OKnob label="WIDTH" value={p('width', 0.34)} color="#ff9933" onChange={set('width')} />
        </Section>

        {/* Harmonics */}
        <Section label="HARMONICS" color="#33ccff">
          <OKnob label="OVERT" value={p('overtones', 0.27)} color="#33ccff" onChange={set('overtones')} />
          <OKnob label="SHARP" value={p('sharpness', 0.9)} color="#33ccff" onChange={set('sharpness')} />
          <OKnob label="HARM" value={p('harmonicity', 1.0)} color="#33ccff" onChange={set('harmonicity')} />
        </Section>

        {/* Decay */}
        <Section label="DECAY" color="#66ff99">
          <OKnob label="LOW" value={p('decayLow', 1.0)} color="#66ff99" onChange={set('decayLow')} />
          <OKnob label="HIGH" value={p('decayHigh', 1.0)} color="#66ff99" onChange={set('decayHigh')} />
        </Section>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-3">
          <Section label="LOW FILTER" color="#ff6633">
            <OKnob label="CUT" value={p('filterLow', 0)} color="#ff6633" onChange={set('filterLow')} />
            <OKnob label="SLOPE" value={p('filterSlopeLow', 0)} color="#ff6633" onChange={set('filterSlopeLow')} />
            <OKnob label="SWEEP" value={p('filterSweepLow')} color="#ff6633" onChange={set('filterSweepLow')} />
          </Section>
          <Section label="HIGH FILTER" color="#cc66ff">
            <OKnob label="CUT" value={p('filterHigh', 1.0)} color="#cc66ff" onChange={set('filterHigh')} />
            <OKnob label="SLOPE" value={p('filterSlopeHigh', 0)} color="#cc66ff" onChange={set('filterSlopeHigh')} />
            <OKnob label="SWEEP" value={p('filterSweepHigh')} color="#cc66ff" onChange={set('filterSweepHigh')} />
          </Section>
        </div>

        {/* Output */}
        <Section label="OUTPUT" color="#ffcc33">
          <OKnob label="GAIN" value={p('gain', 0.25)} color="#66ff99" onChange={set('gain')} />
          <OKnob label="ATK" value={p('attack', 0.25)} color="#ffcc33" onChange={set('attack')} />
          <OKnob label="REL" value={p('release')} color="#ffcc33" onChange={set('release')} />
        </Section>
      </div>

      <div className="px-4 py-1 text-center" style={{ background: '#030a03', borderTop: '1px solid #33ff6620' }}>
        <div className="text-[8px] text-green-900 tracking-[0.3em] uppercase">Oidos • Additive Synthesis • 4k/64k Intros</div>
      </div>
    </div>
  );
};
