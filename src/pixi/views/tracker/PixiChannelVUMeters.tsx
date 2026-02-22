/**
 * PixiChannelVUMeters — Per-channel segmented LED VU meters for WebGL mode.
 * ProTracker-style swing animation with green/yellow/red segments.
 */

import { useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';

import { useTransportStore, useTrackerStore, useUIStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

// VU meter constants
const DECAY_RATE = 0.92;
const SWING_RANGE = 25;
const SWING_SPEED = 0.8;
const NUM_SEGMENTS = 26;
const SEGMENT_GAP = 4;
const SEGMENT_HEIGHT = 4;
const METER_WIDTH = 28;

// Segment colors (Pixi hex)
const COLOR_GREEN = 0x22c55e;
const COLOR_YELLOW = 0xeab308;
const COLOR_RED = 0xef4444;

interface MeterState {
  level: number;
  position: number;
  direction: number;
}

interface PixiChannelVUMetersProps {
  width: number;
  height: number;
}

export const PixiChannelVUMeters: React.FC<PixiChannelVUMetersProps> = ({ width, height }) => {
  const isPlaying = useTransportStore(s => s.isPlaying);
  const performanceQuality = useUIStore(s => s.performanceQuality);
  const numChannels = useTrackerStore(s => {
    const pat = s.patterns[s.currentPatternIndex];
    return pat?.channels.length || 4;
  });

  const graphicsRef = useRef<GraphicsType | null>(null);
  const metersRef = useRef<MeterState[]>([]);

  // Initialize meter states when channel count changes
  useEffect(() => {
    metersRef.current = Array.from({ length: numChannels }, (_, i) => ({
      level: 0,
      position: (i % 2 === 0 ? -1 : 1) * SWING_RANGE * 0.5,
      direction: i % 2 === 0 ? 1 : -1,
    }));
  }, [numChannels]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || performanceQuality === 'low' || !graphicsRef.current) return;

    let rafId: number;
    const draw = () => {
      const g = graphicsRef.current;
      if (!g) return;

      g.clear();

      const nc = numChannels;
      let triggerLevels: Float32Array | number[];
      try {
        triggerLevels = getToneEngine().getChannelTriggerLevels(nc);
      } catch {
        rafId = requestAnimationFrame(draw);
        return;
      }

      // Distribute meters evenly across width
      const channelWidth = width / nc;

      for (let i = 0; i < nc; i++) {
        const meter = metersRef.current[i];
        if (!meter) continue;

        const trigger = triggerLevels[i] || 0;
        const staggerOffset = i * 0.012;

        // Update level
        if (trigger > 0) {
          meter.level = trigger;
        } else {
          meter.level *= (DECAY_RATE - staggerOffset);
          if (meter.level < 0.01) meter.level = 0;
        }

        // Update swing position
        if (meter.level > 0.02) {
          const distFromCenter = Math.abs(meter.position) / SWING_RANGE;
          const easeZone = Math.max(0, (distFromCenter - 0.7) / 0.3);
          const easedSpeed = SWING_SPEED * (1 - easeZone * 0.7);
          meter.position += easedSpeed * meter.direction;

          if (meter.position >= SWING_RANGE) {
            meter.position = SWING_RANGE;
            meter.direction = -1;
          } else if (meter.position <= -SWING_RANGE) {
            meter.position = -SWING_RANGE;
            meter.direction = 1;
          }
        }

        // Center of this channel
        const centerX = i * channelWidth + channelWidth / 2;
        const meterX = centerX - METER_WIDTH / 2 + meter.position;

        // Draw segments bottom-to-top
        const activeSegments = Math.round(meter.level * NUM_SEGMENTS);
        for (let s = 0; s < activeSegments; s++) {
          const ratio = s / (NUM_SEGMENTS - 1);
          const segY = height - 2 - s * (SEGMENT_HEIGHT + SEGMENT_GAP) - SEGMENT_HEIGHT;

          let color: number;
          if (ratio < 0.6) color = COLOR_GREEN;
          else if (ratio < 0.85) color = COLOR_YELLOW;
          else color = COLOR_RED;

          g.roundRect(meterX, segY, METER_WIDTH, SEGMENT_HEIGHT, 1);
          g.fill({ color, alpha: 0.85 });
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, performanceQuality, numChannels, width, height]);

  // Clear when not playing
  useEffect(() => {
    if (!isPlaying && graphicsRef.current) {
      graphicsRef.current.clear();
      // Reset meter levels
      for (const m of metersRef.current) {
        m.level = 0;
      }
    }
  }, [isPlaying]);

  if (performanceQuality === 'low') return null;

  return (
    <pixiGraphics
      ref={graphicsRef}
      draw={() => {}}
      layout={{ position: 'absolute', width, height }}
      interactiveChildren={false}
    />
  );
};
