import React, { useState, useRef, useEffect } from 'react';
import type { V2SpeechConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { MessageSquare, Zap, Activity, Book, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';
import { useThemeStore } from '@stores';
// @ts-expect-error -- SamJs is a JavaScript library without types
import SamJs from '@engine/sam/samjs';

interface V2SpeechControlsProps {
  config: V2SpeechConfig;
  onChange: (updates: Partial<V2SpeechConfig>) => void;
}

export const V2SpeechControls: React.FC<V2SpeechControlsProps> = ({
  config,
  onChange,
}) => {
  const [showPhonemes, setShowPhonemes] = useState(false);

  // Use ref to prevent stale closures in callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; });

  // Theme-aware styling
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const knobColor = isCyanTheme ? '#00ffff' : '#ffcc33';
  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-gray-800';

  // Convert plain text to SAM phonemes
  const handleConvertToPhonemes = () => {
    try {
      const phonetic = SamJs.convert(configRef.current.text);
      if (phonetic) {
        onChange({ text: phonetic });
      }
    } catch (e) {
      console.error('[V2Speech] Phonetic conversion failed:', e);
    }
  };

  // Common phonemes reference (same as SAM)
  const PHONEMES = [
    { code: 'IY', example: 'beet' }, { code: 'IH', example: 'bit' },
    { code: 'EH', example: 'bet' }, { code: 'AE', example: 'bat' },
    { code: 'AA', example: 'hot' }, { code: 'AH', example: 'but' },
    { code: 'AO', example: 'bought' }, { code: 'OH', example: 'bone' },
    { code: 'UH', example: 'book' }, { code: 'UW', example: 'boot' },
    { code: 'RR', example: 'bird' }, { code: 'LL', example: 'lull' },
    { code: 'WW', example: 'we' }, { code: 'YY', example: 'yes' },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto scrollbar-modern">
      {/* Speech Text Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-amber-500" />
            <h3 className="font-bold text-amber-400 uppercase tracking-tight">V2 SPEECH TEXT</h3>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.singMode}
              onChange={(e) => onChange({ singMode: e.target.checked })}
              className="w-3 h-3 rounded border-gray-700 bg-transparent"
            />
            <span className="text-[10px] text-gray-500 uppercase font-bold" title="Enables MIDI note-to-pitch tracking">Sing Mode</span>
          </label>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={config.text}
            onChange={(e) => onChange({ text: e.target.value })}
            className="flex-1 bg-black/40 border border-gray-700 rounded-lg px-4 py-3 font-mono text-amber-500 focus:border-amber-500/50 outline-none"
            placeholder="HELLO WORLD"
          />
          <button
            onClick={handleConvertToPhonemes}
            className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-all flex flex-col items-center justify-center min-w-[80px]"
            title="Convert plain text to phonemes"
          >
            <Wand2 size={16} className="mb-1" />
            <span className="text-[8px] font-black uppercase tracking-tighter">Convert</span>
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-2 uppercase">
          Type plain text and click Convert, or enter phonemes directly (e.g., DHAX KWIHK BRAUN FAHKS)
        </p>
      </div>

      {/* Voice Parameters */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-amber-500" />
          <h3 className="font-bold text-amber-400 uppercase tracking-tight">VOICE PARAMETERS</h3>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <Knob
            value={config.speed}
            min={0}
            max={127}
            onChange={(v) => onChange({ speed: v })}
            label="Speed"
            color={knobColor}
          />
          <Knob
            value={config.pitch}
            min={0}
            max={127}
            onChange={(v) => onChange({ pitch: v })}
            label="Pitch"
            color={knobColor}
          />
          <Knob
            value={config.formantShift}
            min={0}
            max={127}
            onChange={(v) => onChange({ formantShift: v })}
            label="Formant"
            color={knobColor}
          />
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
            V2 Speech uses the SAM engine. Sing Mode tracks keyboard notes to change pitch. Formant shift adjusts voice character from male to female.
          </p>
        </div>
      </div>
    </div>
  );
};
