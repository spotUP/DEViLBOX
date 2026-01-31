import React, { useState, useEffect, useCallback } from 'react';
import { MAMEEngine } from '@engine/MAMEEngine';
import { Knob } from '@components/controls/Knob';
import { Radio, Settings } from 'lucide-react';

interface MAMEDOCVoiceMatrixProps {
  handle: number;
  knobColor: string;
  panelBg: string;
}

export const MAMEDOCVoiceMatrix: React.FC<MAMEDOCVoiceMatrixProps> = ({
  handle,
  knobColor,
  panelBg
}) => {
  const engine = MAMEEngine.getInstance();
  const [selectedOsc, setSelectedOsc] = useState(0);
  const [oscActivity, setOscActivity] = useState<boolean[]>(new Array(32).fill(false));
  const [oscParams, setOscParams] = useState<Record<number, number>>({});

  // Poll for oscillator activity and current params
  useEffect(() => {
    if (handle === 0) return;

    const interval = setInterval(() => {
      const newActivity = [];
      // To check activity on DOC, we read register 0x80 + osc
      // Bit 0 is HALT. If 0, oscillator is running.
      
      for (let i = 0; i < 32; i++) {
        const ctrl = engine.read(handle, 0x80 + i);
        newActivity.push((ctrl & 0x01) === 0);
      }
      setOscActivity(newActivity);

      // Read params for the currently selected oscillator
      const params: Record<number, number> = {};
      params[0x00] = engine.read(handle, 0x00 + selectedOsc); // Freq Low
      params[0x20] = engine.read(handle, 0x20 + selectedOsc); // Freq High
      params[0x40] = engine.read(handle, 0x40 + selectedOsc); // Volume
      params[0x80] = engine.read(handle, 0x80 + selectedOsc); // Control
      params[0xA0] = engine.read(handle, 0xA0 + selectedOsc); // Wavetable Size
      params[0xC0] = engine.read(handle, 0xC0 + selectedOsc); // Wavetable Pointer
      setOscParams(params);
    }, 100);

    return () => clearInterval(interval);
  }, [engine, handle, selectedOsc]);

  const handleOscWrite = useCallback((base: number, val: number) => {
    if (handle === 0) return;
    engine.write(handle, base + selectedOsc, val);
  }, [engine, handle, selectedOsc]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-text-secondary">
        <Radio size={16} />
        <span className="text-xs font-bold uppercase text-text-primary">DOC Oscillator Matrix (32 Voices)</span>
      </div>

      {/* Grid of 32 oscillators */}
      <div className={`grid grid-cols-8 gap-1 p-2 rounded border ${panelBg}`}>
        {Array.from({ length: 32 }).map((_, i) => (
          <button
            key={i}
            onClick={() => setSelectedOsc(i)}
            className={`
              relative h-8 flex items-center justify-center rounded text-[10px] font-mono transition-all
              ${selectedOsc === i 
                ? 'bg-amber-500 text-black font-bold border-white/50 shadow-lg shadow-amber-500/20' 
                : 'bg-dark-bgSecondary/50 text-text-muted hover:bg-dark-bgHover'}
              border border-transparent
            `}
          >
            {i.toString().padStart(2, '0')}
            {oscActivity[i] && (
              <span 
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full animate-pulse bg-amber-400"
              />
            )}
          </button>
        ))}
      </div>

      {/* Selected Oscillator Editor */}
      <div className={`p-4 rounded border ${panelBg} space-y-4 shadow-inner`}>
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-text-muted" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
              Editing Oscillator {selectedOsc.toString().padStart(2, '0')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-text-muted uppercase font-mono">Status:</span>
            <span className={`text-[9px] font-bold font-mono ${oscActivity[selectedOsc] ? 'text-green-400' : 'text-red-400'}`}>
              {oscActivity[selectedOsc] ? 'RUNNING' : 'HALTED'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 md:grid-cols-6 gap-4 place-items-center">
          <Knob size="sm" label="FREQ L" min={0} max={255} value={oscParams[0x00] || 0} onChange={(v) => handleOscWrite(0x00, v)} color={knobColor} />
          <Knob size="sm" label="FREQ H" min={0} max={255} value={oscParams[0x20] || 0} onChange={(v) => handleOscWrite(0x20, v)} color={knobColor} />
          <Knob size="sm" label="VOLUME" min={0} max={255} value={oscParams[0x40] || 0} onChange={(v) => handleOscWrite(0x40, v)} color={knobColor} />
          <Knob size="sm" label="CTRL" min={0} max={255} value={oscParams[0x80] || 0} onChange={(v) => handleOscWrite(0x80, v)} color={knobColor} />
          <Knob size="sm" label="W-SIZE" min={0} max={255} value={oscParams[0xA0] || 0} onChange={(v) => handleOscWrite(0xA0, v)} color={knobColor} />
          <Knob size="sm" label="W-PTR" min={0} max={255} value={oscParams[0xC0] || 0} onChange={(v) => handleOscWrite(0xC0, v)} color={knobColor} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div className="bg-black/20 p-2 rounded border border-white/5 space-y-1">
              <div className="text-[8px] text-text-muted uppercase font-bold tracking-tighter">Register State (HEX)</div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-text-muted">FREQ:</span>
                <span className="text-amber-400">0x{(oscParams[0x20] || 0).toString(16).toUpperCase().padStart(2, '0')}{(oscParams[0x00] || 0).toString(16).toUpperCase().padStart(2, '0')}</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-text-muted">WAVE:</span>
                <span className="text-amber-400">PTR: 0x{(oscParams[0xC0] || 0).toString(16).toUpperCase().padStart(2, '0')} | SZ: 0x{(oscParams[0xA0] || 0).toString(16).toUpperCase().padStart(2, '0')}</span>
              </div>
           </div>
           <div className="bg-black/20 p-2 rounded border border-white/5 flex flex-col justify-center italic text-[9px] text-text-muted">
              <div>• ES5503 (DOC) - Gritty 8-bit wavetable engine.</div>
              <div>• HALT bit must be cleared (0) for audio to play.</div>
           </div>
        </div>
      </div>
    </div>
  );
};
