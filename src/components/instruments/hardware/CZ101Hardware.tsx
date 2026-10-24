/**
 * CZ-101 Hardware UI - Casio CZ-101 Phase Distortion Synthesizer
 *
 * Hardware-accurate panel layout matching the original CZ-101
 * Released: 1984
 * Features: 8-voice Phase Distortion synthesis with compact design
 */

import React from 'react';
import { CZ101_PRESET_BANK, CZ101_KNOB_NEUTRAL, cz101PatchParameters } from '@engine/cz101/cz101Presets';
import { useCz101Patches } from '@components/instruments/controls/CZ101PatchBrowser';
import { usePatchPicker } from '@components/instruments/controls/usePatchPicker';

interface CZ101HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
  /** String parameters (the instrument's own patch travels as `_cz101Tone`). */
  onTextParamChange?: (key: string, value: string) => void;
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
        <div className={`absolute inset-0 rounded bg-dark-bgTertiary border border-dark-borderLight`}>
          {/* Slider groove */}
          <div className="absolute left-1/2 top-1 bottom-1 w-0.5 -translate-x-1/2 bg-dark-bgSecondary rounded-full" />
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
            writingMode: 'vertical-lr' as React.CSSProperties['writingMode'],
            direction: 'rtl' as React.CSSProperties['direction'],
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
      <div className={`text-[8px] font-bold text-text-secondary uppercase tracking-wide text-center`}>
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
  /** Fill the grid cell it sits in (the patch grids), instead of the width of its text. */
  fill?: boolean;
}> = ({ label, active = false, onClick, color = 'gray', small = false, fill = false }) => {
  const colorMap = {
    gray: active ? 'bg-dark-bgActive' : 'bg-dark-bgHover',
    orange: active ? 'bg-orange-500' : 'bg-orange-600',
  };

  return (
    <button
      onClick={onClick}
      className={`${colorMap[color]} hover:brightness-110 text-text-primary ${small ? 'text-[8px] px-2 py-1' : 'text-[9px] px-3 py-1.5'} ${fill ? 'w-full truncate' : ''} font-bold rounded border border-dark-border shadow-md transition-all ${active ? 'shadow-lg scale-95' : ''}`}
    >
      {label}
    </button>
  );
};

const WAVEFORM_BUTTONS = [
  { label: 'SAWTOOTH', value: 0 }, { label: 'SQUARE', value: 1 }, { label: 'PULSE', value: 2 }, { label: 'DOUBLE SINE', value: 4 },
  { label: 'SAW PULSE', value: 5 }, { label: 'RESONANCE', value: 6 }, { label: 'DOUBLE PULSE', value: 7 }, { label: 'SILENT', value: 3 },
];
const WINDOW_BUTTONS = ['NONE', 'SAW', 'TRIANGLE', 'TRAPEZOID', 'PULSE', 'DOUBLE SAW'];

/** Knob range a panel slider (0 to 1) covers. */
const SLIDERS = [
  { label: 'Waveform Depth', key: 'dcw_depth', max: 127, rest: CZ101_KNOB_NEUTRAL },
  { label: 'Waveform Speed', key: 'dcw_rate', max: 127, rest: CZ101_KNOB_NEUTRAL },
  { label: 'Amplitude Speed', key: 'dca_rate', max: 127, rest: CZ101_KNOB_NEUTRAL },
  { label: 'Pitch Drop Depth', key: 'dco_depth', max: 63, rest: 0 },
  { label: 'Pitch Drop Speed', key: 'dco_rate', max: 127, rest: CZ101_KNOB_NEUTRAL },
] as const;

/**
 * CZ-101 Hardware Panel. Every control writes the editor's real parameters
 * (the same keys the simple controls use), and choosing a preset also writes
 * the knob values it implies, so both views always agree.
 */
