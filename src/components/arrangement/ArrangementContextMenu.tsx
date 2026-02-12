/**
 * ArrangementContextMenu - Right-click menu for clips and tracks
 */

import React from 'react';
import { useArrangementStore } from '@stores/useArrangementStore';

const CLIP_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
];

interface ArrangementContextMenuProps {
  x: number;
  y: number;
  clipId: string | null;
  trackId: string | null;
  row: number;
  onClose: () => void;
}

export const ArrangementContextMenu: React.FC<ArrangementContextMenuProps> = ({
  x, y, clipId, trackId, row, onClose,
}) => {
  const {
    removeClips, duplicateClips, toggleClipMute, setClipColor,
    splitClip, selectAllClipsOnTrack, selectedClipIds, pushUndo,
  } = useArrangementStore();

  const handleAction = (action: () => void) => {
    pushUndo();
    action();
    onClose();
  };

  return (
    <div
      className="fixed z-50 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl py-1 text-xs min-w-[160px]"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {clipId && (
        <>
          <MenuItem label="Duplicate" onClick={() => handleAction(() => duplicateClips([...selectedClipIds]))} />
          <MenuItem label="Split at Cursor" onClick={() => handleAction(() => splitClip(clipId, row))} />
          <MenuItem label="Mute/Unmute" onClick={() => handleAction(() => toggleClipMute(clipId))} />
          <Separator />
          <div className="px-2 py-2">
            <div className="text-[10px] text-text-muted mb-1">Clip Color</div>
            <div className="grid grid-cols-8 gap-1">
              {CLIP_COLORS.map(color => (
                <button
                  key={color}
                  className="w-6 h-6 rounded border border-dark-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    handleAction(() => setClipColor(clipId, color));
                  }}
                />
              ))}
            </div>
          </div>
          <Separator />
          <MenuItem label="Delete" onClick={() => handleAction(() => removeClips([...selectedClipIds]))} danger />
        </>
      )}

      {trackId && !clipId && (
        <>
          <MenuItem label="Select All on Track" onClick={() => { selectAllClipsOnTrack(trackId); onClose(); }} />
        </>
      )}

      {!clipId && !trackId && (
        <div className="px-3 py-1 text-text-muted italic">No selection</div>
      )}
    </div>
  );
};

const MenuItem: React.FC<{ label: string; onClick: () => void; danger?: boolean }> = ({
  label, onClick, danger,
}) => (
  <button
    className={`w-full px-3 py-1.5 text-left hover:bg-dark-bgTertiary ${
      danger ? 'text-red-400 hover:text-red-300' : 'text-text-primary'
    }`}
    onClick={onClick}
  >
    {label}
  </button>
);

const Separator: React.FC = () => (
  <div className="my-1 border-t border-dark-border" />
);
