/**
 * TrackScopesStrip — Renoise-style per-channel mini oscilloscopes.
 * Sits between the toolbar and pattern editor.
 * Aligns with actual pattern editor channel columns via shared channelLayout.
 * Shows each channel's own waveform: the WASM engine's channel or the channel's
 * Tone strip (channelScopeSource), master waveform fallback for the rest.
 */

import React, { useEffect, useRef, memo, useCallback } from 'react';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useTransportStore } from '@stores/useTransportStore';
import { useOscilloscopeStore, liveScopeFrame } from '@stores/useOscilloscopeStore';
import { useMixerStore } from '@stores/useMixerStore';
import { useThemeStore } from '@stores/useThemeStore';
import { getToneEngine } from '@engine/ToneEngine';
import { channelLayout, scopeCells, subscribeChannelLayout } from './channelLayout';
import { channelScopeSource } from './channelScopeSource';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';

const STRIP_HEIGHT = 72;

export interface TrackScopesStripProps {
  /** Channels drawn. A format editor (GoatTracker) owns its channels; the tracker pattern is a blank. */
  channelCount?: number;
}

export const TrackScopesStrip: React.FC<TrackScopesStripProps> = memo(({ channelCount }) => {
  const { patterns, currentPatternIndex } = useTrackerStore(useShallow(s => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
  })));
  const pattern = patterns[currentPatternIndex];
  const numChannels = channelCount || pattern?.channels.length || 4;
  const isPlaying = useTransportStore(s => s.isPlaying);
  const oscActive = useOscilloscopeStore(s => s.isActive);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const numChRef = useRef(numChannels);
  const isPlayingRef = useRef(isPlaying);
  const oscActiveRef = useRef(oscActive);
  const analysersEnabledRef = useRef(false);
  const invalidateRef = useRef<() => void>(() => {});

  useEffect(() => { numChRef.current = numChannels; }, [numChannels]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { oscActiveRef.current = oscActive; }, [oscActive]);

  // Enable master analyser for waveform fallback
  useEffect(() => {
    try {
      getToneEngine().enableAnalysers(canvasRef);
      analysersEnabledRef.current = true;
    } catch { /* engine not ready yet */ }
    return () => {
      if (analysersEnabledRef.current) {
        try { getToneEngine().disableAnalysers(canvasRef); } catch { /* ok */ }
      }
    };
  }, []);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const bw = Math.round(width * dpr);
      const bh = Math.round(height * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
        invalidateRef.current();
      }
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const drawWaveform = useCallback((
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    data: Int16Array | Float32Array,
    color: string,
    isFloat: boolean,
  ) => {
    const midY = y + h / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const step = data.length / w;
    for (let px = 0; px < w; px++) {
      const si = Math.floor(px * step);
      const val = isFloat ? (data[si] as number) : (data[si] as number) / 32768.0;
      const py = midY - val * (h / 2) * 0.85;
      if (px === 0) ctx.moveTo(x + px, py);
      else ctx.lineTo(x + px, py);
    }
    ctx.stroke();
  }, []);

  // One frame of the strip. Driven by the shared gated loop at 30 fps while
  // the app sounds; asleep, a mute, a label, a colour or a scroll draws one.
  const drawFrame = useCallback((): boolean => {
      const canvas = canvasRef.current;
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;
      if (cw < 10 || ch < 10) return false;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const theme = useThemeStore.getState().getCurrentTheme().colors;

      ctx.fillStyle = theme.bgSecondary;
      ctx.fillRect(0, 0, cw, ch);

      const nc = numChRef.current;
      const playing = isPlayingRef.current;
      const useOsc = oscActiveRef.current;

      const oscSnapshot = useOsc ? liveScopeFrame() : null;
      const mixState = useMixerStore.getState().channels;
      const trackerState = useTrackerStore.getState();
      const patternChannels = trackerState.patterns[trackerState.currentPatternIndex]?.channels;

      // Fallback: master waveform from Tone.js analyser (for non-WASM formats)
      let masterWaveform: Float32Array | null = null;
      let channelLevels: number[] | null = null;
      if (!useOsc && playing) {
        try {
          if (!analysersEnabledRef.current) {
            getToneEngine().enableAnalysers(canvasRef);
            analysersEnabledRef.current = true;
          }
          const raw = getToneEngine().analyser.getValue();
          if (raw instanceof Float32Array) {
            masterWaveform = raw;
          }
          // Per-channel audio levels to gate master waveform fallback —
          // only show waveform on channels that actually have audio output
          channelLevels = getToneEngine().getChannelLevels(nc);
        } catch { /* engine not ready */ }
      }

      const cells = scopeCells(nc, cw, channelLayout);
      for (let i = 0; i < nc; i++) {
        // Fixed in the strip, in pattern-column order (owner 2026-10-20)
        const { x, w } = cells[i];
        if (w < 2 || x + w <= 0 || x >= cw) continue;

        const y = 1;
        const h = ch - 2;
        const chColor = patternChannels?.[i]?.color || theme.accent;
        const isMuted = mixState[i]?.muted ?? false;
        const color = isMuted ? theme.textMuted : chColor;

        // Scope cell background
        ctx.fillStyle = theme.bg;
        ctx.fillRect(x, y, w, h);

        // Center line
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y + h / 2);
        ctx.lineTo(x + w, y + h / 2);
        ctx.stroke();

        // The channel's own waveform: WASM engine channel or Tone strip
        let stripWaveform: Float32Array | null = null;
        if (playing) {
          try { stripWaveform = getToneEngine().getChannelWaveform(i); } catch { /* engine not ready */ }
        }
        const source = channelScopeSource(useOsc ? oscSnapshot?.[i] : null, stripWaveform);
        if (source) {
          drawWaveform(ctx, x, y, w, h, source.data, color, source.isFloat);
        }
        // Fallback: master waveform on channels with actual audio output only
        else if (masterWaveform && masterWaveform.length > 0) {
          const hasAudio = channelLevels ? channelLevels[i] > 0 : true;
          if (hasAudio) {
            drawWaveform(ctx, x, y, w, h, masterWaveform, color, true);
          }
        }

        // Channel label
        const label = (useOsc && useOscilloscopeStore.getState().channelNames[i])
          || mixState[i]?.name
          || `${i + 1}`;
        ctx.fillStyle = color;
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = 0.5;
        ctx.fillText(label, x + 3, y + 2);
        ctx.globalAlpha = 1;
      }

      // Bottom border
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, ch - 0.5);
      ctx.lineTo(cw, ch - 0.5);
      ctx.stroke();
      return true;
  }, [drawWaveform]);

  const { invalidate } = useVisualizationAnimation({
    onFrame: drawFrame,
    fps: 30,
    redrawOn: [
      useMixerStore.subscribe,
      useTrackerStore.subscribe,
      useThemeStore.subscribe,
      useOscilloscopeStore.subscribe,
      useTransportStore.subscribe,
      subscribeChannelLayout,
    ],
  });
  useEffect(() => { invalidateRef.current = invalidate; }, [invalidate]);

  // Click a channel scope to toggle its mute (solo with modifier): the cell
  // under the pointer, laid out like the drawing (scopeCells).
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nc = numChRef.current;
    if (nc <= 0 || rect.width <= 0) return;
    const px = e.clientX - rect.left;
    const hit = scopeCells(nc, rect.width, channelLayout).findIndex((c) => px >= c.x && px < c.x + c.w);
    if (hit < 0) return;
    const ch = hit;
    const mixer = useMixerStore.getState();
    if (e.altKey || e.metaKey) {
      // Alt/Cmd-click = solo toggle (isolate this channel).
      const soloed = mixer.channels[ch]?.soloed ?? false;
      mixer.setChannelSolo(ch, !soloed);
    } else {
      const muted = mixer.channels[ch]?.muted ?? false;
      mixer.setChannelMute(ch, !muted);
    }
  }, []);

  return (
    <div className="flex-shrink-0 border-b border-dark-border overflow-hidden" style={{ height: STRIP_HEIGHT }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        title="Click a channel to mute · Alt/Cmd-click to solo"
        className="w-full h-full block cursor-pointer"
      />
    </div>
  );
});

TrackScopesStrip.displayName = 'TrackScopesStrip';

