/**
 * ChannelCircularVU - Per-channel circular/radial VU meter displays
 */

import React, { useRef, useEffect, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';

interface ChannelCircularVUProps {
  height?: number;
}

export const ChannelCircularVU: React.FC<ChannelCircularVUProps> = ({ height = 100 }) => {
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

        // Per-channel variation
        const time = Date.now() / 1000;
        const channelPhase = ch * 2.5;
        const variation = Math.sin(time * 2 + channelPhase) * 0.3;
        const channelMultiplier = 0.6 + (ch % 3) * 0.2;
        const level = pattern?.channels[ch]?.muted ? 0 : Math.max(0, Math.min(1, (baseLevel * channelMultiplier) + variation));

        // Draw cell border
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellWidth, cellHeight);

        // Draw channel number
        ctx.fillStyle = '#555';
        ctx.font = '8px monospace';
        ctx.fillText(`CH${ch + 1}`, x + 4, y + 10);

        // Draw circular VU
        const centerX = x + cellWidth / 2;
        const centerY = y + cellHeight / 2;
        const maxRadius = Math.min(cellWidth, cellHeight) / 2 - 12;

        // Draw outer ring
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw level arcs (2 rings per channel)
        const numRings = 2;
        for (let i = 0; i < numRings; i++) {
          const radius = maxRadius * (0.5 + (i * 0.3));
          const intensity = Math.max(0, level - (i * 0.4));
          
          if (intensity > 0) {
            const angle = Math.PI * 2 * Math.min(intensity * 1.5, 1);
            const rotation = (time + ch * 0.3) % (Math.PI * 2);
            
            const hue = 160 + (ch / channelCount) * 60;
            ctx.strokeStyle = `hsl(${hue}, 80%, 50%)`;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, -Math.PI / 2 + rotation, -Math.PI / 2 + rotation + angle);
            ctx.stroke();
          }
        }

        // Draw center dot
        ctx.fillStyle = level > 0.5 ? '#00ffff' : '#333';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fill();
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
