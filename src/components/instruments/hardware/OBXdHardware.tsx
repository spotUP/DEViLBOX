/**
 * OBXd Hardware UI - Oberheim OB-X Analog Polysynth
 *
 * Hardware-accurate panel layout matching the original OB-X/OB-Xa
 * Released: 1979 (OB-X), 1980 (OB-Xa)
 * Features: Classic analog synthesis with warm character, 8-voice polyphony
 */

import React from 'react';

interface OBXdHardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/**
 * Oberheim style knob (black with white line)
 */
const OBXKnob: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  size?: 'small' | 'medium' | 'large';
}> = ({ label, value, onChange, size = 'medium' }) => {

  const sizeMap = {
    small: 'w-10 h-10',
    medium: 'w-14 h-14',
    large: 'w-16 h-16',
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
            background: 'radial-gradient(circle at 30% 30%, #2a2a2a, #000000)',
          }}
        />

        {/* Indicator */}
        <div
          className="absolute top-1 left-1/2 w-1 h-4 bg-white rounded-full -translate-x-1/2 shadow-md"
          style={{
            transform: `translateX(-50%) rotate(${rotation}deg)`,
            transformOrigin: `50% ${size === 'large' ? '2rem' : size === 'medium' ? '1.75rem' : '1.25rem'}`,
          }}
        />
      </div>

      <div className={`text-[9px] font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wide text-center`}>
        {label}
      </div>
    </div>
  );
};

/**
 * Oberheim style switch/button
 */
const OBXSwitch: React.FC<{
  label: string;
  active?: boolean;
  onClick?: () => void;
}> = ({ label, active = false, onClick }) => {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={onClick}
        className={`w-6 h-6 rounded-full border-2 ${active ? 'bg-orange-500 border-orange-600' : 'bg-gray-800 border-gray-700'} shadow-md transition-all ${active ? 'shadow-lg shadow-orange-500/50' : ''}`}
      />
      <div className="text-[8px] font-semibold text-gray-300 uppercase tracking-wide text-center">
        {label}
      </div>
    </div>
  );
};

/**
 * OBXd Hardware Panel
 */
