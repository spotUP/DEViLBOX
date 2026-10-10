/**
 * DeckBeatPhase — Beat position indicator (1-2-3-4)
 *
 * Shows which beat of the bar the deck is currently on with 4 LED-style
 * indicators. Beat 1 (downbeat) is highlighted in the deck's accent color.
 * The current beat glows brightly; a subtle fill bar shows sub-beat position.
 *
 * Polls at RAF speed via getPhaseInfo from DJAutoSync: the lit light is the
 * beat the heard position last crossed, its brightness the fraction into it.
 */

import React, { useRef, useEffect, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import type { DeckId } from '@/engine/dj/DeckEngine';
import { useDeckVisualizationData } from '@/hooks/dj/useDeckVisualizationData';

interface DeckBeatPhaseProps {
  deckId: DeckId;
}

const BEAT_COUNT = 4;

// The first part of a beat counts as "on beat" (glow, full brightness).
const ON_BEAT_THRESHOLD = 0.12;

/** Brightness of the lit beat light at a fraction into its beat. */
export function beatLightBrightness(beatFraction: number): number {
  return beatFraction < ON_BEAT_THRESHOLD ? 1.0 : Math.max(0.3, 1.0 - beatFraction * 0.8);
}

export const DeckBeatPhase: React.FC<DeckBeatPhaseProps> = ({ deckId }) => {
  const hasBeatGrid = useDJStore((s) => !!s.decks[deckId].beatGrid);
  const viz = useDeckVisualizationData(deckId);

  // React state changes only when the lit light or its glow changes; the
  // brightness follows the sub-beat position every frame through the refs.
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [isOnBeat, setIsOnBeat] = useState(false);
  const brightnessRef = useRef(1);
  const overlayRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const tick = () => {
      if (!mountedRef.current) return;
      rafRef.current = requestAnimationFrame(tick);
      // Perf: no polling while the tab is hidden.
      if (document.hidden) return;
      const phase = viz.getBeatPhase();
      // The beat in progress (the last beat the heard position crossed).
      const beat = phase && phase.beatInBar >= 0 ? phase.beatInBar % BEAT_COUNT : -1;
      const fraction = phase ? phase.beatFraction : 0;
      setCurrentBeat(beat);
      setIsOnBeat(beat >= 0 && fraction < ON_BEAT_THRESHOLD);
      brightnessRef.current = beatLightBrightness(fraction);
      const el = beat >= 0 ? overlayRefs.current[beat] : null;
      if (el) el.style.opacity = String(brightnessRef.current);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [deckId, viz]);

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
        const brightness = isActive ? brightnessRef.current : 0.08;

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
              ref={(el) => { overlayRefs.current[i] = el; }}
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
