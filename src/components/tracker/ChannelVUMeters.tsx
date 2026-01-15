/**
 * ChannelVUMeters - Heart Tracker inspired VU meters
 * Bars extend UP from edit bar with linear left/right motion
 * Real-time response to actual note triggers from the audio engine
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTrackerStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

interface ChannelVUMetersProps {
  channelWidths?: number[];
  channelOffsets?: number[];
}

const DECAY_RATE = 0.88;
const SWING_RANGE = 50;
const SWING_SPEED = 0.8; // Pixels per frame

export const ChannelVUMeters: React.FC<ChannelVUMetersProps> = ({
  channelWidths: _channelWidths = [],
  channelOffsets: _channelOffsets = [],
}) => {
  const { patterns, currentPatternIndex } = useTrackerStore();
  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;

  // Track level, position, and direction
  const [meters, setMeters] = useState<{ level: number; position: number; direction: number }[]>(
    () => Array(numChannels).fill(null).map((_, i) => ({
      level: 0,
      position: (i % 2 === 0 ? -1 : 1) * SWING_RANGE * 0.5, // Stagger start positions
      direction: i % 2 === 0 ? 1 : -1
    }))
  );
  const animationRef = useRef<number | null>(null);

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

          // Level (height) animation
          if (trigger > newLevel) {
            const attackSpeed = 0.7 - staggerOffset;
            newLevel = newLevel + (trigger - newLevel) * attackSpeed;
          } else {
            const decayRate = DECAY_RATE - staggerOffset;
            newLevel = newLevel * decayRate;
            if (newLevel < 0.01) newLevel = 0;
          }

          // Back and forth motion with ease in/out at edges (only when audible)
          if (newLevel > 0.02) {
            // Calculate distance from center (0 to 1)
            const distFromCenter = Math.abs(newPosition) / SWING_RANGE;
            // Only ease when close to edges (past 70%)
            const easeZone = Math.max(0, (distFromCenter - 0.7) / 0.3);
            const easedSpeed = SWING_SPEED * (1 - easeZone * 0.7);

            newPosition += easedSpeed * newDirection;

            // Reverse at edges
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

  // Match PatternEditor layout exactly
  const ROW_NUM_WIDTH = 48;
  const CHANNEL_WIDTH = 260;
  const METER_WIDTH = 24;

  const getChannelCenterX = (index: number) => {
    const channelLeft = ROW_NUM_WIDTH + index * CHANNEL_WIDTH;
    return channelLeft + CHANNEL_WIDTH / 2;
  };

  // Get channel colors from pattern
  const getChannelColor = (index: number): string => {
    const channel = pattern?.channels[index];
    return channel?.color || '#22c55e'; // Default green if no color set
  };

  return (
    <div className="vu-meters-overlay">
      {Array(numChannels).fill(0).map((_, index) => {
        const meter = meters[index] || { level: 0, position: 0 };
        const color = getChannelColor(index);
        const centerX = getChannelCenterX(index);

        return (
          <div
            key={index}
            className="vu-meter-vertical"
            style={{
              transform: `translateX(${meter.position}px)`,
              left: `${centerX - METER_WIDTH / 2}px`,
              width: `${METER_WIDTH}px`,
            }}
          >
            {/* Main meter bar - grows upward */}
            <div
              className="vu-meter-bar-vertical"
              style={{
                height: `${Math.min(100, meter.level * 100)}%`,
                backgroundColor: color,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};
