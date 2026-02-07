/**
 * DX7 Hardware UI - Yamaha DX7 FM Synthesizer
 *
 * Hardware-accurate panel layout matching the original DX7
 * Released: 1983
 * Features: 6-operator FM synthesis with 32 algorithms, 16-voice polyphony
 */

import React from 'react';

interface DX7HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/**
 * DX7 style slider (vertical, gray with green cap)
 */
const DX7Slider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, value, onChange }) => {

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-28 w-6 flex items-center justify-center">
        <div className={`absolute inset-0 rounded bg-gray-800 border border-gray-700`}>
          <div className="absolute left-1/2 top-1 bottom-1 w-0.5 -translate-x-1/2 bg-gray-900 rounded-full" />
        </div>

        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value}
          onChange={handleChange}
          className="absolute h-28 w-6 bg-transparent cursor-pointer z-10 opacity-0"
          style={{
            writingMode: 'vertical-lr' as any,
            direction: 'rtl' as any,
          }}
          title={`${label}: ${Math.round(value * 100)}%`}
        />

        <div
          className="absolute w-5 h-2.5 rounded-sm bg-green-500 border border-green-700 shadow-md pointer-events-none z-20"
          style={{
            top: `${100 - value * 100}%`,
            transform: 'translateY(-50%)',
          }}
        />
      </div>

      <div className={`text-[8px] font-bold text-gray-300 uppercase tracking-wide text-center`}>
        {label}
      </div>
    </div>
  );
};

/**
 * DX7 style button
 */
const DX7Button: React.FC<{
  label: string;
  active?: boolean;
  onClick?: () => void;
  small?: boolean;
  color?: 'gray' | 'green';
}> = ({ label, active = false, onClick, small = false, color = 'gray' }) => {
  const colorMap = {
    gray: active ? 'bg-gray-600' : 'bg-gray-700',
    green: active ? 'bg-green-600' : 'bg-green-700',
  };

  return (
    <button
      onClick={onClick}
      className={`${colorMap[color]} hover:brightness-110 text-white ${small ? 'text-[8px] px-2 py-1' : 'text-[9px] px-3 py-1.5'} font-bold rounded border border-gray-900 shadow-md transition-all ${active ? 'shadow-lg' : ''}`}
    >
      {label}
    </button>
  );
};

/**
 * DX7 Hardware Panel
 */
