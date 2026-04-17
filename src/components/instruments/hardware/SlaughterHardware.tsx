/**
 * WaveSabre Slaughter Hardware UI
 *
 * Aggressive red-themed demoscene synth panel.
 * Subtractive synthesis with oscillator, filter, and dual envelopes.
 */

import React from 'react';
import { useKnobImperative } from '@components/controls/useKnobImperative';

interface SlaughterHardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const WSKnob: React.FC<{
  label: string;
  value: number;
  color?: string;
  onChange: (value: number) => void;
  paramKey?: string;
}> = ({ label, value, color = '#ff3333', onChange, paramKey }) => {
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
    <div className="flex flex-col items-center gap-0.5 w-12">
      <div
        className="w-8 h-8 rounded-full border-2 cursor-pointer relative"
        style={{ borderColor: color, background: '#1a0808' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        title={`${label}: ${Math.round(value * 100)}%`}
      >
        <div
          ref={indicatorRef}
          className="absolute w-0.5 h-3 rounded-full"
          style={{ background: color, top: '2px', left: '50%', transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: 'bottom center' }}
        />
      </div>
      <div className="text-[7px] font-bold uppercase tracking-wide text-center" style={{ color }}>{label}</div>
    </div>
  );
};

const Section: React.FC<{ label: string; color?: string; children: React.ReactNode }> = ({ label, color = '#ff3333', children }) => (
  <div className="bg-black/40 rounded p-2">
    <div className="text-[9px] font-bold uppercase tracking-[0.2em] mb-1 pb-0.5 border-b" style={{ color, borderColor: `${color}40` }}>{label}</div>
    <div className="flex flex-wrap gap-1 justify-center">{children}</div>
  </div>
);

export const SlaughterHardware: React.FC<SlaughterHardwareProps> = ({ parameters, onParamChange }) => {
  const p = (key: string, def = 0.5) => parameters[key] ?? def;
  const set = (key: string) => (v: number) => onParamChange(key, v);

  return (
    <div className="rounded-lg overflow-hidden shadow-2xl" style={{ background: 'linear-gradient(180deg, #1a0505 0%, #2a0808 50%, #1a0505 100%)', maxWidth: '600px' }}>
      {/* Header */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: '#0f0202', borderBottom: '2px solid #ff333340' }}>
        <div className="text-[10px] text-red-800 tracking-[0.3em] uppercase font-light">WaveSabre</div>
        <div className="text-xl font-black tracking-wider text-red-500">SLAUGHTER</div>
        <div className="text-[10px] text-red-900 tracking-widest">SUBTRACTIVE</div>
      </div>

      <div className="p-3 space-y-3">
        {/* Oscillator */}
        <Section label="OSCILLATOR" color="#33ccff">
          <WSKnob label="WAVE" value={p('waveform', 0)} color="#33ccff" onChange={set('waveform')} />
          <WSKnob label="PW" value={p('pulseWidth')} color="#33ccff" onChange={set('pulseWidth')} />
          <WSKnob label="COARSE" value={p('coarse')} color="#ffcc33" onChange={set('coarse')} />
          <WSKnob label="FINE" value={p('fine')} color="#ffcc33" onChange={set('fine')} />
          <WSKnob label="VOICES" value={p('voices', 0.125)} color="#ffcc33" onChange={set('voices')} />
          <WSKnob label="DETUNE" value={p('detune', 0.1)} color="#ffcc33" onChange={set('detune')} />
          <WSKnob label="SPREAD" value={p('spread')} color="#ffcc33" onChange={set('spread')} />
        </Section>

        {/* Filter */}
        <Section label="FILTER" color="#ff6633">
          <WSKnob label="TYPE" value={p('filterType', 0)} color="#ff6633" onChange={set('filterType')} />
          <WSKnob label="CUTOFF" value={p('cutoff')} color="#ff6633" onChange={set('cutoff')} />
          <WSKnob label="RESO" value={p('resonance', 0.3)} color="#ff6633" onChange={set('resonance')} />
          <WSKnob label="ENV" value={p('filterEnvAmount')} color="#ff6633" onChange={set('filterEnvAmount')} />
        </Section>

        {/* Envelopes */}
        <div className="grid grid-cols-2 gap-3">
          <Section label="AMP ENVELOPE" color="#66ff99">
            <WSKnob label="ATK" value={p('ampAttack', 0.01)} color="#66ff99" onChange={set('ampAttack')} />
            <WSKnob label="DEC" value={p('ampDecay', 0.3)} color="#66ff99" onChange={set('ampDecay')} />
            <WSKnob label="SUS" value={p('ampSustain', 0.7)} color="#66ff99" onChange={set('ampSustain')} />
            <WSKnob label="REL" value={p('ampRelease', 0.3)} color="#66ff99" onChange={set('ampRelease')} />
          </Section>
          <Section label="FILTER ENVELOPE" color="#cc66ff">
            <WSKnob label="ATK" value={p('filterAttack', 0.01)} color="#cc66ff" onChange={set('filterAttack')} />
            <WSKnob label="DEC" value={p('filterDecay', 0.2)} color="#cc66ff" onChange={set('filterDecay')} />
            <WSKnob label="SUS" value={p('filterSustain', 0.3)} color="#cc66ff" onChange={set('filterSustain')} />
            <WSKnob label="REL" value={p('filterRelease', 0.2)} color="#cc66ff" onChange={set('filterRelease')} />
          </Section>
        </div>

        {/* Output */}
        <Section label="OUTPUT" color="#66ff99">
          <WSKnob label="GAIN" value={p('gain')} color="#66ff99" onChange={set('gain')} />
        </Section>
      </div>

      <div className="px-4 py-1 text-center" style={{ background: '#0f0202', borderTop: '1px solid #ff333320' }}>
        <div className="text-[8px] text-red-900 tracking-[0.3em] uppercase">WaveSabre Slaughter • Subtractive Synth Engine</div>
      </div>
    </div>
  );
};
