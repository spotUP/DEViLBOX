/**
 * DJPitchSlider - Global pitch control for live DJ mixing
 *
 * Adjusts playback rate of entire song in real-time:
 * - Vertical turntable-style slider
 * - Range: -12% to +12% (semitones)
 * - Double-click to reset to 0
 * - Affects master transport tempo
 */

import React, { useState, useCallback } from 'react';
import * as Tone from 'tone';

interface DJPitchSliderProps {
  /** Optional CSS class */
  className?: string;
  /** Callback when pitch changes */
  onPitchChange?: (semitones: number) => void;
}

export const DJPitchSlider: React.FC<DJPitchSliderProps> = ({
  className = '',
  onPitchChange
}) => {
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [baseBPM, setBaseBPM] = useState<number | null>(null);

  const handlePitchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setPitchSemitones(newValue);

    // Calculate playback rate: 2^(semitones/12)
    // +12 semitones = 2x speed (one octave up)
    // -12 semitones = 0.5x speed (one octave down)
    const playbackRate = Math.pow(2, newValue / 12);

    // Store base BPM on first use
    if (baseBPM === null) {
      setBaseBPM(Tone.getTransport().bpm.value);
    }

    // Adjust BPM to create pitch shift effect
    // This changes both tempo AND pitch (like a DJ turntable)
    const currentBase = baseBPM ?? Tone.getTransport().bpm.value;
    Tone.getTransport().bpm.value = currentBase * playbackRate;

    // Notify parent component
    onPitchChange?.(newValue);
  }, [onPitchChange, baseBPM]);

  const handleDoubleClick = useCallback(() => {
    // Reset to 0 on double-click
    setPitchSemitones(0);
    if (baseBPM !== null) {
      Tone.getTransport().bpm.value = baseBPM;
    }
    setBaseBPM(null);
    onPitchChange?.(0);
  }, [onPitchChange, baseBPM]);

  // Format display value
  const displayValue = pitchSemitones > 0
    ? `+${pitchSemitones.toFixed(1)}`
    : pitchSemitones.toFixed(1);

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      {/* Label and Value Display */}
      <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider">
        Pitch
      </div>
      <div
        className="text-[11px] font-mono font-bold text-amber-400 min-w-[40px] text-center cursor-pointer select-none"
        onDoubleClick={handleDoubleClick}
        title="Double-click to reset"
      >
        {displayValue}
      </div>

      {/* Vertical Slider (Turntable Style) */}
      <div className="relative">
        <input
          type="range"
          min="-12"
          max="12"
          step="0.1"
          value={pitchSemitones}
          onChange={handlePitchChange}
          onDoubleClick={handleDoubleClick}
          className="pitch-slider-vertical"
          title="DJ Pitch Control (-12 to +12 semitones)"
          style={{
            writingMode: 'bt-lr' as any,
            WebkitAppearance: 'slider-vertical',
            width: '8px',
            height: '120px',
            accentColor: '#fbbf24', // Amber/gold accent
            cursor: 'ns-resize',
          }}
        />

        {/* Center marker (0 position) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-4 h-0.5 bg-amber-400/30 pointer-events-none"
          style={{
            top: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        />
      </div>

      {/* Range indicators */}
      <div className="flex flex-col items-center text-[8px] font-mono text-text-muted/50 gap-[88px] absolute mt-[32px]">
        <div>+12</div>
        <div>-12</div>
      </div>
    </div>
  );
};

/**
 * Compact horizontal version for tight spaces
 */
export const DJPitchSliderHorizontal: React.FC<DJPitchSliderProps> = ({
  className = '',
  onPitchChange
}) => {
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [baseBPM, setBaseBPM] = useState<number | null>(null);

  const handlePitchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setPitchSemitones(newValue);

    const playbackRate = Math.pow(2, newValue / 12);

    // Store base BPM on first use
    if (baseBPM === null) {
      setBaseBPM(Tone.getTransport().bpm.value);
    }

    // Adjust BPM to create pitch shift effect
    const currentBase = baseBPM ?? Tone.getTransport().bpm.value;
    Tone.getTransport().bpm.value = currentBase * playbackRate;

    onPitchChange?.(newValue);
  }, [onPitchChange, baseBPM]);

  const handleDoubleClick = useCallback(() => {
    setPitchSemitones(0);
    if (baseBPM !== null) {
      Tone.getTransport().bpm.value = baseBPM;
    }
    setBaseBPM(null);
    onPitchChange?.(0);
  }, [onPitchChange, baseBPM]);

  const displayValue = pitchSemitones > 0
    ? `+${pitchSemitones.toFixed(1)}`
    : pitchSemitones.toFixed(1);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Label */}
      <div className="text-[9px] font-mono text-text-muted uppercase">
        Pitch
      </div>

      {/* Range indicator */}
      <div className="text-[8px] font-mono text-text-muted/50">
        -12
      </div>

      {/* Horizontal Slider */}
      <input
        type="range"
        min="-12"
        max="12"
        step="0.1"
        value={pitchSemitones}
        onChange={handlePitchChange}
        onDoubleClick={handleDoubleClick}
        className="flex-1 min-w-[100px] max-w-[150px] accent-amber-500"
        title="DJ Pitch Control (-12 to +12 semitones)"
        style={{ cursor: 'ew-resize' }}
      />

      {/* Range indicator */}
      <div className="text-[8px] font-mono text-text-muted/50">
        +12
      </div>

      {/* Value Display */}
      <div
        className="text-[11px] font-mono font-bold text-amber-400 min-w-[35px] text-center cursor-pointer select-none"
        onDoubleClick={handleDoubleClick}
        title="Double-click to reset"
      >
        {displayValue}
      </div>
    </div>
  );
};
