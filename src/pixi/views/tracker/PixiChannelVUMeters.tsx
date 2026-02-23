/**
 * PixiChannelVUMeters — Per-channel segmented LED VU meters for WebGL mode.
 * ProTracker-style swing animation with green/yellow/red segments.
 *
 * Matches the DOM ChannelVUMeters.tsx behavior:
 * - Uses RAF for animation (same pattern as PixiFrequencyBars/PixiVisualizer)
 * - Gates on isPlaying at effect level to start/stop animation
 * - Meters use actual channel offsets/widths from the pattern (not even spacing)
 * - Segments draw upward from the bottom of the component
 */

import { useEffect, useRef, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';

import { useTransportStore, useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { getToneEngine } from '@engine/ToneEngine';

// VU meter constants — must match DOM ChannelVUMeters.tsx for parity
const DECAY_RATE = 0.92;
const SWING_RANGE = 25;
const SWING_FREQ = 0.0025;     // radians per ms (~2.5s full cycle)
const SWING_PHASE_STEP = 0.45; // radians between adjacent channels
const NUM_SEGMENTS = 26;
const SEGMENT_GAP = 4;
const SEGMENT_HEIGHT = 4;
const METER_WIDTH = 28;
const LINE_NUMBER_WIDTH = 40;

// Layout constants matching PixiPatternEditor for channel offset calculation
const CHAR_WIDTH = 8;

// Segment colors (Pixi hex)
const COLOR_GREEN = 0x22c55e;
const COLOR_YELLOW = 0xeab308;
const COLOR_RED = 0xef4444;

interface MeterState {
  level: number;
}

interface PixiChannelVUMetersProps {
  width: number;
  height: number;
}

export const PixiChannelVUMeters: React.FC<PixiChannelVUMetersProps> = ({ width, height }) => {
  const { pattern, columnVisibility } = useTrackerStore(useShallow(s => ({
    pattern: s.patterns[s.currentPatternIndex],
    columnVisibility: s.columnVisibility,
  })));
  const numChannels = pattern?.channels.length || 4;

  // Compute channel offsets/widths matching PixiPatternEditor layout
  const { channelOffsets, channelWidths } = useMemo(() => {
    if (!pattern) return { channelOffsets: [] as number[], channelWidths: [] as number[] };
    const nc = pattern.channels.length;
    const noteWidth = CHAR_WIDTH * 3 + 4;
    const showAcid = columnVisibility.flag1 || columnVisibility.flag2;
    const showProb = columnVisibility.probability;

    const offsets: number[] = [];
    const widths: number[] = [];
    let currentX = LINE_NUMBER_WIDTH;

    for (let ch = 0; ch < nc; ch++) {
      const channel = pattern.channels[ch];
      const isCollapsed = channel?.collapsed;
      if (isCollapsed) {
        const cw = noteWidth + 40;
        offsets.push(currentX);
        widths.push(cw);
        currentX += cw;
      } else {
        const effectCols = channel?.channelMeta?.effectCols ?? 2;
        const effectWidth = effectCols * (CHAR_WIDTH * 3 + 4);
        const paramWidth = CHAR_WIDTH * 4 + 8 + effectWidth
          + (showAcid ? CHAR_WIDTH * 2 + 8 : 0)
          + (showProb ? CHAR_WIDTH * 2 + 4 : 0);
        const chWidth = noteWidth + paramWidth + 60;
        offsets.push(currentX);
        widths.push(chWidth);
        currentX += chWidth;
      }
    }

    return { channelOffsets: offsets, channelWidths: widths };
  }, [pattern, columnVisibility]);

  const graphicsRef = useRef<GraphicsType | null>(null);
  const metersRef = useRef<MeterState[]>([]);
  const lastGensRef = useRef<number[]>([]);

  // Refs for values needed inside the RAF loop (avoids effect re-runs)
  const numChannelsRef = useRef(numChannels);
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  const channelOffsetsRef = useRef(channelOffsets);
  const channelWidthsRef = useRef(channelWidths);
  useEffect(() => { numChannelsRef.current = numChannels; }, [numChannels]);
  useEffect(() => { widthRef.current = width; }, [width]);
  useEffect(() => { heightRef.current = height; }, [height]);
  useEffect(() => { channelOffsetsRef.current = channelOffsets; }, [channelOffsets]);
  useEffect(() => { channelWidthsRef.current = channelWidths; }, [channelWidths]);

  // Initialize meter states when channel count changes
  useEffect(() => {
    metersRef.current = Array.from({ length: numChannels }, () => ({
      level: 0,
    }));
  }, [numChannels]);

  // RAF animation loop — runs ALWAYS (same as DOM ChannelVUMeters.tsx).
  // NOT gated on isPlaying — checks it inside the loop instead.
  // This avoids ref-timing issues where graphicsRef might be null when
  // the effect first fires with isPlaying=true.
  // RAF loop — always runs (VU meters are lightweight draw ops,
  // no need to gate on performanceQuality which can oscillate and kill the loop)
  useEffect(() => {
    let rafId: number;

    const draw = () => {
      const g = graphicsRef.current;
      if (!g) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      g.clear();

      // Draw transparent full-size rect to establish correct content bounds.
      // Without this, @pixi/layout scales the small VU rects up to fill the
      // layout area, making them appear huge.
      g.rect(0, 0, widthRef.current, heightRef.current);
      g.fill({ color: 0x000000, alpha: 0 });

      const playing = useTransportStore.getState().isPlaying;

      if (!playing) {
        for (const m of metersRef.current) m.level = 0;
        rafId = requestAnimationFrame(draw);
        return;
      }

      const nc = numChannelsRef.current;
      const h = heightRef.current;
      const offsets = channelOffsetsRef.current;
      const widths = channelWidthsRef.current;

      let triggerLevels: number[];
      let triggerGens: number[];
      try {
        const engine = getToneEngine();
        triggerLevels = engine.getChannelTriggerLevels(nc);
        triggerGens = engine.getChannelTriggerGenerations(nc);
      } catch {
        rafId = requestAnimationFrame(draw);
        return;
      }

      // Grow lastGens if needed
      if (lastGensRef.current.length < nc) {
        const old = lastGensRef.current;
        lastGensRef.current = new Array(nc).fill(0);
        for (let j = 0; j < old.length; j++) lastGensRef.current[j] = old[j];
      }

      for (let i = 0; i < nc; i++) {
        const meter = metersRef.current[i];
        if (!meter) continue;

        if (widths[i] && widths[i] < 20) continue;

        // Detect NEW trigger by comparing generation counter
        const isNewTrigger = triggerGens[i] !== lastGensRef.current[i];
        const staggerOffset = i * 0.012;

        if (isNewTrigger && triggerLevels[i] > 0) {
          meter.level = triggerLevels[i];
          lastGensRef.current[i] = triggerGens[i];
        } else {
          meter.level *= (DECAY_RATE - staggerOffset);
          if (meter.level < 0.01) meter.level = 0;
        }

        // Swing position — global time-based sine wave with per-channel phase offset.
        // All channels share one clock so they move as a synced staggered wave.
        const swingPos = meter.level > 0.02
          ? Math.sin(performance.now() * SWING_FREQ + i * SWING_PHASE_STEP) * SWING_RANGE
          : 0;

        let centerX: number;
        if (offsets[i] !== undefined && widths[i]) {
          const offset = offsets[i] - LINE_NUMBER_WIDTH;
          centerX = offset + widths[i] / 2;
        } else {
          const channelWidth = widthRef.current / nc;
          centerX = i * channelWidth + channelWidth / 2;
        }

        const meterX = centerX - METER_WIDTH / 2 + swingPos;
        const activeSegments = Math.round(meter.level * NUM_SEGMENTS);

        // Green segments
        const greenEnd = Math.min(activeSegments, Math.ceil(NUM_SEGMENTS * 0.6));
        if (greenEnd > 0) {
          for (let s = 0; s < greenEnd; s++) {
            const segY = h - 2 - s * (SEGMENT_HEIGHT + SEGMENT_GAP) - SEGMENT_HEIGHT;
            g.rect(meterX, segY, METER_WIDTH, SEGMENT_HEIGHT);
          }
          g.fill({ color: COLOR_GREEN, alpha: 0.9 });
        }

        // Yellow segments
        const yellowStart = greenEnd;
        const yellowEnd = Math.min(activeSegments, Math.ceil(NUM_SEGMENTS * 0.85));
        if (yellowEnd > yellowStart) {
          for (let s = yellowStart; s < yellowEnd; s++) {
            const segY = h - 2 - s * (SEGMENT_HEIGHT + SEGMENT_GAP) - SEGMENT_HEIGHT;
            g.rect(meterX, segY, METER_WIDTH, SEGMENT_HEIGHT);
          }
          g.fill({ color: COLOR_YELLOW, alpha: 0.9 });
        }

        // Red segments
        const redStart = yellowEnd;
        if (activeSegments > redStart) {
          for (let s = redStart; s < activeSegments; s++) {
            const segY = h - 2 - s * (SEGMENT_HEIGHT + SEGMENT_GAP) - SEGMENT_HEIGHT;
            g.rect(meterX, segY, METER_WIDTH, SEGMENT_HEIGHT);
          }
          g.fill({ color: COLOR_RED, alpha: 0.9 });
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <pixiGraphics
      ref={graphicsRef}
      draw={() => {}}
      layout={{ width, height }}
      interactiveChildren={false}
    />
  );
};
