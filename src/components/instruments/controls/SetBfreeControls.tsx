/**
 * SetBfreeControls.tsx - Hammond B3 organ controls for setBfree WASM engine
 *
 * Layout: Upper/Lower/Pedal drawbars, percussion, vibrato/chorus,
 * Leslie speaker, effects, and master controls.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Knob } from '@components/controls/Knob';
import type { SetBfreeConfig } from '@/engine/setbfree/SetBfreeSynth';
import { DEFAULT_SETBFREE } from '@/engine/setbfree/SetBfreeSynth';

interface SetBfreeControlsProps {
  config: SetBfreeConfig;
  onChange: (config: SetBfreeConfig) => void;
}

const DRAWBAR_LABELS = ["16'", "5⅓'", "8'", "4'", "2⅔'", "2'", "1⅗'", "1⅓'", "1'"];
const DRAWBAR_COLORS = [
  '#a0522d', '#a0522d', '#f0f0f0', '#f0f0f0', '#222222',
  '#f0f0f0', '#222222', '#222222', '#f0f0f0',
];

const UPPER_KEYS: (keyof SetBfreeConfig)[] = [
  'upper16', 'upper513', 'upper8', 'upper4', 'upper223',
  'upper2', 'upper135', 'upper113', 'upper1',
];
const LOWER_KEYS: (keyof SetBfreeConfig)[] = [
  'lower16', 'lower513', 'lower8', 'lower4', 'lower223',
  'lower2', 'lower135', 'lower113', 'lower1',
];
const PEDAL_KEYS: (keyof SetBfreeConfig)[] = [
  'pedal16', 'pedal513', 'pedal8', 'pedal4', 'pedal223',
  'pedal2', 'pedal135', 'pedal113', 'pedal1',
];

const VIBRATO_LABELS = ['Off', 'V1', 'C1', 'V2', 'C2', 'V3', 'C3'];
const LESLIE_LABELS = ['STOP', 'SLOW', 'FAST'];

// ============================================================================
// DrawbarSlider — vertical slider styled like a Hammond drawbar
// ============================================================================

interface DrawbarSliderProps {
  label: string;
  value: number;
  color: string;
  onChange: (value: number) => void;
}

const DrawbarSlider: React.FC<DrawbarSliderProps> = React.memo(({
  label, value, color, onChange,
}) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const updateValue = useCallback((clientY: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const stepped = Math.round(pct * 8);
    onChange(stepped);
  }, [onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateValue(e.clientY);
  }, [updateValue]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    updateValue(e.clientY);
  }, [updateValue]);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const fillPct = (value / 8) * 100;

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div className="text-xs font-bold font-mono w-5 text-center text-amber-400">
        {Math.round(value)}
      </div>
      <div
        ref={sliderRef}
        className="relative w-6 h-28 rounded bg-dark-bgSecondary border border-dark-borderLight cursor-pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          className="absolute bottom-0 left-0 right-0 rounded-b transition-all duration-75"
          style={{ height: `${fillPct}%`, backgroundColor: color, opacity: 0.8 }}
        />
        {[1, 2, 3, 4, 5, 6, 7].map(tick => (
          <div
            key={tick}
            className="absolute left-0 right-0 h-px bg-dark-bgActive pointer-events-none"
            style={{ bottom: `${(tick / 8) * 100}%` }}
          />
        ))}
        <div
          className="absolute left-0 right-0 h-2 rounded transition-all duration-75"
          style={{
            bottom: `calc(${fillPct}% - 4px)`,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}88`,
          }}
        />
      </div>
      <div className="text-[10px] text-text-muted font-mono whitespace-nowrap">{label}</div>
    </div>
  );
});
DrawbarSlider.displayName = 'DrawbarSlider';

// ============================================================================
// SegmentButton — a row of mutually exclusive toggle buttons
// ============================================================================

interface SegmentButtonProps {
  labels: string[];
  value: number;
  onChange: (value: number) => void;
}

const SegmentButton: React.FC<SegmentButtonProps> = React.memo(({ labels, value, onChange }) => (
  <div className="flex gap-1">
    {labels.map((label, i) => (
      <button
        key={label}
        onClick={() => onChange(i)}
        className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
          Math.round(value) === i
            ? 'bg-amber-600 text-black'
            : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
));
SegmentButton.displayName = 'SegmentButton';

// ============================================================================
// DrawbarBank — a labeled row of 9 drawbar sliders
// ============================================================================

interface DrawbarBankProps {
  title: string;
  keys: (keyof SetBfreeConfig)[];
  merged: SetBfreeConfig;
  update: (key: keyof SetBfreeConfig, value: number) => void;
}

const DrawbarBank: React.FC<DrawbarBankProps> = React.memo(({ title, keys, merged, update }) => (
  <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
    <h3 className="font-bold uppercase tracking-tight text-sm mb-2 text-amber-500">{title}</h3>
    <div className="flex justify-center gap-1 sm:gap-2">
      {DRAWBAR_LABELS.map((label, i) => (
        <DrawbarSlider
          key={i}
          label={label}
          value={(merged[keys[i]] as number) ?? 0}
          color={DRAWBAR_COLORS[i]}
          onChange={(v) => update(keys[i], v)}
        />
      ))}
    </div>
  </div>
));
DrawbarBank.displayName = 'DrawbarBank';

// ============================================================================
// SetBfreeControls — main component
// ============================================================================

export const SetBfreeControls: React.FC<SetBfreeControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const [showPedals, setShowPedals] = useState(false);

  const updateParam = useCallback((key: keyof SetBfreeConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const merged = { ...DEFAULT_SETBFREE, ...config } as Required<SetBfreeConfig>;

  return (
    <div className="synth-controls-flow grid grid-cols-4 gap-2 p-2 overflow-y-auto text-xs">
      {/* ═══ UPPER MANUAL ═══ */}
      <DrawbarBank title="Upper Manual" keys={UPPER_KEYS} merged={merged} update={updateParam} />

      {/* ═══ LOWER MANUAL ═══ */}
      <DrawbarBank title="Lower Manual" keys={LOWER_KEYS} merged={merged} update={updateParam} />

      {/* ═══ PEDALS (collapsible) ═══ */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <button
          onClick={() => setShowPedals(!showPedals)}
          className="font-bold uppercase tracking-tight text-sm text-amber-500 w-full text-left flex items-center gap-2"
        >
          <span className={`transition-transform ${showPedals ? 'rotate-90' : ''}`}>&#9654;</span>
          Pedals
        </button>
        {showPedals && (
          <div className="flex justify-center gap-1 sm:gap-2 mt-4">
            {DRAWBAR_LABELS.map((label, i) => (
              <DrawbarSlider
                key={i}
                label={label}
                value={(merged[PEDAL_KEYS[i]] as number) ?? 0}
                color={DRAWBAR_COLORS[i]}
                onChange={(v) => updateParam(PEDAL_KEYS[i], v)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ═══ PERCUSSION ═══ */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Percussion</h3>
        <div className="flex flex-wrap items-center gap-4">
          <SegmentButton
            labels={['OFF', 'ON']}
            value={merged.percEnable}
            onChange={(v) => updateParam('percEnable', v)}
          />
          <div className="w-px h-8 bg-dark-bgHover" />
          <SegmentButton
            labels={['NORMAL', 'SOFT']}
            value={merged.percVolume}
            onChange={(v) => updateParam('percVolume', v)}
          />
          <div className="w-px h-8 bg-dark-bgHover" />
          <SegmentButton
            labels={['SLOW', 'FAST']}
            value={merged.percDecay}
            onChange={(v) => updateParam('percDecay', v)}
          />
          <div className="w-px h-8 bg-dark-bgHover" />
          <SegmentButton
            labels={['2ND', '3RD']}
            value={merged.percHarmonic}
            onChange={(v) => updateParam('percHarmonic', v)}
          />
          <div className="w-px h-8 bg-dark-bgHover" />
          <Knob
            label="Gain"
            value={merged.percGain}
            min={0}
            max={22}
            defaultValue={11}
            onChange={(v) => updateParam('percGain', v)}
            color="#d4a017"
          />
        </div>
      </div>

      {/* ═══ VIBRATO / CHORUS ═══ */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Vibrato / Chorus</h3>
        <div className="flex flex-wrap items-start gap-4">
          <SegmentButton
            labels={VIBRATO_LABELS}
            value={merged.vibratoType}
            onChange={(v) => updateParam('vibratoType', v)}
          />
          <div className="w-px h-8 bg-dark-bgHover" />
          <div className="flex gap-1">
            <button
              onClick={() => updateParam('vibratoUpper', merged.vibratoUpper ? 0 : 1)}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                merged.vibratoUpper
                  ? 'bg-amber-600 text-black'
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
              }`}
            >
              UPPER
            </button>
            <button
              onClick={() => updateParam('vibratoLower', merged.vibratoLower ? 0 : 1)}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                merged.vibratoLower
                  ? 'bg-amber-600 text-black'
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
              }`}
            >
              LOWER
            </button>
          </div>
          <Knob
            label="Freq"
            value={merged.vibratoFreq}
            min={4}
            max={22}
            defaultValue={7}
            onChange={(v) => updateParam('vibratoFreq', v)}
            color="#d4a017"
            unit="Hz"
          />
        </div>
      </div>

      {/* ═══ LESLIE SPEAKER ═══ */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Leslie Speaker</h3>
        <div className="flex flex-wrap items-start gap-4">
          <SegmentButton
            labels={LESLIE_LABELS}
            value={merged.leslieSpeed}
            onChange={(v) => updateParam('leslieSpeed', v)}
          />
          <div className="w-px h-8 bg-dark-bgHover" />
          <button
            onClick={() => updateParam('leslieBrake', merged.leslieBrake ? 0 : 1)}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
              merged.leslieBrake
                ? 'bg-red-600 text-white'
                : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
            }`}
          >
            BRAKE
          </button>
        </div>
        <div className="flex flex-wrap gap-4 mt-3 justify-center">
          <Knob label="Horn Slow" value={merged.hornSlowRpm} min={5} max={200} defaultValue={40}
            onChange={(v) => updateParam('hornSlowRpm', v)} color="#d4a017" unit="rpm" />
          <Knob label="Horn Fast" value={merged.hornFastRpm} min={100} max={900} defaultValue={400}
            onChange={(v) => updateParam('hornFastRpm', v)} color="#d4a017" unit="rpm" />
          <Knob label="Horn Acc" value={merged.hornAccel} min={0.05} max={2.0} defaultValue={0.161}
            onChange={(v) => updateParam('hornAccel', v)} color="#d4a017" unit="s" />
          <Knob label="Drum Slow" value={merged.drumSlowRpm} min={5} max={100} defaultValue={36}
            onChange={(v) => updateParam('drumSlowRpm', v)} color="#d4a017" unit="rpm" />
          <Knob label="Drum Fast" value={merged.drumFastRpm} min={60} max={600} defaultValue={357}
            onChange={(v) => updateParam('drumFastRpm', v)} color="#d4a017" unit="rpm" />
          <Knob label="Drum Acc" value={merged.drumAccel} min={0.5} max={10.0} defaultValue={4.127}
            onChange={(v) => updateParam('drumAccel', v)} color="#d4a017" unit="s" />
        </div>
      </div>

      {/* ═══ EFFECTS ═══ */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Effects</h3>
        <div className="flex flex-wrap items-start gap-4 justify-center">
          <button
            onClick={() => updateParam('overdriveEnable', merged.overdriveEnable ? 0 : 1)}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
              merged.overdriveEnable
                ? 'bg-red-600 text-white'
                : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
            }`}
          >
            OVERDRIVE
          </button>
          <Knob label="OD Char" value={merged.overdriveCharacter} min={0} max={127} defaultValue={0}
            onChange={(v) => updateParam('overdriveCharacter', v)} color="#d4a017" />
          <div className="w-px h-8 bg-dark-bgHover" />
          <Knob label="Reverb Mix" value={merged.reverbMix} min={0} max={1} defaultValue={0.1}
            onChange={(v) => updateParam('reverbMix', v)} color="#d4a017" />
          <Knob label="Reverb Wet" value={merged.reverbWet} min={0} max={1} defaultValue={0.1}
            onChange={(v) => updateParam('reverbWet', v)} color="#d4a017" />
        </div>
      </div>

      {/* ═══ MASTER ═══ */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Master</h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Volume" value={merged.volume} min={0} max={1} defaultValue={0.8}
            onChange={(v) => updateParam('volume', v)} color="#d4a017" />
          <Knob label="Key Click" value={merged.keyClick} min={0} max={1} defaultValue={0.5}
            onChange={(v) => updateParam('keyClick', v)} color="#d4a017" />
          <Knob label="Tuning" value={merged.tuning} min={220} max={880} defaultValue={440}
            onChange={(v) => updateParam('tuning', v)} color="#d4a017" unit="Hz" />
          <Knob label="Output" value={merged.outputLevel} min={0} max={1} defaultValue={0.8}
            onChange={(v) => updateParam('outputLevel', v)} color="#d4a017" />
          <Knob label="Swell" value={merged.swellPedal} min={0} max={1} defaultValue={1}
            onChange={(v) => updateParam('swellPedal', v)} color="#d4a017" />
        </div>
      </div>
    </div>
  );
};

export default SetBfreeControls;
