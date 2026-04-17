/**
 * TB-303 Hardware UI - Roland TB-303 Bass Line
 *
 * Hardware-accurate panel layout matching the original TB-303
 * Released: 1981 (discontinued 1984, became legendary in acid house)
 * Features: Monophonic bass synthesizer with iconic filter and sequencer
 */

import React from 'react';
import { useKnobImperative } from '@components/controls/useKnobImperative';

interface TB303HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/**
 * Rotary knob styled like the TB-303 hardware (silver with black indicator line)
 */
const TB303Knob: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  size?: 'small' | 'medium' | 'large';
  color?: 'silver' | 'orange';
  paramKey?: string;
}> = ({ label, value, onChange, size = 'medium', color = 'silver', paramKey }) => {
  const indicatorRef = useKnobImperative<HTMLDivElement>({ paramKey });

  const sizeMap = {
    small: 'w-10 h-10',
    medium: 'w-14 h-14',
    large: 'w-20 h-20',
  };

  const rotation = -135 + (value * 270); // -135deg to +135deg

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      const degrees = angle * (180 / Math.PI);
      const normalized = (degrees + 135 + 360) % 360;
      const newValue = Math.max(0, Math.min(1, normalized / 270));
      onChange(newValue);
    };

    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  const knobColor = color === 'orange'
    ? 'radial-gradient(circle at 30% 30%, #ff8800, #cc6600)'
    : 'radial-gradient(circle at 30% 30%, #c0c0c0, #808080)';

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`${sizeMap[size]} relative cursor-pointer select-none`}
        onPointerDown={handlePointerDown}
        title={`${label}: ${Math.round(value * 100)}%`}
      >
        {/* Knob body */}
        <div
          className="absolute inset-0 rounded-full border-2 border-dark-border shadow-lg"
          style={{
            background: knobColor,
          }}
        />

        {/* Indicator line */}
        <div
          ref={indicatorRef}
          className="absolute top-1 left-1/2 w-0.5 h-3 bg-black rounded-full -translate-x-1/2"
          style={{
            transform: `translateX(-50%) rotate(${rotation}deg)`,
            transformOrigin: `50% ${size === 'large' ? '2.5rem' : size === 'medium' ? '1.75rem' : '1.25rem'}`,
          }}
        />
      </div>

      <div className={`text-[9px] font-bold text-text-secondary uppercase tracking-wide text-center`}>
        {label}
      </div>
    </div>
  );
};

/**
 * TB-303 style button (rectangular with LED)
 */
const TB303Button: React.FC<{
  label: string;
  active?: boolean;
  onClick?: () => void;
  color?: 'gray' | 'orange' | 'red';
}> = ({ label, active = false, onClick, color = 'gray' }) => {

  const colorMap = {
    gray: active ? 'bg-dark-bgActive' : 'bg-dark-bgHover',
    orange: active ? 'bg-orange-500' : 'bg-orange-600',
    red: active ? 'bg-red-500' : 'bg-red-600',
  };

  return (
    <button
      onClick={onClick}
      className={`${colorMap[color]} hover:brightness-110 text-text-primary text-[9px] font-bold px-3 py-1.5 rounded border border-dark-border shadow-md transition-all ${active ? 'shadow-lg scale-95' : ''}`}
    >
      {label}
    </button>
  );
};

/**
 * TB-303 Hardware Panel
 */
export const TB303Hardware: React.FC<TB303HardwareProps> = ({
  parameters,
  onParamChange,
}) => {

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl"
      style={{
        background: 'linear-gradient(180deg, #e0e0e0 0%, #c8c8c8 50%, #b0b0b0 100%)',
      }}
    >
      {/* Top Panel - Logo */}
      <div className="px-4 py-2 bg-gradient-to-r from-gray-800 to-gray-700 border-b-2 border-dark-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-text-primary font-black text-xl tracking-wider" style={{ fontFamily: 'monospace' }}>
            ROLAND
          </div>
        </div>
        <div className="text-right">
          <div className="text-text-secondary text-xs font-light tracking-[0.3em] uppercase">Bass Line</div>
          <div className="text-text-primary font-black text-3xl tracking-tight">TB-303</div>
        </div>
      </div>

      {/* Main Panel */}
      <div className="p-6">
        {/* VCF Section */}
        <div className="mb-6">
          <div className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3 border-b border-dark-borderLight pb-1">
            VCF (Voltage Controlled Filter)
          </div>
          <div className="flex gap-6 justify-center">
            <TB303Knob
              label="Cutoff"
              value={parameters.cutoff || 0.5}
              onChange={(value) => onParamChange('cutoff', value)}
              size="large"
              color="silver"
              paramKey="cutoff"
            />
            <TB303Knob
              label="Resonance"
              value={parameters.resonance || 0.5}
              onChange={(value) => onParamChange('resonance', value)}
              size="large"
              color="silver"
              paramKey="resonance"
            />
            <TB303Knob
              label="Env Mod"
              value={parameters.envMod || 0.5}
              onChange={(value) => onParamChange('envMod', value)}
              size="large"
              color="silver"
              paramKey="envMod"
            />
            <TB303Knob
              label="Decay"
              value={parameters.decay || 0.5}
              onChange={(value) => onParamChange('decay', value)}
              size="large"
              color="silver"
              paramKey="decay"
            />
          </div>
        </div>

        {/* VCO Section */}
        <div className="mb-6">
          <div className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3 border-b border-dark-borderLight pb-1">
            VCO (Voltage Controlled Oscillator)
          </div>
          <div className="flex gap-6 justify-center items-end">
            <TB303Knob
              label="Tuning"
              value={parameters.tuning || 0.5}
              onChange={(value) => onParamChange('tuning', value)}
              size="medium"
              color="silver"
              paramKey="tuning"
            />

            {/* Waveform Switch */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-2">
                <TB303Button
                  label="SAW"
                  active={parameters.waveform !== 1}
                  onClick={() => onParamChange('waveform', 0)}
                />
                <TB303Button
                  label="SQR"
                  active={parameters.waveform === 1}
                  onClick={() => onParamChange('waveform', 1)}
                />
              </div>
              <div className="text-[9px] font-bold text-text-muted uppercase">Wave</div>
            </div>
          </div>
        </div>

        {/* VCA Section */}
        <div className="mb-4">
          <div className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3 border-b border-dark-borderLight pb-1">
            VCA (Voltage Controlled Amplifier)
          </div>
          <div className="flex gap-6 justify-center">
            <TB303Knob
              label="Volume"
              value={parameters.volume || 0.8}
              onChange={(value) => onParamChange('volume', value)}
              size="large"
              color="orange"
              paramKey="volume"
            />
            <TB303Knob
              label="Accent"
              value={parameters.accent || 0.5}
              onChange={(value) => onParamChange('accent', value)}
              size="medium"
              color="silver"
              paramKey="accent"
            />
          </div>
        </div>

        {/* Mode Buttons */}
        <div className="flex gap-2 justify-center mt-6 pt-4 border-t border-dark-borderLight">
          <TB303Button label="NORMAL" color="gray" />
          <TB303Button label="PATTERN" color="gray" />
          <TB303Button label="WRITE" color="orange" />
          <TB303Button label="TRACK" color="gray" />
        </div>
      </div>

      {/* Bottom Info */}
      <div className="px-4 py-1 bg-dark-bgSecondary border-t border-dark-borderLight">
        <div className="text-[9px] text-text-muted text-center uppercase tracking-widest">
          Computerized Bass Line • 1981-1984 • Acid House Legend
        </div>
      </div>
    </div>
  );
};
