/**
 * WaveSabre Falcon Hardware UI
 *
 * Blue-themed FM synth panel — 2-operator FM with dual envelopes.
 */

import React from 'react';
import { useKnobImperative } from '@components/controls/useKnobImperative';

interface FalconHardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const FKnob: React.FC<{
  label: string;
  value: number;
  color?: string;
  onChange: (value: number) => void;
  paramKey?: string;
}> = ({ label, value, color = '#3366ff', onChange, paramKey }) => {
  const angle = -135 + value * 270;
  const indicatorRef = useKnobImperative<HTMLDivElement>({ paramKey, transformOrigin: 'bottom center' });

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
        style={{ borderColor: color, background: '#080818' }}
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

const Section: React.FC<{ label: string; color?: string; children: React.ReactNode }> = ({ label, color = '#3366ff', children }) => (
  <div className="bg-black/40 rounded p-2">
    <div className="text-[9px] font-bold uppercase tracking-[0.2em] mb-1 pb-0.5 border-b" style={{ color, borderColor: `${color}40` }}>{label}</div>
    <div className="flex flex-wrap gap-1 justify-center">{children}</div>
  </div>
);

export const FalconHardware: React.FC<FalconHardwareProps> = ({ parameters, onParamChange }) => {
  const p = (key: string, def = 0.5) => parameters[key] ?? def;
  const set = (key: string) => (v: number) => onParamChange(key, v);

  return (
    <div className="rounded-lg overflow-hidden shadow-2xl" style={{ background: 'linear-gradient(180deg, #050510 0%, #0a0a25 50%, #050510 100%)', maxWidth: '600px' }}>
      {/* Header */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: '#030308', borderBottom: '2px solid #3366ff40' }}>
        <div className="text-[10px] text-blue-800 tracking-[0.3em] uppercase font-light">WaveSabre</div>
        <div className="text-xl font-black tracking-wider text-blue-400">FALCON</div>
        <div className="text-[10px] text-blue-900 tracking-widest">FM SYNTHESIS</div>
      </div>

      <div className="p-3 space-y-3">
        {/* Oscillators */}
        <div className="grid grid-cols-2 gap-3">
          <Section label="OSCILLATOR 1" color="#33ccff">
            <FKnob label="WAVE" value={p('osc1Waveform', 0)} color="#33ccff" onChange={set('osc1Waveform')} />
            <FKnob label="COARSE" value={p('osc1Coarse')} color="#ffcc33" onChange={set('osc1Coarse')} />
            <FKnob label="FINE" value={p('osc1Fine')} color="#ffcc33" onChange={set('osc1Fine')} />
          </Section>
          <Section label="OSCILLATOR 2" color="#ff6633">
            <FKnob label="WAVE" value={p('osc2Waveform', 0)} color="#ff6633" onChange={set('osc2Waveform')} />
            <FKnob label="COARSE" value={p('osc2Coarse')} color="#ffcc33" onChange={set('osc2Coarse')} />
            <FKnob label="FINE" value={p('osc2Fine')} color="#ffcc33" onChange={set('osc2Fine')} />
          </Section>
        </div>

        {/* FM */}
        <Section label="FM MODULATION" color="#cc66ff">
          <FKnob label="AMT" value={p('fmAmount', 0.3)} color="#cc66ff" onChange={set('fmAmount')} />
          <FKnob label="RATIO" value={p('fmCoarse', 0.125)} color="#cc66ff" onChange={set('fmCoarse')} />
          <FKnob label="FINE" value={p('fmFine')} color="#cc66ff" onChange={set('fmFine')} />
          <FKnob label="FDBK" value={p('feedback', 0.1)} color="#cc66ff" onChange={set('feedback')} />
        </Section>

        {/* Envelopes */}
        <div className="grid grid-cols-2 gap-3">
          <Section label="AMP ENVELOPE" color="#66ff99">
            <FKnob label="ATK" value={p('attack1', 0.01)} color="#66ff99" onChange={set('attack1')} />
            <FKnob label="DEC" value={p('decay1', 0.3)} color="#66ff99" onChange={set('decay1')} />
            <FKnob label="SUS" value={p('sustain1')} color="#66ff99" onChange={set('sustain1')} />
            <FKnob label="REL" value={p('release1', 0.3)} color="#66ff99" onChange={set('release1')} />
          </Section>
          <Section label="MOD ENVELOPE" color="#ff9933">
            <FKnob label="ATK" value={p('attack2', 0.01)} color="#ff9933" onChange={set('attack2')} />
            <FKnob label="DEC" value={p('decay2', 0.2)} color="#ff9933" onChange={set('decay2')} />
            <FKnob label="SUS" value={p('sustain2', 0.3)} color="#ff9933" onChange={set('sustain2')} />
            <FKnob label="REL" value={p('release2', 0.2)} color="#ff9933" onChange={set('release2')} />
          </Section>
        </div>

        {/* Output */}
        <div className="grid grid-cols-2 gap-3">
          <Section label="VOICE" color="#ffcc33">
            <FKnob label="VOICES" value={p('voices', 0.125)} color="#ffcc33" onChange={set('voices')} />
            <FKnob label="DETUNE" value={p('detune', 0.1)} color="#ffcc33" onChange={set('detune')} />
            <FKnob label="SPREAD" value={p('spread')} color="#ffcc33" onChange={set('spread')} />
          </Section>
          <Section label="OUTPUT" color="#66ff99">
            <FKnob label="GAIN" value={p('gain')} color="#66ff99" onChange={set('gain')} />
          </Section>
        </div>
      </div>

      <div className="px-4 py-1 text-center" style={{ background: '#030308', borderTop: '1px solid #3366ff20' }}>
        <div className="text-[8px] text-blue-900 tracking-[0.3em] uppercase">WaveSabre Falcon • 2-Op FM Synthesis Engine</div>
      </div>
    </div>
  );
};
