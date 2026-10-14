/**
 * ChannelVUMeters - Canvas-based LED-style segmented VU meters
 * Bars extend UP from edit bar with sectioned segments
 * Green → Yellow → Red gradient from bottom to top
 *
 * PERFORMANCE: Single <canvas> element replaces 104+ DOM nodes.
 * All rendering is done via Canvas 2D — zero per-frame DOM mutations,
 * no forced reflows, no style recalculations.
 */

import React, { useCallback, useEffect, useRef, memo } from 'react';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';
import { useTrackerStore, useSettingsStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { getToneEngine } from '@engine/ToneEngine';
import { useTransportStore } from '@stores/useTransportStore';
import { useThemeStore } from '@stores/useThemeStore';
import { liveScopeFrame } from '@stores/useOscilloscopeStore';
import { waveformVuLevel, engineFedMeterTarget, meterKilledByStop } from './waveformVuLevel';

// VU meter timing constants - ProTracker style
const DECAY_RATE = 0.92;       // per-frame decay at 60fps reference rate
const REFERENCE_FRAME_MS = 1000 / 60; // 16.667ms — normalizes decay across frame rates
const SWING_RANGE = 50;        // wider horizontal travel
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

/** Parse a CSS color string to [r,g,b]. Supports #hex, rgb(), rgba(). */
function parseColor(s: string): [number, number, number] {
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  const hex = s.replace('#', '');
  if (hex.length >= 6) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  return [34, 197, 94]; // fallback green
}

interface MeterState {
  level: number;
}

/**
 * A meter source other than the tracker's engine: each channel's waveform
 * (-1..1) at the time the listener hears it, and whether the source plays.
 * A DJ deck feeds its channel scopes (DeckEngine.getChannelWaveforms: the
 * rendered scope track of a rendered module, the replayer's analysers live).
 */
export type ChannelMeterFeed = () => { playing: boolean; waveforms: ArrayLike<number>[] };

interface ChannelVUMetersProps {
  channelOffsets?: number[];
  channelWidths?: number[];
  scrollLeft?: number;
  editRowY?: number;  // CSS-px Y of the edit row center line
  /** Channels drawn. A format editor (GoatTracker) owns its channels; the tracker pattern is a blank. */
  channelCount?: number;
  /** Meter this source instead of the tracker's engine (a DJ deck). */
  feed?: ChannelMeterFeed;
}

export const ChannelVUMeters: React.FC<ChannelVUMetersProps> = memo(({ channelOffsets = [], channelWidths = [], scrollLeft: scrollLeftProp = 0, editRowY: editRowYProp, channelCount, feed }) => {
  const { patterns, currentPatternIndex } = useTrackerStore(useShallow(s => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex
  })));
  const pattern = patterns[currentPatternIndex];
  const numChannels = channelCount || pattern?.channels.length || 4;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterStates = useRef<MeterState[]>([]);
  const lastTickRef = useRef(0);
  const lastGensRef = useRef<number[]>([]);
  const prevSourceRef = useRef<number[]>([]);
  const wasPlayingRef = useRef(false);

  // Refs for values needed inside the animation loop
  const numChannelsRef = useRef(numChannels);
  const scrollLeftRef = useRef(scrollLeftProp);
  const channelOffsetsRef = useRef(channelOffsets);
  const channelWidthsRef = useRef(channelWidths);
  const editRowYRef = useRef(editRowYProp ?? 0);
  const feedRef = useRef(feed);
  useEffect(() => { feedRef.current = feed; }, [feed]);
  useEffect(() => { numChannelsRef.current = numChannels; }, [numChannels]);
  useEffect(() => { scrollLeftRef.current = scrollLeftProp; }, [scrollLeftProp]);
  useEffect(() => { channelOffsetsRef.current = channelOffsets; }, [channelOffsets]);
  useEffect(() => { channelWidthsRef.current = channelWidths; }, [channelWidths]);
  useEffect(() => { editRowYRef.current = editRowYProp ?? 0; }, [editRowYProp]);

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

  // Meters move only with sound: the shared gated loop (useFrameGate) runs
  // while the app sounds, through the ~2 s fall-off after it stops.
  const drawFrame = useCallback((): boolean => {

      const canvas = canvasRef.current;
      if (!canvas) {
        return false;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return false;
      }

      // Compute frame delta for time-based decay
      const now = performance.now();
      const dt = lastTickRef.current > 0 ? Math.min(now - lastTickRef.current, 100) : REFERENCE_FRAME_MS; // cap at 100ms to avoid huge jumps
      lastTickRef.current = now;

      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      const nc = numChannelsRef.current;
      const isRealtime = useSettingsStore.getState().vuMeterMode === 'realtime';
      // A fed meter (a DJ deck) reads its own source; the tracker reads its engine.
      const fed = feedRef.current ? feedRef.current() : null;
      let triggerLevels: number[] = [];
      let triggerGens: number[] | null = null;
      let realtimeLevels: number[] | null = null;
      let engineLevels: number[] | null = null;
      if (!fed) {
        try {
          const engine = getToneEngine();
          if (isRealtime) {
            realtimeLevels = engine.getChannelLevels(nc);
          }
          engineLevels = engine.getEngineChannelLevels(nc);
          triggerLevels = engine.getChannelTriggerLevels(nc);
          triggerGens = engine.getChannelTriggerGenerations(nc);
        } catch {
          return false;
        }
      }
      const sl = scrollLeftRef.current;
      const offsets = channelOffsetsRef.current;
      const widths = channelWidthsRef.current;
      const isPlaying = fed ? fed.playing : useTransportStore.getState().isPlaying;
      // Per-channel waveforms: the feed's, or a direct-routed WASM engine's (Cinter, Furnace, …).
      const oscChannelData = fed ? (fed.playing ? fed.waveforms : null) : liveScopeFrame();
      // A feed's waveforms are -1..1 floats; an engine's capture is int16.
      const oscFullScale = fed ? 1 : 32768;
      const swingEnabled = useSettingsStore.getState().vuMeterSwing;
      const mirrorEnabled = useSettingsStore.getState().vuMeterMirror;
      const vuStyle = useSettingsStore.getState().vuMeterStyle;

      // Read theme accent color from store (avoids expensive getComputedStyle per frame)
      const accentRaw = useThemeStore.getState().getCurrentTheme().colors.accent || '#22c55e';
      const [ar, ag, ab] = parseColor(accentRaw);

      // Time-based decay factor: identical visual result regardless of frame rate
      const decayFactor = Math.pow(DECAY_RATE, dt / REFERENCE_FRAME_MS);

      // Grow lastGens if needed
      if (lastGensRef.current.length < nc) {
        const old = lastGensRef.current;
        lastGensRef.current = new Array(nc).fill(0);
        for (let j = 0; j < old.length; j++) lastGensRef.current[j] = old[j];
      }

      const playingNow = isPlaying || !!oscChannelData;
      const killed = meterKilledByStop(playingNow, wasPlayingRef.current);
      wasPlayingRef.current = playingNow;

      for (let i = 0; i < nc; i++) {
        const meter = meterStates.current[i];
        if (!meter) continue;

        // Skip collapsed channels
        if (widths[i] && widths[i] < 20) continue;

        // When playback stops, kill meters instantly (no lingering bounce); a note sounded
        // while stopped (row preview) still moves its meter. A direct-routed WASM engine can
        // play with transport isPlaying still false, so its active oscilloscope counts as playing.
        if (killed) {
          meter.level = 0;
        } else {
          // Time-based decay — consistent across all frame rates
          meter.level *= decayFactor;
          if (meter.level < 0.01) meter.level = 0;

          // Always check trigger data (works for all synths including native WASM like DB303)
          if (triggerGens && triggerGens[i] !== lastGensRef.current[i]) {
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

          // WASM per-channel oscilloscope (Cinter, Furnace, Hively, …): those play
          // via a direct-routed WASM engine so the ToneEngine channel meters above
          // stay silent. Derive the level from the channel waveform peak instead.
          // An engine that reports its own levels (libopenmpt) is metered from
          // those: its waveform capture bleeds the neighbouring channels.
          const oscD = oscChannelData ? oscChannelData[i] : null;
          if (oscD && oscD.length > 0) {
            const level = waveformVuLevel(engineLevels ? (engineLevels[i] || 0) : null, oscD, oscFullScale);
            const target = engineFedMeterTarget(isRealtime ? 'realtime' : 'trigger', level, prevSourceRef.current[i] || 0);
            prevSourceRef.current[i] = level;
            if (target > meter.level) meter.level = target;
          }
        }

        // Calculate channel center X
        let centerX: number;
        if (offsets[i] !== undefined && widths[i]) {
          const offset = offsets[i] - LINE_NUMBER_WIDTH;
          centerX = offset + widths[i] / 2;
        } else {
          centerX = i * 260 + 130;
        }

        // Get channel width for fill style
        const channelW = widths[i] || 260;
        const channelX = offsets[i] !== undefined ? offsets[i] - LINE_NUMBER_WIDTH - sl : i * 260 - sl;

        // Edit row Y — segments extrude from this line, offset up to avoid drawing over the edit bar
        const ery = editRowYRef.current - 12;

        if (vuStyle === 'fill') {
          // Fill style: theme-colored rectangle, very subtle
          const fillHeight = Math.round(meter.level * (ery > 0 ? ery : ch / 2));
          if (fillHeight > 0) {
            ctx.fillStyle = `rgba(${ar},${ag},${ab},0.12)`;
            // Upward from edit row
            ctx.fillRect(Math.round(channelX), ery - fillHeight, channelW, fillHeight);
            if (mirrorEnabled) {
              // Mirrored downward from edit row
              ctx.fillRect(Math.round(channelX), ery, channelW, fillHeight);
            }
          }
        } else {
          // Segments style: LED-style bars
          // Apply scroll and swing
          const swingPos = swingEnabled && meter.level > 0.02
            ? Math.sin(performance.now() * SWING_FREQ + i * SWING_PHASE_STEP) * SWING_RANGE
            : 0;
          const meterX = centerX - METER_WIDTH / 2 - sl + swingPos;

          const activeSegments = Math.round(meter.level * NUM_SEGMENTS);
          const segStep = SEGMENT_HEIGHT + SEGMENT_GAP;

          for (let s = 0; s < activeSegments; s++) {
            const ratio = s / (NUM_SEGMENTS - 1);

            // Determine color
            let color: string;
            if (ratio < 0.6) {
              color = COLOR_GREEN;
            } else if (ratio < 0.85) {
              color = COLOR_YELLOW;
            } else {
              color = COLOR_RED;
            }

            ctx.fillStyle = color;
            // Segments grow upward from edit row
            const segYUp = ery - (s + 1) * segStep;
            ctx.fillRect(Math.round(meterX), Math.round(segYUp), METER_WIDTH, SEGMENT_HEIGHT);

            if (mirrorEnabled) {
              // Mirrored: segments grow downward from edit row
              const segYDown = ery + s * segStep;
              ctx.fillRect(Math.round(meterX), Math.round(segYDown), METER_WIDTH, SEGMENT_HEIGHT);
            }
          }
        }
      }

      return true;
  }, []);
  useVisualizationAnimation({ onFrame: drawFrame, fps: 60 });

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
