import React, { useState, useEffect, useCallback } from 'react';
import { MAMEEngine } from '@engine/MAMEEngine';
import { Knob } from '@components/controls/Knob';
import { Radio, Settings, HardDrive } from 'lucide-react';

interface MAMERSAVoiceMatrixProps {
  handle: number;
  knobColor: string;
  panelBg: string;
}

export const MAMERSAVoiceMatrix: React.FC<MAMERSAVoiceMatrixProps> = ({
  handle,
  knobColor,
  panelBg
}) => {
  const engine = MAMEEngine.getInstance();
  const [selectedVoice, setSelectedVoice] = useState(0);
  const [selectedPart, setSelectedPart] = useState(0);
  const [voiceActivity, setVoiceActivity] = useState<boolean[]>(new Array(16).fill(false));
  const [partParams, setPartParams] = useState<Record<number, number>>({});
  const [roms, setRoms] = useState<{ic5?: Uint8Array, ic6?: Uint8Array, ic7?: Uint8Array}>({});

  // Poll for voice activity and part params
  useEffect(() => {
    if (handle === 0) return;

    const interval = setInterval(() => {
      const newActivity = [];
      for (let i = 0; i < 16; i++) {
        const mem_offset = i * 0x100 + 0 * 0x10;
        const env_speed = engine.read(handle, mem_offset + 5);
        newActivity.push(env_speed > 0);
      }
      setVoiceActivity(newActivity);

      const params: Record<number, number> = {};
      const mem_offset = selectedVoice * 0x100 + selectedPart * 0x10;
      
      for (let i = 0; i < 8; i++) {
        params[i] = engine.read(handle, mem_offset + i);
      }
      setPartParams(params);
    }, 100);

    return () => clearInterval(interval);
  }, [engine, handle, selectedVoice, selectedPart]);

  const handlePartWrite = useCallback((reg: number, val: number) => {
    if (handle === 0) return;
    const mem_offset = selectedVoice * 0x100 + selectedPart * 0x10;
    engine.write(handle, mem_offset + reg, val);
  }, [engine, handle, selectedVoice, selectedPart]);

  const handleRSARomUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, type: 'ic5' | 'ic6' | 'ic7') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    
    const newRoms = { ...roms, [type]: data };
    setRoms(newRoms);

    if (newRoms.ic5 && newRoms.ic6 && newRoms.ic7) {
      console.log("🎹 MAME: All Roland SA ROMs ready, injecting...");
      engine.rsaLoadRoms(handle, newRoms.ic5, newRoms.ic6, newRoms.ic7);
    }
  }, [engine, handle, roms]);

  return (
    <div className="space-y-4">
      {/* Roland SA ROM Loader */}
      <div className={`p-4 border rounded ${panelBg} space-y-3`}>
        <div className="flex items-center gap-2 text-text-secondary">
          <HardDrive size={16} />
          <span className="text-xs font-bold uppercase text-text-primary">Roland SA Sample ROMs</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['ic5', 'ic6', 'ic7'].map((id) => {
            const isLoaded = !!roms[id as keyof typeof roms];
            return (
              <label key={id} className={`
                flex flex-col items-center justify-center p-2 rounded border border-dashed transition-all cursor-pointer
                ${isLoaded ? 'bg-sky-500/10 border-sky-500/50' : 'bg-dark-bgSecondary/50 border-dark-border hover:border-text-muted'}
              `}>
                <span className={`text-[9px] font-bold ${isLoaded ? 'text-sky-400' : 'text-text-muted'}`}>{id.toUpperCase()}</span>
                <span className="text-[8px] text-text-muted">{isLoaded ? 'READY' : 'UPLOAD'}</span>
                <input type="file" className="hidden" onChange={(e) => handleRSARomUpload(e, id as 'ic5' | 'ic6' | 'ic7')} />
              </label>
            );
          })}
        </div>
        {!(roms.ic5 && roms.ic6 && roms.ic7) && (
          <p className="text-[8px] text-text-muted italic">Note: RSA engine requires all 3 ROMs (MKS-20 set) to produce sound.</p>
        )}
      </div>

      <div className="flex items-center gap-2 text-text-secondary">
        <Radio size={16} />
        <span className="text-xs font-bold uppercase text-text-primary">Roland SA Voice Matrix (16 Voices / 10 Parts)</span>
      </div>

      {/* Grid of 16 voices */}
      <div className={`grid grid-cols-8 gap-1 p-2 rounded border ${panelBg}`}>
        {Array.from({ length: 16 }).map((_, i) => (
          <button
            key={i}
            onClick={() => setSelectedVoice(i)}
            className={`
              relative h-8 flex items-center justify-center rounded text-[10px] font-mono transition-all
              ${selectedVoice === i 
                ? 'bg-sky-500 text-black font-bold border-sky-500 shadow-lg shadow-sky-500/20' 
                : 'bg-dark-bgSecondary/50 text-text-muted hover:bg-dark-bgHover'}
              border border-transparent
            `}
          >
            V{i.toString().padStart(2, '0')}
            {voiceActivity[i] && (
              <span 
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full animate-pulse bg-sky-400"
              />
            )}
          </button>
        ))}
      </div>

      {/* Part Selection */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <button
            key={i}
            onClick={() => setSelectedPart(i)}
            className={`
              px-2 py-1 rounded text-[9px] font-bold uppercase transition-all
              ${selectedPart === i 
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' 
                : 'bg-dark-bgSecondary text-text-muted hover:text-text-primary'}
            `}
          >
            PART {i}
          </button>
        ))}
      </div>

      {/* Selected Part Editor */}
      <div className={`p-4 rounded border ${panelBg} space-y-4 shadow-inner-dark`}>
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-text-muted" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
              Voice {selectedVoice} | Part {selectedPart} Parameters
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 md:grid-cols-7 gap-4 place-items-center">
          <Knob size="sm" label="PITCH L" min={0} max={255} value={partParams[0] || 0} onChange={(v) => handlePartWrite(0, v)} color={knobColor} />
          <Knob size="sm" label="PITCH H" min={0} max={255} value={partParams[1] || 0} onChange={(v) => handlePartWrite(1, v)} color={knobColor} />
          <Knob size="sm" label="W-LOOP" min={0} max={255} value={partParams[2] || 0} onChange={(v) => handlePartWrite(2, v)} color={knobColor} />
          <Knob size="sm" label="W-HIGH" min={0} max={255} value={partParams[3] || 0} onChange={(v) => handlePartWrite(3, v)} color={knobColor} />
          <Knob size="sm" label="E-DEST" min={0} max={255} value={partParams[4] || 0} onChange={(v) => handlePartWrite(4, v)} color={knobColor} />
          <Knob size="sm" label="E-SPD" min={0} max={255} value={partParams[5] || 0} onChange={(v) => handlePartWrite(5, v)} color={knobColor} />
          <Knob size="sm" label="E-OFFS" min={0} max={255} value={partParams[7] || 0} onChange={(v) => handlePartWrite(7, v)} color={knobColor} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div className="bg-black/20 p-2 rounded border border-border space-y-1">
              <div className="text-[8px] text-text-muted uppercase font-bold tracking-tighter">Hardware Info (SA Engine)</div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-text-muted">PITCH:</span>
                <span className="text-sky-400">0x{(partParams[1] || 0).toString(16).toUpperCase().padStart(2, '0')}{(partParams[0] || 0).toString(16).toUpperCase().padStart(2, '0')}</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-text-muted">WAVE:</span>
                <span className="text-sky-400">HI: 0x{(partParams[3] || 0).toString(16).toUpperCase().padStart(2, '0')} | LP: 0x{(partParams[2] || 0).toString(16).toUpperCase().padStart(2, '0')}</span>
              </div>
           </div>
           <div className="bg-black/20 p-2 rounded border border-border flex flex-col justify-center italic text-[9px] text-text-muted">
              <div>• Structured Adaptive (SA) - Ultra-accurate 80s piano synthesis.</div>
              <div>• Each voice is composed of 10 "Parts" (harmonic components).</div>
           </div>
        </div>
      </div>
    </div>
  );
};
