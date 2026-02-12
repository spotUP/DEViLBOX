/**
 * ChannelVUMeters - LED-style segmented VU meters
 * Bars extend UP from edit bar with sectioned segments
 * Gradient from bright cyan at top to deep blue at bottom
 *
 * PERFORMANCE: Uses refs and direct DOM manipulation instead of React state
 * to avoid 60+ state updates per second during animation.
 */

import React, { useEffect, useRef, memo } from 'react';
import { useTrackerStore, useThemeStore, useUIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { getToneEngine } from '@engine/ToneEngine';

// VU meter timing constants - ProTracker style
const DECAY_RATE = 0.92;  // Smooth decay for falloff
const SWING_RANGE = 25;   // Reduced from 50 to stay within channel bounds
const SWING_SPEED = 0.8;
const NUM_SEGMENTS = 26;
const SEGMENT_GAP = 4;

// Get segment color based on position (0 = bottom, 1 = top)
const getSegmentColor = (ratio: number, isLit: boolean, hue: number = 0): { bg: string; glow: string } => {
  if (!isLit) {
    return { bg: 'transparent', glow: 'none' };
  }
  const saturation = hue === 180 ? 100 : 75 + ratio * 10;
  const lightness = hue === 180 ? 45 + ratio * 15 : 40 + ratio * 20;
  const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  return { bg: color, glow: `0 0 6px ${color}` };
};

interface MeterState {
  level: number;
  position: number;
  direction: number;
}

interface ChannelVUMetersProps {
  channelWidth?: number; // Override default channel width (for VirtualizedTrackerView)
  scrollLeft?: number;   // NEW: Explicit scroll offset from parent
}

// PERFORMANCE: Memoize to prevent re-renders on every scroll step
export const ChannelVUMeters: React.FC<ChannelVUMetersProps> = memo(({ channelWidth: channelWidthProp, scrollLeft: scrollLeftProp = 0 }) => {
  const { patterns, currentPatternIndex } = useTrackerStore(useShallow(s => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex
  })));
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const performanceQuality = useUIStore((state) => state.performanceQuality);
  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;

  const containerRef = useRef<HTMLDivElement>(null);
  const meterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const segmentRefs = useRef<(HTMLDivElement | null)[][]>([]);
  const meterStates = useRef<MeterState[]>([]);
  const animationRef = useRef<number | null>(null);
  const containerHeightRef = useRef(200);

  const meterHue = currentThemeId === 'cyan-lineart' ? 180 : 0;

  // Initialize meter states
  useEffect(() => {
    meterStates.current = Array(numChannels).fill(null).map((_, i) => ({
      level: 0,
      position: (i % 2 === 0 ? -1 : 1) * SWING_RANGE * 0.5,
      direction: i % 2 === 0 ? 1 : -1
    }));
    meterRefs.current = Array(numChannels).fill(null);
    segmentRefs.current = Array(numChannels).fill(null).map(() => Array(NUM_SEGMENTS).fill(null));
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

  // Refs for values needed inside the animation loop
  const numChannelsRef = useRef(numChannels);
  const scrollLeftPropRef = useRef(scrollLeftProp);
  const meterHueRef = useRef(meterHue);
  useEffect(() => { numChannelsRef.current = numChannels; }, [numChannels]);
  useEffect(() => { scrollLeftPropRef.current = scrollLeftProp; }, [scrollLeftProp]);
  useEffect(() => { meterHueRef.current = meterHue; }, [meterHue]);

  // Start/stop animation - loop defined inside effect to avoid self-referencing
  useEffect(() => {
    if (performanceQuality === 'low') {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const tick = () => {
      const engine = getToneEngine();
      const nc = numChannelsRef.current;
      const triggerLevels = engine.getChannelTriggerLevels(nc);

      // Apply scroll offset to container from PROP
      if (containerRef.current) {
        containerRef.current.style.transform = `translateX(${-scrollLeftPropRef.current}px)`;
      }

      for (let i = 0; i < nc; i++) {
        const meter = meterStates.current[i];
        if (!meter) continue;

        const trigger = triggerLevels[i] || 0;
        const staggerOffset = i * 0.012;

        // Update level - ProTracker style: instant jump to full on trigger, smooth decay
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

        // Direct DOM updates - no React re-render
        const meterEl = meterRefs.current[i];
        if (meterEl) {
          meterEl.style.transform = `translateX(${meter.position}px)`;
        }

        const activeSegments = Math.round(meter.level * NUM_SEGMENTS);
        const segments = segmentRefs.current[i];
        if (segments) {
          for (let s = 0; s < NUM_SEGMENTS; s++) {
            const segEl = segments[s];
            if (!segEl) continue;

            const isLit = s < activeSegments;
            const ratio = s / (NUM_SEGMENTS - 1);
            const { bg, glow } = getSegmentColor(ratio, isLit, meterHueRef.current);

            segEl.style.backgroundColor = bg;
            segEl.style.boxShadow = glow;
          }
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
  }, [performanceQuality]);

  // Disable VU meters on low quality
  if (performanceQuality === 'low') {
    return null;
  }

  // Note: ROW_NUM_WIDTH is handled by the parent container's left offset
  const DEFAULT_CHANNEL_WIDTH = 260;
  const COLLAPSED_CHANNEL_WIDTH = 60;
  const METER_WIDTH = 28;
  const CHANNEL_WIDTH = channelWidthProp || DEFAULT_CHANNEL_WIDTH;

  // Calculate channel center X accounting for collapsed channels
  // Parent container already starts at ROW_NUM_WIDTH, so we don't include it here
  const getChannelCenterX = (index: number) => {
    // If using custom channel width (VirtualizedTrackerView), don't account for collapsed
    if (channelWidthProp) {
      return index * CHANNEL_WIDTH + CHANNEL_WIDTH / 2;
    }

    if (!pattern) return index * CHANNEL_WIDTH + CHANNEL_WIDTH / 2;

    // Sum widths of all channels before this one
    let offset = 0;
    for (let i = 0; i < index; i++) {
      const isCollapsed = pattern.channels[i]?.collapsed;
      offset += isCollapsed ? COLLAPSED_CHANNEL_WIDTH : CHANNEL_WIDTH;
    }

    // Add half of this channel's width to get center
    const thisChannelWidth = pattern.channels[index]?.collapsed ? COLLAPSED_CHANNEL_WIDTH : CHANNEL_WIDTH;
    return offset + thisChannelWidth / 2;
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
              height: 'calc(100% - 4px)',
              display: 'flex',
              flexDirection: 'column-reverse',
              alignItems: 'stretch',
              gap: `${SEGMENT_GAP}px`,
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
});

ChannelVUMeters.displayName = 'ChannelVUMeters';
