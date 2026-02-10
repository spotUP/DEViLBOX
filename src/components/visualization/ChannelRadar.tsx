/**
 * ChannelRadar - Per-channel radial scanning radar visualization
 */

import React, { useRef, useEffect, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { useTrackerStore } from '@stores';

interface ChannelRadarProps {
  height?: number;
}

export const ChannelRadar: React.FC<ChannelRadarProps> = ({ height = 100 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const [width, setWidth] = useState(300);
  const { patterns, currentPatternIndex } = useTrackerStore();
  const pattern = patterns[currentPatternIndex];
  const channelCount = pattern?.channels.length || 4;
  const scanAngle = useRef(0);
  const blips = useRef<{ x: number; y: number; age: number; hue: number }[][]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) setWidth(newWidth);
      }
    });

    resizeObserver.observe(canvas.parentElement!);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let mounted = true;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const channelsPerRow = Math.min(4, channelCount);
    const rows = Math.ceil(channelCount / channelsPerRow);
    const cellWidth = width / channelsPerRow;
    const cellHeight = height / rows;

    // Initialize blips for each channel
    if (blips.current.length !== channelCount) {
      blips.current = Array(channelCount).fill(0).map(() => []);
    }

    const animate = () => {
      if (!mounted) return;
      
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      const engine = getToneEngine();
      const waveform = engine.getWaveform();
      
      scanAngle.current += 0.05;

      for (let ch = 0; ch < channelCount; ch++) {
        const rowIdx = Math.floor(ch / channelsPerRow);
        const colIdx = ch % channelsPerRow;
        const x = colIdx * cellWidth;
        const y = rowIdx * cellHeight;

        const centerX = x + cellWidth / 2;
        const centerY = y + cellHeight / 2;
        const radius = Math.min(cellWidth, cellHeight) / 2 - 5;

        // Background circles
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshairs
        ctx.beginPath();
        ctx.moveTo(centerX - radius, centerY);
        ctx.lineTo(centerX + radius, centerY);
        ctx.moveTo(centerX, centerY - radius);
        ctx.lineTo(centerX, centerY + radius);
        ctx.stroke();

        // Audio reactivity
        let level = 0;
        if (waveform && waveform.length > 0) {
          const chStart = Math.floor((ch / channelCount) * waveform.length);
          const chEnd = Math.floor(((ch + 1) / channelCount) * waveform.length);
          let sum = 0;
          for (let i = chStart; i < chEnd; i += 10) {
            sum += Math.abs(waveform[i]);
          }
          level = Math.min(1, (sum / ((chEnd - chStart) / 10)) * 5);
        }
        if (pattern?.channels[ch]?.muted) level = 0;

        // Spawn blips on scan line
        if (level > 0.3) {
          const angle = scanAngle.current % (Math.PI * 2);
          const dist = (0.2 + Math.random() * 0.8) * radius;
          blips.current[ch].push({
            x: centerX + Math.cos(angle) * dist,
            y: centerY + Math.sin(angle) * dist,
            age: 1.0,
            hue: 120 + (ch / channelCount) * 100
          });
        }

        // Draw and update blips
        for (let i = blips.current[ch].length - 1; i >= 0; i--) {
          const b = blips.current[ch][i];
          ctx.fillStyle = `hsla(${b.hue}, 100%, 50%, ${b.age})`;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 2 * b.age, 0, Math.PI * 2);
          ctx.fill();
          
          b.age -= 0.01;
          if (b.age <= 0) blips.current[ch].splice(i, 1);
        }

        // Radar sweep line
        const sweepGradient = ctx.createConicGradient(scanAngle.current, centerX, centerY);
        const baseHue = 120 + (ch / channelCount) * 100;
        sweepGradient.addColorStop(0, `hsla(${baseHue}, 100%, 50%, 0.5)`);
        sweepGradient.addColorStop(0.1, `hsla(${baseHue}, 100%, 50%, 0)`);
        sweepGradient.addColorStop(1, `hsla(${baseHue}, 100%, 50%, 0)`);

        ctx.fillStyle = sweepGradient;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, scanAngle.current, scanAngle.current - 0.5, true);
        ctx.fill();

        // Scan line tip
        ctx.strokeStyle = `hsla(${baseHue}, 100%, 70%, 0.8)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.cos(scanAngle.current) * radius, centerY + Math.sin(scanAngle.current) * radius);
        ctx.stroke();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, channelCount, pattern]);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <canvas ref={canvasRef} style={{ width: `${width}px`, height: `${height}px` }} />
    </div>
  );
};
