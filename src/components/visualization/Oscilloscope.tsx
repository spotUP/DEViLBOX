/**
 * Oscilloscope - Canvas-based waveform and spectrum visualizer
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAudioStore, useTransportStore } from '@stores';
import { useThemeStore } from '@stores/useThemeStore';

interface OscilloscopeProps {
  width?: number | 'auto';
  height?: number;
  mode?: 'waveform' | 'spectrum';
}

export const Oscilloscope: React.FC<OscilloscopeProps> = ({
  width = 800,
  height = 120,
  mode = 'waveform',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const { analyserNode, fftNode } = useAudioStore();
  const [measuredWidth, setMeasuredWidth] = useState(800);

  // Derived actual width: use prop when numeric, measured when 'auto'
  const actualWidth = width !== 'auto' ? width : measuredWidth;

  // Handle responsive width measurement via ResizeObserver
  useEffect(() => {
    if (width !== 'auto') return;

    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      setMeasuredWidth(Math.floor(rect.width));
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [width]);

  const { currentThemeId } = useThemeStore();
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const isPlaying = useTransportStore((state) => state.isPlaying);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution
    canvas.width = actualWidth;
    canvas.height = height;

    // PERF: Don't run animation loop when not playing - just draw static background
    if (!isPlaying) {
      // Draw static empty state
      const bgColor = isCyanTheme ? '#030808' : '#0a0a0b';
      const gridColor = isCyanTheme ? 'rgba(0, 255, 255, 0.08)' : '#1a1a1d';
      const centerLineColor = isCyanTheme ? 'rgba(0, 255, 255, 0.2)' : 'rgba(0, 212, 170, 0.2)';

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, actualWidth, height);

      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      for (let i = 0; i < actualWidth; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
      }
      for (let i = 0; i < height; i += 30) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(actualWidth, i);
        ctx.stroke();
      }
      ctx.strokeStyle = centerLineColor;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(actualWidth, height / 2);
      ctx.stroke();
      return; // No animation loop when not playing
    }

    let isRunning = true;
    let lastFrameTime = 0;
    const FRAME_INTERVAL = 1000 / 30; // PERF: Limit to 30fps - oscilloscope doesn't need 60fps

    // Theme-aware colors (cached once, not recreated per frame)
    const bgColor = isCyanTheme ? '#030808' : '#0a0a0b';
    const gridColor = isCyanTheme ? 'rgba(0, 255, 255, 0.08)' : '#1a1a1d';
    const waveColor1 = isCyanTheme ? '#00ffff' : '#00d4aa';
    const waveColor2 = isCyanTheme ? '#00ffff' : '#7c3aed';
    const centerLineColor = isCyanTheme ? 'rgba(0, 255, 255, 0.2)' : 'rgba(0, 212, 170, 0.2)';

    // PERF: Pre-create gradient once instead of every frame
    const waveformGradient = ctx.createLinearGradient(0, 0, actualWidth, 0);
    waveformGradient.addColorStop(0, waveColor1);
    waveformGradient.addColorStop(0.5, waveColor1);
    waveformGradient.addColorStop(1, waveColor2);

    // PERF: Pre-compute spectrum colors to avoid string allocation per bar per frame
    const spectrumColors: string[] = [];
    if (mode === 'spectrum') {
      for (let i = 0; i < 1024; i++) {
        if (isCyanTheme) {
          // Will be updated per-frame based on amplitude
          spectrumColors.push('rgba(0, 255, 255, 0.75)');
        } else {
          const hue = 160 + (i / 1024) * 120;
          spectrumColors.push(`hsla(${hue}, 80%, 50%, 0.8)`);
        }
      }
    }

    const draw = (timestamp: number) => {
      if (!isRunning || !canvas || !ctx) return;

      // PERF: Limit to target FPS
      const elapsed = timestamp - lastFrameTime;
      if (elapsed < FRAME_INTERVAL) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);

      // Clear canvas with dark background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, actualWidth, height);

      // Draw subtle grid
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;

      // Vertical grid lines
      for (let i = 0; i < actualWidth; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
      }

      // Horizontal grid lines
      for (let i = 0; i < height; i += 30) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(actualWidth, i);
        ctx.stroke();
      }

      if (mode === 'waveform' && analyserNode) {
        // Draw waveform
        const waveform = analyserNode.getValue() as Float32Array;

        // Use cached gradient
        ctx.strokeStyle = waveformGradient;
        ctx.lineWidth = 2;
        ctx.beginPath();

        const sliceWidth = actualWidth / waveform.length;
        let x = 0;

        for (let i = 0; i < waveform.length; i++) {
          const v = (waveform[i] + 1) / 2; // Normalize -1 to 1 -> 0 to 1
          const y = v * height;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.stroke();

        // Draw center line
        ctx.strokeStyle = centerLineColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(actualWidth, height / 2);
        ctx.stroke();

      } else if (mode === 'spectrum' && fftNode) {
        // Draw frequency spectrum
        const spectrum = fftNode.getValue() as Float32Array;

        const barWidth = actualWidth / spectrum.length;
        let x = 0;

        for (let i = 0; i < spectrum.length; i++) {
          // Convert dB to 0-1 range (-100dB to 0dB)
          const db = spectrum[i];
          const normalized = (db + 100) / 100;
          const barHeight = normalized * height;

          // Use pre-computed colors (cyan theme still needs per-bar alpha)
          if (isCyanTheme) {
            // For cyan, vary alpha based on amplitude
            ctx.globalAlpha = 0.5 + (normalized * 0.5);
            ctx.fillStyle = 'rgb(0, 255, 255)';
          } else {
            ctx.fillStyle = spectrumColors[i] || spectrumColors[spectrumColors.length - 1];
          }

          ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

          x += barWidth;
        }
        ctx.globalAlpha = 1; // Reset alpha
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      isRunning = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [actualWidth, height, mode, analyserNode, fftNode, isCyanTheme, isPlaying]);

  return (
    <div ref={containerRef} className={width === 'auto' ? 'w-full' : ''}>
      <canvas
        ref={canvasRef}
        style={{ width: width === 'auto' ? '100%' : `${actualWidth}px`, height: `${height}px` }}
      />
    </div>
  );
};