export const DX7Hardware: React.FC<DX7HardwareProps> = ({
  parameters,
  onParamChange,
}) => {

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl"
      style={{
        background: 'linear-gradient(180deg, #d0d0d0 0%, #a8a8a8 100%)',
      }}
    >
      {/* Top Panel - Logo & LCD */}
      <div className="px-6 py-3 bg-gradient-to-r from-gray-900 to-gray-800 border-b-2 border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-gray-400 text-[10px] font-light tracking-[0.5em] uppercase">Yamaha</div>
            <div className="text-white font-black text-4xl tracking-wider">DX7</div>
            <div className="text-gray-400 text-[9px] font-light tracking-[0.3em] uppercase">Digital Programmable Algorithm Synthesizer</div>
          </div>
        </div>

        {/* LCD Display */}
        <div className="bg-gradient-to-b from-green-950 to-black border-2 border-green-800 rounded p-3 shadow-inner">
          <div className="font-mono text-green-400 text-sm">
            <div className="flex justify-between mb-1">
              <span>VOICE: 01</span>
              <span>E.PIANO 1</span>
            </div>
            <div className="text-xs text-green-500 opacity-80 grid grid-cols-2 gap-2">
              <span>ALG: 05</span>
              <span>FBK: 7</span>
            </div>
            <div className="text-[10px] text-green-600 mt-1 flex gap-4">
              <span>OP1█ OP2█ OP3▓ OP4▓ OP5░ OP6░</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Control Panel */}
      <div className="p-6 bg-gradient-to-b from-gray-400 to-gray-500">
        {/* Operator Sliders */}
        <div className="mb-6">
          <div className="text-xs font-bold text-gray-800 uppercase tracking-widest mb-3 pb-1 border-b border-gray-600">
            Operator Levels
          </div>
          <div className="flex gap-4 justify-center items-end bg-gray-500/30 rounded p-4">
            <DX7Slider
              label="OP1"
              value={parameters.op1_level || 0.99}
              onChange={(value) => onParamChange('op1_level', value)}
            />
            <DX7Slider
              label="OP2"
              value={parameters.op2_level || 0.99}
              onChange={(value) => onParamChange('op2_level', value)}
            />
            <DX7Slider
              label="OP3"
              value={parameters.op3_level || 0.8}
              onChange={(value) => onParamChange('op3_level', value)}
            />
            <DX7Slider
              label="OP4"
              value={parameters.op4_level || 0.8}
              onChange={(value) => onParamChange('op4_level', value)}
            />
            <DX7Slider
              label="OP5"
              value={parameters.op5_level || 0.5}
              onChange={(value) => onParamChange('op5_level', value)}
            />
            <DX7Slider
              label="OP6"
              value={parameters.op6_level || 0.5}
              onChange={(value) => onParamChange('op6_level', value)}
            />
          </div>
        </div>

        {/* Master Controls */}
        <div className="mb-4">
          <div className="text-xs font-bold text-gray-800 uppercase tracking-widest mb-3 pb-1 border-b border-gray-600">
            Master
          </div>
          <div className="flex gap-6 justify-center items-end">
            <DX7Slider
              label="Volume"
              value={parameters.volume || 0.8}
              onChange={(value) => onParamChange('volume', value)}
            />
            <DX7Slider
              label="Detune"
              value={parameters.detune || 0.5}
              onChange={(value) => onParamChange('detune', value)}
            />
            <DX7Slider
              label="Feedback"
              value={parameters.feedback || 0.5}
              onChange={(value) => onParamChange('feedback', value)}
            />
          </div>
        </div>

        {/* Function Buttons */}
        <div className="grid grid-cols-4 gap-2 mt-6 pt-4 border-t border-gray-600">
          <DX7Button label="EDIT" color="green" />
          <DX7Button label="VOICE" color="gray" />
          <DX7Button label="FUNCTION" color="gray" />
          <DX7Button label="STORE" color="green" />
        </div>

        {/* Voice Select */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          <DX7Button label="1-8" small />
          <DX7Button label="9-16" small />
          <DX7Button label="17-24" small />
          <DX7Button label="25-32" small />
        </div>

        {/* Algorithm Display */}
        <div className="mt-4 p-3 bg-gray-700 rounded border border-gray-800">
          <div className="text-[9px] text-gray-300 uppercase tracking-wide mb-2 text-center">Algorithm 5</div>
          <div className="flex justify-center gap-2 text-[10px] font-mono text-green-400">
            <div className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 border-2 border-green-400 rounded flex items-center justify-center">6</div>
              <div className="h-4 w-0.5 bg-green-400"></div>
              <div className="w-6 h-6 border-2 border-green-400 rounded flex items-center justify-center">5</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 border-2 border-green-400 rounded flex items-center justify-center">4</div>
              <div className="h-4 w-0.5 bg-green-400"></div>
              <div className="w-6 h-6 border-2 border-green-400 rounded flex items-center justify-center">3</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 border-2 border-green-400 rounded flex items-center justify-center">2</div>
              <div className="h-4 w-0.5 bg-green-400"></div>
              <div className="w-6 h-6 border-2 border-green-400 rounded flex items-center justify-center">1</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Info */}
      <div className="px-4 py-1 bg-gray-800 border-t border-gray-700">
        <div className="text-[9px] text-gray-400 text-center uppercase tracking-widest">
          6-Operator FM Synthesis • 32 Algorithms • 16 Voices • 1983
        </div>
      </div>
    </div>
  );
};
