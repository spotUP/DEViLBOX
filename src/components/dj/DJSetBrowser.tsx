import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDJSetStore } from '../../stores/useDJSetStore';
import { useAuthStore } from '../../stores/useAuthStore';

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatRelativeDate(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Extended metadata returned by listDJSets API */
interface SetListEntry {
  id: string;
  name: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  durationMs: number;
  trackList: { title: string }[];
  version: 1;
  playCount: number;
  hasMic: boolean;
}

export const DJSetBrowser: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const setList = useDJSetStore((s) => s.setList);
  const total = useDJSetStore((s) => s.total);
  const isPlayingSet = useDJSetStore((s) => s.isPlayingSet);
  const currentSetId = useDJSetStore((s) => s.currentSetId);
  const isRecording = useDJSetStore((s) => s.isRecording);
  const playbackProgress = useDJSetStore((s) => s.playbackProgress);
  const playbackElapsed = useDJSetStore((s) => s.playbackElapsed);
  const preloadProgress = useDJSetStore((s) => s.preloadProgress);
  const error = useDJSetStore((s) => s.error);
  const fetchSets = useDJSetStore((s) => s.fetchSets);
  const playSet = useDJSetStore((s) => s.playSet);
  const stopSetPlayback = useDJSetStore((s) => s.stopSetPlayback);
  const deleteSet = useDJSetStore((s) => s.deleteSet);

  const userId = useAuthStore((s) => s.user?.id);

  // Fetch sets when panel opens
  useEffect(() => {
    if (open) fetchSets();
  }, [open, fetchSets]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handlePlay = useCallback((id: string) => {
    playSet(id);
  }, [playSet]);

  const handleDelete = useCallback((id: string) => {
    if (confirmDelete === id) {
      deleteSet(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  }, [confirmDelete, deleteSet]);

  const handleLoadMore = useCallback(() => {
    fetchSets({ offset: setList.length });
  }, [fetchSets, setList.length]);

  // Cast to extended type since the API returns playCount/hasMic
  const entries = setList as unknown as SetListEntry[];

  return (
    <div ref={panelRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isRecording}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', cursor: isRecording ? 'not-allowed' : 'pointer',
          opacity: isRecording ? 0.5 : 1,
          background: 'transparent', border: 'none', color: '#ccc', fontSize: 12,
        }}
      >
        <span>Sets</span>
        {total > 0 && (
          <span style={{
            background: '#555', borderRadius: 8, padding: '1px 5px',
            fontSize: 10, minWidth: 16, textAlign: 'center',
          }}>
            {total}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 10000,
          width: 360, maxHeight: 480, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
          borderRadius: 6, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          pointerEvents: 'auto',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 12px', borderBottom: '1px solid var(--color-border)',
          }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>DJ Sets</span>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16,
            }}>
              x
            </button>
          </div>

          {/* Error banner */}
          {error && (
            <div style={{ padding: '6px 12px', background: '#3a1111', color: '#f88', fontSize: 11 }}>
              {error}
            </div>
          )}

          {/* Set list */}
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>
            {entries.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>
                No recorded sets yet
              </div>
            ) : (
              entries.map((s) => {
                const isActive = currentSetId === s.id;
                const isPreloading = isActive && preloadProgress > 0 && preloadProgress < 1;
                const isPlaying = isActive && isPlayingSet && preloadProgress >= 1;

                return (
                  <div key={s.id} style={{
                    padding: '8px 12px', borderBottom: '1px solid var(--color-border)',
                    background: isActive ? 'var(--color-bg-tertiary)' : 'transparent',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 500, fontSize: 12, color: 'var(--color-text)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
                          {s.authorName || 'Anonymous'}
                          {' \u00b7 '}{formatDuration(s.durationMs)}
                          {' \u00b7 '}{s.trackList?.length || 0} tracks
                          {' \u00b7 '}{s.playCount || 0} plays
                          {' \u00b7 '}{formatRelativeDate(s.createdAt)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                        {isPlaying ? (
                          <button onClick={() => stopSetPlayback()} style={{
                            background: '#c33', border: 'none', borderRadius: 3,
                            color: '#fff', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
                          }}>
                            Stop
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePlay(s.id)}
                            disabled={isPlayingSet}
                            style={{
                              background: '#2a6', border: 'none', borderRadius: 3,
                              color: '#fff', padding: '3px 8px', fontSize: 10,
                              cursor: isPlayingSet ? 'not-allowed' : 'pointer',
                              opacity: isPlayingSet && !isActive ? 0.4 : 1,
                            }}
                          >
                            Play
                          </button>
                        )}

                        {userId && userId === s.authorId && (
                          <button
                            onClick={() => handleDelete(s.id)}
                            style={{
                              background: confirmDelete === s.id ? '#c33' : '#333',
                              border: 'none', borderRadius: 3,
                              color: confirmDelete === s.id ? '#fff' : '#888',
                              padding: '3px 6px', fontSize: 10, cursor: 'pointer',
                            }}
                          >
                            {confirmDelete === s.id ? 'Sure?' : 'Del'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Preload progress bar */}
                    {isPreloading && (
                      <div style={{ marginTop: 4, height: 3, background: '#333', borderRadius: 2 }}>
                        <div style={{
                          width: `${preloadProgress * 100}%`, height: '100%',
                          background: '#48f', borderRadius: 2, transition: 'width 0.2s',
                        }} />
                      </div>
                    )}

                    {/* Playback progress bar */}
                    {isPlaying && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ height: 3, background: '#333', borderRadius: 2 }}>
                          <div style={{
                            width: `${playbackProgress * 100}%`, height: '100%',
                            background: '#2a6', borderRadius: 2, transition: 'width 0.3s',
                          }} />
                        </div>
                        <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
                          {formatDuration(playbackElapsed)} / {formatDuration(s.durationMs)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Load more */}
          {setList.length < total && (
            <div style={{ padding: 8, textAlign: 'center', borderTop: '1px solid #333' }}>
              <button onClick={handleLoadMore} style={{
                background: 'none', border: 'none', color: '#48f', fontSize: 11, cursor: 'pointer',
              }}>
                Load more ({total - setList.length} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
