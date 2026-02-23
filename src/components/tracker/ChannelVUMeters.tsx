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
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { getToneEngine } from '@engine/ToneEngine';
import { useTransportStore } from '@stores/useTransportStore';

// VU meter timing constants - ProTracker style
const DECAY_RATE = 0.92;
const SWING_RANGE = 25;
const SWING_FREQ = 0.0025;     // radians per ms (~2.5s full cycle)
const SWING_PHASE_STEP = 0.45; // radians between adjacent channels
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
  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterStates = useRef<MeterState[]>([]);
  const animationRef = useRef<number | null>(null);
  const lastGensRef = useRef<number[]>([]);

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
    meterStates.current = Array.from({ length: numChannels }, () => ({
      level: 0,
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

  // Animation loop — always runs (VU meters are lightweight canvas ops,
  // no need to gate on performanceQuality which can oscillate and kill the loop)
  useEffect(() => {
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
      const triggerGens = engine.getChannelTriggerGenerations(nc);
      const sl = scrollLeftRef.current;
      const offsets = channelOffsetsRef.current;
      const widths = channelWidthsRef.current;

      // Grow lastGens if needed
      if (lastGensRef.current.length < nc) {
        const old = lastGensRef.current;
        lastGensRef.current = new Array(nc).fill(0);
        for (let j = 0; j < old.length; j++) lastGensRef.current[j] = old[j];
      }

      for (let i = 0; i < nc; i++) {
        const meter = meterStates.current[i];
        if (!meter) continue;

        // Skip collapsed channels
        if (widths[i] && widths[i] < 20) continue;

        // Detect NEW trigger by comparing generation counter
        const isNewTrigger = triggerGens[i] !== lastGensRef.current[i];
        const staggerOffset = i * 0.012;

        // Update level - instant jump on NEW trigger, smooth decay otherwise
        // When playback is stopped, kill meters instantly (no lingering bounce)
        if (!useTransportStore.getState().isPlaying) {
          meter.level = 0;
        } else if (isNewTrigger && triggerLevels[i] > 0) {
          meter.level = triggerLevels[i];
          lastGensRef.current[i] = triggerGens[i];
        } else {
          const decayRate = DECAY_RATE - staggerOffset;
          meter.level = meter.level * decayRate;
          if (meter.level < 0.01) meter.level = 0;
        }

        // Swing position — global time-based sine wave with per-channel phase offset.
        // All channels share one clock so they move as a synced staggered wave.
        const swingPos = meter.level > 0.02
          ? Math.sin(performance.now() * SWING_FREQ + i * SWING_PHASE_STEP) * SWING_RANGE
          : 0;

        // Calculate channel center X
        let centerX: number;
        if (offsets[i] && widths[i]) {
          const offset = offsets[i] - LINE_NUMBER_WIDTH;
          centerX = offset + widths[i] / 2;
        } else {
          centerX = i * 260 + 130;
        }

        // Apply scroll and swing
        const meterX = centerX - METER_WIDTH / 2 - sl + swingPos;

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

          // Draw segment - simplified for performance
          ctx.fillStyle = color;
          ctx.fillRect(Math.round(meterX), Math.round(segY), METER_WIDTH, SEGMENT_HEIGHT);
        }
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
  }, []);

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
