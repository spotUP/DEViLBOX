/**
 * StereoField - Lissajous/Goniometer style stereo field visualizer
 * Shows the stereo image of audio with L/R correlation
 */

import React, { useEffect, useRef } from 'react';
import { useAudioStore, useTransportStore } from '@stores';
import { useThemeStore } from '@stores/useThemeStore';

interface StereoFieldProps {
  size?: number;
  height?: number;
}

const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

export const StereoField: React.FC<StereoFieldProps> = ({
  size = 100,
  height = 100,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const trailRef = useRef<{ x: number; y: number; age: number }[]>([]);

  const { analyserNode } = useAudioStore();
  const isPlaying = useTransportStore((state) => state.isPlaying);
  const { currentThemeId } = useThemeStore();
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Make it square based on height
    const actualSize = Math.min(container.clientWidth, height);
    canvas.width = actualSize;
    canvas.height = actualSize;

    const centerX = actualSize / 2;
    const centerY = actualSize / 2;
    const radius = actualSize / 2 - 8;

    // Colors
    const bgColor = isCyanTheme ? '#030808' : '#0a0a0b';
    const gridColor = isCyanTheme ? 'rgba(0, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.08)';
    const dotColor = isCyanTheme ? '#00ffff' : '#00d4aa';

    if (!isPlaying) {
      // Draw static state
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, actualSize, actualSize);

      // Draw circle outline
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Cross lines (L-R and M-S)
      ctx.beginPath();
      ctx.moveTo(centerX - radius, centerY);
      ctx.lineTo(centerX + radius, centerY);
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX, centerY + radius);
      ctx.stroke();

      // Diagonal lines (45 degrees)
      ctx.strokeStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)';
      const diag = radius * 0.707; // cos(45deg)
      ctx.beginPath();
      ctx.moveTo(centerX - diag, centerY - diag);
      ctx.lineTo(centerX + diag, centerY + diag);
      ctx.moveTo(centerX - diag, centerY + diag);
      ctx.lineTo(centerX + diag, centerY - diag);
      ctx.stroke();

      // Labels
      ctx.fillStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.4)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('L', centerX - radius + 8, centerY - 2);
      ctx.fillText('R', centerX + radius - 8, centerY - 2);
      ctx.fillText('Stereo Field', centerX, actualSize - 3);

      return;
    }

    let lastFrameTime = 0;
    let isRunning = true;

    const draw = (timestamp: number) => {
      if (!isRunning || !canvas || !ctx) return;

      const elapsed = timestamp - lastFrameTime;
      if (elapsed < FRAME_INTERVAL) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);

      // Clear
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, actualSize, actualSize);

      // Draw circle and guides
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Cross lines
      ctx.beginPath();
      ctx.moveTo(centerX - radius, centerY);
      ctx.lineTo(centerX + radius, centerY);
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX, centerY + radius);
      ctx.stroke();

      // Diagonal guides
      ctx.strokeStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)';
      const diag = radius * 0.707;
      ctx.beginPath();
      ctx.moveTo(centerX - diag, centerY - diag);
      ctx.lineTo(centerX + diag, centerY + diag);
      ctx.moveTo(centerX - diag, centerY + diag);
      ctx.lineTo(centerX + diag, centerY - diag);
      ctx.stroke();

      // Get audio data
      if (analyserNode) {
        const waveform = analyserNode.getValue() as Float32Array;
        const len = Math.min(waveform.length, 512);

        // Simulate stereo by using different parts of the waveform
        // (Real stereo would need separate L/R analysers)
        const newPoints: { x: number; y: number; age: number }[] = [];

        for (let i = 0; i < len; i += 4) {
          const left = waveform[i] || 0;
          const right = waveform[i + 1] || 0;

          // Convert to M/S (Mid-Side) coordinates
          // Mid = (L + R) / 2, Side = (L - R) / 2
          // For display: x = Side (stereo width), y = Mid (mono content)
          const mid = (left + right) / 2;
          const side = (left - right) / 2;

          // Apply rotation for Lissajous (45 degree rotation)
          const x = centerX + side * radius * 1.2;
          const y = centerY - mid * radius * 1.2;

          newPoints.push({ x, y, age: 0 });
        }

        // Update trail with aging
        const maxTrailLength = 150;
        trailRef.current = [...newPoints, ...trailRef.current.map(p => ({ ...p, age: p.age + 1 }))]
          .filter(p => p.age < maxTrailLength)
          .slice(0, maxTrailLength * 2);

        // Draw trail
        for (const point of trailRef.current) {
          const alpha = 1 - point.age / maxTrailLength;
          if (isCyanTheme) {
            ctx.fillStyle = `rgba(0, 255, 255, ${alpha * 0.6})`;
          } else {
            ctx.fillStyle = `rgba(0, 212, 170, ${alpha * 0.6})`;
          }
          const dotSize = 2 - point.age / maxTrailLength;
          ctx.beginPath();
          ctx.arc(point.x, point.y, Math.max(0.5, dotSize), 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw current points brighter
        ctx.fillStyle = dotColor;
        for (const point of newPoints) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Labels
      ctx.fillStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.4)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('L', centerX - radius + 8, centerY - 2);
      ctx.fillText('R', centerX + radius - 8, centerY - 2);
      ctx.fillText('Stereo Field', centerX, actualSize - 3);

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      isRunning = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      trailRef.current = [];
    };
  }, [size, height, analyserNode, isPlaying, isCyanTheme]);

  return (
    <div ref={containerRef} className="flex items-center justify-center w-full">
      <canvas
        ref={canvasRef}
        className="rounded-md border border-dark-border"
        style={{ width: `${height}px`, height: `${height}px` }}
      />
    </div>
  );
};
