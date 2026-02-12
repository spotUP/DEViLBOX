/**
 * ArrangementContextMenu - Right-click menu for clips and tracks
 */

import React from 'react';
import { useArrangementStore } from '@stores/useArrangementStore';

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
    removeClips, duplicateClips, toggleClipMute,
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
