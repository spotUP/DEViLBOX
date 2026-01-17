/**
 * ChannelVUMeters - LED-style segmented VU meters
 * Bars extend UP from edit bar with sectioned segments
 * Gradient from bright cyan at top to deep blue at bottom
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTrackerStore, useThemeStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

interface ChannelVUMetersProps {
  channelWidths?: number[];
  channelOffsets?: number[];
}

const DECAY_RATE = 0.88;
const SWING_RANGE = 50;
const SWING_SPEED = 0.8;
const NUM_SEGMENTS = 26; // Number of LED segments
const SEGMENT_GAP = 4; // Gap between segments in pixels

// Get segment color based on position (0 = bottom, 1 = top)
// Hue parameter allows theme-aware coloring (0 = red, 180 = cyan)
const getSegmentColor = (ratio: number, isLit: boolean, hue: number = 0): { bg: string; glow: string } => {
  if (!isLit) {
    // Off state - fully transparent
    return {
      bg: 'transparent',
      glow: 'none',
    };
  }

  // Lit state - theme-aware color with brightness gradient
  const saturation = hue === 180 ? 100 : 75 + ratio * 10; // 100% for cyan, 75-85% for others
  const lightness = hue === 180 ? 45 + ratio * 15 : 40 + ratio * 20; // Adjusted for cyan
  const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

  return {
    bg: color,
    glow: `0 0 6px ${color}`,
  };
};

export const ChannelVUMeters: React.FC<ChannelVUMetersProps> = ({
  channelWidths: _channelWidths = [],
  channelOffsets: _channelOffsets = [],
}) => {
  const { patterns, currentPatternIndex } = useTrackerStore();
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(200);

  // Theme-aware hue: cyan (180) for cyan-lineart theme, red (0) for others
  const meterHue = currentThemeId === 'cyan-lineart' ? 180 : 0;

  const [meters, setMeters] = useState<{ level: number; position: number; direction: number }[]>(
    () => Array(numChannels).fill(null).map((_, i) => ({
      level: 0,
      position: (i % 2 === 0 ? -1 : 1) * SWING_RANGE * 0.5,
      direction: i % 2 === 0 ? 1 : -1
    }))
  );
  const animationRef = useRef<number | null>(null);

  // Measure container height
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const engine = getToneEngine();

    const animate = () => {
      const triggerLevels = engine.getChannelTriggerLevels(numChannels);

      setMeters(prev => {
        return prev.map((meter, i) => {
          const trigger = triggerLevels[i] || 0;
          const staggerOffset = i * 0.012;

          let newLevel = meter.level;
          let newPosition = meter.position;
          let newDirection = meter.direction;

          if (trigger > newLevel) {
            const attackSpeed = 0.7 - staggerOffset;
            newLevel = newLevel + (trigger - newLevel) * attackSpeed;
          } else {
            const decayRate = DECAY_RATE - staggerOffset;
            newLevel = newLevel * decayRate;
            if (newLevel < 0.01) newLevel = 0;
          }

          if (newLevel > 0.02) {
            const distFromCenter = Math.abs(newPosition) / SWING_RANGE;
            const easeZone = Math.max(0, (distFromCenter - 0.7) / 0.3);
            const easedSpeed = SWING_SPEED * (1 - easeZone * 0.7);

            newPosition += easedSpeed * newDirection;

            if (newPosition >= SWING_RANGE) {
              newPosition = SWING_RANGE;
              newDirection = -1;
            } else if (newPosition <= -SWING_RANGE) {
              newPosition = -SWING_RANGE;
              newDirection = 1;
            }
          }

          return { level: newLevel, position: newPosition, direction: newDirection };
        });
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [numChannels]);

  const ROW_NUM_WIDTH = 48;
  const CHANNEL_WIDTH = 260;
  const METER_WIDTH = 28;

  const getChannelCenterX = (index: number) => {
    const channelLeft = ROW_NUM_WIDTH + index * CHANNEL_WIDTH;
    return channelLeft + CHANNEL_WIDTH / 2;
  };

  return (
    <div ref={containerRef} className="vu-meters-overlay">
      {Array(numChannels).fill(0).map((_, index) => {
        const meter = meters[index] || { level: 0, position: 0 };
        const centerX = getChannelCenterX(index);
        const activeSegments = Math.round(meter.level * NUM_SEGMENTS);

        return (
          <div
            key={index}
            className="vu-meter-vertical"
            style={{
              transform: `translateX(${meter.position}px)`,
              left: `${centerX - METER_WIDTH / 2}px`,
              width: `${METER_WIDTH}px`,
              height: `${containerHeight - 4}px`,
              display: 'flex',
              flexDirection: 'column-reverse',
              alignItems: 'stretch',
              gap: `${SEGMENT_GAP}px`,
            }}
          >
            {Array.from({ length: NUM_SEGMENTS }, (_, segIndex) => {
              const isLit = segIndex < activeSegments;
              const ratio = segIndex / (NUM_SEGMENTS - 1);
              const { bg, glow } = getSegmentColor(ratio, isLit, meterHue);

              return (
                <div
                  key={segIndex}
                  style={{
                    height: '4px',
                    backgroundColor: bg,
                    borderRadius: '1px',
                    boxShadow: glow,
                    transition: isLit ? 'none' : 'background-color 80ms, box-shadow 80ms',
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
