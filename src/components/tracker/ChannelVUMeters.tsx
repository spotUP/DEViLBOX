/**
 * ChannelVUMeters - Canvas-based LED-style segmented VU meters
 * Bars extend UP from edit bar with sectioned segments
 * Green → Yellow → Red gradient from bottom to top
 *
 * PERFORMANCE: Single <canvas> element replaces 104+ DOM nodes.
 * All rendering is done via Canvas 2D — zero per-frame DOM mutations,
 * no forced reflows, no style recalculations.
 */

import React, { useEffect, useRef, memo } from 'react';
import { useTrackerStore, useUIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { getToneEngine } from '@engine/ToneEngine';

// VU meter timing constants - ProTracker style
const DECAY_RATE = 0.92;
const SWING_RANGE = 25;
const SWING_SPEED = 0.8;
const NUM_SEGMENTS = 26;
const SEGMENT_GAP = 4;
const SEGMENT_HEIGHT = 4;
const METER_WIDTH = 28;
const LINE_NUMBER_WIDTH = 40;

// Segment colors
const COLOR_GREEN = '#22c55e';
const COLOR_YELLOW = '#eab308';
const COLOR_RED = '#ef4444';

interface MeterState {
  level: number;
  position: number;
  direction: number;
}

interface ChannelVUMetersProps {
  channelOffsets?: number[];
  channelWidths?: number[];
  scrollLeft?: number;
}

export const ChannelVUMeters: React.FC<ChannelVUMetersProps> = memo(({ channelOffsets = [], channelWidths = [], scrollLeft: scrollLeftProp = 0 }) => {
  const { patterns, currentPatternIndex } = useTrackerStore(useShallow(s => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex
  })));
  const performanceQuality = useUIStore((state) => state.performanceQuality);
  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterStates = useRef<MeterState[]>([]);
  const animationRef = useRef<number | null>(null);

  // Refs for values needed inside the animation loop
  const numChannelsRef = useRef(numChannels);
  const scrollLeftRef = useRef(scrollLeftProp);
  const channelOffsetsRef = useRef(channelOffsets);
  const channelWidthsRef = useRef(channelWidths);

  useEffect(() => { numChannelsRef.current = numChannels; }, [numChannels]);
  useEffect(() => { scrollLeftRef.current = scrollLeftProp; }, [scrollLeftProp]);
  useEffect(() => { channelOffsetsRef.current = channelOffsets; }, [channelOffsets]);
  useEffect(() => { channelWidthsRef.current = channelWidths; }, [channelWidths]);

  // Initialize meter states
  useEffect(() => {
    meterStates.current = Array.from({ length: numChannels }, (_, i) => ({
      level: 0,
      position: (i % 2 === 0 ? -1 : 1) * SWING_RANGE * 0.5,
      direction: i % 2 === 0 ? 1 : -1
    }));
  }, [numChannels]);

  // Canvas resize via ResizeObserver — no clientHeight read/write loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const bw = Math.round(width * dpr);
      const bh = Math.round(height * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  // Animation loop
  useEffect(() => {
    if (performanceQuality === 'low') {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const tick = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      const engine = getToneEngine();
      const nc = numChannelsRef.current;
      const triggerLevels = engine.getChannelTriggerLevels(nc);
      const sl = scrollLeftRef.current;
      const offsets = channelOffsetsRef.current;
      const widths = channelWidthsRef.current;

      for (let i = 0; i < nc; i++) {
        const meter = meterStates.current[i];
        if (!meter) continue;

        // Skip collapsed channels
        if (widths[i] && widths[i] < 20) continue;

        const trigger = triggerLevels[i] || 0;
        const staggerOffset = i * 0.012;

        // Update level - instant jump on trigger, smooth decay
        if (trigger > 0) {
          meter.level = trigger;
        } else {
          const decayRate = DECAY_RATE - staggerOffset;
          meter.level = meter.level * decayRate;
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

        // Calculate channel center X
        let centerX: number;
        if (offsets[i] && widths[i]) {
          const offset = offsets[i] - LINE_NUMBER_WIDTH;
          centerX = offset + widths[i] / 2;
        } else {
          centerX = i * 260 + 130;
        }

        // Apply scroll and swing
        const meterX = centerX - METER_WIDTH / 2 - sl + meter.position;

        // Draw segments bottom-to-top
        const activeSegments = Math.round(meter.level * NUM_SEGMENTS);

        for (let s = 0; s < activeSegments; s++) {
          const ratio = s / (NUM_SEGMENTS - 1);
          const segY = ch - 2 - (s * (SEGMENT_HEIGHT + SEGMENT_GAP)) - SEGMENT_HEIGHT;

          // Determine color
          let color: string;
          if (ratio < 0.6) {
            color = COLOR_GREEN;
          } else if (ratio < 0.85) {
            color = COLOR_YELLOW;
          } else {
            color = COLOR_RED;
          }

          // Draw segment with glow
          ctx.shadowColor = color;
          ctx.shadowBlur = 6;
          ctx.fillStyle = color;

          // Rounded rect
          const r = 1;
          ctx.beginPath();
          ctx.moveTo(meterX + r, segY);
          ctx.lineTo(meterX + METER_WIDTH - r, segY);
          ctx.quadraticCurveTo(meterX + METER_WIDTH, segY, meterX + METER_WIDTH, segY + r);
          ctx.lineTo(meterX + METER_WIDTH, segY + SEGMENT_HEIGHT - r);
          ctx.quadraticCurveTo(meterX + METER_WIDTH, segY + SEGMENT_HEIGHT, meterX + METER_WIDTH - r, segY + SEGMENT_HEIGHT);
          ctx.lineTo(meterX + r, segY + SEGMENT_HEIGHT);
          ctx.quadraticCurveTo(meterX, segY + SEGMENT_HEIGHT, meterX, segY + SEGMENT_HEIGHT - r);
          ctx.lineTo(meterX, segY + r);
          ctx.quadraticCurveTo(meterX, segY, meterX + r, segY);
          ctx.closePath();
          ctx.fill();
        }

        // Reset shadow after each meter
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [performanceQuality]);

  if (performanceQuality === 'low') {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="vu-meters-canvas"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
});

ChannelVUMeters.displayName = 'ChannelVUMeters';
