/**
 * ChannelLevelsCompact - Compact horizontal channel level meters for toolbar
 * Shows per-channel audio levels in a minimal horizontal format
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useTrackerStore, useTransportStore, useThemeStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

interface ChannelLevelsCompactProps {
  height?: number;
  width?: number | 'auto';
}

const DECAY_RATE = 0.88;

export const ChannelLevelsCompact: React.FC<ChannelLevelsCompactProps> = ({
  height = 100,
  width = 'auto',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const levelStatesRef = useRef<number[]>([]);
  const peakHoldsRef = useRef<{ level: number; frames: number }[]>([]);

  const { patterns, currentPatternIndex } = useTrackerStore();
  const isPlaying = useTransportStore((state) => state.isPlaying);
  const { currentThemeId } = useThemeStore();

  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Initialize states
  useEffect(() => {
    levelStatesRef.current = new Array(numChannels).fill(0);
    peakHoldsRef.current = new Array(numChannels).fill(null).map(() => ({ level: 0, frames: 0 }));
  }, [numChannels]);

  // Animation loop
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    const actualWidth = container.clientWidth;
    if (canvas.width !== actualWidth || canvas.height !== height) {
      canvas.width = actualWidth;
      canvas.height = height;
    }

    const engine = getToneEngine();
    const triggerLevels = engine.getChannelTriggerLevels(numChannels);

    // Update levels with smoothing
    for (let i = 0; i < numChannels; i++) {
      const trigger = triggerLevels[i] || 0;
      const current = levelStatesRef.current[i] || 0;

      if (trigger > current) {
        levelStatesRef.current[i] = current + (trigger - current) * 0.7;
      } else {
        levelStatesRef.current[i] = current * DECAY_RATE;
        if (levelStatesRef.current[i] < 0.01) levelStatesRef.current[i] = 0;
      }

      // Peak hold
      const peak = peakHoldsRef.current[i];
      if (levelStatesRef.current[i] >= peak.level) {
        peak.level = levelStatesRef.current[i];
        peak.frames = 30; // Hold for 1 second at 30fps
      } else if (peak.frames > 0) {
        peak.frames--;
      } else {
        peak.level *= 0.95;
        if (peak.level < 0.01) peak.level = 0;
      }
    }

    // Draw
    const bgColor = isCyanTheme ? '#030808' : '#0a0a0b';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, actualWidth, height);

    const barHeight = Math.max(6, (height - 24 - (numChannels - 1) * 3) / numChannels);
    const barMaxWidth = actualWidth - 40;
    const startY = 12;

    for (let i = 0; i < numChannels; i++) {
      const y = startY + i * (barHeight + 3);
      const level = levelStatesRef.current[i];
      const peak = peakHoldsRef.current[i];
      const barWidth = level * barMaxWidth;
      const peakX = 20 + peak.level * barMaxWidth;

      // Channel label
      ctx.fillStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.4)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}`, 4, y + barHeight - 1);

      // Background track
      ctx.fillStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(20, y, barMaxWidth, barHeight);

      // Level bar with gradient
      if (barWidth > 0) {
        const gradient = ctx.createLinearGradient(20, 0, 20 + barMaxWidth, 0);
        if (isCyanTheme) {
          gradient.addColorStop(0, 'rgba(0, 200, 200, 0.8)');
          gradient.addColorStop(0.7, 'rgba(0, 255, 255, 1)');
          gradient.addColorStop(1, 'rgba(255, 100, 100, 1)');
        } else {
          gradient.addColorStop(0, 'rgba(0, 180, 140, 0.8)');
          gradient.addColorStop(0.7, 'rgba(0, 212, 170, 1)');
          gradient.addColorStop(1, 'rgba(255, 80, 80, 1)');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(20, y, barWidth, barHeight);
      }

      // Peak indicator
      if (peak.level > 0.02) {
        ctx.fillStyle = isCyanTheme ? '#00ffff' : '#ff4444';
        ctx.fillRect(peakX - 1, y, 2, barHeight);
      }
    }

    // Label
    ctx.fillStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.3)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Channel Levels', actualWidth / 2, height - 3);

    animationRef.current = requestAnimationFrame(animate);
  }, [numChannels, height, isCyanTheme]);

  // Start/stop animation
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      // Draw static state
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const actualWidth = container.clientWidth;
          canvas.width = actualWidth;
          canvas.height = height;

          const bgColor = isCyanTheme ? '#030808' : '#0a0a0b';
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, actualWidth, height);

          const barHeight = Math.max(6, (height - 24 - (numChannels - 1) * 3) / numChannels);
          const barMaxWidth = actualWidth - 40;
          const startY = 12;

          for (let i = 0; i < numChannels; i++) {
            const y = startY + i * (barHeight + 3);
            ctx.fillStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.4)';
            ctx.font = '9px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${i + 1}`, 4, y + barHeight - 1);
            ctx.fillStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(20, y, barMaxWidth, barHeight);
          }

          ctx.fillStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.3)';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Channel Levels', actualWidth / 2, height - 3);
        }
      }
      // Reset levels
      levelStatesRef.current = new Array(numChannels).fill(0);
      peakHoldsRef.current = new Array(numChannels).fill(null).map(() => ({ level: 0, frames: 0 }));
      return;
    }

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [animate, isPlaying, numChannels, height, isCyanTheme]);

  return (
    <div ref={containerRef} className={width === 'auto' ? 'w-full' : ''}>
      <canvas
        ref={canvasRef}
        className="rounded-md border border-dark-border"
        style={{ width: '100%', height: `${height}px` }}
      />
    </div>
  );
};
