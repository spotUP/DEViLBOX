/**
 * DJSetRecordButton — Record/stop button for DJ set recording.
 *
 * Shows elapsed duration while recording. On stop, prompts for a name
 * and saves the set to the server.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useDJSetStore } from '@/stores/useDJSetStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { DJSetRecorder } from '@/engine/dj/recording/DJSetRecorder';
import { saveDJSet, uploadBlob } from '@/lib/djSetApi';
import type { DJSet } from '@/engine/dj/recording/DJSetFormat';

let _activeRecorder: DJSetRecorder | null = null;

/** Get the active recorder (for DJEngine to attach) */
export function getActiveRecorder(): DJSetRecorder | null {
  return _activeRecorder;
}

export const DJSetRecordButton: React.FC = () => {
  const isRecording = useDJSetStore(s => s.isRecording);
  const recordingDuration = useDJSetStore(s => s.recordingDuration);
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const isPlayingSet = useDJSetStore(s => s.isPlayingSet);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<number>(0);

  // Duration update timer
  useEffect(() => {
    if (!isRecording) return;
    timerRef.current = window.setInterval(() => {
      if (_activeRecorder) {
        useDJSetStore.getState().setRecordingDuration(_activeRecorder.elapsed() / 1000);
      }
    }, 250);
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  const handleToggle = async () => {
    if (isRecording) {
      // Stop recording
      if (!_activeRecorder) return;
      const name = prompt('Name your DJ set:', `DJ Set ${new Date().toLocaleString()}`);
      if (!name) return; // cancelled

      const set: DJSet = _activeRecorder.stopRecording(name, user?.id || 'local', user?.username || 'DJ');

      // Detach from DJEngine
      try {
        const { getDJEngineIfActive } = await import('@/engine/dj/DJEngine');
        const engine = getDJEngineIfActive();
        if (engine) engine.recorder = null;
      } catch { /* not active */ }

      _activeRecorder = null;
      useDJSetStore.getState().setRecording(false);
      useDJSetStore.getState().setRecordingDuration(0);

      // Upload embedded blobs for non-Modland tracks
      if (token) {
        setSaving(true);
        try {
          // Upload local tracks as blobs
          const { getDJEngine } = await import('../../engine/dj/DJEngine');
          const engine = getDJEngine();

          for (const track of set.metadata.trackList) {
            if (track.source.type === 'local') {
              // Find which deck has this track loaded
              for (const deckId of ['A', 'B', 'C'] as const) {
                try {
                  const deck = engine.getDeck(deckId);
                  const bytes = deck.audioPlayer?.getOriginalFileBytes?.();
                  if (bytes) {
                    const blob = new Blob([bytes], { type: 'application/octet-stream' });
                    const { id: blobId } = await uploadBlob(blob, track.fileName);
                    const originalSource = { ...track.source };
                    (track as any).source = { type: 'embedded', blobId, originalSource };

                    // Rewrite matching load events
                    for (const evt of set.events) {
                      if (evt.type === 'load' && evt.values?.fileName === track.fileName) {
                        (evt.values as any).source = track.source;
                      }
                    }
                    break; // Found the deck, move to next track
                  }
                } catch { /* deck might not exist */ }
              }
            }
          }

          // Upload mic recording if present
          try {
            const { getDJEngineIfActive: getEng } = await import('@/engine/dj/DJEngine');
            const eng = getEng();
            if (eng?.mic?.isRecording) {
              const micBlob = eng.mic.stopRecording();
              if (micBlob && micBlob.size > 0) {
                const { id } = await uploadBlob(micBlob, 'mic-recording.webm');
                set.micAudioId = id;
              }
            }
          } catch { /* no mic */ }

          await saveDJSet(set);
          useDJSetStore.getState().fetchSets();
          console.log('[DJSetRecord] Set saved:', set.metadata.name);
        } catch (err) {
          console.error('[DJSetRecord] Save failed:', err);
          alert('Failed to save DJ set to server. Set recorded locally.');
        } finally {
          setSaving(false);
        }
      }
    } else {
      // Start recording
      _activeRecorder = new DJSetRecorder();
      _activeRecorder.startRecording();

      // Attach to DJEngine
      try {
        const { getDJEngineIfActive } = await import('@/engine/dj/DJEngine');
        const engine = getDJEngineIfActive();
        if (engine) engine.recorder = _activeRecorder;
      } catch { /* not active */ }

      useDJSetStore.getState().setRecording(true);
      useDJSetStore.getState().setRecordingStartTime(Date.now());
    }
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
  };

  return (
    <button
      onClick={handleToggle}
      disabled={saving || isPlayingSet}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all
        ${isRecording
          ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
          : 'bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-secondary hover:text-text-primary'
        }
        ${saving ? 'opacity-50 cursor-wait' : isPlayingSet ? 'opacity-40 cursor-not-allowed' : ''}
      `}
      title={isRecording ? 'Stop recording' : 'Record DJ set'}
    >
      <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`} />
      {saving ? 'Saving...' : isRecording ? formatDuration(recordingDuration) : 'REC'}
    </button>
  );
};
