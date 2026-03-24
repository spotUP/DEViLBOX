/**
 * TrackHeader - Per-track header with name, mute/solo, volume/pan
 * Features colored left sidebar strip, track number badge, and bigger M/S buttons
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useArrangementStore } from '@stores/useArrangementStore';
import type { ArrangementTrack } from '@/types/arrangement';

interface TrackHeaderProps {
  track: ArrangementTrack;
  height: number;
}

// ─── Volume/Pan mini fader ─────────────────────────────────────────────────────

interface MiniFaderProps {
  value: number;       // current value
  min: number;
  max: number;
  color: string;
  label: string;
  formatValue: (v: number) => string;
  onChange: (v: number) => void;
}

const MiniFader: React.FC<MiniFaderProps> = ({ value, min, max, color, label, formatValue, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const dragStartRef = useRef<{ x: number; startValue: number } | null>(null);

  const getValueFromPosition = useCallback((clientX: number, rect: DOMRect): number => {
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return min + pct * (max - min);
  }, [min, max]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDragging(true);
    const newValue = getValueFromPosition(e.clientX, rect);
    onChange(newValue);
    dragStartRef.current = { x: e.clientX, startValue: newValue };

    const onMove = (me: PointerEvent) => {
      const r = trackRef.current?.getBoundingClientRect();
      if (!r) return;
      onChange(getValueFromPosition(me.clientX, r));
    };

    const onUp = () => {
      setDragging(false);
      dragStartRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [getValueFromPosition, onChange]);

  const pct = Math.max(0, Math.min(1, (value - min) / (max - min))) * 100;

  return (
    <div
      className="relative flex-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        ref={trackRef}
        className="relative h-[6px] rounded-full overflow-hidden cursor-ew-resize"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        onPointerDown={handlePointerDown}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-none"
          style={{
            width: `${pct}%`,
            backgroundColor: dragging ? color : `${color}99`,
          }}
        />
      </div>
      {/* Tooltip-like label on hover/drag */}
      {(hovered || dragging) && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1 rounded text-[9px] whitespace-nowrap pointer-events-none z-[99990]"
          style={{
            backgroundColor: 'rgba(0,0,0,0.85)',
            color: 'var(--color-text-secondary)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          {label}: {formatValue(value)}
        </div>
      )}
    </div>
  );
};

// ─── Pan indicator ─────────────────────────────────────────────────────────────

interface PanIndicatorProps {
  pan: number;   // -100 to 100
  color: string;
  onChange: (v: number) => void;
}

