/**
 * TrackScopesStrip — Renoise-style per-channel mini oscilloscopes/VU strip.
 * Sits between the toolbar and pattern editor.
 * Aligns with actual pattern editor channel columns via shared channelLayout.
 */

import React, { useEffect, useRef, memo, useCallback } from 'react';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useTransportStore } from '@stores/useTransportStore';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { useMixerStore } from '@stores/useMixerStore';
import { useThemeStore } from '@stores/useThemeStore';
import { getToneEngine } from '@engine/ToneEngine';
import { channelLayout } from './channelLayout';

const STRIP_HEIGHT = 40;

/** Per-channel muted accent colors (low-saturation, professional) */
const CH_COLORS = [
  '#5ec4b0', '#5eb0d8', '#6ec88a', '#d87aa8',
  '#8ec86e', '#d8a060', '#a88ad8', '#d89060',
  '#60b4d8', '#80d8b0', '#d8b060', '#d870a0',
  '#60c870', '#7860d8', '#d88888', '#6088d8',
];

/** Smoothed level state per channel */
interface ScopeState {
  level: number;
  peak: number;
  peakAge: number;
}

/** Parse CSS hex color to [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  if (c.length === 3) {
    return [parseInt(c[0]+c[0], 16), parseInt(c[1]+c[1], 16), parseInt(c[2]+c[2], 16)];
  }
  return [parseInt(c.slice(0,2), 16), parseInt(c.slice(2,4), 16), parseInt(c.slice(4,6), 16)];
}

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
  const scopeStates = useRef<ScopeState[]>([]);
  const animRef = useRef<number>(0);
  const numChRef = useRef(numChannels);
  const isPlayingRef = useRef(isPlaying);
  const oscActiveRef = useRef(oscActive);

  useEffect(() => { numChRef.current = numChannels; }, [numChannels]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { oscActiveRef.current = oscActive; }, [oscActive]);

  useEffect(() => {
    scopeStates.current = Array.from({ length: numChannels }, () => ({
      level: 0, peak: 0, peakAge: 0,
    }));
  }, [numChannels]);

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

  const drawLevelBar = useCallback((
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    level: number, peak: number,
    color: string,
  ) => {
    const midY = y + h / 2;
    const barH = level * (h / 2) * 0.85;
    const [r, g, b] = hexToRgb(color);

    // Symmetrical bar from center
    ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
    ctx.fillRect(x + 2, midY - barH, w - 4, barH * 2);

    // Brighter core
    ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
    const coreW = Math.max(2, w * 0.5);
    const coreX = x + (w - coreW) / 2;
    const coreH = barH * 0.6;
    ctx.fillRect(coreX, midY - coreH, coreW, coreH * 2);

    // Peak line
    if (peak > 0.01) {
      const peakY = peak * (h / 2) * 0.85;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, midY - peakY);
      ctx.lineTo(x + w - 2, midY - peakY);
      ctx.moveTo(x + 2, midY + peakY);
      ctx.lineTo(x + w - 2, midY + peakY);
      ctx.stroke();
    }
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

      // Read theme colors
      const theme = useThemeStore.getState().getCurrentTheme().colors;

      // Background
      ctx.fillStyle = theme.bgSecondary;
      ctx.fillRect(0, 0, cw, ch);

      const nc = numChRef.current;
      const playing = isPlayingRef.current;
      const useOsc = oscActiveRef.current;

      // Read shared channel layout from PatternEditorCanvas
      const layout = channelLayout;
      const hasLayout = layout.numChannels > 0 && layout.offsets.length >= nc;
      const scrollX = layout.scrollLeft;

      // Get Tone.js levels for non-WASM engines
      let toneLevels: number[] | null = null;
      if (!useOsc) {
        try {
          toneLevels = getToneEngine().getChannelLevels(nc);
        } catch { /* engine not ready */ }
      }

      const oscSnapshot = useOsc ? useOscilloscopeStore.getState().channelData : null;
      const mixState = useMixerStore.getState().channels;

      // Read channel colors from pattern
      const trackerState = useTrackerStore.getState();
      const patternChannels = trackerState.patterns[trackerState.currentPatternIndex]?.channels;

      for (let i = 0; i < nc; i++) {
        // Use real channel layout if available, otherwise fall back to equal spacing
        let x: number, w: number;
        if (hasLayout) {
          x = layout.offsets[i] - scrollX;
          w = layout.widths[i] - 2; // 2px gap between channels
        } else {
          const equalW = Math.max(40, (cw - 4) / nc - 2);
          x = 2 + i * (equalW + 2);
          w = equalW;
        }

        // Skip if fully off-screen
        if (x + w < 0 || x > cw) continue;

        // Clip to visible area
        const clipX = Math.max(0, x);
        const clipW = Math.min(cw, x + w) - clipX;
        if (clipW < 4) continue;

        const y = 2;
        const h = ch - 4;
        // Use channel color from pattern editor, fall back to palette
        const color = patternChannels?.[i]?.color || CH_COLORS[i % CH_COLORS.length];
        const isMuted = mixState[i]?.muted ?? false;
        const displayColor = isMuted ? theme.textMuted : color;

        // Scope background
        ctx.fillStyle = theme.bg;
        ctx.fillRect(clipX, y, clipW, h);

        // Center line
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(clipX, y + h / 2);
        ctx.lineTo(clipX + clipW, y + h / 2);
        ctx.stroke();

        // Draw content (use full x/w for proper waveform, canvas clips naturally)
        if (useOsc && oscSnapshot && oscSnapshot[i] && oscSnapshot[i]!.length > 0) {
          drawWaveform(ctx, x, y, w, h, oscSnapshot[i]!, displayColor);
        } else if (toneLevels && playing) {
          const rawDb = toneLevels[i] ?? -60;
          const normalized = Math.max(0, Math.min(1, (rawDb + 60) / 60));

          const state = scopeStates.current[i];
          if (state) {
            state.level = state.level * 0.7 + normalized * 0.3;
            if (normalized > state.peak) {
              state.peak = normalized;
              state.peakAge = 0;
            } else {
              state.peakAge++;
              if (state.peakAge > 30) state.peak *= 0.95;
            }
            drawLevelBar(ctx, clipX, y, clipW, h, state.level, state.peak, displayColor);
          }
        } else if (!playing) {
          const state = scopeStates.current[i];
          if (state && state.level > 0.001) {
            state.level *= 0.9;
            state.peak *= 0.95;
            drawLevelBar(ctx, clipX, y, clipW, h, state.level, state.peak, displayColor);
          }
        }

        // Channel label
        const label = (useOsc && useOscilloscopeStore.getState().channelNames[i])
          || mixState[i]?.name
          || `${i + 1}`;
        ctx.fillStyle = isMuted ? theme.textMuted : displayColor;
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = 0.7;
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
  }, [drawWaveform, drawLevelBar]);

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

