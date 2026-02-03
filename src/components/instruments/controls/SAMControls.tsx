import React from 'react';
import type { SamConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { MessageSquare, Zap, Activity, Music } from 'lucide-react';
import { useThemeStore } from '@stores';

interface SAMControlsProps {
  config: SamConfig;
  onChange: (updates: Partial<SamConfig>) => void;
}

export const SAMControls: React.FC<SAMControlsProps> = ({
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
              <span className="text-[10px] text-gray-500 uppercase font-bold">Sing</span>
            </label>
          </div>
        </div>
        
        <input
          type="text"
          value={config.text}
          onChange={(e) => onChange({ text: e.target.value })}
          className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 font-mono text-amber-500 focus:border-amber-500/50 outline-none"
          placeholder="COMMODORE SIXTY FOUR"
        />
      </div>

      {/* Voice Parameters */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-amber-500" />
          <h3 className="font-bold text-amber-400 uppercase tracking-tight">VOICE CHARACTER</h3>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
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
          <Knob
            value={config.mouth}
            min={0}
            max={255}
            onChange={(v) => onChange({ mouth: v })}
            label="Mouth"
            color={knobColor}
          />
          <Knob
            value={config.throat}
            min={0}
            max={255}
            onChange={(v) => onChange({ throat: v })}
            label="Throat"
            color={knobColor}
          />
        </div>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Zap size={14} className="text-amber-400 mt-0.5" />
          <p className="text-[10px] text-amber-400/70 leading-relaxed uppercase">
            SAM (Software Automatic Mouth) is a classic 8-bit speech engine from 1982. Use "Sing" mode for melodic speech triggered by notes.
          </p>
        </div>
      </div>
    </div>
  );
};
