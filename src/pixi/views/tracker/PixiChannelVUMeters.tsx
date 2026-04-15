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

import { useTransportStore, useTrackerStore, useEditorStore, useSettingsStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { getToneEngine } from '@engine/ToneEngine';
import { useThemeStore } from '@stores/useThemeStore';
import { cssColorToPixi } from '../../theme';
import { VU_GREEN, VU_YELLOW, VU_RED } from '../../colors';

// VU meter constants — must match DOM ChannelVUMeters.tsx for parity
const DECAY_RATE = 0.92;       // per-frame decay at 60fps reference rate
const REFERENCE_FRAME_MS = 1000 / 60; // 16.667ms — normalizes decay across frame rates
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

// Pre-allocated fill style objects to avoid GC pressure in the rAF loop
const FILL_GREEN = { color: VU_GREEN, alpha: 0.9 };
const FILL_YELLOW = { color: VU_YELLOW, alpha: 0.9 };
const FILL_RED = { color: VU_RED, alpha: 0.9 };
const FILL_CLEAR = { color: 0x000000, alpha: 0 };
// Fill style uses theme accent (mutable — updated each frame from theme store)
const FILL_ACCENT = { color: VU_GREEN, alpha: 0.35 };

interface MeterState {
  level: number;
}

interface PixiChannelVUMetersProps {
  width: number;
  height: number;
  editRowY?: number; // Y position of edit row - segments grow from here
}

export const PixiChannelVUMeters: React.FC<PixiChannelVUMetersProps> = ({ width, height, editRowY }) => {
  const pattern = useTrackerStore(useShallow(s => s.patterns[s.currentPatternIndex]));
  const columnVisibility = useEditorStore(s => s.columnVisibility);
  const numChannels = pattern?.channels.length || 4;
  
  // Default editRowY to center of component
  const editRowYRef = useRef(editRowY ?? height / 2);
  useEffect(() => { editRowYRef.current = editRowY ?? height / 2; }, [editRowY, height]);

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
  const wasIdleRef = useRef(false); // true when last frame had all meters at 0

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
    let lastDrawTime = 0;
    const MIN_DRAW_INTERVAL = 16; // cap VU draws at ~60fps

    const draw = () => {
      const g = graphicsRef.current;
      if (!g) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      // Throttle draw rate — VU meters don't need 700+ fps
      const now = performance.now();
      if (now - lastDrawTime < MIN_DRAW_INTERVAL) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      // Compute frame delta for time-based decay
      const dt = lastDrawTime > 0 ? Math.min(now - lastDrawTime, 100) : REFERENCE_FRAME_MS;
      lastDrawTime = now;

      const playing = useTransportStore.getState().isPlaying;

      if (!playing) {
        if (!wasIdleRef.current) {
          g.clear();
          g.rect(0, 0, widthRef.current, heightRef.current);
          g.fill(FILL_CLEAR);
          for (const m of metersRef.current) m.level = 0;
          wasIdleRef.current = true;
        }
        rafId = requestAnimationFrame(draw);
        return;
      }
      // wasIdleRef tracks whether the previous frame was all-zero during playback

      const nc = numChannelsRef.current;
      const h = heightRef.current;
      const offsets = channelOffsetsRef.current;
      const widths = channelWidthsRef.current;

      const isRealtime = useSettingsStore.getState().vuMeterMode === 'realtime';
      let triggerLevels: number[];
      let triggerGens: number[];
      let realtimeLevels: number[] | null = null;
      try {
        const engine = getToneEngine();
        if (isRealtime) {
          realtimeLevels = engine.getChannelLevels(nc);
        }
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

      // Time-based decay factor: identical visual result regardless of frame rate
      const decayFactor = Math.pow(DECAY_RATE, dt / REFERENCE_FRAME_MS);

      // Update levels and check if any meter is active
      let anyActive = false;
      for (let i = 0; i < nc; i++) {
        const meter = metersRef.current[i];
        if (!meter) continue;

        // Time-based decay — consistent across all frame rates
        meter.level *= decayFactor;
        if (meter.level < 0.01) meter.level = 0;

        // Always check trigger data (works for all synths including native WASM like DB303)
        const isNewTrigger = triggerGens[i] !== lastGensRef.current[i];
        if (isNewTrigger) {
          lastGensRef.current[i] = triggerGens[i];
          if (triggerLevels[i] > meter.level) {
            meter.level = triggerLevels[i];
          }
        }

        // In realtime mode, also use per-channel audio meter data (higher wins)
        if (isRealtime && realtimeLevels) {
          const target = realtimeLevels[i] || 0;
          if (target > meter.level) {
            meter.level = target;
          }
        }
        if (meter.level > 0) anyActive = true;
      }

      // Skip draw if all meters at zero and already cleared
      if (!anyActive && wasIdleRef.current) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      wasIdleRef.current = !anyActive;

      g.clear();
      g.rect(0, 0, widthRef.current, heightRef.current);
      g.fill(FILL_CLEAR);

      const swingEnabled = useSettingsStore.getState().vuMeterSwing;
      const mirrorEnabled = useSettingsStore.getState().vuMeterMirror;
      const vuStyle = useSettingsStore.getState().vuMeterStyle;

      // Update fill accent color from theme
      const themeColors = useThemeStore.getState().getCurrentTheme().colors;
      const accentPixi = cssColorToPixi(themeColors.accent);
      FILL_ACCENT.color = accentPixi.color;

      for (let i = 0; i < nc; i++) {
        const meter = metersRef.current[i];
        if (!meter) continue;

        if (widths[i] && widths[i] < 20) continue;

        if (meter.level < 0.01) continue;

        // Get channel dimensions
        const channelW = widths[i] || (widthRef.current / nc);
        let channelX: number;
        if (offsets[i] !== undefined) {
          channelX = offsets[i] - LINE_NUMBER_WIDTH;
        } else {
          channelX = i * channelW;
        }

        const ery = editRowYRef.current; // Edit row Y position

        if (vuStyle === 'fill') {
          // Fill style: solid color rectangle filling channel width
          const fillHeight = Math.round(meter.level * (ery > 0 ? ery : h / 2));
          if (fillHeight > 0) {
            // Normal: fill upward from edit row
            g.rect(channelX, ery - fillHeight, channelW, fillHeight);
            if (mirrorEnabled) {
              // Mirror: also fill downward from edit row
              g.rect(channelX, ery, channelW, fillHeight);
            }
            g.fill(FILL_ACCENT);
          }
        } else {
          // Segments style: LED-style bars
          // Swing position — global time-based sine wave with per-channel phase offset.
          const swingPos = swingEnabled && meter.level > 0.02
            ? Math.sin(performance.now() * SWING_FREQ + i * SWING_PHASE_STEP) * SWING_RANGE
            : 0;

          let centerX: number;
          if (offsets[i] !== undefined && widths[i]) {
            const offset = offsets[i] - LINE_NUMBER_WIDTH;
            centerX = offset + widths[i] / 2;
          } else {
            centerX = i * channelW + channelW / 2;
          }

          const meterX = centerX - METER_WIDTH / 2 + swingPos;
          const activeSegments = Math.round(meter.level * NUM_SEGMENTS);
          const segStep = SEGMENT_HEIGHT + SEGMENT_GAP;

          // Helpers to compute segment Y positions from edit row
          const getSegYUp = (s: number) => ery - (s + 1) * segStep;
          const getSegYDown = (s: number) => ery + s * segStep;

          // Green segments
          const greenEnd = Math.min(activeSegments, Math.ceil(NUM_SEGMENTS * 0.6));
          if (greenEnd > 0) {
            for (let s = 0; s < greenEnd; s++) {
              g.rect(meterX, getSegYUp(s), METER_WIDTH, SEGMENT_HEIGHT);
              if (mirrorEnabled) g.rect(meterX, getSegYDown(s), METER_WIDTH, SEGMENT_HEIGHT);
            }
            g.fill(FILL_GREEN);
          }

          // Yellow segments
          const yellowStart = greenEnd;
          const yellowEnd = Math.min(activeSegments, Math.ceil(NUM_SEGMENTS * 0.85));
          if (yellowEnd > yellowStart) {
            for (let s = yellowStart; s < yellowEnd; s++) {
              g.rect(meterX, getSegYUp(s), METER_WIDTH, SEGMENT_HEIGHT);
              if (mirrorEnabled) g.rect(meterX, getSegYDown(s), METER_WIDTH, SEGMENT_HEIGHT);
            }
            g.fill(FILL_YELLOW);
          }

          // Red segments
          const redStart = yellowEnd;
          if (activeSegments > redStart) {
            for (let s = redStart; s < activeSegments; s++) {
              g.rect(meterX, getSegYUp(s), METER_WIDTH, SEGMENT_HEIGHT);
              if (mirrorEnabled) g.rect(meterX, getSegYDown(s), METER_WIDTH, SEGMENT_HEIGHT);
            }
            g.fill(FILL_RED);
          }
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
