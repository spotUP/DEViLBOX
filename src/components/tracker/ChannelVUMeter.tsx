/**
 * ChannelVUMeter - LED-style VU meter with sectioned segments
 * Gradient from bright cyan at top to deep blue at bottom
 */

import React, { useEffect, useState, useRef } from 'react';
import { useAnimationFrame } from '@hooks/useAnimationCoordinator';

interface ChannelVUMeterProps {
  level: number; // 0-1, triggered level
  isActive: boolean; // Whether this channel just triggered
}

const NUM_SEGMENTS = 12;
const DECAY_RATE = 0.85; // How fast the meter falls
const DECAY_INTERVAL = 35; // ms between decay updates

// Color gradient from bottom (dark blue) to top (bright cyan)
// Using HSL: hue 180-190 (cyan), varying lightness
const getSegmentColor = (index: number, total: number, isLit: boolean): string => {
  if (!isLit) {
    // Off state - very dim version of the color
    const ratio = index / (total - 1);
    const lightness = 8 + ratio * 4; // 8-12% lightness when off
    return `hsl(185, 80%, ${lightness}%)`;
  }

  // Lit state - gradient from dark blue-cyan at bottom to bright cyan at top
  const ratio = index / (total - 1);
  // Hue: 200 (blue) at bottom to 180 (cyan) at top
  const hue = 200 - ratio * 20;
  // Saturation: high throughout
  const saturation = 85 + ratio * 15; // 85-100%
  // Lightness: darker at bottom, brighter at top
  const lightness = 35 + ratio * 30; // 35-65%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

export const ChannelVUMeter: React.FC<ChannelVUMeterProps> = React.memo(
  ({ level, isActive }) => {
    // TEMP: Disable to test performance
    return null;

    const [displayLevel, setDisplayLevel] = useState(0);

    // ProTracker behavior: Instantly jump to triggered note volume, then decay
    useEffect(() => {
      if (isActive && level > 0) {
        const newLevel = Math.min(1, level);
        // Instant jump to new level (no Math.max - allows both up AND down jumps)
        setDisplayLevel(newLevel);
      }
    }, [level, isActive]);

    // Decay animation using centralized coordinator
    const lastDecayTime = useRef(0);
    useAnimationFrame(
      `vu-meter-decay-${level}-${isActive}`,
      (deltaTime) => {
        lastDecayTime.current += deltaTime;

        // Only decay every DECAY_INTERVAL ms
        if (lastDecayTime.current >= DECAY_INTERVAL) {
          lastDecayTime.current = 0;
          setDisplayLevel((prev) => {
            const next = prev * DECAY_RATE;
            if (next < 0.02) return 0;
            return next;
          });
        }
      },
      []
    );

    const activeSegments = Math.round(displayLevel * NUM_SEGMENTS);

    return (
      <div
        className="flex flex-col-reverse rounded-sm overflow-hidden"
        style={{
          height: '24px',
          width: '8px',
          gap: '1px',
          padding: '1px',
          backgroundColor: 'rgba(0,0,0,0.4)',
        }}
      >
        {Array.from({ length: NUM_SEGMENTS }, (_, i) => {
          const isLit = i < activeSegments;
          const color = getSegmentColor(i, NUM_SEGMENTS, isLit);

          return (
            <div
              key={i}
              style={{
                flex: 1,
                backgroundColor: color,
                borderRadius: '1px',
                boxShadow: isLit ? `0 0 4px ${color}` : 'none',
                transition: isLit ? 'none' : 'background-color 80ms, box-shadow 80ms',
              }}
            />
          );
        })}
      </div>
    );
  }
);

ChannelVUMeter.displayName = 'ChannelVUMeter';
