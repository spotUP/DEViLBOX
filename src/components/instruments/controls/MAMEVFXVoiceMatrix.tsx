import React, { useState, useEffect, useCallback } from 'react';
import { MAMEEngine } from '@engine/MAMEEngine';
import { Knob } from '@components/controls/Knob';
import { Radio, Settings, FileUp } from 'lucide-react';
import { MAMEVFXFilterVisualizer } from '@components/visualization/MAMEVFXFilterVisualizer';

interface MAMEVFXVoiceMatrixProps {
  handle: number;
  accentColor: string;
  knobColor: string;
  panelBg: string;
}

export const MAMEVFXVoiceMatrix: React.FC<MAMEVFXVoiceMatrixProps> = ({
  handle,
  accentColor,
  knobColor,
  panelBg
}) => {
  const engine = MAMEEngine.getInstance();
  const [selectedVoice, setSelectedVoice] = useState(0);
  const [voiceActivity, setVoiceActivity] = useState<boolean[]>(new Array(32).fill(false));
  const [voiceParams, setVoiceParams] = useState<Record<number, number>>({});

  // Poll for voice activity and current params
  useEffect(() => {
    if (handle === 0) return;

    const interval = setInterval(() => {
      const newActivity = [];
      const originalPage = engine.read(handle, 0x78);
      
      for (let i = 0; i < 32; i++) {
        engine.write(handle, 0x78, i); // Select voice page
        const ctrl = engine.read(handle, 0x00);
        // Bit 0 is STOP. If 0, voice is playing.
        newActivity.push((ctrl & 0x01) === 0);
      }
      
      engine.write(handle, 0x78, originalPage);
      setVoiceActivity(newActivity);

      // Also read params for the currently selected voice
      engine.write(handle, 0x78, selectedVoice);
      const params: Record<number, number> = {};
      for (let i = 0; i < 16; i++) {
        params[i] = engine.read(handle, i);
      }
      setVoiceParams(params);
      engine.write(handle, 0x78, originalPage);
    }, 100);

    return () => clearInterval(interval);
  }, [engine, handle, selectedVoice]);

  const handleVoiceWrite = useCallback((reg: number, val: number) => {
    if (handle === 0) return;
    const originalPage = engine.read(handle, 0x78);
    engine.write(handle, 0x78, selectedVoice);
    engine.write(handle, reg, val);
    engine.write(handle, 0x78, originalPage);
  }, [engine, handle, selectedVoice]);

  const handleSysexUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || handle === 0) return;

    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    
    console.log(`🎹 MAME: Sending SysEx to handle ${handle} (${data.length} bytes)...`);
    engine.addMidiEvent(handle, data);
  }, [engine, handle]);

  return (
    <div className="space-y-4">
      {/* SysEx / Bank Loader */}
      <div className={`p-3 rounded border ${panelBg} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded">
            <FileUp className="text-purple-400" size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">SysEx Bank Loader</h4>
            <p className="text-[9px] text-text-muted">Import original .SYX patches</p>
          </div>
        </div>
        <label className="cursor-pointer text-[10px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-3 py-1.5 rounded border border-purple-500/30 transition-colors font-bold uppercase">
          Load .SYX
          <input type="file" className="hidden" accept=".syx" onChange={handleSysexUpload} />
        </label>
      </div>

      <div className="flex items-center gap-2 text-text-secondary">
        <Radio size={16} />
        <span className="text-xs font-bold uppercase text-text-primary">Voice Matrix (32 Oscillators)</span>
      </div>

      {/* Grid of 32 voices */}
      <div className={`grid grid-cols-8 gap-1 p-2 rounded border ${panelBg}`}>
        {Array.from({ length: 32 }).map((_, i) => (
          <button
            key={i}
            onClick={() => setSelectedVoice(i)}
            className={`
              relative h-8 flex items-center justify-center rounded text-[10px] font-mono transition-all
              ${selectedVoice === i 
                ? 'bg-accent-primary text-black font-bold border-white/50 shadow-lg shadow-accent-primary/20' 
                : 'bg-dark-bgSecondary/50 text-text-muted hover:bg-dark-bgHover'}
              border border-transparent
            `}
          >
            {i.toString().padStart(2, '0')}
            {voiceActivity[i] && (
              <span 
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: selectedVoice === i ? 'black' : accentColor }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Selected Voice Editor */}
      <div className={`p-4 rounded border ${panelBg} space-y-4`}>
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-text-muted" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
              Editing Voice {selectedVoice.toString().padStart(2, '0')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-text-muted uppercase font-mono">Status:</span>
            <span className={`text-[9px] font-bold font-mono ${voiceActivity[selectedVoice] ? 'text-green-400' : 'text-red-400'}`}>
              {voiceActivity[selectedVoice] ? 'RUNNING' : 'STOPPED'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 md:grid-cols-8 gap-4 place-items-center">
          <Knob size="sm" label="VOL L" min={0} max={255} value={voiceParams[0x10] || 0} onChange={(v) => handleVoiceWrite(0x10, v)} color={knobColor} />
          <Knob size="sm" label="VOL R" min={0} max={255} value={voiceParams[0x20] || 0} onChange={(v) => handleVoiceWrite(0x20, v)} color={knobColor} />
          <Knob size="sm" label="FREQ L" min={0} max={255} value={voiceParams[0x08] || 0} onChange={(v) => handleVoiceWrite(0x08, v)} color={knobColor} />
          <Knob size="sm" label="FREQ H" min={0} max={255} value={voiceParams[0x09] || 0} onChange={(v) => handleVoiceWrite(0x09, v)} color={knobColor} />
          <Knob size="sm" label="K1" min={0} max={255} value={voiceParams[0x48] || 0} onChange={(v) => handleVoiceWrite(0x48, v)} color={knobColor} />
          <Knob size="sm" label="K2" min={0} max={255} value={voiceParams[0x38] || 0} onChange={(v) => handleVoiceWrite(0x38, v)} color={knobColor} />
          <Knob size="sm" label="ECOUNT" min={0} max={255} value={voiceParams[0x30] || 0} onChange={(v) => handleVoiceWrite(0x30, v)} color={knobColor} />
          <Knob size="sm" label="CTRL" min={0} max={255} value={voiceParams[0x00] || 0} onChange={(v) => handleVoiceWrite(0x00, v)} color={knobColor} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div className="bg-black/20 p-2 rounded border border-white/5 space-y-1">
              <div className="text-[8px] text-text-muted uppercase font-bold tracking-tighter">Wavetable Offset</div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-text-muted">START:</span>
                <span className="text-accent-primary">0x{(voiceParams[0x08 + 0x80] || 0).toString(16).toUpperCase().padStart(4, '0')}</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-text-muted">END:</span>
                <span className="text-accent-primary">0x{(voiceParams[0x10 + 0x80] || 0).toString(16).toUpperCase().padStart(4, '0')}</span>
              </div>
           </div>
           
           <div className="flex justify-center">
              <MAMEVFXFilterVisualizer 
                k1={voiceParams[0x48] || 0} 
                k2={voiceParams[0x38] || 0} 
                width={180}
                height={50}
                color={accentColor}
              />
           </div>
        </div>
      </div>
    </div>
  );
};