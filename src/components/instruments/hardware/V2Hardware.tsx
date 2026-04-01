/**
 * V2 Hardware UI - farbrausch V2 Synthesizer
 *
 * Demoscene-inspired dark panel with 3 oscillators, 2 filters, routing, envelopes.
 * German demo scene aesthetic — dark gray with cyan/orange accents.
 */

import React from 'react';

interface V2HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

const V2Knob: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  color?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min = 0, max = 127, color = '#33ccff', onChange }) => {
  const norm = (value - min) / (max - min);
  const angle = -135 + norm * 270;

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const step = (max - min) / 50;
    const newVal = Math.max(min, Math.min(max, value + (e.deltaY < 0 ? step : -step)));
    onChange(Math.round(newVal));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = value;
    const onMove = (ev: MouseEvent) => {
      const delta = (startY - ev.clientY) * (max - min) / 150;
      onChange(Math.round(Math.max(min, Math.min(max, startVal + delta))));
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div className="flex flex-col items-center gap-0.5 w-12">
      <div
        className="w-8 h-8 rounded-full border-2 cursor-pointer relative"
        style={{ borderColor: color, background: '#1a1a2e' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        title={`${label}: ${Math.round(value)}`}
      >
        <div
          className="absolute w-0.5 h-3 rounded-full"
          style={{ background: color, top: '2px', left: '50%', transform: `translateX(-50%) rotate(${angle}deg)`, transformOrigin: 'bottom center' }}
        />
      </div>
      <div className="text-[7px] font-bold uppercase tracking-wide text-center" style={{ color }}>{label}</div>
      <div className="text-[7px] text-gray-500 font-mono">{Math.round(value)}</div>
    </div>
  );
};

const SectionLabel: React.FC<{ label: string; color?: string }> = ({ label, color = '#33ccff' }) => (
  <div className="text-[9px] font-bold uppercase tracking-[0.2em] mb-1 pb-0.5 border-b" style={{ color, borderColor: `${color}40` }}>
    {label}
  </div>
);

export const V2Hardware: React.FC<V2HardwareProps> = ({ parameters, onParamChange }) => {
  const p = (key: string, def = 64) => parameters[key] ?? def;
  const set = (key: string) => (v: number) => onParamChange(key, v);

  return (
    <div className="rounded-lg overflow-hidden shadow-2xl" style={{ background: 'linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 50%, #0d0d1a 100%)', maxWidth: '680px' }}>
      {/* Header */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: 'linear-gradient(90deg, #0a0a15 0%, #1a1a2e 50%, #0a0a15 100%)', borderBottom: '2px solid #33ccff40' }}>
        <div className="text-[10px] text-cyan-600 tracking-[0.4em] uppercase font-light">farbrausch</div>
        <div className="text-xl font-black tracking-wider" style={{ color: '#33ccff' }}>V2</div>
        <div className="text-[10px] text-cyan-800 tracking-widest">SYNTHESIZER</div>
      </div>

      <div className="p-3 space-y-3">
        {/* Oscillators Row */}
        <div className="grid grid-cols-3 gap-3">
          {([['OSC 1', 'osc1', '#33ccff'], ['OSC 2', 'osc2', '#ff6633'], ['OSC 3', 'osc3', '#cc66ff']] as const).map(([label, prefix, color]) => (
            <div key={prefix} className="bg-black/30 rounded p-2">
              <SectionLabel label={label} color={color} />
              <div className="flex flex-wrap gap-1 justify-center">
                <V2Knob label="MODE" value={p(`${prefix}.mode`, prefix === 'osc1' ? 1 : 0)} min={0} max={7} color={color} onChange={set(`${prefix}.mode`)} />
                <V2Knob label="TRANS" value={p(`${prefix}.transpose`, 64)} color="#ffcc33" onChange={set(`${prefix}.transpose`)} />
                <V2Knob label="DETUNE" value={p(`${prefix}.detune`, prefix === 'osc2' ? 74 : prefix === 'osc3' ? 54 : 64)} color="#ffcc33" onChange={set(`${prefix}.detune`)} />
                <V2Knob label="COLOR" value={p(`${prefix}.color`, 64)} color="#ff9933" onChange={set(`${prefix}.color`)} />
                <V2Knob label="VOL" value={p(`${prefix}.level`, prefix === 'osc1' ? 127 : 0)} color="#66ff99" onChange={set(`${prefix}.level`)} />
              </div>
            </div>
          ))}
        </div>

        {/* Filters + Routing Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-black/30 rounded p-2">
            <SectionLabel label="FILTER 1" color="#ff6633" />
            <div className="flex gap-1 justify-center">
              <V2Knob label="MODE" value={p('filter1.mode', 1)} min={0} max={7} color="#ff6633" onChange={set('filter1.mode')} />
              <V2Knob label="CUT" value={p('filter1.cutoff', 127)} color="#ff6633" onChange={set('filter1.cutoff')} />
              <V2Knob label="RES" value={p('filter1.resonance', 0)} color="#ff6633" onChange={set('filter1.resonance')} />
            </div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <SectionLabel label="FILTER 2" color="#33ccff" />
            <div className="flex gap-1 justify-center">
              <V2Knob label="MODE" value={p('filter2.mode', 0)} min={0} max={7} color="#33ccff" onChange={set('filter2.mode')} />
              <V2Knob label="CUT" value={p('filter2.cutoff', 64)} color="#33ccff" onChange={set('filter2.cutoff')} />
              <V2Knob label="RES" value={p('filter2.resonance', 0)} color="#33ccff" onChange={set('filter2.resonance')} />
            </div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <SectionLabel label="ROUTING" color="#cc66ff" />
            <div className="flex gap-1 justify-center">
              <V2Knob label="MODE" value={p('routing.mode', 0)} min={0} max={2} color="#cc66ff" onChange={set('routing.mode')} />
              <V2Knob label="BAL" value={p('routing.balance', 64)} color="#cc66ff" onChange={set('routing.balance')} />
            </div>
          </div>
        </div>

        {/* Envelopes Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-black/30 rounded p-2">
            <SectionLabel label="AMP ENV" color="#66ff99" />
            <div className="flex gap-1 justify-center">
              <V2Knob label="ATK" value={p('envelope.attack', 0)} color="#66ff99" onChange={set('envelope.attack')} />
              <V2Knob label="DEC" value={p('envelope.decay', 64)} color="#66ff99" onChange={set('envelope.decay')} />
              <V2Knob label="SUS" value={p('envelope.sustain', 127)} color="#66ff99" onChange={set('envelope.sustain')} />
              <V2Knob label="REL" value={p('envelope.release', 32)} color="#66ff99" onChange={set('envelope.release')} />
            </div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <SectionLabel label="MOD ENV" color="#ff9933" />
            <div className="flex gap-1 justify-center">
              <V2Knob label="ATK" value={p('envelope2.attack', 0)} color="#ff9933" onChange={set('envelope2.attack')} />
              <V2Knob label="DEC" value={p('envelope2.decay', 64)} color="#ff9933" onChange={set('envelope2.decay')} />
              <V2Knob label="SUS" value={p('envelope2.sustain', 127)} color="#ff9933" onChange={set('envelope2.sustain')} />
              <V2Knob label="REL" value={p('envelope2.release', 32)} color="#ff9933" onChange={set('envelope2.release')} />
            </div>
          </div>
        </div>

        {/* LFO Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-black/30 rounded p-2">
            <SectionLabel label="LFO 1" color="#ffcc33" />
            <div className="flex gap-1 justify-center">
              <V2Knob label="RATE" value={p('lfo1.rate', 64)} color="#ffcc33" onChange={set('lfo1.rate')} />
              <V2Knob label="DEPTH" value={p('lfo1.depth', 0)} color="#ffcc33" onChange={set('lfo1.depth')} />
            </div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <SectionLabel label="LFO 2" color="#ff6699" />
            <div className="flex gap-1 justify-center">
              <V2Knob label="RATE" value={p('lfo2.rate', 64)} color="#ff6699" onChange={set('lfo2.rate')} />
              <V2Knob label="AMP" value={p('lfo2.amplify', 127)} color="#ff6699" onChange={set('lfo2.amplify')} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-1 text-center" style={{ background: '#0a0a15', borderTop: '1px solid #33ccff20' }}>
        <div className="text-[8px] text-cyan-900 tracking-[0.3em] uppercase">farbrausch Synthesizer System • V2M Engine</div>
      </div>
    </div>
  );
};
