/**
 * ChannelTunnel - Per-channel 3D perspective tunnel visualization
 */

import React, { useRef, useEffect, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';

interface ChannelTunnelProps {
  height?: number;
}

export const ChannelTunnel: React.FC<ChannelTunnelProps> = ({ height = 100 }) => {
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
  const tunnelOffset = useRef(0);

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
      
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      const engine = getToneEngine();
      const fft = engine.getFFT();
      
      tunnelOffset.current += 0.05;

      for (let ch = 0; ch < channelCount; ch++) {
        const rowIdx = Math.floor(ch / channelsPerRow);
        const colIdx = ch % channelsPerRow;
        const x = colIdx * cellWidth;
        const y = rowIdx * cellHeight;

        const centerX = x + cellWidth / 2;
        const centerY = y + cellHeight / 2;
        
        // Per-channel frequency slice
        let intensity = 0;
        if (fft && fft.length > 0) {
          const sliceSize = Math.floor(fft.length / channelCount);
          const startIdx = ch * sliceSize;
          let sum = 0;
          for (let i = 0; i < 10; i++) {
            sum += (fft[startIdx + i] + 140) / 140;
          }
          intensity = Math.max(0, Math.min(1, sum / 10));
        }
        
        if (pattern?.channels[ch]?.muted) intensity = 0;

        // Draw tunnel layers
        const numLayers = 8;
        for (let i = 0; i < numLayers; i++) {
          const z = ((i / numLayers) + (tunnelOffset.current % (1 / numLayers))) % 1;
          const scale = 1 - z;
          const alpha = z * 0.8;
          const hue = 200 + (ch / channelCount) * 100 + (z * 50);

          ctx.strokeStyle = `hsla(${hue}, 80%, 50%, ${alpha})`;
          ctx.lineWidth = 1 + intensity * 2;
          
          // Perspective square
          const w = cellWidth * scale;
          const h = cellHeight * scale;
          ctx.strokeRect(centerX - w / 2, centerY - h / 2, w, h);

          // Lines connecting layers
          if (i === 0 && intensity > 0.5) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(centerX - w / 2, centerY - h / 2);
            ctx.moveTo(x + cellWidth, y);
            ctx.lineTo(centerX + w / 2, centerY - h / 2);
            ctx.moveTo(x, y + cellHeight);
            ctx.lineTo(centerX - w / 2, centerY + h / 2);
            ctx.moveTo(x + cellWidth, y + cellHeight);
            ctx.lineTo(centerX + w / 2, centerY + h / 2);
            ctx.stroke();
          }
        }

        // Channel center light
        const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 10 + intensity * 20);
        const centerHue = 180 + (ch / channelCount) * 60;
        grad.addColorStop(0, `hsla(${centerHue}, 100%, 70%, ${intensity * 0.5})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, cellWidth, cellHeight);
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
