import React from 'react';
import type { V2SpeechConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { MessageSquare, Zap, Activity } from 'lucide-react';
import { useThemeStore } from '@stores';

interface V2SpeechControlsProps {
  config: V2SpeechConfig;
  onChange: (updates: Partial<V2SpeechConfig>) => void;
}

export const V2SpeechControls: React.FC<V2SpeechControlsProps> = ({
  config,
  onChange,
}) => {
  // Theme-aware styling
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const knobColor = isCyanTheme ? '#00ffff' : '#ffcc33';
  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-gray-800';

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Speech Text Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare size={16} className="text-amber-500" />
          <h3 className="font-bold text-amber-400 uppercase tracking-tight">V2 PHONETIC TEXT</h3>
        </div>
        
        <input
          type="text"
          value={config.text}
          onChange={(e) => onChange({ text: e.target.value })}
          className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 font-mono text-amber-500 focus:border-amber-500/50 outline-none"
          placeholder="!DHAX_ !prAA_dAHkt"
        />
        <p className="text-[10px] text-gray-500 mt-2 uppercase">
          Use ! for phonemes and _ for pauses. Example: !DHAX_ !kwIH_k
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

      <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Zap size={14} className="text-amber-400 mt-0.5" />
          <p className="text-[10px] text-amber-400/70 leading-relaxed uppercase">
            Speech is rendered using the Lisa engine (ronan). Formant shift changes the perceived character from male to female or child.
          </p>
        </div>
      </div>
    </div>
  );
};