const PanIndicator: React.FC<PanIndicatorProps> = ({ pan, color, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const getValueFromPosition = useCallback((clientX: number, rect: DOMRect): number => {
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round((pct * 200) - 100);  // -100 to 100
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDragging(true);
    onChange(getValueFromPosition(e.clientX, rect));

    const onMove = (me: PointerEvent) => {
      const r = trackRef.current?.getBoundingClientRect();
      if (!r) return;
      onChange(getValueFromPosition(me.clientX, r));
    };

    const onUp = () => {
      setDragging(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [getValueFromPosition, onChange]);

  // Pan indicator: center line + dot that moves left/right
  const centerPct = 50;
  const dotPct = (pan + 100) / 200 * 100;

  const formatPan = (v: number) => {
    if (Math.abs(v) < 2) return 'C';
    return v < 0 ? `L${Math.abs(Math.round(v))}` : `R${Math.round(v)}`;
  };

  return (
    <div
      className="relative"
      style={{ width: 32 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        ref={trackRef}
        className="relative h-[6px] rounded-full overflow-hidden cursor-ew-resize"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        onPointerDown={handlePointerDown}
      >
        {/* Center tick */}
        <div
          className="absolute inset-y-0"
          style={{
            left: `${centerPct}%`,
            width: 1,
            backgroundColor: 'rgba(255,255,255,0.2)',
          }}
        />
        {/* Pan fill: from center to dot */}
        {Math.abs(pan) > 2 && (
          <div
            className="absolute inset-y-0"
            style={{
              left:  pan < 0 ? `${dotPct}%` : `${centerPct}%`,
              right: pan < 0 ? `${100 - centerPct}%` : `${100 - dotPct}%`,
              backgroundColor: dragging ? color : `${color}88`,
            }}
          />
        )}
        {/* Pan dot */}
        <div
          className="absolute top-0 rounded-full"
          style={{
            left: `calc(${dotPct}% - 3px)`,
            width: 6,
            height: 6,
            backgroundColor: color,
          }}
        />
      </div>
      {(hovered || dragging) && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1 rounded text-[9px] whitespace-nowrap pointer-events-none z-[99990]"
          style={{
            backgroundColor: 'rgba(0,0,0,0.85)',
            color: 'var(--color-text-secondary)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          Pan: {formatPan(pan)}
        </div>
      )}
    </div>
  );
};

// ─── TrackHeader ───────────────────────────────────────────────────────────────

export const TrackHeader: React.FC<TrackHeaderProps> = ({ track, height }) => {
  const { toggleTrackMute, toggleTrackSolo, updateTrack, setTrackVolume, setTrackPan } = useArrangementStore();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(track.name);

  // Sync if track name changes externally (e.g., undo/redo)
  useEffect(() => { requestAnimationFrame(() => setNameValue(track.name)); }, [track.name]);

  const handleNameSubmit = useCallback(() => {
    setEditingName(false);
    if (nameValue.trim() && nameValue !== track.name) {
      updateTrack(track.id, { name: nameValue.trim() });
    }
  }, [nameValue, track.id, track.name, updateTrack]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNameSubmit();
    if (e.key === 'Escape') {
      setNameValue(track.name);
      setEditingName(false);
    }
  }, [handleNameSubmit, track.name]);

  const handleVolumeChange = useCallback((v: number) => {
    setTrackVolume(track.id, Math.round(v));
  }, [track.id, setTrackVolume]);

  const handlePanChange = useCallback((v: number) => {
    setTrackPan(track.id, Math.round(v));
  }, [track.id, setTrackPan]);

  const trackColor = track.color || '#3b82f6';

  return (
    <div
      className="flex border-b border-dark-border bg-dark-bgSecondary select-none"
      style={{ height, minHeight: 30 }}
    >
      {/* Colored left sidebar strip */}
      <div
        className="flex-shrink-0"
        style={{
          width: 4,
          backgroundColor: trackColor,
        }}
      />

      {/* Content */}
      <div className="flex-1 flex flex-col px-2 py-1.5 min-w-0">
        {/* Track number badge + name */}
        <div className="flex items-center gap-1.5 min-h-[20px]">
          <span
            className="flex-shrink-0 w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center"
            style={{
              backgroundColor: `${trackColor}33`,
              color: trackColor,
            }}
          >
            {track.index + 1}
          </span>
          {editingName ? (
            <input
              className="bg-dark-bgTertiary border border-dark-border rounded px-1 text-xs text-text-primary w-full"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleNameKeyDown}
              autoFocus
            />
          ) : (
            <span
              className="text-xs text-text-primary truncate cursor-pointer hover:text-accent-primary font-medium"
              onDoubleClick={() => setEditingName(true)}
              title={track.name}
            >
              {track.name}
            </span>
          )}
        </div>

        {/* M / S buttons + volume/pan faders */}
        {height >= 44 && (
          <div className="flex items-center gap-1 mt-1.5">
            <button
              className={`w-6 h-5 rounded text-[10px] font-bold leading-none transition-colors flex-shrink-0 ${
                track.muted
                  ? 'bg-red-600 text-text-primary'
                  : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-border hover:text-text-primary'
              }`}
              onClick={() => toggleTrackMute(track.id)}
              title="Mute"
            >
              M
            </button>
            <button
              className={`w-6 h-5 rounded text-[10px] font-bold leading-none transition-colors flex-shrink-0 ${
                track.solo
                  ? 'bg-yellow-600 text-text-primary'
                  : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-border hover:text-text-primary'
              }`}
              onClick={() => toggleTrackSolo(track.id)}
              title="Solo"
            >
              S
            </button>

            {/* Volume + pan controls (visible when height allows) */}
            {height >= 44 && (
              <div className="flex-1 flex flex-col gap-1 ml-1 min-w-0">
                {/* Volume fader */}
                <MiniFader
                  value={track.volume}
                  min={0}
                  max={100}
                  color={trackColor}
                  label="Vol"
                  formatValue={(v) => `${Math.round(v)}%`}
                  onChange={handleVolumeChange}
                />

                {/* Pan indicator — only when enough height */}
                {height >= 56 && (
                  <PanIndicator
                    pan={track.pan}
                    color={trackColor}
                    onChange={handlePanChange}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
