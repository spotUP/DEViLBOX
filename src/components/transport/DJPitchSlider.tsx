/**
 * DJPitchSlider - Technics SL-1200 style pitch fader
 *
 * Custom-drawn vertical fader:
 * - Thin center groove (the track)
 * - Rectangular handle with three horizontal ribs
 * - Center reference mark at 0 position
 * - Range: -12 to +12 semitones
 * - Double-click / right-click to reset
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as Tone from 'tone';

interface DJPitchSliderProps {
  className?: string;
  onPitchChange?: (semitones: number) => void;
}

const MIN_PITCH = -12;
const MAX_PITCH = 12;
const PITCH_RANGE = 24; // MAX - MIN
const HANDLE_H = 24;   // px — height of the fader cap
const EDGE_PAD = 4;    // px — keep handle inside housing at extremes

export const DJPitchSlider: React.FC<DJPitchSliderProps> = ({
  className = '',
  onPitchChange,
}) => {
  const [pitch, setPitch] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const baseBPMRef = useRef<number | null>(null);
  const trackRef   = useRef<HTMLDivElement>(null);
  const dragRef    = useRef({ startY: 0, startPitch: 0 });

  // ── Audio ──────────────────────────────────────────────────────────
  const applyPitch = useCallback((raw: number) => {
    const clamped = Math.max(MIN_PITCH, Math.min(MAX_PITCH, raw));
    setPitch(clamped);
    if (baseBPMRef.current === null) {
      baseBPMRef.current = Tone.getTransport().bpm.value;
    }
    Tone.getTransport().bpm.value =
      baseBPMRef.current * Math.pow(2, clamped / 12);
    onPitchChange?.(clamped);
  }, [onPitchChange]);

  const resetPitch = useCallback(() => {
    if (baseBPMRef.current !== null) {
      Tone.getTransport().bpm.value = baseBPMRef.current;
      baseBPMRef.current = null;
    }
    setPitch(0);
    onPitchChange?.(0);
  }, [onPitchChange]);

  // ── Drag ───────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startPitch: pitch };
    setIsDragging(true);
  }, [pitch]);

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const h = trackRef.current?.clientHeight ?? 1;
      const usable = h - HANDLE_H - EDGE_PAD * 2;
      const dy = e.clientY - dragRef.current.startY;
      applyPitch(dragRef.current.startPitch - (dy / usable) * PITCH_RANGE);
    };

    const onUp = () => setIsDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, applyPitch]);

  // ── Layout ─────────────────────────────────────────────────────────
  // 0 = top of track (+12 st), 1 = bottom (-12 st)
  const frac = (MAX_PITCH - pitch) / PITCH_RANGE;
  const handleTop = `calc(${EDGE_PAD}px + ${frac} * (100% - ${HANDLE_H + EDGE_PAD * 2}px))`;

  const displayValue = pitch > 0 ? `+${pitch.toFixed(1)}` : pitch.toFixed(1);
  const atCenter = Math.abs(pitch) < 0.05;

  return (
    <div
      className={`flex flex-col items-center py-2 gap-1 select-none ${className}`}
      style={{ width: 52 }}
    >
      {/* Label */}
      <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider flex-shrink-0">
        Pitch
      </span>

      {/* Value readout */}
      <span
        className={`text-[10px] font-mono font-bold text-center cursor-pointer flex-shrink-0 transition-colors ${
          atCenter ? 'text-text-muted' : 'text-amber-400'
        }`}
        onDoubleClick={resetPitch}
        onContextMenu={(e) => { e.preventDefault(); resetPitch(); }}
        title="Double-click or right-click to reset"
      >
        {displayValue}
      </span>

      {/* +12 label */}
      <span className="text-[8px] font-mono text-text-muted/40 leading-none flex-shrink-0">
        +12
      </span>

      {/* ── Scale + Housing ─────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 w-full flex flex-row gap-0">

      {/* Scale marks — left of housing, -8 top / 0 mid / +8 bottom */}
      <div className="relative flex-shrink-0 flex flex-col justify-between py-[4px]" style={{ width: 18 }}>
        {['-8','','','-4','','','0','','','+4','','','+8'].map((label, i, arr) => {
          const isMajor = label !== '';
          return (
            <div key={i} className="flex items-center justify-end gap-0.5" style={{ flex: 1 }}>
              {isMajor && (
                <span className={`text-[6px] font-mono leading-none ${label === '0' ? 'text-amber-400/60' : 'text-text-muted/40'}`}>
                  {label}
                </span>
              )}
              <div className={`h-px flex-shrink-0 ${isMajor ? 'w-1.5' : 'w-1'} ${label === '0' ? 'bg-amber-400/40' : 'bg-text-muted/30'}`} />
            </div>
          );
        })}
      </div>

      {/* Housing */}
      <div className="relative flex-1 min-h-0">


        {/* Center reference tick (left edge, marks 0) */}
        <div
          className="absolute left-0 w-1.5 h-px bg-amber-400/30 pointer-events-none"
          style={{ top: '50%' }}
        />

        {/* Track groove — thin vertical line down the center */}
        <div
          className="absolute top-2 bottom-2 left-1/2 w-[3px] -translate-x-px pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        />

        {/* Draggable area */}
        <div
          ref={trackRef}
          className="absolute inset-0 cursor-ns-resize"
          onMouseDown={handleMouseDown}
          onContextMenu={(e) => { e.preventDefault(); resetPitch(); }}
        />

        {/* ── Fader handle (SL-1200 style) ─────────────────────────── */}
        <div
          className="absolute inset-x-1 pointer-events-none"
          style={{ height: HANDLE_H, top: handleTop }}
        >
          {/* Handle body */}
          <div
            className={`absolute inset-0 rounded-[2px] transition-colors duration-75 ${
              isDragging
                ? 'bg-dark-bgTertiary border border-amber-400/50'
                : 'bg-dark-bgSecondary border border-dark-border'
            }`}
          >
            {/* Top rib */}
            <div
              className="absolute inset-x-2 h-px"
              style={{ top: 5, background: isDragging ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.12)' }}
            />
            {/* Middle rib — slightly brighter, acts as center groove */}
            <div
              className="absolute inset-x-2 h-px"
              style={{ top: '50%', transform: 'translateY(-50%)', background: isDragging ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.18)' }}
            />
            {/* Bottom rib */}
            <div
              className="absolute inset-x-2 h-px"
              style={{ bottom: 5, background: isDragging ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.12)' }}
            />
          </div>
        </div>
      </div>{/* Housing */}
      </div>{/* Scale + Housing row */}

      {/* -12 label */}
      <span className="text-[8px] font-mono text-text-muted/40 leading-none flex-shrink-0">
        -12
      </span>
    </div>
  );
};

/**
 * Compact horizontal version for tight spaces
 */
export const DJPitchSliderHorizontal: React.FC<DJPitchSliderProps> = ({
  className = '',
  onPitchChange,
}) => {
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [baseBPM, setBaseBPM] = useState<number | null>(null);

  const handlePitchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setPitchSemitones(newValue);
    const playbackRate = Math.pow(2, newValue / 12);
    if (baseBPM === null) {
      setBaseBPM(Tone.getTransport().bpm.value);
    }
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
      <div className="text-[9px] font-mono text-text-muted uppercase">Pitch</div>
      <div className="text-[8px] font-mono text-text-muted/50">-12</div>
      <input
        type="range"
        min="-12"
        max="12"
        step="0.1"
        value={pitchSemitones}
        onChange={handlePitchChange}
        onDoubleClick={handleDoubleClick}
        className="flex-1 min-w-[100px] max-w-[150px] accent-amber-500"
        style={{ cursor: 'ew-resize' }}
      />
      <div className="text-[8px] font-mono text-text-muted/50">+12</div>
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
