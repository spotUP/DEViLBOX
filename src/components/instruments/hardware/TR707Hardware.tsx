/**
 * TR-707 Hardware UI - Roland TR-707 Rhythm Composer
 *
 * Hardware-accurate panel layout matching the original TR-707
 * Released: 1985
 * Features: 10-voice PCM drum machine with individual level controls
 */

import React from 'react';
import { useThemeStore } from '@stores/useThemeStore';

interface TR707HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

interface DrumVoice {
  key: string;
  label: string;
  shortLabel: string;
}

const DRUM_VOICES: DrumVoice[] = [
  { key: 'accent', label: 'Accent', shortLabel: 'AC' },
  { key: 'bass', label: 'Bass Drum', shortLabel: 'BD' },
  { key: 'snare', label: 'Snare Drum', shortLabel: 'SD' },
  { key: 'low_tom', label: 'Low Tom', shortLabel: 'LT' },
  { key: 'mid_tom', label: 'Mid Tom', shortLabel: 'MT' },
  { key: 'hi_tom', label: 'Hi Tom', shortLabel: 'HT' },
  { key: 'rimshot', label: 'Rim/Cow', shortLabel: 'RIM/COW' },
  { key: 'handclap', label: 'HCP/Tamb', shortLabel: 'HCP/TAMB' },
  { key: 'hihat', label: 'Hi-Hat', shortLabel: 'HH' },
  { key: 'crash', label: 'Crash', shortLabel: 'CRASH' },
  { key: 'ride', label: 'Ride', shortLabel: 'RIDE' },
  { key: 'volume', label: 'Volume', shortLabel: 'VOLUME' },
];

/**
 * Vertical slider styled like the TR-707 hardware
 */
const TR707Slider: React.FC<{
  label: string;
  shortLabel: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, shortLabel, value, onChange }) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isDark = currentThemeId !== 'cyan-lineart';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  return (
    <div className="flex flex-col items-center gap-2 flex-1">
      {/* Slider track */}
      <div className="relative h-32 w-8 flex items-center justify-center">
        <div className={`absolute inset-0 rounded-full ${isDark ? 'bg-gray-800' : 'bg-gray-300'} border ${isDark ? 'border-gray-700' : 'border-gray-400'} z-0`}>
          {/* Slider groove */}
          <div className="absolute left-1/2 top-2 bottom-2 w-1 -translate-x-1/2 bg-gray-900 rounded-full" />
        </div>

        {/* Slider input */}
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value}
          onChange={handleChange}
          className="absolute h-32 w-8 bg-transparent cursor-pointer vertical-slider z-10 opacity-0"
          style={{
            writingMode: 'vertical-lr' as any,
            direction: 'rtl' as any,
          }}
          title={`${label}: ${Math.round(value * 100)}%`}
        />

        {/* Slider cap */}
        <div
          className={`absolute w-6 h-3 rounded-sm ${isDark ? 'bg-red-600' : 'bg-red-500'} border border-red-800 shadow-lg pointer-events-none transition-all z-20`}
          style={{
            top: `${100 - value * 100}%`,
            transform: 'translateY(-50%)',
          }}
        />
      </div>

      {/* Label */}
      <div className="text-center">
        <div className={`text-xs font-bold ${isDark ? 'text-gray-300' : 'text-gray-700'} tracking-wider`}>
          {shortLabel}
        </div>
        <div className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'} uppercase`}>
          {label}
        </div>
      </div>
    </div>
  );
};

/**
 * Rotary knob styled like the TR-707 hardware
 */
const TR707Knob: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  size?: 'small' | 'medium' | 'large';
}> = ({ label, value, onChange, size = 'medium' }) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isDark = currentThemeId !== 'cyan-lineart';

  const sizeMap = {
    small: 'w-12 h-12',
    medium: 'w-16 h-16',
    large: 'w-20 h-20',
  };

  const rotation = -135 + (value * 270); // -135deg to +135deg (270 deg total)

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      const degrees = angle * (180 / Math.PI);
      const normalized = (degrees + 135 + 360) % 360;
      const newValue = Math.max(0, Math.min(1, normalized / 270));
      onChange(newValue);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`${sizeMap[size]} relative cursor-pointer select-none`}
        onMouseDown={handleMouseDown}
        title={`${label}: ${Math.round(value * 100)}%`}
      >
        {/* Knob body */}
        <div
          className={`absolute inset-0 rounded-full ${isDark ? 'bg-gray-800' : 'bg-gray-700'} border-4 ${isDark ? 'border-gray-900' : 'border-gray-900'} shadow-lg`}
          style={{
            background: isDark
              ? 'radial-gradient(circle at 30% 30%, #4b5563, #1f2937)'
              : 'radial-gradient(circle at 30% 30%, #6b7280, #374151)',
          }}
        />

        {/* Knob indicator */}
        <div
          className="absolute top-1 left-1/2 w-1 h-4 bg-white rounded-full -translate-x-1/2 shadow-md"
          style={{
            transform: `translateX(-50%) rotate(${rotation}deg)`,
            transformOrigin: `50% ${size === 'large' ? '2.5rem' : size === 'medium' ? '2rem' : '1.5rem'}`,
          }}
        />

        {/* Center cap */}
        <div className={`absolute inset-0 m-auto w-3 h-3 rounded-full ${isDark ? 'bg-gray-950' : 'bg-black'} shadow-inner`} />
      </div>

      <div className={`text-xs font-bold ${isDark ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wider text-center`}>
        {label}
      </div>
    </div>
  );
};

