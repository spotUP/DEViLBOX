/**
 * MAMEOscilloscope - Waveform visualizer for MAME chip synths
 *
 * Subscribes to oscilloscope data from MAMEBaseSynth and renders
 * real-time waveform display with hardware-styled appearance.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { useThemeStore } from '@stores/useThemeStore';

interface MAMEOscilloscopeProps {
  instrumentId: number;
  width?: number;
  height?: number;
  color?: string;
}

export function MAMEOscilloscope({
  instrumentId,
  width,
  height = 120,
  color,
}: MAMEOscilloscopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const oscDataRef = useRef<Float32Array | null>(null);
  const [isActive, setIsActive] = useState(false);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Theme-dependent colors
  const bgColor = isCyanTheme ? '#030808' : '#0a0a0b';
  const gridColor = isCyanTheme ? 'rgba(0, 255, 255, 0.06)' : 'rgba(100, 100, 120, 0.1)';
  const centerLineColor = isCyanTheme ? 'rgba(0, 255, 255, 0.15)' : 'rgba(100, 100, 120, 0.2)';
  const waveColor = color || (isCyanTheme ? '#00ffff' : '#00d4aa');
  const panelBg = isCyanTheme
    ? 'linear-gradient(180deg, #0a1515 0%, #050c0c 100%)'
    : 'linear-gradient(180deg, #252525 0%, #1a1a1a 100%)';

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Resize canvas for crisp display
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    // Clear
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    const pad = 4;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;

    // Draw grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = pad + (innerH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    }
    for (let i = 1; i < 8; i++) {
      const x = pad + (innerW * i) / 8;
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, h - pad);
      ctx.stroke();
    }

    // Draw center line
    ctx.strokeStyle = centerLineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, h / 2);
    ctx.lineTo(w - pad, h / 2);
    ctx.stroke();

    // Draw waveform
    const data = oscDataRef.current;
    if (data && data.length > 0) {
      ctx.strokeStyle = waveColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const samples = data.length;
      const step = innerW / samples;

      for (let i = 0; i < samples; i++) {
        const x = pad + i * step;
        // Clamp and scale sample value
        const sample = Math.max(-1, Math.min(1, data[i]));
        const y = pad + innerH / 2 - sample * (innerH / 2 - 4);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Glow effect
      ctx.strokeStyle = waveColor;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      // Draw flat line when no data
      ctx.strokeStyle = waveColor;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, h / 2);
      ctx.lineTo(w - pad, h / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, [bgColor, gridColor, centerLineColor, waveColor]);

  useEffect(() => {
    const engine = getToneEngine();
    const synth = engine.getMAMEChipSynth(instrumentId);

    if (!synth) {
      setIsActive(false);
      return;
    }

    setIsActive(true);

    // Subscribe to oscilloscope data
    const unsubscribe = synth.onOscData((data: Float32Array) => {
      oscDataRef.current = data;
    });

    // Start animation loop
    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      unsubscribe();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [instrumentId, draw]);

  if (!isActive) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="rounded-lg overflow-hidden"
      style={{
        background: panelBg,
        border: isCyanTheme ? '1px solid rgba(0, 255, 255, 0.2)' : '1px solid rgba(255, 255, 255, 0.08)',
        width: width || '100%',
      }}
    >
      <div className="px-2 py-1 flex items-center justify-between border-b"
        style={{ borderColor: isCyanTheme ? 'rgba(0, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)' }}>
        <span className="text-[10px] font-mono uppercase tracking-wider"
          style={{ color: isCyanTheme ? '#00ffff' : '#888' }}>
          Oscilloscope
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height }}
        className="block"
      />
    </div>
  );
}
