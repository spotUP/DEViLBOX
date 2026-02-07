/**
 * D-50 Hardware UI - Roland D-50 Linear Arithmetic Synthesizer
 *
 * Hardware-accurate panel layout matching the original D-50
 * Released: 1987
 * Features: LA synthesis with PCM attack + synth sustain, 16 voices
 */

import React from 'react';
import { useThemeStore } from '@stores/useThemeStore';

interface D50HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/**
 * D-50 style knob (gray with white indicator)
 */
const D50Knob: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  size?: 'small' | 'medium';
}> = ({ label, value, onChange, size = 'medium' }) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isDark = currentThemeId !== 'cyan-lineart';

  const sizeMap = {
    small: 'w-10 h-10',
    medium: 'w-12 h-12',
  };

  const rotation = -135 + (value * 270);

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
    <div className="flex flex-col items-center gap-1">
      <div
        className={`${sizeMap[size]} relative cursor-pointer select-none`}
        onMouseDown={handleMouseDown}
        title={`${label}: ${Math.round(value * 100)}%`}
      >
        {/* Knob body */}
        <div
          className="absolute inset-0 rounded-full border-2 border-gray-800 shadow-lg"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #707070, #404040)',
          }}
        />

        {/* Indicator */}
        <div
          className="absolute top-1 left-1/2 w-1 h-2 bg-white rounded-full -translate-x-1/2 shadow-md"
          style={{
            transform: `translateX(-50%) rotate(${rotation}deg)`,
            transformOrigin: `50% ${size === 'medium' ? '1.5rem' : '1.25rem'}`,
          }}
        />
      </div>

      <div className={`text-[8px] font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wide text-center max-w-[60px]`}>
        {label}
      </div>
    </div>
  );
};

/**
 * D-50 style button
 */
const D50Button: React.FC<{
  label: string;
  active?: boolean;
  onClick?: () => void;
  small?: boolean;
}> = ({ label, active = false, onClick, small = false }) => {
  return (
    <button
      onClick={onClick}
      className={`${small ? 'text-[8px] px-2 py-1' : 'text-[9px] px-3 py-1.5'} ${active ? 'bg-red-600' : 'bg-gray-700'} hover:brightness-110 text-white font-bold rounded border border-gray-900 shadow-md transition-all ${active ? 'shadow-lg' : ''}`}
    >
      {label}
    </button>
  );
};

/**
 * D-50 Hardware Panel
 */
export const D50Hardware: React.FC<D50HardwareProps> = ({
  parameters,
  onParamChange,
}) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isDark = currentThemeId !== 'cyan-lineart';

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl"
      style={{
        background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)',
      }}
    >
      {/* Top Panel - Logo & LCD */}
      <div className="px-6 py-3 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b-2 border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="text-white font-black text-2xl tracking-wider" style={{ fontFamily: 'monospace' }}>
            ROLAND
          </div>
          <div className="text-right">
            <div className="text-gray-400 text-[10px] font-light tracking-[0.4em] uppercase">Linear Synthesizer</div>
            <div className="text-white font-black text-4xl tracking-tight">D-50</div>
          </div>
        </div>

        {/* LCD Display */}
        <div className="bg-gradient-to-b from-cyan-900 to-cyan-950 border-2 border-cyan-800 rounded p-3 shadow-inner">
          <div className="font-mono text-cyan-400 text-sm">
            <div className="flex justify-between mb-1">
              <span>PATCH: 11</span>
              <span>FANTASIA</span>
            </div>
            <div className="text-xs text-cyan-500 opacity-80">
              <span>Upper: Piano+Str</span>
              <span className="ml-4">Lower: Synth Bass</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Control Panel */}
      <div className="p-6 bg-gradient-to-b from-gray-800 to-gray-900">
        {/* Tone Controls */}
        <div className="mb-6">
          <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-700">
            Tone Controls
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-[9px] text-gray-400 uppercase mb-2">Upper</div>
              <div className="flex gap-3 justify-center">
                <D50Knob
                  label="Level"
                  value={parameters.upper_level || 0.8}
                  onChange={(value) => onParamChange('upper_level', value)}
                  size="medium"
                />
                <D50Knob
                  label="Detune"
                  value={parameters.upper_detune || 0.5}
                  onChange={(value) => onParamChange('upper_detune', value)}
                  size="small"
                />
              </div>
            </div>

            <div className="text-center">
              <div className="text-[9px] text-gray-400 uppercase mb-2">Lower</div>
              <div className="flex gap-3 justify-center">
                <D50Knob
                  label="Level"
                  value={parameters.lower_level || 0.8}
                  onChange={(value) => onParamChange('lower_level', value)}
                  size="medium"
                />
                <D50Knob
                  label="Detune"
                  value={parameters.lower_detune || 0.5}
                  onChange={(value) => onParamChange('lower_detune', value)}
                  size="small"
                />
              </div>
            </div>

            <div className="text-center">
              <div className="text-[9px] text-gray-400 uppercase mb-2">Cutoff</div>
              <D50Knob
                label="Filter"
                value={parameters.cutoff || 0.7}
                onChange={(value) => onParamChange('cutoff', value)}
                size="medium"
              />
            </div>

            <div className="text-center">
              <div className="text-[9px] text-gray-400 uppercase mb-2">Resonance</div>
              <D50Knob
                label="Reso"
                value={parameters.resonance || 0.3}
                onChange={(value) => onParamChange('resonance', value)}
                size="medium"
              />
            </div>
          </div>
        </div>

        {/* Effects & Master */}
        <div className="mb-6">
          <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-700">
            Effects & Master
          </div>
          <div className="flex gap-6 justify-center items-end">
            <D50Knob
              label="Chorus"
              value={parameters.chorus || 0.3}
              onChange={(value) => onParamChange('chorus', value)}
              size="medium"
            />
            <D50Knob
              label="Reverb"
              value={parameters.reverb || 0.4}
              onChange={(value) => onParamChange('reverb', value)}
              size="medium"
            />
            <D50Knob
              label="Volume"
              value={parameters.volume || 0.8}
              onChange={(value) => onParamChange('volume', value)}
              size="medium"
            />
          </div>
        </div>

        {/* Control Buttons */}
        <div className="grid grid-cols-4 gap-2 mt-6 pt-4 border-t border-gray-700">
          <D50Button label="PATCH" />
          <D50Button label="TONE" />
          <D50Button label="CHASE" />
          <D50Button label="EDIT" />
          <D50Button label="WRITE" />
          <D50Button label="UTILITY" />
          <D50Button label="MIDI" />
          <D50Button label="EXIT" />
        </div>

        {/* Patch Select Buttons */}
        <div className="grid grid-cols-8 gap-1 mt-4">
          {['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6', 'A-7', 'A-8'].map((patch) => (
            <D50Button key={patch} label={patch} small />
          ))}
        </div>
      </div>

      {/* Bottom Info */}
      <div className="px-4 py-1 bg-black border-t border-gray-800">
        <div className="text-[9px] text-gray-600 text-center uppercase tracking-widest">
          LA Synthesis • 16 Voices • PCM + Analog • 1987
        </div>
      </div>
    </div>
  );
};
