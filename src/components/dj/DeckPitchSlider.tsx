/**
 * DeckPitchSlider - Per-deck vertical pitch fader (Technics SL-1200 style)
 *
 * Range: -16 to +16 semitones with center detent mark at 0.
 * Double-click to reset to center.
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';

interface DeckPitchSliderProps {
  deckId: 'A' | 'B';
}

const PITCH_MIN = -16;
const PITCH_MAX = 16;
const SLIDER_HEIGHT = 200; // px - height of the track
const HANDLE_HEIGHT = 24;  // px - height of the rectangular handle

export const DeckPitchSlider: React.FC<DeckPitchSliderProps> = ({ deckId }) => {
  const pitchOffset = useDJStore((s) => s.decks[deckId].pitchOffset);
  const setDeckPitch = useDJStore((s) => s.setDeckPitch);

  // Use ref pattern from CLAUDE.md for drag handling to avoid stale state
  const pitchRef = useRef(pitchOffset);
  useEffect(() => {
    pitchRef.current = pitchOffset;
  }, [pitchOffset]);

  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Convert pitch value (-16 to +16) to pixel offset from top of track
  const pitchToY = (pitch: number): number => {
    // Top = +16, Bottom = -16 (inverted: pushing fader up = higher pitch)
    const normalized = (PITCH_MAX - pitch) / (PITCH_MAX - PITCH_MIN);
    return normalized * (SLIDER_HEIGHT - HANDLE_HEIGHT);
  };

  // Convert pixel offset from top of track to pitch value
  const yToPitch = (y: number): number => {
    const clamped = Math.max(0, Math.min(SLIDER_HEIGHT - HANDLE_HEIGHT, y));
    const normalized = clamped / (SLIDER_HEIGHT - HANDLE_HEIGHT);
    return PITCH_MAX - normalized * (PITCH_MAX - PITCH_MIN);
  };

  const updatePitch = useCallback(
    (clientY: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const y = clientY - rect.top - HANDLE_HEIGHT / 2;
      const newPitch = Math.round(yToPitch(y) * 10) / 10; // 0.1 resolution
      setDeckPitch(deckId, newPitch);
    },
    [deckId, setDeckPitch]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      updatePitch(e.clientY);
    },
    [updatePitch]
  );

  // Global mouse handlers for drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updatePitch(e.clientY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updatePitch]);

  const handleDoubleClick = useCallback(() => {
    setDeckPitch(deckId, 0);
  }, [deckId, setDeckPitch]);

  const handleY = pitchToY(pitchOffset);
  const centerY = pitchToY(0);
  const displayValue =
    pitchOffset > 0
      ? `+${pitchOffset.toFixed(1)}`
      : pitchOffset < 0
        ? pitchOffset.toFixed(1)
        : '0.0';

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      {/* Slider track container */}
      <div
        ref={trackRef}
        className="relative cursor-pointer"
        style={{ width: 32, height: SLIDER_HEIGHT }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* Groove track */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-sm"
          style={{
            width: 6,
            height: SLIDER_HEIGHT,
            backgroundColor: '#1a1a2e',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6)',
          }}
        />

        {/* Center detent mark */}
        <div
          className="absolute left-0 right-0"
          style={{
            top: centerY + HANDLE_HEIGHT / 2 - 1,
            height: 2,
            backgroundColor: '#666',
          }}
        />

        {/* Rectangular handle */}
        <div
          className="absolute left-0 right-0 rounded-sm"
          style={{
            top: handleY,
            height: HANDLE_HEIGHT,
            backgroundColor: '#555',
            backgroundImage:
              'linear-gradient(to bottom, #6a6a6a 0%, #555 40%, #444 100%)',
            boxShadow: isDragging
              ? '0 0 6px rgba(255,255,255,0.2), inset 0 1px 0 rgba(255,255,255,0.15)'
              : 'inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 3px rgba(0,0,0,0.5)',
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
        >
          {/* Grip lines */}
          <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 flex flex-col gap-[2px]">
            <div className="h-[1px] bg-black/30" />
            <div className="h-[1px] bg-white/10" />
            <div className="h-[1px] bg-black/30" />
            <div className="h-[1px] bg-white/10" />
            <div className="h-[1px] bg-black/30" />
          </div>
        </div>
      </div>

      {/* Pitch value readout */}
      <div
        className="font-mono text-xs text-text-secondary text-center"
        style={{ minWidth: 48 }}
      >
        {displayValue} st
      </div>
    </div>
  );
};
