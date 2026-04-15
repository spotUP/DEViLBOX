/**
 * DeckScopes - Per-channel waveform oscilloscope display + mute toggles
 *
 * 4 per-channel scopes + 1 combined "ALL" scope, horizontally stacked.
 * Click a scope to mute/unmute that channel. Shift+click to solo.
 * Click ALL to enable all channels. Muted channels dim the waveform.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { useDeckVisualizationData } from '@/hooks/dj/useDeckVisualizationData';

interface DeckScopesProps {
  deckId: 'A' | 'B' | 'C';
  /** Size of each scope (matches turntable) */
  size?: number;
}

const NUM_CHANNELS = 4;

interface ScopeCanvasProps {
  deckId: 'A' | 'B' | 'C';
  /** Channel index 0-3, or -1 for ALL */
  channel: number;
  size: number;
  muted: boolean;
  onClick: (e: React.MouseEvent) => void;
}

const ScopeCanvas: React.FC<ScopeCanvasProps> = ({ deckId, channel, size, muted, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  // Count consecutive idle frames so we can stop rAF when not playing
  const idleFramesRef = useRef<number>(0);
  const isAll = channel === -1;
  const viz = useDeckVisualizationData(deckId);
  // Subscribe to isPlaying so the rAF loop restarts when the deck starts playing
  // (after having been stopped and idle for >60 frames)
  const isPlaying = useDJStore((s) => s.decks[deckId]?.isPlaying ?? false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Idle guard: count frames since last play. After 60 frames (~1 sec at 60fps)
    // the rAF loop stops (see reschedule logic at end of draw).
    // isPlaying is subscribed above — when deck starts playing React re-renders,
    // the draw callback changes identity, and useEffect restarts the loop.
    if (!isPlaying) {
      idleFramesRef.current++;
    } else {
      idleFramesRef.current = 0;
    }

    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cs = getComputedStyle(canvas);
    const borderColor = cs.getPropertyValue('--color-border').trim() || '#581014';
    const successColor = cs.getPropertyValue('--color-success').trim() || '#10b981';
    const mutedColor = cs.getPropertyValue('--color-text-muted').trim() || '#686060';
    const accentColor = cs.getPropertyValue('--color-accent').trim() || '#ef4444';

    // Background — transparent, inherits from parent
    ctx.clearRect(0, 0, size, size);

    // Center line
    const midY = size / 2;
    ctx.beginPath();
    ctx.moveTo(1, midY);
    ctx.lineTo(size - 1, midY);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    if (isPlaying) {
      if (isAll) {
        // ALL: draw full merged waveform (256 samples)
        const waveform = viz.getWaveform();
        if (waveform && waveform.length >= 256) {
          ctx.beginPath();
          for (let i = 0; i < 256; i++) {
            const x = 1 + (i / 255) * (size - 2);
            const sample = waveform[i] || 0;
            const y = midY - sample * (size / 2 - 2);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = successColor;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      } else {
        // Per-channel: use dedicated per-channel analyser data
        const channelWaveforms = viz.getChannelWaveforms();
        const chData = channelWaveforms?.[channel];
        if (chData && chData.length > 0) {
          const len = chData.length;
          ctx.beginPath();
          for (let i = 0; i < len; i++) {
            const x = 1 + (i / (len - 1)) * (size - 2);
            const sample = chData[i] || 0;
            const y = midY - sample * (size / 2 - 2);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = muted ? mutedColor : successColor;
          ctx.lineWidth = 1;
          ctx.globalAlpha = muted ? 0.3 : 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    // Channel label
    ctx.fillStyle = muted ? accentColor : mutedColor;
    ctx.globalAlpha = muted ? 0.8 : 0.5;
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(isAll ? 'ALL' : `CH${channel + 1}`, 3, 3);
    ctx.globalAlpha = 1;

    // Muted indicator
    if (muted && !isAll) {
      ctx.fillStyle = accentColor;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 1;
    }

    // Keep scheduling only while playing or during the ~1s idle cool-down
    if (isPlaying || idleFramesRef.current <= 60) {
      rafRef.current = requestAnimationFrame(draw);
    }
    // When paused for >60 frames the loop stops. It restarts automatically
    // whenever `draw` identity changes (muted prop, size, etc) via the useEffect.
  }, [deckId, channel, size, muted, isAll, isPlaying, viz]);

  useEffect(() => {
    // Reset idle counter so we always draw at least ~1s worth of frames on mount
    idleFramesRef.current = 0;
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="block rounded-sm flex-shrink-0 cursor-pointer"
      style={{ width: size, height: size }}
      onClick={onClick}
      title={isAll ? 'Enable all channels' : `CH${channel + 1} — click to mute/unmute, shift+click to solo`}
    />
  );
};

export const DeckScopes: React.FC<DeckScopesProps> = ({ deckId, size = 64 }) => {
  const channelMask = useDJStore((s) => s.decks[deckId].channelMask);

  const isChannelEnabled = (index: number): boolean => (channelMask & (1 << index)) !== 0;

  const handleChannelClick = useCallback((channelIndex: number, e: React.MouseEvent) => {
    const store = useDJStore.getState();
    if (e.shiftKey) {
      // Solo: disable all, enable only this one
      store.setAllDeckChannels(deckId, false);
      store.toggleDeckChannel(deckId, channelIndex);
    } else {
      store.toggleDeckChannel(deckId, channelIndex);
    }
  }, [deckId]);

  const handleAllClick = useCallback(() => {
    useDJStore.getState().setAllDeckChannels(deckId, true);
  }, [deckId]);

  return (
    <div className="flex gap-1 flex-shrink-0">
      {Array.from({ length: NUM_CHANNELS }, (_, i) => (
        <ScopeCanvas
          key={i}
          deckId={deckId}
          channel={i}
          size={size}
          muted={!isChannelEnabled(i)}
          onClick={(e) => handleChannelClick(i, e)}
        />
      ))}
      <ScopeCanvas
        deckId={deckId}
        channel={-1}
        size={size}
        muted={false}
        onClick={handleAllClick}
      />
    </div>
  );
};
