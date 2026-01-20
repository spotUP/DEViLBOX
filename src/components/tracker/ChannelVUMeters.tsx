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
  singleChannel?: number; // If provided, only render this channel as a horizontal header bar
}

const DECAY_RATE = 0.88;
const SWING_RANGE = 40;
const SWING_SPEED = 0.6;
const NUM_SEGMENTS = 26; // Number of LED segments
const SEGMENT_GAP = 4; // Gap between segments in pixels

export const ChannelVUMeters: React.FC<ChannelVUMetersProps> = ({
  channelWidths = [],
  channelOffsets = [],
  singleChannel,
}) => {
  const { patterns, currentPatternIndex } = useTrackerStore();
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;
  const containerRef = useRef<HTMLDivElement>(null);

  // Theme-aware hue: cyan (180) for cyan-lineart theme, lime/green (90) for FT2
  const meterHue = currentThemeId === 'ft2-classic' ? 90 : (currentThemeId === 'cyan-lineart' ? 180 : 0);

  const [meters, setMeters] = useState<{ level: number; position: number; direction: number }[]>(
    () => Array(numChannels).fill(null).map((_, i) => ({
      level: 0,
      position: (i % 2 === 0 ? -1 : 1) * SWING_RANGE * 0.5,
      direction: i % 2 === 0 ? 1 : -1
    }))
  );
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const engine = getToneEngine();

    const animate = () => {
      const triggerLevels = engine.getChannelTriggerLevels(numChannels);

      setMeters(prev => {
        // Handle channel count changes
        if (prev.length !== numChannels) {
          return Array(numChannels).fill(null).map((_, i) => ({
             level: prev[i]?.level || 0,
             position: prev[i]?.position || (i % 2 === 0 ? -1 : 1) * SWING_RANGE * 0.5,
             direction: prev[i]?.direction || (i % 2 === 0 ? 1 : -1)
          }));
        }

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

          // Update swing position
          newPosition += SWING_SPEED * newDirection;
          if (newPosition >= SWING_RANGE) { newPosition = SWING_RANGE; newDirection = -1; }
          else if (newPosition <= -SWING_RANGE) { newPosition = -SWING_RANGE; newDirection = 1; }

          return { level: newLevel, position: newPosition, direction: newDirection };
        });
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [numChannels]);

  // Render horizontal header meter if singleChannel is provided
  if (singleChannel !== undefined) {
    const level = meters[singleChannel]?.level || 0;
    return (
      <div className="w-full h-full bg-black/40 rounded-sm overflow-hidden border border-white/5">
        <div 
          className="h-full transition-all duration-30 shadow-[0_0_10px_rgba(0,255,0,0.3)]"
          style={{ 
            width: `${level * 100}%`,
            background: `linear-gradient(90deg, hsl(${meterHue}, 80%, 40%) 0%, hsl(${meterHue}, 100%, 60%) 100%)`
          }}
        />
      </div>
    );
  }

  // Standard vertical background meters
  const METER_WIDTH = 28;
  const getChannelCenterX = (index: number) => {
    const offset = channelOffsets[index] ?? (48 + index * 120);
    const width = channelWidths[index] ?? 120;
    return offset + width / 2;
  };

  return (
    <div ref={containerRef} className="vu-meters-overlay w-full h-full relative">
      {Array(numChannels).fill(0).map((_, index) => {
        const meter = meters[index] || { level: 0, position: 0 };
        const centerX = getChannelCenterX(index);
        const activeSegments = Math.round(meter.level * NUM_SEGMENTS);
        const isCollapsed = (channelWidths[index] || 120) < 50;

        if (isCollapsed) return null;

        return (
          <div
            key={index}
            className="vu-meter-vertical absolute bottom-0"
            style={{
              transform: `translateX(${meter.position}px)`,
              left: `${centerX - METER_WIDTH / 2}px`,
              width: `${METER_WIDTH}px`,
              height: `100%`,
              display: 'flex',
              flexDirection: 'column-reverse',
              alignItems: 'stretch',
              gap: `${SEGMENT_GAP}px`,
            }}
          >
            {Array.from({ length: NUM_SEGMENTS }, (_, segIndex) => {
              const isLit = segIndex < activeSegments;
              const ratio = segIndex / (NUM_SEGMENTS - 1);
              const saturation = meterHue === 180 ? 100 : 75 + ratio * 10;
              const lightness = meterHue === 180 ? 45 + ratio * 15 : 40 + ratio * 20;
              const color = `hsl(${meterHue}, ${saturation}%, ${lightness}%)`;

              return (
                <div
                  key={segIndex}
                  style={{
                    height: '2px',
                    backgroundColor: isLit ? color : 'transparent',
                    borderRadius: '1px',
                    boxShadow: isLit ? `0 0 4px ${color}` : 'none',
                    opacity: isLit ? 0.4 : 0,
                    transition: isLit ? 'none' : 'opacity 150ms',
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
