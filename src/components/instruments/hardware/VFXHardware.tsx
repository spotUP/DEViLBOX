/**
 * VFX Hardware UI - Ensoniq VFX Wavetable Workstation
 *
 * Hardware-accurate panel layout matching the original VFX/VFX-SD
 * Released: 1989
 * Features: 21-voice wavetable synthesis with built-in sequencer and effects
 */

import React from 'react';
import { useThemeStore } from '@stores/useThemeStore';

interface VFXHardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/**
 * VFX style knob (black with white line indicator)
 */
const VFXKnob: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  size?: 'small' | 'medium';
}> = ({ label, value, onChange, size = 'medium' }) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isDark = currentThemeId !== 'cyan-lineart';

  const sizeMap = {
    small: 'w-10 h-10',
    medium: 'w-14 h-14',
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
          className="absolute inset-0 rounded-full border-2 border-black shadow-lg"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #303030, #000000)',
          }}
        />

        {/* Indicator */}
        <div
          className="absolute top-1 left-1/2 w-1 h-3 bg-white rounded-full -translate-x-1/2 shadow-md"
          style={{
            transform: `translateX(-50%) rotate(${rotation}deg)`,
            transformOrigin: `50% ${size === 'medium' ? '1.75rem' : '1.25rem'}`,
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
 * VFX style button
 */
const VFXButton: React.FC<{
  label: string;
  active?: boolean;
  onClick?: () => void;
  small?: boolean;
}> = ({ label, active = false, onClick, small = false }) => {
  return (
    <button
      onClick={onClick}
      className={`${small ? 'text-[8px] px-2 py-1' : 'text-[9px] px-3 py-1.5'} ${active ? 'bg-blue-600' : 'bg-gray-700'} hover:brightness-110 text-white font-bold rounded border border-gray-900 shadow-md transition-all ${active ? 'shadow-lg' : ''}`}
    >
      {label}
    </button>
  );
};

/**
 * VFX Hardware Panel
 */
export const VFXHardware: React.FC<VFXHardwareProps> = ({
  parameters,
  onParamChange,
}) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isDark = currentThemeId !== 'cyan-lineart';

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl"
      style={{
        background: 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)',
      }}
    >
      {/* Top Panel - Logo & Display */}
      <div className="px-6 py-3 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 border-b-2 border-blue-700">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-blue-200 text-[10px] font-light tracking-[0.5em] uppercase">Ensoniq</div>
            <div className="text-white font-black text-3xl tracking-wider">VFX</div>
            <div className="text-blue-300 text-[9px] font-light tracking-[0.3em] uppercase">SD Music Synthesizer</div>
          </div>
        </div>

        {/* LCD Display */}
        <div className="bg-gradient-to-b from-blue-950 to-black border-2 border-blue-800 rounded p-3 shadow-inner">
          <div className="font-mono text-blue-400 text-sm">
            <div className="flex justify-between mb-1">
              <span>PROG: 042</span>
              <span>TRANSWAVES</span>
            </div>
            <div className="text-xs text-blue-500 opacity-80">
              <span>Wave: Piano →  Strings</span>
            </div>
            <div className="text-[10px] text-blue-600 mt-1">
              <span>ENV1: ▁▃▅█▇▅▃▁</span>
              <span className="ml-4">ENV2: ▁▂▃▄▅▆▇█</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Control Panel */}
      <div className="p-6 bg-gradient-to-b from-gray-900 to-black">
        {/* Oscillator Section */}
        <div className="mb-6">
          <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-800">
            Oscillator / Wave
          </div>
          <div className="flex gap-5 justify-center">
            <VFXKnob
              label="Wave"
              value={parameters.wave || 0.0}
              onChange={(value) => onParamChange('wave', value)}
              size="medium"
            />
            <VFXKnob
              label="Start"
              value={parameters.wave_start || 0.0}
              onChange={(value) => onParamChange('wave_start', value)}
              size="medium"
            />
            <VFXKnob
              label="End"
              value={parameters.wave_end || 1.0}
              onChange={(value) => onParamChange('wave_end', value)}
              size="medium"
            />
            <VFXKnob
              label="Pitch"
              value={parameters.pitch || 0.5}
              onChange={(value) => onParamChange('pitch', value)}
              size="medium"
            />
            <VFXKnob
              label="Fine"
              value={parameters.fine || 0.5}
              onChange={(value) => onParamChange('fine', value)}
              size="small"
            />
          </div>
        </div>

        {/* Filter Section */}
        <div className="mb-6">
          <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-800">
            Filter
          </div>
          <div className="flex gap-5 justify-center">
            <VFXKnob
              label="Cutoff"
              value={parameters.cutoff || 0.7}
              onChange={(value) => onParamChange('cutoff', value)}
              size="medium"
            />
            <VFXKnob
              label="Reso"
              value={parameters.resonance || 0.3}
              onChange={(value) => onParamChange('resonance', value)}
              size="medium"
            />
            <VFXKnob
              label="Env Amt"
              value={parameters.filter_env || 0.5}
              onChange={(value) => onParamChange('filter_env', value)}
              size="medium"
            />
            <VFXKnob
              label="Vel Amt"
              value={parameters.filter_vel || 0.5}
              onChange={(value) => onParamChange('filter_vel', value)}
              size="small"
            />
          </div>
        </div>

        {/* Envelope & Amp Section */}
        <div className="mb-6">
          <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-800">
            Envelope / Amp
          </div>
          <div className="flex gap-5 justify-center">
            <VFXKnob
              label="Attack"
              value={parameters.attack || 0.0}
              onChange={(value) => onParamChange('attack', value)}
              size="medium"
            />
            <VFXKnob
              label="Decay"
              value={parameters.decay || 0.3}
              onChange={(value) => onParamChange('decay', value)}
              size="medium"
            />
            <VFXKnob
              label="Sustain"
              value={parameters.sustain || 0.7}
              onChange={(value) => onParamChange('sustain', value)}
              size="medium"
            />
            <VFXKnob
              label="Release"
              value={parameters.release || 0.3}
              onChange={(value) => onParamChange('release', value)}
              size="medium"
            />
            <VFXKnob
              label="Volume"
              value={parameters.volume || 0.8}
              onChange={(value) => onParamChange('volume', value)}
              size="medium"
            />
          </div>
        </div>

        {/* Effects */}
        <div className="mb-4">
          <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-800">
            Effects
          </div>
          <div className="flex gap-5 justify-center">
            <VFXKnob
              label="Chorus"
              value={parameters.chorus || 0.2}
              onChange={(value) => onParamChange('chorus', value)}
              size="medium"
            />
            <VFXKnob
              label="Reverb"
              value={parameters.reverb || 0.3}
              onChange={(value) => onParamChange('reverb', value)}
              size="medium"
            />
            <VFXKnob
              label="Delay"
              value={parameters.delay || 0.0}
              onChange={(value) => onParamChange('delay', value)}
              size="medium"
            />
          </div>
        </div>

        {/* Control Buttons */}
        <div className="grid grid-cols-4 gap-2 mt-6 pt-4 border-t border-gray-800">
          <VFXButton label="PROGRAM" />
          <VFXButton label="EDIT" />
          <VFXButton label="SEQ" />
          <VFXButton label="SONG" />
          <VFXButton label="FX" />
          <VFXButton label="CART" />
          <VFXButton label="MIDI" />
          <VFXButton label="MASTER" />
        </div>

        {/* Program Select */}
        <div className="grid grid-cols-8 gap-1 mt-3">
          {Array.from({ length: 8 }, (_, i) => i + 1).map((num) => (
            <VFXButton key={num} label={num.toString()} small />
          ))}
        </div>
      </div>

      {/* Bottom Info */}
      <div className="px-4 py-1 bg-black border-t border-gray-800">
        <div className="text-[9px] text-gray-600 text-center uppercase tracking-widest">
          Wavetable Synthesis • 21 Voices • 32 Oscillators • 1989
        </div>
      </div>
    </div>
  );
};