export const CZ101Hardware: React.FC<CZ101HardwareProps> = ({
  parameters,
  onParamChange,
  onTextParamChange,
}) => {
  const { program, ownPatch, userPatches, activeUser, current, dragOver, setDragOver, chooseFactory, chooseUser, onPatchLoaded, onDrop, removePatch } =
    useCz101Patches(parameters, onParamChange, onTextParamChange);
  const { openPicker, picker } = usePatchPicker('CZ101', onPatchLoaded);

  const waveform = parameters.waveform1 ?? cz101PatchParameters(current.patch).waveform1;
  const windowValue = parameters.window ?? 0;

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
          <div className="text-text-primary font-black text-xl tracking-[0.3em]" style={{ fontFamily: 'sans-serif' }}>
            CASIO
          </div>
        </div>
        <div className="text-right">
          <div className="text-orange-400 text-xs font-light tracking-[0.3em] uppercase">Phase Distortion</div>
          <div className="text-text-primary font-black text-3xl tracking-wide">CZ-101</div>
        </div>
      </div>

      <div className="p-4">
        {/* Display: the loaded preset */}
        <div className="mb-4 bg-gradient-to-b from-gray-800 to-gray-900 p-2 rounded border border-dark-borderLight shadow-inner">
          <div className="bg-amber-900/20 border border-amber-800 rounded p-2 min-h-[60px] font-mono text-xs text-amber-400">
            <div className="flex justify-between">
              <span>{ownPatch ? 'USER' : 'FACTORY'}</span>
              <span className="uppercase">{current.patch.name}</span>
            </div>
          </div>
        </div>

        {/* Preset picker: the Init factory patch, and the User patches imported from SysEx dumps */}
        <div className="mb-4">
          <div className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2 text-center">Factory</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-1 mb-3">
            {CZ101_PRESET_BANK.map((entry, index) => (
              <CZ101Button key={entry.patch.name} label={(entry.patch.name ?? '').toUpperCase()} small fill active={!ownPatch && index === program} onClick={() => chooseFactory(index)} />
            ))}
          </div>
          <div className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2 text-center">User</div>
          <div
            data-sample-drop-zone
            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded border border-dashed p-2 ${dragOver ? 'border-orange-400 bg-orange-500/10' : 'border-dark-borderLight'}`}
          >
            {userPatches.length === 0 ? (
              <div className="text-[10px] text-text-secondary text-center mb-2">
                No user patches yet. Load Casio CZ single-patch SysEx files (.syx from a CZ-101, CZ-1000, CZ-3000 or CZ-5000), or drop them here.
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-1 mb-2">
                {userPatches.map((entry) => (
                  <CZ101Button key={entry.id} label={entry.name.toUpperCase()} small fill active={entry.id === activeUser?.id} onClick={() => chooseUser(entry.id)} />
                ))}
              </div>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-1">
              <CZ101Button label="LOAD SYSEX FILE(S)..." fill color="orange" onClick={openPicker} />
              {activeUser && (
                <CZ101Button label="REMOVE THIS PATCH" small fill onClick={() => { removePatch(activeUser.id); chooseFactory(0); }} />
              )}
            </div>
            {picker}
          </div>
        </div>

        {/* Sliders: offsets from the preset */}
        <div className="mb-4">
          <div className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2 text-center">
            Parameter Control
          </div>
          <div className="flex gap-3 justify-center items-end bg-dark-bgSecondary/30 rounded p-3">
            {SLIDERS.map((slider) => (
              <CZ101Slider
                key={slider.key}
                label={slider.label}
                value={(parameters[slider.key] ?? slider.rest) / slider.max}
                onChange={(value) => onParamChange(slider.key, Math.round(value * slider.max))}
              />
            ))}
            <CZ101Slider
              label="Volume"
              value={parameters.volume ?? 0.8}
              onChange={(value) => onParamChange('volume', value)}
            />
          </div>
        </div>

        {/* Waveform, window, ring modulation */}
        <div className="mb-3">
          <div className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2 text-center">Waveform</div>
          <div className="grid grid-cols-4 gap-1">
            {WAVEFORM_BUTTONS.map((button) => (
              <CZ101Button key={button.value} label={button.label} small active={waveform === button.value} onClick={() => { onParamChange('waveform1', button.value); onParamChange('waveform2', button.value); }} />
            ))}
          </div>
        </div>
        <div className="mb-3">
          <div className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2 text-center">Window</div>
          <div className="grid grid-cols-3 gap-1">
            {WINDOW_BUTTONS.map((label, value) => (
              <CZ101Button key={label} label={label} small active={windowValue === value} onClick={() => onParamChange('window', value)} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <CZ101Button label="RING MODULATION" color="orange" active={(parameters.ring_mod ?? 0) > 0.5} onClick={() => onParamChange('ring_mod', (parameters.ring_mod ?? 0) > 0.5 ? 0 : 1)} />
        </div>
      </div>

      <div className="px-4 py-1 bg-black border-t border-dark-border">
        <div className="text-[9px] text-text-muted text-center uppercase tracking-widest">
          Phase Distortion Synthesis - 8 Voices - 1984
        </div>
      </div>
    </div>
  );
};
