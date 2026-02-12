/**
 * TrackHeader - Per-track header with name, mute/solo, volume/pan
 * Features colored left sidebar strip, track number badge, and bigger M/S buttons
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useArrangementStore } from '@stores/useArrangementStore';
import type { ArrangementTrack } from '@/types/arrangement';

interface TrackHeaderProps {
  track: ArrangementTrack;
  height: number;
}

export const TrackHeader: React.FC<TrackHeaderProps> = ({ track, height }) => {
  const { toggleTrackMute, toggleTrackSolo, updateTrack } = useArrangementStore();
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
          backgroundColor: track.color || '#666',
        }}
      />

      {/* Content */}
      <div className="flex-1 flex flex-col px-2 py-1.5 min-w-0">
        {/* Track number badge + name */}
        <div className="flex items-center gap-1.5 min-h-[20px]">
          <span
            className="flex-shrink-0 w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center"
            style={{
              backgroundColor: `${track.color || '#666'}33`,
              color: track.color || '#888',
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

        {/* M / S buttons (bigger) */}
        {height >= 44 && (
          <div className="flex items-center gap-1 mt-1.5">
            <button
              className={`w-6 h-5 rounded text-[10px] font-bold leading-none transition-colors ${
                track.muted
                  ? 'bg-red-600 text-white'
                  : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-border hover:text-text-primary'
              }`}
              onClick={() => toggleTrackMute(track.id)}
              title="Mute"
            >
              M
            </button>
            <button
              className={`w-6 h-5 rounded text-[10px] font-bold leading-none transition-colors ${
                track.solo
                  ? 'bg-yellow-600 text-white'
                  : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-border hover:text-text-primary'
              }`}
              onClick={() => toggleTrackSolo(track.id)}
              title="Solo"
            >
              S
            </button>

            {/* Volume mini-bar (more prominent) */}
            {height >= 56 && (
              <div className="flex-1 ml-1.5">
                <div className="relative h-[4px] bg-dark-bgTertiary rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${track.volume}%`,
                      backgroundColor: `${track.color || '#3b82f6'}88`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
