/**
 * ArrangementContextMenu — Right-click context menu for arrangement clips.
 * Reads position/clipId from useArrangementStore.clipContextMenu.
 * Rendered via a portal so it floats above the Pixi canvas.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useArrangementStore } from '@stores/useArrangementStore';
import { useTrackerStore } from '@stores';
import { usePianoRollStore } from '@/stores/usePianoRollStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';

const CLIP_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#ec4899', '#f43f5e', '#78716c', '#ffffff',
];

const MENU_W = 200;

export const ArrangementContextMenu: React.FC = () => {
  const menu = useArrangementStore(s => s.clipContextMenu);
  const setMenu = useArrangementStore(s => s.setClipContextMenu);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  useEffect(() => {
    if (!menu) return;
    // Reset color picker visibility when menu closes/reopens
    setShowColorPicker(false);
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu, setMenu]);

  if (!menu) return null;

  const { clipId, screenX, screenY } = menu;
  const arr = useArrangementStore.getState();
  const clip = arr.clips.find(c => c.id === clipId);
  if (!clip) return null;

  const track = arr.tracks.find(t => t.id === clip.trackId);
  const currentClipColor = clip.color ?? null;
  const trackColor = track?.color ?? null;

  const close = () => setMenu(null);

  const handleOpenInPianoRoll = () => {
    close();
    const ts = useTrackerStore.getState();
    const patternIndex = ts.patterns.findIndex(p => p.id === clip.patternId);
    if (patternIndex >= 0) ts.setCurrentPattern(patternIndex);
    const pr = usePianoRollStore.getState();
    pr.setChannelIndex(clip.sourceChannelIndex ?? 0);
    pr.setScroll(clip.offsetRows || 0, pr.view.scrollY);
    useWorkbenchStore.getState().showWindow('pianoroll');
  };

  const handleRename = () => {
    close();
    arr.setRenamingClipId(clipId);
  };

  const handleMute = () => {
    close();
    arr.toggleClipMute(clipId);
  };

  const handleDuplicate = () => {
    close();
    arr.pushUndo();
    const newIds = arr.duplicateClips([clipId]);
    arr.clearSelection();
    arr.selectClips(newIds);
  };

  const handleDelete = () => {
    close();
    arr.pushUndo();
    arr.removeClip(clipId);
  };

  const handleSetColor = (color: string) => {
    close();
    arr.pushUndo();
    arr.setClipColor(clipId, color);
  };

  const handleResetColor = () => {
    close();
    arr.setClipColor(clipId, null);
  };

  // Adjust position so menu stays on screen
  const left = Math.min(screenX, window.innerWidth - MENU_W - 8);
  const top = Math.min(screenY, window.innerHeight - 320);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[10000] bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl py-1 text-xs"
      style={{ left, top, width: MENU_W }}
      onMouseDown={e => e.stopPropagation()}
    >
      <MenuItem label="Open in Piano Roll" onClick={handleOpenInPianoRoll} />
      <Separator />
      <MenuItem label="Rename" onClick={handleRename} />
      <MenuItem label={clip.muted ? 'Unmute' : 'Mute'} onClick={handleMute} />
      <MenuItem label="Duplicate" onClick={handleDuplicate} />
      <Separator />
      {/* Set color menu item with color dot indicator */}
      <button
        className="w-full px-3 py-1.5 text-left hover:bg-dark-bgTertiary font-mono text-text-primary flex items-center justify-between"
        onClick={() => setShowColorPicker(v => !v)}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm ring-1 ring-white/30"
            style={{ backgroundColor: currentClipColor ?? trackColor ?? '#666' }}
          />
          <span>Set color</span>
        </div>
        <span className="text-text-muted text-[10px]">{showColorPicker ? '▲' : '▼'}</span>
      </button>
      {showColorPicker && (
        <div className="grid grid-cols-4 gap-1 p-2 border-t border-dark-border">
          {CLIP_COLORS.map(color => (
            <button
              key={color}
              onClick={() => handleSetColor(color)}
              className="w-6 h-6 rounded-sm hover:scale-110 transition-transform ring-1 ring-white/20"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          {/* Reset to track color */}
          <button
            onClick={handleResetColor}
            className="w-6 h-6 rounded-sm border border-dashed border-white/40 hover:bg-white/10 flex items-center justify-center text-[8px] text-white/60"
            title="Reset to track color"
          >
            ×
          </button>
        </div>
      )}
      <Separator />
      <MenuItem label="Delete" onClick={handleDelete} danger />
    </div>,
    document.body,
  );
};

const MenuItem: React.FC<{ label: string; onClick: () => void; danger?: boolean }> = ({
  label, onClick, danger,
}) => (
  <button
    className={`w-full px-3 py-1.5 text-left hover:bg-dark-bgTertiary font-mono ${
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
