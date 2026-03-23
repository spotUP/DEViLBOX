/**
 * TrackRenameDialog — Inline rename overlay for arrangement track headers.
 * Triggered by double-clicking a track header name.
 * Rendered via a portal so it floats above the Pixi canvas.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useArrangementStore } from '@stores/useArrangementStore';

function resolveTrackName(trackId: string): string {
  const track = useArrangementStore.getState().tracks.find(t => t.id === trackId);
  return track?.name || '';
}

export const TrackRenameDialog: React.FC = () => {
  const renamingTrackId = useArrangementStore(s => s.renamingTrackId);
  const setRenamingTrackId = useArrangementStore(s => s.setRenamingTrackId);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingTrackId && inputRef.current) {
      inputRef.current.value = resolveTrackName(renamingTrackId);
      inputRef.current.select();
      inputRef.current.focus();
    }
  }, [renamingTrackId]);

  if (!renamingTrackId) return null;

  const commit = () => {
    const name = inputRef.current?.value.trim() ?? '';
    if (name) {
      useArrangementStore.getState().updateTrack(renamingTrackId, { name });
    }
    setRenamingTrackId(null);
  };

  const cancel = () => setRenamingTrackId(null);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}
    >
      <div style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-light)',
        borderRadius: 6,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 280,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1, textTransform: 'uppercase' }}>
          Rename Track
        </div>
        <input
          ref={inputRef}
          defaultValue={resolveTrackName(renamingTrackId)}
          style={{
            background: 'var(--color-bg-tertiary)',
            border: '1px solid #555',
            borderRadius: 4,
            color: 'var(--color-text)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 13,
            padding: '6px 10px',
            outline: 'none',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={cancel}
            style={{
              background: 'transparent', border: '1px solid #555', borderRadius: 4,
              color: 'var(--color-text-secondary)', padding: '4px 12px', cursor: 'pointer', fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            Cancel
          </button>
          <button
            onClick={commit}
            style={{
              background: '#3b5bdb', border: 'none', borderRadius: 4,
              color: 'var(--color-text)', padding: '4px 12px', cursor: 'pointer', fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            Rename
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
