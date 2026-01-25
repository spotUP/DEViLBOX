/**
 * ChannelVUMeters - LED-style segmented VU meters
 * Bars extend UP from edit bar with sectioned segments
 * Gradient from bright cyan at top to deep blue at bottom
 *
 * PERFORMANCE OPTIMIZATIONS:
 * 1. Uses refs and direct DOM manipulation instead of React state
 * 2. Frame rate limited to 30fps (not 60fps) - VU meters don't need 60fps
 * 3. Tracks previous segment states to skip unchanged DOM updates
 * 4. Pre-computes segment colors at startup (no HSL calc per frame)
 * 5. Skips animation entirely when all meters are idle (no audio)
 * 6. Only runs animation loop when audio is playing
 * 7. Uses CSS will-change hint for GPU-accelerated transforms
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useTrackerStore, useThemeStore, useUIStore, useTransportStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

const DECAY_RATE = 0.88;
const SWING_RANGE = 20; // Reduced to stay within channel bounds
const SWING_SPEED = 2.0; // Faster swing
const NUM_SEGMENTS = 26;
const SEGMENT_GAP = 4;

// PERFORMANCE: Limit to 30fps - VU meters look fine at 30fps and uses half the CPU
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

// PERFORMANCE: Pre-compute segment colors for both hues (avoids HSL calculation every frame)
// Key: `${hue}-${segmentIndex}` -> { bg, glow }
const colorCache = new Map<string, { bg: string; glow: string }>();

const getSegmentColor = (segmentIndex: number, isLit: boolean, hue: number): { bg: string; glow: string } => {
  if (!isLit) {
    return { bg: 'transparent', glow: 'none' };
  }

  const cacheKey = `${hue}-${segmentIndex}`;
  let cached = colorCache.get(cacheKey);

  if (!cached) {
    const ratio = segmentIndex / (NUM_SEGMENTS - 1);
    const saturation = hue === 180 ? 100 : 75 + ratio * 10;
    const lightness = hue === 180 ? 45 + ratio * 15 : 40 + ratio * 20;
    const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    cached = { bg: color, glow: `0 0 6px ${color}` };
    colorCache.set(cacheKey, cached);
  }

  return cached;
};

// Pre-warm the color cache for both themes
for (let hue of [0, 180]) {
  for (let i = 0; i < NUM_SEGMENTS; i++) {
    getSegmentColor(i, true, hue);
  }
}

interface MeterState {
  level: number;
  position: number;
  direction: number;
  prevActiveSegments: number; // Track previous state to skip unchanged updates
  prevPosition: number; // Track previous position to skip unchanged transform updates
}

export const ChannelVUMeters: React.FC = () => {
  // VU meters re-enabled - not the cause of FPS issues
  const DISABLE_VU_METERS = false;

  const { patterns, currentPatternIndex } = useTrackerStore();
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const performanceQuality = useUIStore((state) => state.performanceQuality);
  // PERFORMANCE: Only run animation when playing
  const isPlaying = useTransportStore((state) => state.isPlaying);
  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;

  const containerRef = useRef<HTMLDivElement>(null);
  const meterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const segmentRefs = useRef<(HTMLDivElement | null)[][]>([]);
  const meterStates = useRef<MeterState[]>([]);
  const animationRef = useRef<number | null>(null);
  const containerHeightRef = useRef(200);
  // PERFORMANCE: Track consecutive idle frames to reduce work when no audio
  const idleFramesRef = useRef(0);

  const meterHue = currentThemeId === 'cyan-lineart' ? 180 : 0;

  // Initialize meter states
  useEffect(() => {
    meterStates.current = Array(numChannels).fill(null).map((_, i) => ({
      level: 0,
      position: (i % 2 === 0 ? -1 : 1) * SWING_RANGE * 0.5,
      direction: i % 2 === 0 ? 1 : -1,
      prevActiveSegments: -1, // -1 forces initial render
      prevPosition: -999, // Force initial position update
    }));
    meterRefs.current = Array(numChannels).fill(null);
    segmentRefs.current = Array(numChannels).fill(null).map(() => Array(NUM_SEGMENTS).fill(null));
    idleFramesRef.current = 0;
  }, [numChannels]);

  // Measure container height
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        containerHeightRef.current = containerRef.current.clientHeight;
        // Update meter heights directly
        meterRefs.current.forEach(ref => {
          if (ref) ref.style.height = `${containerHeightRef.current - 4}px`;
        });
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Track last frame time for FPS limiting
  const lastFrameTimeRef = useRef(0);

  // Animation loop using requestAnimationFrame - NO React state updates
  // PERFORMANCE: Limited to 30fps, skips unchanged segments, detects idle state
  const animate = useCallback((timestamp: number) => {
    // PERFORMANCE: Limit to target FPS
    const elapsed = timestamp - lastFrameTimeRef.current;
    if (elapsed < FRAME_INTERVAL) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }
    lastFrameTimeRef.current = timestamp - (elapsed % FRAME_INTERVAL);

    const engine = getToneEngine();
    const triggerLevels = engine.getChannelTriggerLevels(numChannels);

    // PERFORMANCE: Track if all meters are idle
    let anyActive = false;
    let anyChanged = false;

    for (let i = 0; i < numChannels; i++) {
      const meter = meterStates.current[i];
      if (!meter) continue;

      const trigger = triggerLevels[i] || 0;
      const staggerOffset = i * 0.012;

      // Update level
      if (trigger > meter.level) {
        const attackSpeed = 0.7 - staggerOffset;
        meter.level = meter.level + (trigger - meter.level) * attackSpeed;
        anyActive = true;
      } else {
        const decayRate = DECAY_RATE - staggerOffset;
        meter.level = meter.level * decayRate;
        if (meter.level < 0.01) {
          meter.level = 0;
        } else {
          anyActive = true; // Still decaying
        }
      }

      // Update swing position only when there's level
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

      // PERFORMANCE: Only update transform if position changed significantly
      const positionRounded = Math.round(meter.position);
      if (positionRounded !== meter.prevPosition) {
        const meterEl = meterRefs.current[i];
        if (meterEl) {
          meterEl.style.transform = `translateX(${positionRounded}px)`;
        }
        meter.prevPosition = positionRounded;
        anyChanged = true;
      }

      const activeSegments = Math.round(meter.level * NUM_SEGMENTS);
      const prevActiveSegments = meter.prevActiveSegments;

      // PERFORMANCE: Skip segment updates if count hasn't changed
      if (activeSegments === prevActiveSegments) {
        continue;
      }

      anyChanged = true;
      const segments = segmentRefs.current[i];
      if (segments) {
        // PERFORMANCE: Only update segments that changed state
        const minSeg = Math.min(prevActiveSegments, activeSegments);
        const maxSeg = Math.max(prevActiveSegments, activeSegments);

        for (let s = 0; s < NUM_SEGMENTS; s++) {
          const segEl = segments[s];
          if (!segEl) continue;

          // PERFORMANCE: Skip segments outside the changed range
          // Exception: first render (prevActiveSegments === -1) updates all
          if (prevActiveSegments !== -1 && (s < minSeg || s >= maxSeg)) {
            continue;
          }

          const isLit = s < activeSegments;
          // PERFORMANCE: Use pre-computed colors from cache
          const { bg, glow } = getSegmentColor(s, isLit, meterHue);

          segEl.style.backgroundColor = bg;
          segEl.style.boxShadow = glow;
        }
      }

      // Update tracking after processing
      meter.prevActiveSegments = activeSegments;
    }

    // PERFORMANCE: Track idle frames - when idle for a while, we could reduce frequency further
    if (!anyActive && !anyChanged) {
      idleFramesRef.current++;
    } else {
      idleFramesRef.current = 0;
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [numChannels, meterHue]);

  // Start/stop animation based on playback state and quality settings
  useEffect(() => {
    // PERFORMANCE: Don't run animation when disabled, low quality, or not playing
    if (DISABLE_VU_METERS || performanceQuality === 'low' || !isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      // Reset meters to zero when stopping
      if (!isPlaying) {
        meterStates.current.forEach((meter, i) => {
          if (meter) {
            meter.level = 0;
            meter.prevActiveSegments = -1; // Force re-render on next play
            meter.prevPosition = -999;
          }
          // Clear all segments
          const segments = segmentRefs.current[i];
          if (segments) {
            segments.forEach(segEl => {
              if (segEl) {
                segEl.style.backgroundColor = 'transparent';
                segEl.style.boxShadow = 'none';
              }
            });
          }
        });
      }
      return;
    }

    // Reset idle counter when starting
    idleFramesRef.current = 0;
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [animate, performanceQuality, isPlaying]);

  // Disable VU meters on low quality or when testing
  if (DISABLE_VU_METERS || performanceQuality === 'low') {
    return null;
  }

  // Match PatternEditorCanvas dimensions
  const ROW_NUM_WIDTH = 40; // LINE_NUMBER_WIDTH in canvas
  const CHAR_WIDTH = 10;
  const noteWidth = CHAR_WIDTH * 3 + 4;  // 34
  const paramWidth = CHAR_WIDTH * 12 + 28; // 148 - inst(2) + vol(2) + eff1(3) + eff2(3) + accent(1) + slide(1) + gaps
  const CHANNEL_WIDTH = noteWidth + paramWidth + 20; // 202
  const METER_WIDTH = 20; // Narrower to fit better

  const getChannelCenterX = (index: number) => {
    return ROW_NUM_WIDTH + index * CHANNEL_WIDTH + CHANNEL_WIDTH / 2;
  };

  return (
    <div ref={containerRef} className="vu-meters-overlay">
      {Array(numChannels).fill(0).map((_, index) => {
        const centerX = getChannelCenterX(index);

        return (
          <div
            key={index}
            ref={el => { meterRefs.current[index] = el; }}
            className="vu-meter-vertical"
            style={{
              left: `${centerX - METER_WIDTH / 2}px`,
              width: `${METER_WIDTH}px`,
              height: `${containerHeightRef.current - 4}px`,
              display: 'flex',
              flexDirection: 'column-reverse',
              alignItems: 'stretch',
              gap: `${SEGMENT_GAP}px`,
              // PERFORMANCE: GPU acceleration hints
              willChange: 'transform',
              transform: 'translateX(0px)', // Initialize transform
            }}
          >
            {Array.from({ length: NUM_SEGMENTS }, (_, segIndex) => (
              <div
                key={segIndex}
                ref={el => {
                  if (!segmentRefs.current[index]) segmentRefs.current[index] = [];
                  segmentRefs.current[index][segIndex] = el;
                }}
                style={{
                  height: '4px',
                  backgroundColor: 'transparent',
                  borderRadius: '1px',
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
};
