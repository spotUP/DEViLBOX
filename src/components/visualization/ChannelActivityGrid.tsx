/**
 * ChannelActivityGrid - Grid showing per-channel activity levels
 */

import React, { useRef, useEffect, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';

interface ChannelActivityGridProps {
  height?: number;
}

export const ChannelActivityGrid: React.FC<ChannelActivityGridProps> = ({ height = 100 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef(0);
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

    const channelsPerRow = Math.min(8, channelCount);
    const rows = Math.ceil(channelCount / channelsPerRow);
    const cellWidth = width / channelsPerRow;
    const cellHeight = height / rows;

    const FRAME_INTERVAL = 1000 / 30;

    const animate = () => {
      if (!mounted) return;

      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const now = performance.now();
      if (now - lastFrameTimeRef.current < FRAME_INTERVAL) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameTimeRef.current = now;

      ctx.fillStyle = '#0a0a0b';
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

        // Simulate per-channel variation with dramatic modulation
        const time = Date.now() / 1000;
        const channelPhase = ch * 2.1; // Different phase per channel
        const variation = Math.sin(time * 2 + channelPhase) * 0.4 + Math.cos(time * 1.3 + channelPhase * 0.7) * 0.3;
        // Each channel gets a different base multiplier
        const channelMultiplier = 0.5 + (ch % 4) * 0.2;
        const targetLevel = pattern?.channels[ch]?.muted ? 0 : Math.max(0, Math.min(1, (baseLevel * channelMultiplier) + variation));
        
        // Smooth the level
        smoothedLevels.current[ch] += (targetLevel - smoothedLevels.current[ch]) * 0.2;
        const level = smoothedLevels.current[ch];

        // Draw cell background
        const padding = 2;
        ctx.fillStyle = '#111';
        ctx.fillRect(x + padding, y + padding, cellWidth - padding * 2, cellHeight - padding * 2);

        // Draw level meter
        const meterHeight = (cellHeight - padding * 2) * level;
        const gradient = ctx.createLinearGradient(x, y + cellHeight, x, y + cellHeight - meterHeight);
        
        if (level > 0.8) {
          gradient.addColorStop(0, '#ff0000');
          gradient.addColorStop(0.3, '#ffff00');
          gradient.addColorStop(1, '#00ff00');
        } else if (level > 0.5) {
          gradient.addColorStop(0, '#ffff00');
          gradient.addColorStop(1, '#00ff00');
        } else {
          gradient.addColorStop(0, '#00ff00');
          gradient.addColorStop(1, '#00d4aa');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(
          x + padding,
          y + cellHeight - padding - meterHeight,
          cellWidth - padding * 2,
          meterHeight
        );

        // Draw channel number
        ctx.fillStyle = level > 0.5 ? '#000' : '#666';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText((ch + 1).toString(), x + cellWidth / 2, y + cellHeight / 2 + 3);

        // Draw border
        ctx.strokeStyle = pattern?.channels[ch]?.solo ? '#00ffff' : '#222';
        ctx.lineWidth = pattern?.channels[ch]?.solo ? 2 : 1;
        ctx.strokeRect(x + padding, y + padding, cellWidth - padding * 2, cellHeight - padding * 2);
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
