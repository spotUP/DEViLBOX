/**
 * ChannelSpectrums - Per-channel mini spectrum displays
 */

import React, { useRef, useEffect, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';

interface ChannelSpectrumsProps {
  height?: number;
}

export const ChannelSpectrums: React.FC<ChannelSpectrumsProps> = ({ height = 100 }) => {
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

    // Enable analysers when visualization is active
    const engine = getToneEngine();
    engine.enableAnalysers();

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
      const fft = engine.getFFT();

      if (fft) {
        const values = fft;
        const barsPerChannel = 16;
        const time = Date.now() / 1000; // Hoist out of loops

        for (let ch = 0; ch < channelCount; ch++) {
          const row = Math.floor(ch / channelsPerRow);
          const col = ch % channelsPerRow;
          const x = col * cellWidth;
          const y = row * cellHeight;

          // Draw cell border
          ctx.strokeStyle = '#222';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cellWidth, cellHeight);

          // Draw channel number
          ctx.fillStyle = '#555';
          ctx.font = '8px monospace';
          ctx.fillText(`CH${ch + 1}`, x + 4, y + 10);

          // Draw spectrum bars
          const padding = 4;
          const barWidth = (cellWidth - padding * 2) / barsPerChannel;
          const maxBarHeight = cellHeight - padding * 2 - 12;

          for (let i = 0; i < barsPerChannel; i++) {
            // Each channel reads from a dramatically different part of the spectrum
            const frequencyOffset = Math.floor((ch / channelCount) * values.length * 0.6); // Wider offset
            const idx = (Math.floor((i / barsPerChannel) * values.length) + frequencyOffset) % values.length;
            const value = values[idx];
            const normalized = (value + 140) / 140;
            const barHeight = Math.max(0, Math.min(1, normalized)) * maxBarHeight;

            // Dramatic time-based and channel-based modulation
            const channelPhase = ch * 1.7;
            const channelAmp = 0.4 + (ch % 3) * 0.3; // Different amplitude per channel
            const channelMod = pattern?.channels[ch]?.muted ? 0 : (Math.sin(time * 1.5 + channelPhase + i * 0.4) * 0.3 + channelAmp);
            const finalHeight = barHeight * channelMod;

            const barX = x + padding + i * barWidth;
            const barY = y + padding + 12 + maxBarHeight - finalHeight;

            // Color based on frequency (low=red, mid=yellow, high=cyan)
            const hue = (i / barsPerChannel) * 180 + 180;
            ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
            ctx.fillRect(barX, barY, barWidth - 1, finalHeight);
          }
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      // Disable analysers to save CPU when visualization unmounts
      engine.disableAnalysers();
    };
  }, [width, height, channelCount, pattern]);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <canvas ref={canvasRef} style={{ width: `${width}px`, height: `${height}px` }} />
    </div>
  );
};
