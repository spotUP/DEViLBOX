/**
 * ModuleScopeCanvas — Inline oscilloscope for a SunVox module.
 *
 * Polls `SunVoxEngine.getModuleScope()` at ~20Hz during playback and renders
 * waveform to a tiny canvas. Uses the shared SunVox handle directly since
 * synth instances may be disposed during playback.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { SunVoxEngine } from '@/engine/sunvox/SunVoxEngine';
import { getSharedSunVoxHandle } from '@/engine/sunvox-modular/SunVoxModularSynth';

interface ModuleScopeCanvasProps {
  svModuleId: number;
  width?: number;
  height?: number;
  isPlaying?: boolean;
}

export const ModuleScopeCanvas: React.FC<ModuleScopeCanvasProps> = ({
  svModuleId,
  width = 80,
  height = 28,
  isPlaying = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastPollRef = useRef<number>(0);
  const [isVisible, setIsVisible] = useState(false);
  const POLL_INTERVAL = 50; // ~20Hz

  // Only poll when the canvas is in the viewport (saves WASM calls for off-screen modules)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback((samples: Float32Array) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const mid = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, w, h);

    // Center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    if (samples.length === 0) return;

    // Waveform
    ctx.strokeStyle = '#4ade80'; // green-400
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const step = samples.length / w;
    for (let x = 0; x < w; x++) {
      const i = Math.floor(x * step);
      const y = mid - samples[i] * mid * 0.9;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, []);

  useEffect(() => {
    if (!isPlaying || svModuleId < 0 || !isVisible) {
      draw(new Float32Array(0));
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      const now = performance.now();
      if (now - lastPollRef.current >= POLL_INTERVAL) {
        lastPollRef.current = now;
        try {
          // Use the shared song handle and engine singleton directly
          const handle = getSharedSunVoxHandle();
          if (handle >= 0 && SunVoxEngine.hasInstance()) {
            const engine = SunVoxEngine.getInstance();
            const samples = await engine.getModuleScope(handle, svModuleId);
            if (!cancelled) draw(samples);
          }
        } catch {
          // Engine disposed or error — ignore
        }
      }
      if (!cancelled) {
        rafRef.current = requestAnimationFrame(poll);
      }
    };

    rafRef.current = requestAnimationFrame(poll);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, svModuleId, isVisible, draw]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded border border-dark-border/50"
      style={{ width, height }}
    />
  );
};
