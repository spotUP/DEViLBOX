/**
 * Tunefish4 Hardware UI - Brain Control Tunefish 4 Synthesizer
 *
 * Clean demoscene synth aesthetic — dark with warm amber/orange accents.
 * Full parameter control across generator, filters, and effects.
 */

import React from 'react';
import { useKnobImperative } from '@components/controls/useKnobImperative';

interface TunefishHardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const TFKnob: React.FC<{
  label: string;
  value: number;
  color?: string;
  onChange: (value: number) => void;
  paramKey?: string;
}> = ({ label, value, color = '#ff9933', onChange, paramKey }) => {
  const angle = -135 + value * 270;
  const indicatorRef = useKnobImperative<HTMLDivElement>({ paramKey });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const newVal = Math.max(0, Math.min(1, value + (e.deltaY < 0 ? 0.02 : -0.02)));
    onChange(Math.round(newVal * 100) / 100);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = value;
    const onMove = (ev: MouseEvent) => {
      const delta = (startY - ev.clientY) / 150;
      onChange(Math.round(Math.max(0, Math.min(1, startVal + delta)) * 100) / 100);
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div className="flex flex-col items-center gap-0.5 w-11">
      <div
        className="w-7 h-7 rounded-full border-2 cursor-pointer relative"
        style={{ borderColor: color, background: '#1a1208' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        title={`${label}: ${Math.round(value * 100)}%`}
      >
        <div
          ref={indicatorRef}
          className="absolute w-0.5 h-2.5 rounded-full"
          style={{ background: color, top: '2px', left: '50%', transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: 'bottom center' }}
        />
      </div>
      <div className="text-[6px] font-bold uppercase tracking-wide text-center leading-tight" style={{ color }}>{label}</div>
    </div>
  );
};

const Section: React.FC<{ label: string; color?: string; children: React.ReactNode }> = ({ label, color = '#ff9933', children }) => (
  <div className="bg-black/30 rounded p-1.5">
    <div className="text-[8px] font-bold uppercase tracking-[0.15em] mb-1 pb-0.5 border-b" style={{ color, borderColor: `${color}30` }}>{label}</div>
    <div className="flex flex-wrap gap-0.5 justify-center">{children}</div>
  </div>
);

export const TunefishHardware: React.FC<TunefishHardwareProps> = ({ parameters, onParamChange }) => {
  const p = (key: string, def = 0.5) => parameters[key] ?? def;
  const set = (key: string) => (v: number) => onParamChange(key, v);

  return (
    <div className="rounded-lg overflow-hidden shadow-2xl" style={{ background: 'linear-gradient(180deg, #1a1208 0%, #2a1f10 50%, #1a1208 100%)', maxWidth: '700px' }}>
      {/* Header */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: '#0f0a04', borderBottom: '2px solid #ff993340' }}>
        <div className="text-[10px] tracking-[0.3em] uppercase font-light" style={{ color: '#ff9933' }}>Brain Control</div>
        <div className="text-xl font-black tracking-wider" style={{ color: '#ff9933' }}>TUNEFISH 4</div>
        <div className="text-[10px] tracking-widest" style={{ color: '#ff993380' }}>DEMOSCENE SYNTH</div>
      </div>

      <div className="p-2 space-y-2">
        {/* Generator Row */}
        <div className="grid grid-cols-2 gap-2">
          <Section label="GENERATOR" color="#ff9933">
            <TFKnob label="BW" value={p('genBandwidth')} onChange={set('genBandwidth')} />
            <TFKnob label="HARM" value={p('genNumHarmonics')} onChange={set('genNumHarmonics')} />
            <TFKnob label="DAMP" value={p('genDamp')} onChange={set('genDamp')} />
            <TFKnob label="MOD" value={p('genModulation', 0)} onChange={set('genModulation')} />
            <TFKnob label="DRIVE" value={p('genDrive', 0)} color="#ff6633" onChange={set('genDrive')} />
            <TFKnob label="OCT" value={p('genOctave')} color="#ffcc33" onChange={set('genOctave')} />
          </Section>
          <Section label="VOICE" color="#ffcc33">
            <TFKnob label="VOL" value={p('genVolume', 0.8)} color="#66ff99" onChange={set('genVolume')} />
            <TFKnob label="PAN" value={p('genPanning')} color="#66ff99" onChange={set('genPanning')} />
            <TFKnob label="GAIN" value={p('globalGain', 0.7)} color="#66ff99" onChange={set('globalGain')} />
            <TFKnob label="FREQ" value={p('genFreq')} color="#ffcc33" onChange={set('genFreq')} />
            <TFKnob label="DETUNE" value={p('genDetune', 0)} color="#ffcc33" onChange={set('genDetune')} />
            <TFKnob label="GLIDE" value={p('genGlide', 0)} color="#ffcc33" onChange={set('genGlide')} />
          </Section>
        </div>

        {/* Polyphony + Noise */}
        <div className="grid grid-cols-2 gap-2">
          <Section label="POLY / UNISON" color="#cc66ff">
            <TFKnob label="POLY" value={p('genPolyphony', 1)} color="#cc66ff" onChange={set('genPolyphony')} />
            <TFKnob label="UNI" value={p('genUnisono', 0)} color="#cc66ff" onChange={set('genUnisono')} />
            <TFKnob label="SPREAD" value={p('genSpread')} color="#cc66ff" onChange={set('genSpread')} />
            <TFKnob label="SLOP" value={p('genSlop', 0)} color="#cc66ff" onChange={set('genSlop')} />
          </Section>
          <Section label="NOISE" color="#999999">
            <TFKnob label="AMT" value={p('noiseAmount', 0)} color="#999" onChange={set('noiseAmount')} />
            <TFKnob label="FREQ" value={p('noiseFreq')} color="#999" onChange={set('noiseFreq')} />
            <TFKnob label="BW" value={p('noiseBandwidth')} color="#999" onChange={set('noiseBandwidth')} />
          </Section>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-4 gap-2">
          <Section label="LP FILTER" color="#ff6633">
            <TFKnob label="CUT" value={p('lpFilterCutoff', 1)} color="#ff6633" onChange={set('lpFilterCutoff')} />
            <TFKnob label="RES" value={p('lpFilterResonance', 0)} color="#ff6633" onChange={set('lpFilterResonance')} />
          </Section>
          <Section label="HP FILTER" color="#33ccff">
            <TFKnob label="CUT" value={p('hpFilterCutoff', 0)} color="#33ccff" onChange={set('hpFilterCutoff')} />
            <TFKnob label="RES" value={p('hpFilterResonance', 0)} color="#33ccff" onChange={set('hpFilterResonance')} />
          </Section>
          <Section label="BP FILTER" color="#ffcc33">
            <TFKnob label="CUT" value={p('bpFilterCutoff')} color="#ffcc33" onChange={set('bpFilterCutoff')} />
            <TFKnob label="Q" value={p('bpFilterQ')} color="#ffcc33" onChange={set('bpFilterQ')} />
          </Section>
          <Section label="NOTCH" color="#cc66ff">
            <TFKnob label="CUT" value={p('ntFilterCutoff')} color="#cc66ff" onChange={set('ntFilterCutoff')} />
            <TFKnob label="Q" value={p('ntFilterQ')} color="#cc66ff" onChange={set('ntFilterQ')} />
          </Section>
        </div>

        {/* Effects */}
        <div className="grid grid-cols-3 gap-2">
          <Section label="DISTORTION" color="#ff3333">
            <TFKnob label="AMT" value={p('distortionAmount', 0)} color="#ff3333" onChange={set('distortionAmount')} />
            <TFKnob label="GAIN" value={p('distortionGain', 0)} color="#ff3333" onChange={set('distortionGain')} />
          </Section>
          <Section label="DELAY" color="#33ccff">
            <TFKnob label="LEFT" value={p('delayLeft', 0)} color="#33ccff" onChange={set('delayLeft')} />
            <TFKnob label="RIGHT" value={p('delayRight', 0)} color="#33ccff" onChange={set('delayRight')} />
            <TFKnob label="DECAY" value={p('delayDecay', 0)} color="#33ccff" onChange={set('delayDecay')} />
          </Section>
          <Section label="CHORUS / FLANGE" color="#66ff99">
            <TFKnob label="RATE" value={p('chorusFreq', 0)} color="#66ff99" onChange={set('chorusFreq')} />
            <TFKnob label="DEPTH" value={p('chorusDepth', 0)} color="#66ff99" onChange={set('chorusDepth')} />
            <TFKnob label="GAIN" value={p('chorusGain', 0)} color="#66ff99" onChange={set('chorusGain')} />
          </Section>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-1 text-center" style={{ background: '#0f0a04', borderTop: '1px solid #ff993320' }}>
        <div className="text-[8px] tracking-[0.3em] uppercase" style={{ color: '#ff993360' }}>Tunefish 4 • Additive Synthesis Engine</div>
      </div>
    </div>
  );
};