/**
 * TR-707 Hardware Panel
 */
export const TR707Hardware: React.FC<TR707HardwareProps> = ({
  parameters,
  onParamChange,
}) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isDark = currentThemeId !== 'cyan-lineart';

  return (
    <div
      className={`rounded-lg overflow-hidden shadow-2xl ${isDark ? 'bg-gradient-to-b from-gray-400 via-gray-300 to-gray-400' : 'bg-gradient-to-b from-gray-200 via-gray-100 to-gray-200'}`}
      style={{
        background: 'linear-gradient(180deg, #d4d4d4 0%, #c0c0c0 50%, #a8a8a8 100%)',
      }}
    >
      {/* Top Panel - Logo & Brand */}
      <div className="px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 border-b-2 border-gray-500 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-white font-black text-xl tracking-wider" style={{ fontFamily: 'monospace' }}>
            ROLAND
          </div>
        </div>
        <div className="text-right">
          <div className="text-gray-800 text-xs font-light tracking-[0.3em] uppercase">Rhythm Composer</div>
          <div className="text-gray-900 font-black text-3xl tracking-tight">TR-707</div>
        </div>
      </div>

      {/* Main Panel - Horizontal Layout */}
      <div className="flex gap-4 p-4">
        {/* Left Section - Memory/Pattern (Simplified) */}
        <div className="flex-shrink-0 w-48 space-y-3">
          {/* LCD Display Area */}
          <div className="bg-gradient-to-b from-gray-700 to-gray-800 p-3 rounded border-2 border-gray-600 shadow-inner">
            <div className="bg-green-900/30 border border-green-800 rounded p-2 min-h-[80px] font-mono text-xs text-green-400">
              <div className="opacity-80">MEMORY PATTERN</div>
              <div className="mt-2 text-[10px]">PTN: 01</div>
              <div className="text-[10px]">KIT: Standard</div>
            </div>
          </div>

          {/* Pattern Buttons */}
          <div className="grid grid-cols-4 gap-1">
            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((btn) => (
              <button
                key={btn}
                className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-2 rounded border border-gray-600 shadow"
              >
                {btn}
              </button>
            ))}
          </div>

          {/* Menu Buttons */}
          <div className="space-y-1">
            <button className="w-full bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold py-2 rounded border border-orange-700">
              EDIT
            </button>
            <button className="w-full bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-2 rounded border border-gray-600">
              OPTION
            </button>
          </div>
        </div>

        {/* Right Section - Mixer Faders */}
        <div className="flex-1 flex flex-col">
          <div className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-2 text-center">
            LEVEL
          </div>
          <div className="flex gap-2 justify-between items-end flex-1 px-2">
            <div className="text-[9px] text-gray-600 uppercase tracking-tight self-start">MAX</div>
            {DRUM_VOICES.map((voice) => (
              <TR707Slider
                key={voice.key}
                label={voice.label}
                shortLabel={voice.shortLabel}
                value={parameters[voice.key] || 0.8}
                onChange={(value) => onParamChange(voice.key, value)}
              />
            ))}
            <div className="text-[9px] text-gray-600 uppercase tracking-tight self-start">MAX</div>
          </div>
          <div className="text-[9px] text-gray-600 uppercase tracking-tight text-center mt-1">MIN</div>

          {/* Shuffle Knob */}
          <div className="flex justify-end mt-3 pr-4">
            <div className="text-center">
              <div className="text-[10px] text-gray-700 uppercase font-bold mb-1">Shuffle</div>
              <TR707Knob
                label=""
                value={parameters.decay || 0.5}
                onChange={(value) => onParamChange('decay', value)}
                size="medium"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section - Sequencer */}
      <div className="px-4 pb-3">
        <div className="bg-gradient-to-b from-gray-600 to-gray-700 rounded p-2 border border-gray-500">
          <div className="grid grid-cols-16 gap-0.5 mb-2">
            {Array.from({ length: 16 }, (_, i) => (
              <div
                key={i}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-600 h-6 rounded-sm flex items-center justify-center text-[9px] text-gray-400"
              >
                {i + 1}
              </div>
            ))}
          </div>
          <div className="flex gap-2 text-[9px] text-gray-300 justify-between px-1">
            <span>Bass Drum</span>
            <span>Snare Drum</span>
            <span>Low Tom</span>
            <span>Mid Tom</span>
            <span>Hi Tom</span>
            <span className="text-right">Hi-Hat</span>
          </div>
        </div>
      </div>

      {/* Bottom Info */}
      <div className="px-4 py-1 bg-gray-800 border-t border-gray-600">
        <div className="text-[9px] text-gray-500 text-center uppercase tracking-widest">
          PCM Digital Rhythm Composer • 1985
        </div>
      </div>
    </div>
  );
};
