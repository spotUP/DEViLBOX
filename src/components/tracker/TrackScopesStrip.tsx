/**
 * TrackScopesStrip — Renoise-style per-channel mini oscilloscopes/VU strip.
 * Sits between the toolbar and pattern editor.
 * Uses oscilloscope store (WASM/Furnace) or channel levels (Tone.js) as data source.
 * Single canvas for performance.
 */

import React, { useEffect, useRef, memo, useCallback } from 'react';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useTransportStore } from '@stores/useTransportStore';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { useMixerStore } from '@stores/useMixerStore';
import { getToneEngine } from '@engine/ToneEngine';

const STRIP_HEIGHT = 40;
const SCOPE_PAD = 2;
const MIN_SCOPE_WIDTH = 40;

/** Per-channel accent colors */
const CH_COLORS = [
  '#00ffcc', '#00ccff', '#44ff88', '#ff44aa',
  '#88ff44', '#ffaa44', '#cc88ff', '#ff8844',
  '#44ccff', '#88ffcc', '#ffcc44', '#ff4488',
  '#44ff44', '#8844ff', '#ff8888', '#4488ff',
];

/** Smoothed level state per channel */
interface ScopeState {
  level: number;
  peak: number;
  peakAge: number;
}

export const TrackScopesStrip: React.FC = memo(() => {
  const { patterns, currentPatternIndex } = useTrackerStore(useShallow(s => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
  })));
  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;
  const isPlaying = useTransportStore(s => s.isPlaying);

  // Oscilloscope store for WASM engines — subscribe to trigger re-render on activity change
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

  // Init scope states
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
    ctx.lineWidth = 1;
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

    // Symmetrical bar from center
    ctx.fillStyle = color + '60';
    ctx.fillRect(x + 2, midY - barH, w - 4, barH * 2);

    // Brighter core
    const coreH = barH * 0.6;
    ctx.fillStyle = color + 'a0';
    ctx.fillRect(x + w * 0.25, midY - coreH, w * 0.5, coreH * 2);

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
    const FPS_INTERVAL = 1000 / 30; // 30fps

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

      // Background
      ctx.fillStyle = '#1a1a1e';
      ctx.fillRect(0, 0, cw, ch);

      const nc = numChRef.current;
      const scopeW = Math.max(MIN_SCOPE_WIDTH, (cw - SCOPE_PAD) / nc - SCOPE_PAD);
      const playing = isPlayingRef.current;
      const useOsc = oscActiveRef.current;

      // Get Tone.js levels for non-WASM engines
      let toneLevels: number[] | null = null;
      if (!useOsc) {
        try {
          toneLevels = getToneEngine().getChannelLevels(nc);
        } catch { /* engine not ready */ }
      }

      // Get oscilloscope data snapshot
      const oscSnapshot = useOsc ? useOscilloscopeStore.getState().channelData : null;
      const mixState = useMixerStore.getState().channels;

      for (let i = 0; i < nc; i++) {
        const x = SCOPE_PAD + i * (scopeW + SCOPE_PAD);
        const y = SCOPE_PAD;
        const w = scopeW;
        const h = ch - SCOPE_PAD * 2;
        const color = CH_COLORS[i % CH_COLORS.length];
        const isMuted = mixState[i]?.muted ?? false;
        const displayColor = isMuted ? '#444' : color;

        // Scope background
        ctx.fillStyle = '#0e0e10';
        ctx.fillRect(x, y, w, h);

        // Center line
        ctx.strokeStyle = '#2a2a30';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y + h / 2);
        ctx.lineTo(x + w, y + h / 2);
        ctx.stroke();

        // Draw content
        if (useOsc && oscSnapshot && oscSnapshot[i] && oscSnapshot[i]!.length > 0) {
          // WASM oscilloscope waveform
          drawWaveform(ctx, x, y, w, h, oscSnapshot[i]!, displayColor);
        } else if (toneLevels && playing) {
          // Tone.js level bar
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
            drawLevelBar(ctx, x, y, w, h, state.level, state.peak, displayColor);
          }
        } else if (!playing) {
          // Decay when stopped
          const state = scopeStates.current[i];
          if (state && state.level > 0.001) {
            state.level *= 0.9;
            state.peak *= 0.95;
            drawLevelBar(ctx, x, y, w, h, state.level, state.peak, displayColor);
          }
        }

        // Channel label
        const label = (useOsc && useOscilloscopeStore.getState().channelNames[i])
          || mixState[i]?.name
          || `${i + 1}`;
        ctx.fillStyle = isMuted ? '#555' : displayColor + '80';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, x + 2, y + 1);
      }

      // Bottom border line
      ctx.strokeStyle = '#2a2a30';
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
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
});

TrackScopesStrip.displayName = 'TrackScopesStrip';
