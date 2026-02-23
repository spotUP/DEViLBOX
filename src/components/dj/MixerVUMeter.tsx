/**
 * MixerVUMeter - LED-style VU meter for one DJ deck
 *
 * 20-segment vertical meter with peak hold that polls the deck engine level via RAF.
 * Green (bottom 12) → Yellow (mid 5) → Red (top 3).
 * Peak hold LED stays at the peak position for ~1.5 seconds, then drops.
 */

import React, { useRef, useEffect, useState } from 'react';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface MixerVUMeterProps {
  deckId: 'A' | 'B' | 'C';
}

const VU_SEGMENTS = 20;
const PEAK_HOLD_MS = 1500;
const PEAK_DECAY_SEGMENTS_PER_SEC = 12; // How fast peak drops after hold expires

/** Map a dB level to 0-20 segment count */
function levelToSegments(dBLevel: number): number {
  if (dBLevel <= -60) return 0;
  if (dBLevel >= 0) return VU_SEGMENTS;
  const normalized = (dBLevel + 60) / 60;
  return Math.round(normalized * VU_SEGMENTS);
}

/** Get LED color for a given segment index (0=bottom, 19=top) */
function getSegmentColor(index: number): string {
  if (index >= 17) return 'var(--color-error)';
  if (index >= 12) return 'var(--color-warning)';
  return 'var(--color-success)';
}

export const MixerVUMeter: React.FC<MixerVUMeterProps> = ({ deckId }) => {
  const [level, setLevel] = useState(-Infinity);
  const [peakSegment, setPeakSegment] = useState(-1);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const peakRef = useRef(-1);
  const peakTimeRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    let lastTime = performance.now();

    const tick = (now: number) => {
      if (!mountedRef.current) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      try {
        const dB = getDJEngine().getDeck(deckId).getLevel();
        const dbVal = typeof dB === 'number' ? dB : -Infinity;
        setLevel(dbVal);

        const currentSegments = levelToSegments(dbVal);

        // Update peak hold
        if (currentSegments >= peakRef.current) {
          peakRef.current = currentSegments;
          peakTimeRef.current = now;
        } else if (now - peakTimeRef.current > PEAK_HOLD_MS) {
          // Decay peak
          peakRef.current = Math.max(
            currentSegments,
            peakRef.current - PEAK_DECAY_SEGMENTS_PER_SEC * dt,
          );
        }
        setPeakSegment(Math.round(peakRef.current));
      } catch {
        // Engine not ready yet
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [deckId]);

  const segments = levelToSegments(level);

  const deckNum = deckId === 'A' ? '1' : '2';

  return (
    <div
      className="flex flex-col-reverse gap-[1px] justify-center"
      style={{ width: 12 }}
      title={`Deck ${deckNum} level meter`}
    >
      {Array.from({ length: VU_SEGMENTS }, (_, i) => {
        const isLit = i < segments;
        const isPeakHold = !isLit && i === peakSegment - 1 && peakSegment > segments;
        const color = getSegmentColor(i);

        return (
          <div
            key={i}
            className="rounded-[1px]"
            style={{
              width: 12,
              height: 5,
              backgroundColor: isLit || isPeakHold
                ? color
                : 'var(--color-bg-tertiary)',
              opacity: isPeakHold ? 0.85 : 1,
              transition: isLit ? 'none' : 'background-color 0.05s',
            }}
          />
        );
      })}
    </div>
  );
};