export const OBXdHardware: React.FC<OBXdHardwareProps> = ({
  parameters,
  onParamChange,
}) => {

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl"
      style={{
        background: 'linear-gradient(180deg, #4a4a4a 0%, #2a2a2a 100%)',
      }}
    >
      {/* Top Panel - Logo */}
      <div className="px-6 py-3 bg-gradient-to-r from-orange-700 to-orange-600 border-b-2 border-orange-800">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-orange-200 text-sm font-light tracking-[0.5em] uppercase">Oberheim</div>
            <div className="text-white font-black text-4xl tracking-wider">OB-X</div>
          </div>
          <div className="text-right">
            <div className="text-orange-200 text-xs font-light tracking-[0.3em] uppercase">Polyphonic</div>
            <div className="text-white text-2xl font-bold">8 VOICE</div>
          </div>
        </div>
      </div>

      {/* Main Control Panel */}
      <div className="p-6 bg-gradient-to-b from-gray-800 to-gray-900">
        {/* Oscillator Section */}
        <div className="mb-6">
          <div className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-700">
            Oscillators
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-[10px] text-gray-400 uppercase mb-2">VCO 1</div>
              <div className="flex gap-3 justify-center">
                <OBXKnob
                  label="Freq"
                  value={parameters.vco1_freq || 0.5}
                  onChange={(value) => onParamChange('vco1_freq', value)}
                  size="medium"
                />
                <OBXKnob
                  label="Level"
                  value={parameters.vco1_level || 0.8}
                  onChange={(value) => onParamChange('vco1_level', value)}
                  size="small"
                />
              </div>
            </div>

            <div className="text-center">
              <div className="text-[10px] text-gray-400 uppercase mb-2">VCO 2</div>
              <div className="flex gap-3 justify-center">
                <OBXKnob
                  label="Freq"
                  value={parameters.vco2_freq || 0.5}
                  onChange={(value) => onParamChange('vco2_freq', value)}
                  size="medium"
                />
                <OBXKnob
                  label="Level"
                  value={parameters.vco2_level || 0.8}
                  onChange={(value) => onParamChange('vco2_level', value)}
                  size="small"
                />
              </div>
            </div>

            <div className="text-center">
              <div className="text-[10px] text-gray-400 uppercase mb-2">Mix</div>
              <OBXKnob
                label="Detune"
                value={parameters.detune || 0.5}
                onChange={(value) => onParamChange('detune', value)}
                size="medium"
              />
            </div>
          </div>

          {/* Waveform Switches */}
          <div className="flex gap-8 justify-center mt-4 p-3 bg-gray-900/50 rounded">
            <div className="flex gap-3">
              <OBXSwitch label="SAW" active={parameters.vco1_saw === 1} onClick={() => onParamChange('vco1_saw', parameters.vco1_saw === 1 ? 0 : 1)} />
              <OBXSwitch label="PLS" active={parameters.vco1_pulse === 1} onClick={() => onParamChange('vco1_pulse', parameters.vco1_pulse === 1 ? 0 : 1)} />
            </div>
            <div className="flex gap-3">
              <OBXSwitch label="SAW" active={parameters.vco2_saw === 1} onClick={() => onParamChange('vco2_saw', parameters.vco2_saw === 1 ? 0 : 1)} />
              <OBXSwitch label="PLS" active={parameters.vco2_pulse === 1} onClick={() => onParamChange('vco2_pulse', parameters.vco2_pulse === 1 ? 0 : 1)} />
            </div>
          </div>
        </div>

        {/* Filter Section */}
        <div className="mb-6">
          <div className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-700">
            VCF (Filter)
          </div>
          <div className="flex gap-5 justify-center">
            <OBXKnob
              label="Cutoff"
              value={parameters.cutoff || 0.7}
              onChange={(value) => onParamChange('cutoff', value)}
              size="large"
            />
            <OBXKnob
              label="Reso"
              value={parameters.resonance || 0.3}
              onChange={(value) => onParamChange('resonance', value)}
              size="large"
            />
            <OBXKnob
              label="Env Amt"
              value={parameters.filter_env || 0.5}
              onChange={(value) => onParamChange('filter_env', value)}
              size="medium"
            />
            <OBXKnob
              label="Kbd Amt"
              value={parameters.filter_kbd || 0.5}
              onChange={(value) => onParamChange('filter_kbd', value)}
              size="small"
            />
          </div>

          {/* Filter Modes */}
          <div className="flex gap-4 justify-center mt-4">
            <OBXSwitch label="LP" active={parameters.filter_mode === 0} onClick={() => onParamChange('filter_mode', 0)} />
            <OBXSwitch label="BP" active={parameters.filter_mode === 1} onClick={() => onParamChange('filter_mode', 1)} />
            <OBXSwitch label="HP" active={parameters.filter_mode === 2} onClick={() => onParamChange('filter_mode', 2)} />
          </div>
        </div>

        {/* Envelope Section */}
        <div className="mb-6">
          <div className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-700">
            Envelope
          </div>
          <div className="flex gap-5 justify-center">
            <OBXKnob
              label="Attack"
              value={parameters.attack || 0.01}
              onChange={(value) => onParamChange('attack', value)}
              size="medium"
            />
            <OBXKnob
              label="Decay"
              value={parameters.decay || 0.3}
              onChange={(value) => onParamChange('decay', value)}
              size="medium"
            />
            <OBXKnob
              label="Sustain"
              value={parameters.sustain || 0.7}
              onChange={(value) => onParamChange('sustain', value)}
              size="medium"
            />
            <OBXKnob
              label="Release"
              value={parameters.release || 0.3}
              onChange={(value) => onParamChange('release', value)}
              size="medium"
            />
          </div>
        </div>

        {/* Master Section */}
        <div className="mb-4">
          <div className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-700">
            Master
          </div>
          <div className="flex gap-6 justify-center items-end">
            <OBXKnob
              label="Volume"
              value={parameters.volume || 0.8}
              onChange={(value) => onParamChange('volume', value)}
              size="large"
            />
            <OBXKnob
              label="Tune"
              value={parameters.tune || 0.5}
              onChange={(value) => onParamChange('tune', value)}
              size="small"
            />
            <div className="flex flex-col items-center gap-2">
              <OBXSwitch label="UNISON" active={parameters.unison === 1} onClick={() => onParamChange('unison', parameters.unison === 1 ? 0 : 1)} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Info */}
      <div className="px-4 py-1 bg-black border-t border-gray-800">
        <div className="text-[9px] text-gray-600 text-center uppercase tracking-widest">
          Analog Polyphonic Synthesizer • Classic Warmth • 1979
        </div>
      </div>
    </div>
  );
};
