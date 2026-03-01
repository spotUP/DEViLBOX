/**
 * ClipRenameDialog — Inline rename overlay for arrangement clips.
 * Triggered by F2 when a single clip is selected.
 * Rendered via a portal so it floats above the Pixi canvas.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useArrangementStore } from '@stores/useArrangementStore';
import { useTrackerStore } from '@stores';

/** Resolve current display name for a clip */
function resolveClipName(clipId: string): string {
  const arr = useArrangementStore.getState();
  const clip = arr.clips.find(c => c.id === clipId);
  if (!clip) return '';
  if (clip.name) return clip.name;
  const ts = useTrackerStore.getState();
  const pat = ts.patterns.find(p => p.id === clip.patternId);
  return pat?.name || '';
}

export const ClipRenameDialog: React.FC = () => {
  const renamingClipId = useArrangementStore(s => s.renamingClipId);
  const setRenamingClipId = useArrangementStore(s => s.setRenamingClipId);
  const setClipName = useArrangementStore(s => s.setClipName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingClipId && inputRef.current) {
      inputRef.current.value = resolveClipName(renamingClipId);
      inputRef.current.select();
      inputRef.current.focus();
    }
  }, [renamingClipId]);

  if (!renamingClipId) return null;

  const commit = () => {
    const name = inputRef.current?.value.trim() ?? '';
    setClipName(renamingClipId, name);
    setRenamingClipId(null);
  };

  const cancel = () => setRenamingClipId(null);

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
        background: '#1e1e2e',
        border: '1px solid #444',
        borderRadius: 6,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 280,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <div style={{ color: '#ccc', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1, textTransform: 'uppercase' }}>
          Rename Clip
        </div>
        <input
          ref={inputRef}
          defaultValue={resolveClipName(renamingClipId)}
          style={{
            background: '#2a2a3e',
            border: '1px solid #555',
            borderRadius: 4,
            color: '#fff',
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
              color: '#aaa', padding: '4px 12px', cursor: 'pointer', fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            Cancel
          </button>
          <button
            onClick={commit}
            style={{
              background: '#3b5bdb', border: 'none', borderRadius: 4,
              color: '#fff', padding: '4px 12px', cursor: 'pointer', fontSize: 11,
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
