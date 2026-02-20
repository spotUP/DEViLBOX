/**
 * ChannelWaveforms - Per-channel mini waveform display
 */

import React, { useRef, useEffect, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';

interface ChannelWaveformsProps {
  height?: number;
}

export const ChannelWaveforms: React.FC<ChannelWaveformsProps> = ({ height = 100 }) => {
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

    // Enable analysers when visualization is active
    const engine = getToneEngine();
    engine.enableAnalysers();

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

      if (waveform) {
        const values = waveform;

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

          // Draw waveform with per-channel offset
          const padding = 4;
          const waveHeight = cellHeight - padding * 2 - 12;
          const waveY = y + padding + 12;
          const step = Math.max(1, Math.floor(values.length / (cellWidth - padding * 2)));
          
          // Per-channel offset in the waveform data
          const channelOffset = Math.floor((ch / channelCount) * values.length);
          const phaseShift = (ch * 123) % values.length; // Prime number for good distribution

          ctx.strokeStyle = pattern?.channels[ch]?.muted ? '#333' : '#00d4aa';
          ctx.lineWidth = 1.5;
          ctx.beginPath();

          for (let i = 0; i < cellWidth - padding * 2; i++) {
            const idx = (channelOffset + (i * step) + phaseShift) % values.length;
            let value = values[idx];
            
            // Apply dramatic per-channel amplitude and phase modulation
            const channelAmp = 0.3 + (ch / channelCount) * 0.5; // Different amplitude per channel
            const channelFreq = 1 + (ch % 3); // Different frequency multiplier
            value = value * channelAmp * channelFreq;
            
            const px = x + padding + i;
            const py = waveY + (waveHeight / 2) + (value * waveHeight * 0.4);
            
            if (i === 0) {
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.stroke();
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
