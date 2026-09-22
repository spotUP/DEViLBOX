/**
 * DeckPitchSlider - Per-deck vertical pitch fader (Technics SL-1200 style)
 *
 * Range: -16 to +16 semitones with center detent mark at 0.
 * Double-click to reset to center.
 * Stretches vertically to fill its parent container.
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { setDeckRepitchLock, setDeckPitch as setDeckPitchAction } from '@/engine/dj/DJActions';

interface DeckPitchSliderProps {
  deckId: 'A' | 'B' | 'C';
}

const PITCH_MIN = -16;
const PITCH_MAX = 16;
const HANDLE_HEIGHT = 24;  // px - height of the rectangular handle

export const DeckPitchSlider: React.FC<DeckPitchSliderProps> = ({ deckId }) => {
  const pitchOffset = useDJStore((s) => s.decks[deckId].pitchOffset);
  const repitchLock = useDJStore((s) => s.decks[deckId].repitchLock);

  // Use ref pattern from CLAUDE.md for drag handling to avoid stale state
  const pitchRef = useRef(pitchOffset);
  useEffect(() => {
    pitchRef.current = pitchOffset;
  }, [pitchOffset]);

  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [trackHeight, setTrackHeight] = useState(200);

  // Observe track container height
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h && h > 0) setTrackHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Convert pitch value (-16 to +16) to pixel offset from top of track
  const pitchToY = useCallback((pitch: number): number => {
    // Top = +16, Bottom = -16 (inverted: pushing fader up = higher pitch)
    const normalized = (PITCH_MAX - pitch) / (PITCH_MAX - PITCH_MIN);
    return normalized * (trackHeight - HANDLE_HEIGHT);
  }, [trackHeight]);

  // Convert pixel offset from top of track to pitch value
  const yToPitch = useCallback((y: number): number => {
    const clamped = Math.max(0, Math.min(trackHeight - HANDLE_HEIGHT, y));
    const normalized = clamped / (trackHeight - HANDLE_HEIGHT);
    return PITCH_MAX - normalized * (PITCH_MAX - PITCH_MIN);
  }, [trackHeight]);

  const updatePitch = useCallback(
    (clientY: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const y = clientY - rect.top - HANDLE_HEIGHT / 2;
      const newPitch = Math.round(yToPitch(y) * 10) / 10; // 0.1 resolution
      setDeckPitchAction(deckId, newPitch);
    },
    [deckId, yToPitch]
  );

  // Pointer events, not mouse events. `Fader.tsx` is the reference shape:
  // capture the pointer so the drag follows it off the 32px-wide track, and
  // treat `pointercancel` as a release so a pointer the browser takes away
  // cannot leave the deck repitched.
  const activePointerRef = useRef<number | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerRef.current !== null) return; // second finger: ignore
      e.preventDefault();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* no pointer capture in this environment */
      }
      activePointerRef.current = e.pointerId;
      setIsDragging(true);
      updatePitch(e.clientY);
    },
    [updatePitch]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerRef.current !== e.pointerId) return;
      e.preventDefault();
      updatePitch(e.clientY);
    },
    [updatePitch]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (activePointerRef.current !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    activePointerRef.current = null;
    setIsDragging(false);
  }, []);

  /**
   * A pointer can be taken away without ever sending `pointerup` — the browser
   * steals it for a system gesture, or the captured element is re-created by a
   * render. `lostpointercapture` is the only event that always arrives, so it
   * ends the drag too. Without it the "one pointer at a time" guard below
   * latches and the control is dead until remount — "the sliders stopped
   * working after some pulls" (2026-09-22).
   */
  const handleLostPointerCapture = useCallback((e: React.PointerEvent) => {
    if (activePointerRef.current !== e.pointerId) return;
    activePointerRef.current = null;
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setDeckPitchAction(deckId, 0);
  }, [deckId]);

  const handleY = pitchToY(pitchOffset);
  const centerY = pitchToY(0);
  const displayValue =
    pitchOffset > 0
      ? `+${pitchOffset.toFixed(1)}`
      : pitchOffset < 0
        ? pitchOffset.toFixed(1)
        : '0.0';

  return (
    <div className="flex flex-col items-center gap-2 select-none h-full">
      {/* Repitch lock chip — only visible when locked */}
      <button
        className={
          'px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border transition-colors shrink-0 ' +
          (repitchLock
            ? 'bg-accent-warning/20 border-accent-warning text-accent-warning'
            : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:border-accent-warning hover:text-accent-warning')
        }
        onClick={() => setDeckRepitchLock(deckId, !repitchLock)}
        title={repitchLock
          ? 'Repitch Lock ON — fader moves without changing pitch. Click or press Tab/\\ to unlock.'
          : 'Repitch Lock OFF — pitch follows fader. Click or press Tab/\\ to lock.'}
      >
        {repitchLock ? 'LOCK' : 'lock'}
      </button>
      {/* Slider track container — fills available height */}
      <div
        ref={trackRef}
        className="relative cursor-pointer flex-1 min-h-0"
        style={{ width: 32, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handleLostPointerCapture}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => { e.preventDefault(); setDeckPitchAction(deckId, 0); }}
      >
        {/* Groove track — recessed black slot like the TD-3 sequencer groove */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-sm top-0 bottom-0"
          style={{
            width: 6,
            backgroundColor: 'rgba(0,0,0,0.6)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)',
          }}
        />

        {/* Center detent mark */}
        <div
          className="absolute left-0 right-0"
          style={{
            top: centerY + HANDLE_HEIGHT / 2 - 1,
            height: 2,
            backgroundColor: 'rgba(255,255,255,0.3)',
          }}
        />

        {/* Rectangular handle — brushed silver like TD-3 knobs */}
        <div
          className="absolute left-0 right-0 rounded-sm"
          style={{
            top: handleY,
            height: HANDLE_HEIGHT,
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.2) 40%, rgba(255,255,255,0.15) 100%)',
            border: '1px solid rgba(255,255,255,0.2)',
            boxShadow: isDragging
              ? '0 0 8px var(--color-accent-glow, rgba(255,255,255,0.3)), inset 0 1px 0 rgba(255,255,255,0.2)'
              : 'inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 3px rgba(0,0,0,0.5)',
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
        >
          {/* Grip lines */}
          <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 flex flex-col gap-[2px]">
            <div className="h-[1px] bg-black/30" />
            <div className="h-[1px] bg-white/20" />
            <div className="h-[1px] bg-black/30" />
            <div className="h-[1px] bg-white/20" />
            <div className="h-[1px] bg-black/30" />
          </div>
        </div>
      </div>

      {/* Pitch value readout */}
      <div
        className="font-mono text-xs text-text-secondary text-center shrink-0"
        style={{ minWidth: 48 }}
      >
        {displayValue} st
      </div>
    </div>
  );
};
