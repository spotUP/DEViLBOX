/**
 * ChannelVUMeter - ProTracker-style VU meter that triggers on note events
 * Vertical bar meter with yellow/magenta segments that animate when notes play
 */

import React, { useEffect, useState, useRef } from 'react';

interface ChannelVUMeterProps {
  level: number; // 0-1, triggered level
  isActive: boolean; // Whether this channel just triggered
}

const NUM_SEGMENTS = 8;
const DECAY_RATE = 0.88; // How fast the meter falls
const DECAY_INTERVAL = 40; // ms between decay updates

export const ChannelVUMeter: React.FC<ChannelVUMeterProps> = React.memo(
  ({ level, isActive }) => {
    const [displayLevel, setDisplayLevel] = useState(0);
    const decayRef = useRef<number | null>(null);

    // When a new level comes in, set it immediately if higher
    useEffect(() => {
      if (isActive && level > 0) {
        const newLevel = Math.min(1, level);
        setDisplayLevel((prev) => Math.max(prev, newLevel));
      }
    }, [level, isActive]);

    // Decay animation
    useEffect(() => {
      const decay = () => {
        setDisplayLevel((prev) => {
          const next = prev * DECAY_RATE;
          if (next < 0.02) return 0;
          return next;
        });
      };

      decayRef.current = window.setInterval(decay, DECAY_INTERVAL);
      return () => {
        if (decayRef.current) {
          clearInterval(decayRef.current);
        }
      };
    }, []);

    const activeSegments = Math.round(displayLevel * NUM_SEGMENTS);

    return (
      <div className="flex flex-col-reverse gap-px" style={{ height: '20px', width: '6px' }}>
        {Array.from({ length: NUM_SEGMENTS }, (_, i) => {
          const isLit = i < activeSegments;
          // ProTracker style: bottom segments are green, middle yellow, top magenta
          const segmentIndex = i;

          let bgColor = 'bg-dark-border/50'; // Off state - dim
          if (isLit) {
            if (segmentIndex >= NUM_SEGMENTS - 2) {
              // Top 2 segments - magenta/pink (hot)
              bgColor = 'bg-fuchsia-400';
            } else if (segmentIndex >= NUM_SEGMENTS - 4) {
              // Next 2 segments - yellow
              bgColor = 'bg-yellow-400';
            } else {
              // Bottom segments - green
              bgColor = 'bg-emerald-400';
            }
          }

          return (
            <div
              key={i}
              className={`w-full ${bgColor}`}
              style={{
                height: '2px',
                transition: isLit ? 'none' : 'background-color 50ms',
              }}
            />
          );
        })}
      </div>
    );
  }
);

ChannelVUMeter.displayName = 'ChannelVUMeter';
