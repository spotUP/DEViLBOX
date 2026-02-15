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

// Color gradient from bottom (Green) to top (Red)
const getSegmentColor = (index: number, total: number, isLit: boolean): string => {
  if (!isLit) {
    return 'rgba(255, 255, 255, 0.05)';
  }

  const ratio = index / (total - 1);
  if (ratio < 0.6) return '#22c55e'; // Green
  if (ratio < 0.85) return '#eab308'; // Yellow
  return '#ef4444'; // Red
};

export const ChannelVUMeter: React.FC<ChannelVUMeterProps> = React.memo(
  ({ level, isActive }) => {
    // DISABLED: Using ChannelVUMeters overlay instead (no React state updates needed)
    // If re-enabling, also set DISABLE_VU_POLLING = false in PatternEditor.tsx
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
