/**
 * DeckBeatPhase — Beat position indicator (1-2-3-4)
 *
 * Shows which beat of the bar the deck is currently on with 4 LED-style
 * indicators. Beat 1 (downbeat) is highlighted in the deck's accent color.
 * The current beat glows brightly; a subtle fill bar shows sub-beat position.
 *
 * Polls at RAF speed via getPhaseInfo from DJAutoSync.
 */

import React, { useRef, useEffect, useState } from 'react';
import { getBeatPhaseInfo, type PhaseInfo } from '@/engine/dj/DJAutoSync';
import { useDJStore } from '@/stores/useDJStore';
import type { DeckId } from '@/engine/dj/DeckEngine';

interface DeckBeatPhaseProps {
  deckId: DeckId;
}

const BEAT_COUNT = 4;

// Threshold: if phase is within this range of 0 or 1, consider "on beat"
const ON_BEAT_THRESHOLD = 0.12;

export const DeckBeatPhase: React.FC<DeckBeatPhaseProps> = ({ deckId }) => {
  const hasBeatGrid = useDJStore((s) => !!s.decks[deckId].beatGrid);
  const timeSignature = useDJStore((s) => s.decks[deckId].beatGrid?.timeSignature ?? 4);

  const [phase, setPhase] = useState<PhaseInfo | null>(null);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const tick = () => {
      if (!mountedRef.current) return;
      const info = getBeatPhaseInfo(deckId);
      setPhase(info);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [deckId]);

  // Which beat of the bar are we on? (0-indexed)
  const currentBeat = phase
    ? Math.floor(phase.barPhase * timeSignature) % BEAT_COUNT
    : -1;

  // Sub-beat phase within current beat (0-1)
  const subBeatPhase = phase ? phase.beatPhase : 0;

  // Is this beat "on" (close to the beat boundary)?
  const isOnBeat = subBeatPhase < ON_BEAT_THRESHOLD || subBeatPhase > (1 - ON_BEAT_THRESHOLD);

  const isA = deckId === 'A';
  const accentColor = isA ? '#3b82f6' : '#f97316'; // blue / orange
  const dimColor = 'rgba(255,255,255,0.08)';

  if (!hasBeatGrid) {
    // No beat grid — show dim placeholders
    return (
      <div className="flex items-center gap-[3px]">
        {Array.from({ length: BEAT_COUNT }, (_, i) => (
          <div
            key={i}
            className="rounded-sm"
            style={{
              width: 10,
              height: 10,
              backgroundColor: dimColor,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: BEAT_COUNT }, (_, i) => {
        const isActive = i === currentBeat;
        const isDownbeat = i === 0;
        // Brightness ramps down across the sub-beat phase
        const brightness = isActive
          ? isOnBeat ? 1.0 : Math.max(0.3, 1.0 - subBeatPhase * 0.8)
          : 0.08;

        const color = isDownbeat ? accentColor : '#ffffff';

        return (
          <div
            key={i}
            className="rounded-sm relative overflow-hidden"
            style={{
              width: 10,
              height: 10,
              backgroundColor: dimColor,
            }}
          >
            {/* Lit overlay */}
            <div
              className="absolute inset-0 rounded-sm"
              style={{
                backgroundColor: color,
                opacity: brightness,
                transition: isActive ? 'none' : 'opacity 0.1s',
              }}
            />
            {/* Glow effect on active beat */}
            {isActive && isOnBeat && (
              <div
                className="absolute inset-[-2px] rounded-sm pointer-events-none"
                style={{
                  boxShadow: `0 0 6px 1px ${isDownbeat ? accentColor : 'rgba(255,255,255,0.5)'}`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
