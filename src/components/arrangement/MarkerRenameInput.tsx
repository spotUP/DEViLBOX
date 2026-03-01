/**
 * MarkerRenameInput — Inline rename overlay for arrangement markers.
 * Rendered via a portal so it floats above the Pixi canvas.
 * Triggered by double-clicking a marker triangle in the ruler.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useArrangementStore } from '@stores/useArrangementStore';

export const MarkerRenameInput: React.FC = () => {
  const renamingMarkerId = useArrangementStore(s => s.renamingMarkerId);
  const setRenamingMarkerId = useArrangementStore(s => s.setRenamingMarkerId);
  const updateMarker = useArrangementStore(s => s.updateMarker);
  const markers = useArrangementStore(s => s.markers);
  const view = useArrangementStore(s => s.view);
  const inputRef = useRef<HTMLInputElement>(null);

  const marker = renamingMarkerId ? markers.find(m => m.id === renamingMarkerId) : null;

  useEffect(() => {
    if (marker && inputRef.current) {
      inputRef.current.value = marker.name;
      inputRef.current.select();
      inputRef.current.focus();
    }
  }, [marker]);

  if (!renamingMarkerId || !marker) return null;

  const commit = () => {
    const name = inputRef.current?.value.trim() ?? '';
    if (name) {
      updateMarker(renamingMarkerId, { name });
    }
    setRenamingMarkerId(null);
  };

  const cancel = () => setRenamingMarkerId(null);

  // Compute screen position of the marker relative to the canvas element.
  // The canvas occupies the left portion of the viewport; we use the first
  // <canvas> element's bounding rect as the base.
  const canvas = document.querySelector('canvas');
  const canvasRect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const TRACK_HEADERS_W = 160;
  const ARR_TOOLBAR_H = 36;
  const TITLE_H = 28; // PixiWindow title bar height
  const RULER_HEIGHT = 24;

  const markerOffsetX = (marker.row - view.scrollRow) * view.pixelsPerRow;
  const screenX = canvasRect.left + TRACK_HEADERS_W + markerOffsetX;
  const screenY = canvasRect.top + TITLE_H + ARR_TOOLBAR_H + RULER_HEIGHT;

  const inputWidth = 140;
  const left = Math.max(4, screenX - inputWidth / 2);

  return createPortal(
    <input
      ref={inputRef}
      defaultValue={marker.name}
      style={{
        position: 'fixed',
        left,
        top: screenY + 2,
        width: inputWidth,
        background: '#1e1e2e',
        border: `1px solid ${marker.color}`,
        borderRadius: 4,
        color: '#fff',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        padding: '3px 6px',
        outline: 'none',
        zIndex: 9999,
        boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      }}
      onBlur={commit}
    />,
    document.body,
  );
};
