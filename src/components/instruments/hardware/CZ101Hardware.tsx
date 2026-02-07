/**
 * CZ-101 Hardware UI - Casio CZ-101 Phase Distortion Synthesizer
 *
 * Hardware-accurate panel layout matching the original CZ-101
 * Released: 1984
 * Features: 8-voice Phase Distortion synthesis with compact design
 */

import React from 'react';

interface CZ101HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/**
 * CZ-101 style slider (small vertical slider with orange cap)
 */
const CZ101Slider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, value, onChange }) => {

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Slider track */}
      <div className="relative h-24 w-6 flex items-center justify-center">
        <div className={`absolute inset-0 rounded bg-gray-800 border border-gray-700`}>
          {/* Slider groove */}
          <div className="absolute left-1/2 top-1 bottom-1 w-0.5 -translate-x-1/2 bg-gray-900 rounded-full" />
        </div>

        {/* Slider input */}
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value}
          onChange={handleChange}
          className="absolute h-24 w-6 bg-transparent cursor-pointer z-10 opacity-0"
          style={{
            writingMode: 'vertical-lr' as any,
            direction: 'rtl' as any,
          }}
          title={`${label}: ${Math.round(value * 100)}%`}
        />

        {/* Slider cap (orange) */}
        <div
          className="absolute w-5 h-2.5 rounded-sm bg-orange-500 border border-orange-700 shadow-md pointer-events-none z-20"
          style={{
            top: `${100 - value * 100}%`,
            transform: 'translateY(-50%)',
          }}
        />
      </div>

      {/* Label */}
      <div className={`text-[8px] font-bold text-gray-300 uppercase tracking-wide text-center`}>
        {label}
      </div>
    </div>
  );
};

/**
 * CZ-101 style button (rectangular, gray or orange)
 */
const CZ101Button: React.FC<{
  label: string;
  active?: boolean;
  onClick?: () => void;
  color?: 'gray' | 'orange';
  small?: boolean;
}> = ({ label, active = false, onClick, color = 'gray', small = false }) => {
  const colorMap = {
    gray: active ? 'bg-gray-600' : 'bg-gray-700',
    orange: active ? 'bg-orange-500' : 'bg-orange-600',
  };

  return (
    <button
      onClick={onClick}
      className={`${colorMap[color]} hover:brightness-110 text-white ${small ? 'text-[8px] px-2 py-1' : 'text-[9px] px-3 py-1.5'} font-bold rounded border border-gray-900 shadow-md transition-all ${active ? 'shadow-lg scale-95' : ''}`}
    >
      {label}
    </button>
  );
};

/**
 * CZ-101 Hardware Panel
 */
export const CZ101Hardware: React.FC<CZ101HardwareProps> = ({
  parameters,
  onParamChange,
}) => {

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl max-w-2xl"
      style={{
        background: 'linear-gradient(180deg, #4a4a4a 0%, #3a3a3a 50%, #2a2a2a 100%)',
      }}
    >
      {/* Top Panel - Logo & Model */}
      <div className="px-4 py-2 bg-gradient-to-r from-gray-900 to-gray-800 border-b-2 border-orange-600 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-white font-black text-xl tracking-[0.3em]" style={{ fontFamily: 'sans-serif' }}>
            CASIO
          </div>
        </div>
        <div className="text-right">
          <div className="text-orange-400 text-xs font-light tracking-[0.3em] uppercase">Phase Distortion</div>
          <div className="text-white font-black text-3xl tracking-wide">CZ-101</div>
        </div>
      </div>

      {/* Main Panel - Compact Layout */}
      <div className="p-4">
        {/* LCD Display Area */}
        <div className="mb-4 bg-gradient-to-b from-gray-800 to-gray-900 p-2 rounded border border-gray-700 shadow-inner">
          <div className="bg-amber-900/20 border border-amber-800 rounded p-2 min-h-[60px] font-mono text-xs text-amber-400">
            <div className="flex justify-between">
              <span>PATCH: 12</span>
              <span>BRASS 1</span>
            </div>
            <div className="text-[10px] text-amber-500/80 mt-1">
              DCO1: SAW | DCO2: PULSE
            </div>
          </div>
        </div>

        {/* Sliders Section */}
        <div className="mb-4">
          <div className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2 text-center">
            Parameter Control
          </div>
          <div className="flex gap-3 justify-center items-end bg-gray-900/30 rounded p-3">
            <CZ101Slider
              label="DCW"
              value={parameters.dcw || 0.5}
              onChange={(value) => onParamChange('dcw', value)}
            />
            <CZ101Slider
              label="DCA"
              value={parameters.dca || 0.8}
              onChange={(value) => onParamChange('dca', value)}
            />
            <CZ101Slider
              label="DCO"
              value={parameters.dco || 0.5}
              onChange={(value) => onParamChange('dco', value)}
            />
            <CZ101Slider
              label="Detune"
              value={parameters.detune || 0.5}
              onChange={(value) => onParamChange('detune', value)}
            />
            <CZ101Slider
              label="Octave"
              value={parameters.octave || 0.5}
              onChange={(value) => onParamChange('octave', value)}
            />
            <CZ101Slider
              label="Volume"
              value={parameters.volume || 0.8}
              onChange={(value) => onParamChange('volume', value)}
            />
          </div>
        </div>

        {/* Waveform Selection */}
        <div className="mb-3">
          <div className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2 text-center">
            Waveform
          </div>
          <div className="grid grid-cols-4 gap-1">
            <CZ101Button label="SAW" small active={parameters.waveform === 0} onClick={() => onParamChange('waveform', 0)} />
            <CZ101Button label="SQUARE" small active={parameters.waveform === 1} onClick={() => onParamChange('waveform', 1)} />
            <CZ101Button label="PULSE" small active={parameters.waveform === 2} onClick={() => onParamChange('waveform', 2)} />
            <CZ101Button label="RESO" small active={parameters.waveform === 6} onClick={() => onParamChange('waveform', 6)} />
          </div>
        </div>

        {/* Function Buttons */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <CZ101Button label="CARTRIDGE" color="gray" />
          <CZ101Button label="TONE EDIT" color="orange" />
          <CZ101Button label="PROGRAM" color="gray" />
        </div>

        {/* Preset Banks */}
        <div className="grid grid-cols-4 gap-1">
          {['A-1', 'A-2', 'A-3', 'A-4', 'B-1', 'B-2', 'B-3', 'B-4'].map((preset) => (
            <CZ101Button key={preset} label={preset} small color="gray" />
          ))}
        </div>
      </div>

      {/* Bottom Info */}
      <div className="px-4 py-1 bg-black border-t border-gray-800">
        <div className="text-[9px] text-gray-600 text-center uppercase tracking-widest">
          Phase Distortion Synthesis • 8 Voices • 1984
        </div>
      </div>
    </div>
  );
};
