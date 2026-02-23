/**
 * DeckScopes - Per-channel waveform oscilloscope display + mute toggles
 *
 * 4 per-channel scopes + 1 combined "ALL" scope, horizontally stacked.
 * Click a scope to mute/unmute that channel. Shift+click to solo.
 * Click ALL to enable all channels. Muted channels dim the waveform.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { useDJStore } from '@/stores/useDJStore';

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
  const isAll = channel === -1;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
    const bgColor = cs.getPropertyValue('--color-bg').trim() || '#0b0909';
    const borderColor = cs.getPropertyValue('--color-border').trim() || '#2f2525';
    const successColor = cs.getPropertyValue('--color-success').trim() || '#10b981';
    const mutedColor = cs.getPropertyValue('--color-text-muted').trim() || '#686060';
    const accentColor = cs.getPropertyValue('--color-accent').trim() || '#ef4444';

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    // Border — highlight if muted
    ctx.strokeStyle = muted ? accentColor : borderColor;
    ctx.lineWidth = muted ? 1 : 0.5;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

    // Center line
    const midY = size / 2;
    ctx.beginPath();
    ctx.moveTo(1, midY);
    ctx.lineTo(size - 1, midY);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Waveform trace — only fetch live data when playing
    const isPlaying = useDJStore.getState().decks[deckId]?.isPlaying ?? false;
    let waveform: Float32Array | null = null;
    if (isPlaying) {
      try {
        waveform = getDJEngine().getDeck(deckId).getWaveform();
      } catch {
        // Engine not ready
      }
    }

    if (waveform && waveform.length >= 256) {
      if (isAll) {
        // ALL: draw full 256-sample buffer
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
      } else {
        // Per-channel: 64-sample slice
        const samplesPerChannel = 64;
        const offset = channel * samplesPerChannel;
        ctx.beginPath();
        for (let i = 0; i < samplesPerChannel; i++) {
          const x = 1 + (i / (samplesPerChannel - 1)) * (size - 2);
          const sample = waveform[offset + i] || 0;
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

    rafRef.current = requestAnimationFrame(draw);
  }, [deckId, channel, size, muted, isAll]);

  useEffect(() => {
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
