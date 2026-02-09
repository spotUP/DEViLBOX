import React, { useState, useRef } from 'react';
import type { SamConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { MessageSquare, Zap, Activity, Book, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';
import { useThemeStore } from '@stores';
// @ts-ignore
import SamJs from '@engine/sam/samjs';

interface SAMControlsProps {
  config: SamConfig;
  onChange: (updates: Partial<SamConfig>) => void;
}

export const SAMControls: React.FC<SAMControlsProps> = ({
  config,
  onChange,
}) => {
  const [showPhonemes, setShowPhonemes] = useState(false);
  
  // Use ref to prevent stale closures in callbacks
  const configRef = useRef(config);
  configRef.current = config;

  // Theme-aware styling
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const knobColor = isCyanTheme ? '#00ffff' : '#ffcc33';
  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-gray-800';

  const handleConvertToPhonemes = () => {
    try {
      const phonetic = SamJs.convert(configRef.current.text);
      if (phonetic) {
        onChange({ 
          text: phonetic,
          phonetic: true 
        });
      }
    } catch (e) {
      console.error('[SAM] Phonetic conversion failed:', e);
    }
  };

  const PHONEMES = [
    { code: 'IY', example: 'beet' }, { code: 'IH', example: 'bit' },
    { code: 'EH', example: 'bet' }, { code: 'AE', example: 'bat' },
    { code: 'AA', example: 'hot' }, { code: 'AH', example: 'but' },
    { code: 'AO', example: 'bought' }, { code: 'OH', example: 'bone' },
    { code: 'UH', example: 'book' }, { code: 'UW', example: 'boot' },
    { code: 'RR', example: 'bird' }, { code: 'LL', example: 'lull' },
    { code: 'WW', example: 'we' }, { code: 'YY', example: 'yes' },
  ];

  const handleTextChange = (text: string) => {
    // If we're not in phonetic mode, we just update the text
    // We don't auto-convert while typing as it's destructive/confusing
    onChange({ text });
  };

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto scrollbar-modern">
      {/* Speech Text Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-amber-500" />
            <h3 className="font-bold text-amber-400 uppercase tracking-tight">SAM TEXT</h3>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.phonetic}
                onChange={(e) => onChange({ phonetic: e.target.checked })}
                className="w-3 h-3 rounded border-gray-700 bg-transparent"
              />
              <span className="text-[10px] text-gray-500 uppercase font-bold">Phonetic</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.singmode}
                onChange={(e) => onChange({ singmode: e.target.checked })}
                className="w-3 h-3 rounded border-gray-700 bg-transparent"
              />
              <span className="text-[10px] text-gray-500 uppercase font-bold" title="Adjusts pitch based on MIDI notes">Sing</span>
            </label>
          </div>
        </div>
        
        <div className="flex gap-2">
          <input
            type="text"
            value={config.text}
            onChange={(e) => handleTextChange(e.target.value)}
            className="flex-1 bg-black/40 border border-gray-700 rounded-lg px-4 py-3 font-mono text-amber-500 focus:border-amber-500/50 outline-none"
            placeholder="COMMODORE SIXTY FOUR"
          />
          <button
            onClick={handleConvertToPhonemes}
            className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-all flex flex-col items-center justify-center min-w-[80px]"
            title="Convert plain text to SAM phonemes"
          >
            <Wand2 size={16} className="mb-1" />
            <span className="text-[8px] font-black uppercase tracking-tighter">Convert</span>
          </button>
        </div>
      </div>

      {/* Main Parameters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* XY Pad for Mouth/Throat */}
        <div className={`p-4 rounded-xl border ${panelBg} flex flex-col items-center`}>
          <div className="flex items-center gap-2 mb-4 w-full">
            <Activity size={16} className="text-amber-500" />
            <h3 className="font-bold text-amber-400 uppercase tracking-tight">VOCAL CHARACTER</h3>
          </div>
          
          <div 
            className="w-40 h-40 bg-black/60 rounded-lg border border-gray-700 relative cursor-crosshair overflow-hidden"
            onMouseMove={(e) => {
              if (e.buttons === 1) {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.max(0, Math.min(255, ((e.clientX - rect.left) / rect.width) * 255));
                const y = Math.max(0, Math.min(255, (1 - (e.clientY - rect.top) / rect.height) * 255));
                onChange({ mouth: Math.round(x), throat: Math.round(y) });
              }
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = Math.max(0, Math.min(255, ((e.clientX - rect.left) / rect.width) * 255));
              const y = Math.max(0, Math.min(255, (1 - (e.clientY - rect.top) / rect.height) * 255));
              onChange({ mouth: Math.round(x), throat: Math.round(y) });
            }}
          >
            {/* Grid lines */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
              <div className="w-full h-[1px] bg-amber-500" />
              <div className="h-full w-[1px] bg-amber-500" />
            </div>
            
            {/* Point */}
            <div 
              className="absolute w-3 h-3 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.8)] -translate-x-1/2 translate-y-1/2"
              style={{ 
                left: `${(config.mouth / 255) * 100}%`, 
                bottom: `${(config.throat / 255) * 100}%` 
              }}
            />
            
            {/* Labels */}
            <div className="absolute bottom-1 left-2 text-[8px] text-gray-500 uppercase font-bold">Mouth (X)</div>
            <div className="absolute top-2 left-1 text-[8px] text-gray-500 uppercase font-bold origin-left rotate-90">Throat (Y)</div>
          </div>
          
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase font-bold">Mouth</div>
              <div className="text-xs text-amber-500 font-mono font-bold">{config.mouth}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase font-bold">Throat</div>
              <div className="text-xs text-amber-500 font-mono font-bold">{config.throat}</div>
            </div>
          </div>
        </div>

        {/* Knobs for Speed/Pitch */}
        <div className={`p-4 rounded-xl border ${panelBg}`}>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-amber-500" />
            <h3 className="font-bold text-amber-400 uppercase tracking-tight">PERFORMANCE</h3>
          </div>
          <div className="grid grid-cols-2 gap-6 items-center justify-center h-40">
            <Knob
              value={config.pitch}
              min={0}
              max={255}
              onChange={(v) => onChange({ pitch: v })}
              label="Pitch"
              color={knobColor}
            />
            <Knob
              value={config.speed}
              min={0}
              max={255}
              onChange={(v) => onChange({ speed: v })}
              label="Speed"
              color={knobColor}
            />
          </div>
        </div>
      </div>

      {/* Phoneme Cheat Sheet */}
      <div className={`rounded-xl border ${panelBg} overflow-hidden transition-all`}>
        <button 
          onClick={() => setShowPhonemes(!showPhonemes)}
          className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Book size={14} className="text-amber-500" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Phoneme Reference</span>
          </div>
          {showPhonemes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        
        {showPhonemes && (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-gray-800 bg-black/20">
            {PHONEMES.map(p => (
              <div key={p.code} className="flex flex-col p-1.5 rounded bg-gray-900/50 border border-gray-800">
                <span className="text-[10px] font-bold text-amber-500 font-mono">{p.code}</span>
                <span className="text-[8px] text-gray-500 uppercase">{p.example}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Zap size={14} className="text-amber-400 mt-0.5" />
          <p className="text-[10px] text-amber-400/70 leading-relaxed uppercase">
            SAM renders a new buffer on every change. Sing mode allows melodic playback via keyboard.
          </p>
        </div>
      </div>
    </div>
  );
};
