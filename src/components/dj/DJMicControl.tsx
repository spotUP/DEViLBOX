/**
 * DJMicControl — Microphone toggle + gain slider for DJ mode.
 */

import React, { useState, useCallback } from 'react';
import { useDJSetStore } from '@/stores/useDJSetStore';
import { DJMicEngine } from '@/engine/dj/DJMicEngine';

export const DJMicControl: React.FC = () => {
  const micEnabled = useDJSetStore(s => s.micEnabled);
  const micGain = useDJSetStore(s => s.micGain);
  const isRecording = useDJSetStore(s => s.isRecording);
  const [error, setError] = useState<string | null>(null);

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

      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
};
