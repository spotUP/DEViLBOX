/**
 * DJMicControl — Microphone toggle + gain slider for DJ mode.
 *
 * Also hosts the TOAST hold-button. TOAST (kind:'hold') taps the live
 * mic into the dub bus wet chain so the voice picks up echo + spring
 * + tape coloration — MC vocal throw. Only shows when micEnabled.
 */

import React, { useState, useCallback, useRef } from 'react';
import { useDJSetStore } from '@/stores/useDJSetStore';
import { DJMicEngine } from '@/engine/dj/DJMicEngine';
import { fire } from '@/engine/dub/DubRouter';

export const DJMicControl: React.FC = () => {
  const micEnabled = useDJSetStore(s => s.micEnabled);
  const micGain = useDJSetStore(s => s.micGain);
  const isRecording = useDJSetStore(s => s.isRecording);
  const [error, setError] = useState<string | null>(null);
  const [toasting, setToasting] = useState(false);
  // Toast is kind:'hold' — fire() returns {dispose}. Ref so mouse-up
  // releases it deterministically across React re-renders.
  const toastHandleRef = useRef<{ dispose(): void } | null>(null);

  const handleToggle = useCallback(async () => {
    try {
      setError(null);
      const { getDJEngineIfActive } = await import('@/engine/dj/DJEngine');
      const engine = getDJEngineIfActive();
      if (!engine) return;

      const active = await engine.toggleMic();
      useDJSetStore.getState().setMicEnabled(active);

      // Start/stop mic recording if set recording is active
      if (active && isRecording && engine.mic) {
        engine.mic.startRecording();
        useDJSetStore.getState().setMicRecording(true);
      } else if (!active && engine.mic) {
        engine.mic.stopRecording();
        useDJSetStore.getState().setMicRecording(false);
      }
    } catch (err) {
      setError('Mic unavailable');
      console.error('[DJMicControl] Toggle failed:', err);
    }
  }, [isRecording]);

  const startToast = useCallback(() => {
    if (toastHandleRef.current) return;
    const handle = fire('toast', undefined, {}, 'live');
    if (handle) {
      toastHandleRef.current = handle;
      setToasting(true);
    }
  }, []);

  const stopToast = useCallback(() => {
    if (!toastHandleRef.current) return;
    try { toastHandleRef.current.dispose(); } catch { /* ok */ }
    toastHandleRef.current = null;
    setToasting(false);
  }, []);

  const handleGainChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const gain = parseFloat(e.target.value);
    useDJSetStore.getState().setMicGain(gain);
    try {
      const { getDJEngineIfActive } = await import('@/engine/dj/DJEngine');
      const engine = getDJEngineIfActive();
      engine?.mic?.setGain(gain);
    } catch { /* not active */ }
  }, []);

  if (!DJMicEngine.isSupported()) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleToggle}
        className={`
          px-2 py-1 rounded text-xs font-bold transition-all
          ${micEnabled
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-muted'
          }
        `}
        title={micEnabled ? 'Mute microphone' : 'Enable microphone'}
      >
        MIC
      </button>

      {micEnabled && (
        <input
          type="range"
          min="0"
          max="1.5"
          step="0.01"
          value={micGain}
          onChange={handleGainChange}
          className="w-16 h-1 accent-green-500"
          title={`Mic gain: ${Math.round(micGain * 100)}%`}
        />
      )}

      {micEnabled && (
        <button
          onMouseDown={startToast}
          onMouseUp={stopToast}
          onMouseLeave={stopToast}
          onTouchStart={(e) => { e.preventDefault(); startToast(); }}
          onTouchEnd={(e) => { e.preventDefault(); stopToast(); }}
          className={`
            px-2 py-1 rounded text-xs font-bold transition-colors select-none
            ${toasting
              ? 'bg-accent-primary text-text-inverse'
              : 'bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-primary'
            }
          `}
          title="Hold to TOAST — mic voice through dub bus (echo + spring)"
        >
          TOAST
        </button>
      )}

      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
};
