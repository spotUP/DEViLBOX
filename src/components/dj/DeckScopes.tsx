/**
 * DeckScopes - Per-channel waveform oscilloscope display + mute/fx-target toggles
 *
 * 4 per-channel scopes + 1 combined "ALL" scope + MUTE/FX mode chip,
 * horizontally stacked. Click semantics branch on `channelModeUI`:
 *   'mute' → click toggles mute, shift=solo. Muted channels dim red.
 *   'fx'   → click toggles fx-target, shift=solo-in-fx-set. Targets get
 *            an amber ring. Picked channels are where DUB moves / EQ /
 *            filter sweeps get routed. Audio routing lands in a follow-up
 *            plan — for now the selection is visible + stored.
 * Click ALL → in mute mode: enable every channel. In fx mode: clear targets.
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
  /** True when this channel is in the deck's fx-target set (only applies in 'fx' mode). */
  fxTargeted: boolean;
  /** Click-mode — drives the visual ring colour and the overlay glyph. */
  mode: 'mute' | 'fx';
  onClick: (e: React.MouseEvent) => void;
}

const ScopeCanvas: React.FC<ScopeCanvasProps> = ({ deckId, channel, size, muted, fxTargeted, mode, onClick }) => {
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
    // Amber highlight — used to mark fx-target channels in fx mode.
    // Matches the `accent-highlight` token used elsewhere on the dub UI
    // (bassLock chip, pedal glow) so the UX is colour-consistent.
    const highlightColor = cs.getPropertyValue('--color-accent-highlight').trim() || '#f59e0b';

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

    // FX-target ring — amber outline + corner "FX" glyph. Only drawn in
    // fx mode so mute-mode viewers never see the extra chrome.
    if (mode === 'fx' && !isAll) {
      if (fxTargeted) {
        ctx.strokeStyle = highlightColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, size - 2, size - 2);
        ctx.fillStyle = highlightColor;
        ctx.globalAlpha = 0.9;
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('FX', size - 3, 3);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
      } else {
        // Dim outline — advertises the target-affordance without committing.
        ctx.strokeStyle = highlightColor;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 1;
        ctx.strokeRect(1, 1, size - 2, size - 2);
        ctx.globalAlpha = 1;
      }
    }

    // Keep scheduling only while playing or during the ~1s idle cool-down
    if (isPlaying || idleFramesRef.current <= 60) {
      rafRef.current = requestAnimationFrame(draw);
    }
    // When paused for >60 frames the loop stops. It restarts automatically
    // whenever `draw` identity changes (muted / fxTargeted / mode / size) via the useEffect.
  }, [deckId, channel, size, muted, isAll, isPlaying, viz, mode, fxTargeted]);

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
  const fxTargetChannels = useDJStore((s) => s.decks[deckId].fxTargetChannels);
  const mode = useDJStore((s) => s.decks[deckId].channelModeUI);

  const isChannelEnabled = (index: number): boolean => (channelMask & (1 << index)) !== 0;
  const isFxTargeted = (index: number): boolean => fxTargetChannels.has(index);

  const handleChannelClick = useCallback((channelIndex: number, e: React.MouseEvent) => {
    const store = useDJStore.getState();
    const currentMode = store.decks[deckId].channelModeUI;
    if (currentMode === 'fx') {
      // fx mode: toggle / solo in the fx-target set.
      if (e.shiftKey) {
        store.setFxTarget(deckId, [channelIndex]);
      } else {
        store.toggleFxTarget(deckId, channelIndex);
      }
      return;
    }
    // mute mode (default): toggle / solo the mute mask.
    if (e.shiftKey) {
      store.setAllDeckChannels(deckId, false);
      store.toggleDeckChannel(deckId, channelIndex);
    } else {
      store.toggleDeckChannel(deckId, channelIndex);
    }
  }, [deckId]);

  const handleAllClick = useCallback(() => {
    const store = useDJStore.getState();
    if (store.decks[deckId].channelModeUI === 'fx') {
      // "ALL" in fx mode = clear the target set (back to whole-deck semantic).
      store.clearFxTarget(deckId);
    } else {
      store.setAllDeckChannels(deckId, true);
    }
  }, [deckId]);

  const handleModeToggle = useCallback(() => {
    const store = useDJStore.getState();
    const next: 'mute' | 'fx' = store.decks[deckId].channelModeUI === 'mute' ? 'fx' : 'mute';
    store.setChannelMode(deckId, next);
  }, [deckId]);

  const isFxMode = mode === 'fx';

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {Array.from({ length: NUM_CHANNELS }, (_, i) => (
        <ScopeCanvas
          key={i}
          deckId={deckId}
          channel={i}
          size={size}
          muted={!isChannelEnabled(i)}
          fxTargeted={isFxTargeted(i)}
          mode={mode}
          onClick={(e) => handleChannelClick(i, e)}
        />
      ))}
      <ScopeCanvas
        deckId={deckId}
        channel={-1}
        size={size}
        muted={false}
        fxTargeted={false}
        mode={mode}
        onClick={handleAllClick}
      />
      {/*
        Mode chip — toggles click semantic between MUTE (today's behaviour,
        writes channelMask) and FX (writes fxTargetChannels). Sits next to
        the ALL button so the affordance is co-located with the cluster it
        modifies.
      */}
      <button
        onClick={handleModeToggle}
        className={`
          flex items-center justify-center font-mono font-bold select-none
          rounded-sm border transition-colors duration-75
          ${isFxMode
            ? 'bg-accent-highlight text-text-inverse border-accent-highlight'
            : 'bg-dark-bgTertiary text-text-secondary border-dark-border hover:bg-dark-bgHover'}
        `}
        style={{ width: 28, height: size, fontSize: 9, letterSpacing: '0.1em' }}
        title={`Click-mode: ${isFxMode ? 'FX TARGET (click = pick FX channels)' : 'MUTE (click = mute/unmute)'} — toggle to switch`}
      >
        {isFxMode ? 'FX' : 'MUT'}
      </button>
    </div>
  );
};
