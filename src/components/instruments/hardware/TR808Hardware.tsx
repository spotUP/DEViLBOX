/**
 * TR-808/909 Hardware UI - Roland TR-808/909 Rhythm Composers
 *
 * Hardware-accurate panel layout matching the original TR-808
 * Based on io-808 web emulator design
 * TR-808 Released: 1980, TR-909 Released: 1983
 * Features: Iconic drum machines with analog (808) and digital (909) synthesis
 */

import React from 'react';

interface TR808HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

/**
 * TR-808 style drum knob (black handle, green/orange inner)
 */
const TR808Knob: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  size?: 'small' | 'medium';
  isLevel?: boolean;
}> = ({ label, value, onChange, size = 'medium', isLevel = false }) => {

  const sizeMap = {
    small: 50,
    medium: 60,
  };

  const knobSize = sizeMap[size];
  const innerSize = Math.floor(knobSize * 0.65);
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

  // Guide marks (11 marks around the knob)
  const guides = [];
  for (let i = 0; i < 11; i++) {
    const angle = -135 + (i * 27);
    const rad = (angle * Math.PI) / 180;
    const distance = knobSize / 2 - 2;
    const x = knobSize / 2 + Math.cos(rad) * distance;
    const y = knobSize / 2 + Math.sin(rad) * distance;
    guides.push(
      <div
        key={i}
        className="absolute w-0.5 h-2 bg-[#9b9fa0]"
        style={{
          left: `${x}px`,
          top: `${y}px`,
          transform: `rotate(${angle + 90}deg)`,
          transformOrigin: 'center',
        }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-[10px] font-bold text-[#f6edc6] uppercase tracking-tight text-center min-h-[28px] flex items-center">
        {label}
      </div>

      <div
        className="relative cursor-pointer select-none"
        style={{ width: knobSize, height: knobSize }}
      >
        {/* Guide marks */}
        {guides}

        {/* Level indicator dot (only for level knobs) */}
        {isLevel && (
          <div
            className="absolute w-1.5 h-1.5 rounded-full bg-[#ff5a00]"
            style={{
              right: '8%',
              top: '37%',
            }}
          />
        )}

        {/* Outer ring */}
        <div
          className="absolute rounded-full shadow-lg"
          style={{
            width: knobSize,
            height: knobSize,
            background: 'radial-gradient(circle at 35% 35%, #bbb, #888)',
            border: '2px solid #6b6b6b',
          }}
        />

        {/* Inner knob body */}
        <div
          className="absolute rounded-full cursor-pointer select-none"
          style={{
            width: innerSize,
            height: innerSize,
            left: (knobSize - innerSize) / 2,
            top: (knobSize - innerSize) / 2,
            background: isLevel
              ? 'radial-gradient(circle at 30% 30%, #ff7a30, #ff5a00)'
              : 'radial-gradient(circle at 30% 30%, #d8e8d8, #C8D4C8)',
            border: '8px solid #111111',
          }}
          onMouseDown={handleMouseDown}
          title={`${label}: ${Math.round(value * 100)}%`}
        >
          {/* Handle indicator */}
          <div
            className="absolute w-1 h-3 bg-[#111111] rounded-sm"
            style={{
              left: '50%',
              top: '-6px',
              transform: `translateX(-50%) rotate(${rotation}deg)`,
              transformOrigin: `50% ${innerSize / 2 + 6}px`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * TR-808 style switch (for conga/tom, claves/rimshot, maracas/handclap)
 */
const TR808Switch: React.FC<{
  label1: string;
  label2: string;
  active: boolean;
  onClick: () => void;
}> = ({ label1, label2, active, onClick }) => {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[8px] text-[#f6edc6] uppercase font-bold">{label1}</div>
      <button
        onClick={onClick}
        className="w-8 h-12 rounded-sm transition-colors"
        style={{
          background: active
            ? 'linear-gradient(180deg, #4a4a4a, #313335)'
            : 'linear-gradient(180deg, #313335, #1a1a1a)',
          border: '2px solid #111',
          boxShadow: active ? 'inset 0 2px 4px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.3)',
        }}
      />
      <div className="text-[8px] text-[#f6edc6] uppercase font-bold">{label2}</div>
    </div>
  );
};

/**
 * Instrument column (like on the original TR-808)
 */
const InstrumentColumn: React.FC<{
  name: string;
  controls: Array<{ label: string; param: string; isLevel?: boolean }>;
  switchLabels?: { label1: string; label2: string };
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}> = ({ name, controls, switchLabels, parameters, onParamChange }) => {
  return (
    <div className="flex flex-col items-center gap-2 px-2">
      {/* Instrument name */}
      <div className="text-[11px] font-bold text-[#f6edc6] uppercase tracking-tight text-center min-h-[32px] flex items-center">
        {name}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        {controls.map((control) => (
          <TR808Knob
            key={control.param}
            label={control.label}
            value={parameters[control.param] ?? 0.5}
            onChange={(value) => onParamChange(control.param, value)}
            size="small"
            isLevel={control.isLevel}
          />
        ))}

        {/* Switch (for conga/tom, etc.) */}
        {switchLabels && (
          <TR808Switch
            label1={switchLabels.label1}
            label2={switchLabels.label2}
            active={(parameters.switchMode ?? 0) > 0.5}
            onClick={() => onParamChange('switchMode', (parameters.switchMode ?? 0) > 0.5 ? 0 : 1)}
          />
        )}
      </div>
    </div>
  );
};

/**
 * TR-808 Hardware Panel
 */
export const TR808Hardware: React.FC<TR808HardwareProps> = ({
  parameters,
  onParamChange,
}) => {

  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl"
      style={{
        background: 'linear-gradient(180deg, #a8a8a8 0%, #888888 100%)',
      }}
    >
      {/* Top Panel - Logo */}
      <div className="px-6 py-3 bg-gradient-to-r from-gray-800 to-gray-700 border-b-2 border-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-gray-400 text-[10px] font-light tracking-[0.5em] uppercase">Roland</div>
            <div className="text-white font-black text-4xl tracking-wider" style={{ fontFamily: 'Impact, Arial Black, sans-serif' }}>TR-808/909</div>
            <div className="text-gray-400 text-[9px] font-light tracking-[0.25em] uppercase">Rhythm Composer</div>
          </div>
          <div className="text-right">
            <div className="text-[#ff5a00] text-xs font-bold tracking-wider uppercase">Analog</div>
            <div className="text-white text-2xl font-bold">16 STEP</div>
          </div>
        </div>
      </div>

      {/* Main Control Panel */}
      <div className="p-4 bg-gradient-to-b from-[#9b9fa0] to-[#7a7e7f]">
        {/* Instrument Controls */}
        <div className="mb-4">
          <div className="text-[10px] font-bold text-[#f6edc6] uppercase tracking-widest mb-2 pb-1 border-b border-gray-600">
            Instrument Controls
          </div>

          <div className="grid grid-cols-6 gap-1">
            {/* Accent (no controls - just volume level indicator) */}
            <InstrumentColumn
              name="*ACCENT"
              controls={[{ label: 'LEVEL', param: 'accent_level', isLevel: true }]}
              parameters={parameters}
              onParamChange={onParamChange}
            />

            {/* Bass Drum */}
            <InstrumentColumn
              name="*BASS *DRUM"
              controls={[
                { label: 'TONE', param: 'kick_tone' },
                { label: 'DECAY', param: 'kick_decay' },
                { label: 'LEVEL', param: 'kick_level', isLevel: true },
              ]}
              parameters={parameters}
              onParamChange={onParamChange}
            />

            {/* Snare Drum */}
            <InstrumentColumn
              name="*SNARE *DRUM"
              controls={[
                { label: 'TONE', param: 'snare_tone' },
                { label: 'SNAPPY', param: 'snare_snappy' },
                { label: 'LEVEL', param: 'snare_level', isLevel: true },
              ]}
              parameters={parameters}
              onParamChange={onParamChange}
            />

            {/* Low Tom/Conga */}
            <InstrumentColumn
              name="*LOW *TOM/*CONGA"
              controls={[
                { label: 'TUNING', param: 'low_tom_tuning' },
                { label: 'LEVEL', param: 'low_tom_level', isLevel: true },
              ]}
              switchLabels={{ label1: 'TOM', label2: 'CONGA' }}
              parameters={parameters}
              onParamChange={onParamChange}
            />

            {/* Mid Tom/Conga */}
            <InstrumentColumn
              name="*MID *TOM/*CONGA"
              controls={[
                { label: 'TUNING', param: 'mid_tom_tuning' },
                { label: 'LEVEL', param: 'mid_tom_level', isLevel: true },
              ]}
              switchLabels={{ label1: 'TOM', label2: 'CONGA' }}
              parameters={parameters}
              onParamChange={onParamChange}
            />

            {/* Hi Tom/Conga */}
            <InstrumentColumn
              name="*HI *TOM/*CONGA"
              controls={[
                { label: 'TUNING', param: 'hi_tom_tuning' },
                { label: 'LEVEL', param: 'hi_tom_level', isLevel: true },
              ]}
              switchLabels={{ label1: 'TOM', label2: 'CONGA' }}
              parameters={parameters}
              onParamChange={onParamChange}
            />
          </div>

          {/* Second row */}
          <div className="grid grid-cols-6 gap-1 mt-4">
            {/* Rimshot/Claves */}
            <InstrumentColumn
              name="*RIM/*CLAVES"
              controls={[{ label: 'LEVEL', param: 'rimshot_level', isLevel: true }]}
              switchLabels={{ label1: 'RIM', label2: 'CLAVE' }}
              parameters={parameters}
              onParamChange={onParamChange}
            />

            {/* Handclap/Maracas */}
            <InstrumentColumn
              name="*CLAP/*MARACAS"
              controls={[{ label: 'LEVEL', param: 'clap_level', isLevel: true }]}
              switchLabels={{ label1: 'CLAP', label2: 'MARACA' }}
              parameters={parameters}
              onParamChange={onParamChange}
            />

            {/* Cowbell */}
            <InstrumentColumn
              name="*COW *BELL"
              controls={[{ label: 'LEVEL', param: 'cowbell_level', isLevel: true }]}
              parameters={parameters}
              onParamChange={onParamChange}
            />

            {/* Cymbal */}
            <InstrumentColumn
              name="*CYMBAL"
              controls={[
                { label: 'TONE', param: 'cymbal_tone' },
                { label: 'DECAY', param: 'cymbal_decay' },
                { label: 'LEVEL', param: 'cymbal_level', isLevel: true },
              ]}
              parameters={parameters}
              onParamChange={onParamChange}
            />

            {/* Open Hi-Hat */}
            <InstrumentColumn
              name="*OPEN *HI-HAT"
              controls={[
                { label: 'DECAY', param: 'oh_decay' },
                { label: 'LEVEL', param: 'oh_level', isLevel: true },
              ]}
              parameters={parameters}
              onParamChange={onParamChange}
            />

            {/* Closed Hi-Hat */}
            <InstrumentColumn
              name="*CLSD *HI-HAT"
              controls={[{ label: 'LEVEL', param: 'ch_level', isLevel: true }]}
              parameters={parameters}
              onParamChange={onParamChange}
            />
          </div>
        </div>

        {/* Master Section */}
        <div className="mt-6 pt-4 border-t border-gray-600">
          <div className="text-[10px] font-bold text-[#f6edc6] uppercase tracking-widest mb-3 pb-1">
            Master
          </div>
          <div className="flex gap-6 justify-center">
            <TR808Knob
              label="MASTER VOLUME"
              value={parameters.master_volume || 0.8}
              onChange={(value) => onParamChange('master_volume', value)}
              size="medium"
              isLevel={true}
            />
            <TR808Knob
              label="TEMPO"
              value={parameters.tempo || 0.5}
              onChange={(value) => onParamChange('tempo', value)}
              size="medium"
            />
          </div>
        </div>
      </div>

      {/* Bottom Info */}
      <div className="px-4 py-1 bg-black border-t border-gray-800">
        <div className="text-[9px] text-gray-600 text-center uppercase tracking-widest">
          Analog/Digital Rhythm Composer • 16-Step Sequencer • 1980/1983
        </div>
      </div>
    </div>
  );
};
