import React, { useRef, useEffect, useState } from 'react';
import { useAudioStore } from '@stores';
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
  const animationRef = useRef<number | null>(null);
  const { analyserNode, fftNode } = useAudioStore();
  const [actualWidth, setActualWidth] = useState(typeof width === 'number' ? width : 800);

  // Handle responsive width
  useEffect(() => {
    if (width !== 'auto') {
      requestAnimationFrame(() => {
        setActualWidth(width);
      });
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      setActualWidth(Math.floor(rect.width));
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [width]);

  const { currentThemeId } = useThemeStore();
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution
    canvas.width = actualWidth;
    canvas.height = height;

    let isRunning = true;

    // Theme-aware colors
    const bgColor = isCyanTheme ? '#030808' : '#0a0a0b';
    const gridColor = isCyanTheme ? 'rgba(0, 255, 255, 0.08)' : '#1a1a1d';
    const waveColor1 = isCyanTheme ? '#00ffff' : '#00d4aa';
    const waveColor2 = isCyanTheme ? '#00ffff' : '#7c3aed';
    const centerLineColor = isCyanTheme ? 'rgba(0, 255, 255, 0.2)' : 'rgba(0, 212, 170, 0.2)';

    const draw = () => {
      if (!isRunning || !canvas || !ctx) return;

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

        // Gradient stroke (monochrome cyan for cyan theme)
        const gradient = ctx.createLinearGradient(0, 0, actualWidth, 0);
        gradient.addColorStop(0, waveColor1);
        gradient.addColorStop(0.5, waveColor1);
        gradient.addColorStop(1, waveColor2);

        ctx.strokeStyle = gradient;
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

          // Gradient based on frequency (monochrome cyan for cyan theme)
          if (isCyanTheme) {
            const alpha = 0.5 + (normalized * 0.5);
            ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
          } else {
            const hue = 160 + (i / spectrum.length) * 120; // Teal to purple
            ctx.fillStyle = `hsla(${hue}, 80%, 50%, 0.8)`;
          }

          ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

          x += barWidth;
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      isRunning = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [actualWidth, height, mode, analyserNode, fftNode, isCyanTheme]);

  return (
    <div ref={containerRef} className={width === 'auto' ? 'w-full' : ''}>
      <canvas
        ref={canvasRef}
        className="rounded-md border border-dark-border"
        style={{ width: width === 'auto' ? '100%' : `${actualWidth}px`, height: `${height}px` }}
      />
    </div>
  );
};
