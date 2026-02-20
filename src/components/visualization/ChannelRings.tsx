/**
 * ChannelRings - Per-channel pulsing concentric rings visualization
 */

import React, { useRef, useEffect, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';

interface ChannelRingsProps {
  height?: number;
}

export const ChannelRings: React.FC<ChannelRingsProps> = ({ height = 100 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

  const [width, setWidth] = useState(300);
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex,
    }))
  );
  const pattern = patterns[currentPatternIndex];
  const channelCount = pattern?.channels.length || 4;
  const smoothedLevels = useRef<number[]>(new Array(32).fill(0));

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

    const animate = () => {
      if (!mounted) return;

      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      const engine = getToneEngine();
      const waveform = engine.getWaveform();
      
      let baseLevel = 0;
      if (waveform && waveform.length > 0) {
        const rms = Math.sqrt(waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length);
        baseLevel = Math.min(1, rms * 10);
      }

      for (let ch = 0; ch < channelCount; ch++) {
        const row = Math.floor(ch / channelsPerRow);
        const col = ch % channelsPerRow;
        const x = col * cellWidth;
        const y = row * cellHeight;

        // Per-channel variation
        const time = Date.now() / 1000;
        const channelPhase = ch * 1.5;
        const variation = Math.sin(time * 3 + channelPhase) * 0.2;
        const targetLevel = pattern?.channels[ch]?.muted ? 0 : Math.max(0, Math.min(1, baseLevel + variation));
        
        smoothedLevels.current[ch] += (targetLevel - smoothedLevels.current[ch]) * 0.15;
        const level = smoothedLevels.current[ch];

        const centerX = x + cellWidth / 2;
        const centerY = y + cellHeight / 2;
        const maxRadius = Math.min(cellWidth, cellHeight) / 2 - 10;

        // Draw channel number (subtle)
        ctx.fillStyle = '#333';
        ctx.font = '8px monospace';
        ctx.fillText((ch + 1).toString(), x + 4, y + 10);

        // Draw rings
        const numRings = 3;
        for (let i = 0; i < numRings; i++) {
          const ringLevel = Math.max(0, level - (i * 0.2));
          const radius = (maxRadius / numRings) * (i + 1) + (ringLevel * 10);
          const alpha = 0.2 + (ringLevel * 0.8);
          const hue = 180 + (ch / channelCount) * 120 + (i * 20);

          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${hue}, 80%, 50%, ${alpha})`;
          ctx.lineWidth = 1 + (ringLevel * 3);
          ctx.stroke();

          if (ringLevel > 0.3) {
            ctx.shadowBlur = 10 * ringLevel;
            ctx.shadowColor = `hsla(${hue}, 100%, 50%, 0.5)`;
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }

        // Animated crosshairs
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX - 5, centerY);
        ctx.lineTo(centerX + 5, centerY);
        ctx.moveTo(centerX, centerY - 5);
        ctx.lineTo(centerX, centerY + 5);
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
