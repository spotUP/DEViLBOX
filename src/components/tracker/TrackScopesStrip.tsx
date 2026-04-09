/**
 * TrackScopesStrip — Renoise-style per-channel mini oscilloscopes.
 * Sits between the toolbar and pattern editor.
 * Aligns with actual pattern editor channel columns via shared channelLayout.
 * Waveform-only — shows oscilloscope data when available, flat line otherwise.
 */

import React, { useEffect, useRef, memo, useCallback } from 'react';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useTransportStore } from '@stores/useTransportStore';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { useMixerStore } from '@stores/useMixerStore';
import { useThemeStore } from '@stores/useThemeStore';
import { channelLayout } from './channelLayout';

const STRIP_HEIGHT = 36;

export const TrackScopesStrip: React.FC = memo(() => {
  const { patterns, currentPatternIndex } = useTrackerStore(useShallow(s => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
  })));
  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;
  const isPlaying = useTransportStore(s => s.isPlaying);
  const oscActive = useOscilloscopeStore(s => s.isActive);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const numChRef = useRef(numChannels);
  const isPlayingRef = useRef(isPlaying);
  const oscActiveRef = useRef(oscActive);

  useEffect(() => { numChRef.current = numChannels; }, [numChannels]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { oscActiveRef.current = oscActive; }, [oscActive]);

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
      }
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const drawWaveform = useCallback((
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    data: Int16Array,
    color: string,
  ) => {
    const midY = y + h / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const step = data.length / w;
    for (let px = 0; px < w; px++) {
      const si = Math.floor(px * step);
      const val = data[si] / 32768.0;
      const py = midY - val * (h / 2) * 0.85;
      if (px === 0) ctx.moveTo(x + px, py);
      else ctx.lineTo(x + px, py);
    }
    ctx.stroke();
  }, []);

  // Animation loop
  useEffect(() => {
    let lastTime = 0;
    const FPS_INTERVAL = 1000 / 30;

    const tick = (now: number) => {
      animRef.current = requestAnimationFrame(tick);

      if (now - lastTime < FPS_INTERVAL) return;
      lastTime = now;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;
      if (cw < 10 || ch < 10) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const theme = useThemeStore.getState().getCurrentTheme().colors;

      // Background — match pattern editor
      ctx.fillStyle = theme.bgSecondary;
      ctx.fillRect(0, 0, cw, ch);

      const nc = numChRef.current;
      const useOsc = oscActiveRef.current;

      const layout = channelLayout;
      const hasLayout = layout.numChannels > 0 && layout.offsets.length >= nc;
      const scrollX = layout.scrollLeft;

      const oscSnapshot = useOsc ? useOscilloscopeStore.getState().channelData : null;
      const mixState = useMixerStore.getState().channels;
      const trackerState = useTrackerStore.getState();
      const patternChannels = trackerState.patterns[trackerState.currentPatternIndex]?.channels;

      for (let i = 0; i < nc; i++) {
        let x: number, w: number;
        if (hasLayout) {
          x = layout.offsets[i] - scrollX;
          w = layout.widths[i] - 1;
        } else {
          const equalW = Math.max(40, (cw - 4) / nc - 1);
          x = 2 + i * (equalW + 1);
          w = equalW;
        }

        if (x + w < 0 || x > cw) continue;

        const clipX = Math.max(0, x);
        const clipW = Math.min(cw, x + w) - clipX;
        if (clipW < 4) continue;

        const y = 1;
        const h = ch - 2;
        const chColor = patternChannels?.[i]?.color || theme.accent;
        const isMuted = mixState[i]?.muted ?? false;
        const color = isMuted ? theme.textMuted : chColor;

        // Scope cell background
        ctx.fillStyle = theme.bg;
        ctx.fillRect(clipX, y, clipW, h);

        // Center line
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(clipX, y + h / 2);
        ctx.lineTo(clipX + clipW, y + h / 2);
        ctx.stroke();

        // Waveform
        if (useOsc && oscSnapshot && oscSnapshot[i] && oscSnapshot[i]!.length > 0) {
          drawWaveform(ctx, x, y, w, h, oscSnapshot[i]!, color);
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
        ctx.fillText(label, clipX + 3, y + 2);
        ctx.globalAlpha = 1;
      }

      // Bottom border
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, ch - 0.5);
      ctx.lineTo(cw, ch - 0.5);
      ctx.stroke();
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawWaveform]);

  return (
    <div className="flex-shrink-0 border-b border-dark-border overflow-hidden" style={{ height: STRIP_HEIGHT }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
    </div>
  );
});

TrackScopesStrip.displayName = 'TrackScopesStrip';

