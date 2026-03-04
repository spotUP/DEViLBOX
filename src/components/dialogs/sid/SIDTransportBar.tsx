/**
 * SIDTransportBar — DOM transport controls for SID playback.
 * Play/Pause, Stop, FF, Loop, subtune nav, volume, time display + scrub bar.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, Square, SkipBack, SkipForward, Repeat, Volume2,
} from 'lucide-react';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useAudioStore } from '@stores/useAudioStore';

interface SIDTransportBarProps {
  className?: string;
}

export const SIDTransportBar: React.FC<SIDTransportBarProps> = ({ className }) => {
  const { sidMetadata, setSidMetadata } = useTrackerStore(
    useShallow((s) => ({ sidMetadata: s.sidMetadata, setSidMetadata: s.setSidMetadata }))
  );
  const masterVolume = useAudioStore((s) => s.masterVolume);
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume);

  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const duration = 0; // Duration tracking to be implemented per-engine
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getEngine = useCallback(async () => {
    const { getTrackerReplayer } = await import('@engine/TrackerReplayer');
    return getTrackerReplayer().getC64SIDEngine();
  }, []);

  // Poll playback state
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const engine = await getEngine();
      if (engine) {
        setPlaying(engine.isPlaying());
      }
    }, 250);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [getEngine]);

  const handlePlay = useCallback(async () => {
    const engine = await getEngine();
    if (!engine) return;
    if (engine.isPlaying()) {
      engine.pause();
      setPlaying(false);
    } else {
      engine.resume();
      setPlaying(true);
    }
  }, [getEngine]);

  const handleStop = useCallback(async () => {
    const engine = await getEngine();
    if (!engine) return;
    engine.stop();
    setPlaying(false);
    setElapsed(0);
  }, [getEngine]);

  const handlePrevSub = useCallback(async () => {
    if (!sidMetadata || sidMetadata.currentSubsong <= 0) return;
    const engine = await getEngine();
    if (!engine) return;
    const next = sidMetadata.currentSubsong - 1;
    engine.setSubsong(next);
    setSidMetadata({ ...sidMetadata, currentSubsong: next });
  }, [sidMetadata, setSidMetadata, getEngine]);

  const handleNextSub = useCallback(async () => {
    if (!sidMetadata || sidMetadata.currentSubsong >= sidMetadata.subsongs - 1) return;
    const engine = await getEngine();
    if (!engine) return;
    const next = sidMetadata.currentSubsong + 1;
    engine.setSubsong(next);
    setSidMetadata({ ...sidMetadata, currentSubsong: next });
  }, [sidMetadata, setSidMetadata, getEngine]);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;

  const subsongLabel = sidMetadata
    ? `Sub ${sidMetadata.currentSubsong + 1}/${sidMetadata.subsongs}`
    : 'Sub 1/1';

  return (
    <div className={`flex items-center gap-3 px-4 py-2 border-b border-dark-border/50 bg-dark-bgSecondary/30 ${className ?? ''}`}>
      {/* Subtune nav */}
      <button
        onClick={handlePrevSub}
        className="p-1 text-text-muted hover:text-text-primary transition-colors"
        title="Previous subtune"
      >
        <SkipBack size={14} />
      </button>

      {/* Play / Pause */}
      <button
        onClick={handlePlay}
        className="p-1 text-text-muted hover:text-text-primary transition-colors"
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>

      {/* Stop */}
      <button
        onClick={handleStop}
        className="p-1 text-text-muted hover:text-text-primary transition-colors"
        title="Stop"
      >
        <Square size={14} />
      </button>

      {/* Fast-forward (next subtune) */}
      <button
        onClick={handleNextSub}
        className="p-1 text-text-muted hover:text-text-primary transition-colors"
        title="Next subtune"
      >
        <SkipForward size={14} />
      </button>

      {/* Loop */}
      <button
        onClick={() => setLooping(!looping)}
        className={`p-1 transition-colors ${looping ? 'text-blue-400' : 'text-text-muted hover:text-text-primary'}`}
        title="Loop"
      >
        <Repeat size={14} />
      </button>

      {/* Subtune counter */}
      <span className="text-xs font-mono text-text-muted whitespace-nowrap">
        {subsongLabel}
      </span>

      {/* Time scrub bar */}
      <div className="flex-1 h-1 bg-dark-border rounded cursor-pointer relative group">
        <div
          className="absolute inset-y-0 left-0 bg-blue-500/60 rounded"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Time display */}
      <span className="text-xs font-mono text-text-muted whitespace-nowrap">
        {formatTime(elapsed)}/{formatTime(duration)}
      </span>

      {/* Volume */}
      <Volume2 size={14} className="text-text-muted shrink-0" />
      <input
        type="range"
        min={-60}
        max={0}
        step={1}
        value={masterVolume}
        onChange={(e) => setMasterVolume(Number(e.target.value))}
        className="w-20"
        title={`Volume: ${masterVolume} dB`}
      />
    </div>
  );
};
