/**
 * MixerVUMeter - LED-style VU meter for one DJ deck
 *
 * 12-segment vertical meter that polls the deck engine level via RAF.
 * Green (bottom 7) → Yellow (mid 3) → Red (top 2).
 */

import React, { useRef, useEffect, useState } from 'react';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface MixerVUMeterProps {
  deckId: 'A' | 'B' | 'C';
}

const VU_SEGMENTS = 20;

/** Map a dB level to 0-20 segment count */
function levelToSegments(dBLevel: number): number {
  if (dBLevel <= -60) return 0;
  if (dBLevel >= 0) return VU_SEGMENTS;
  const normalized = (dBLevel + 60) / 60;
  return Math.round(normalized * VU_SEGMENTS);
}

/** Get LED color for a given segment index (0=bottom, 19=top) */
function getSegmentColor(index: number, lit: boolean): string {
  if (!lit) return 'var(--color-bg-tertiary)';
  if (index >= 17) return 'var(--color-error)';
  if (index >= 12) return 'var(--color-warning)';
  return 'var(--color-success)';
}

export const MixerVUMeter: React.FC<MixerVUMeterProps> = ({ deckId }) => {
  const [level, setLevel] = useState(-Infinity);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const tick = () => {
      if (!mountedRef.current) return;
      try {
        const dB = getDJEngine().getDeck(deckId).getLevel();
        setLevel(typeof dB === 'number' ? dB : -Infinity);
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
      style={{ width: 8 }}
      title={`Deck ${deckNum} level meter`}
    >
      {Array.from({ length: VU_SEGMENTS }, (_, i) => (
        <div
          key={i}
          className="rounded-[1px]"
          style={{
            width: 8,
            height: 6,
            backgroundColor: getSegmentColor(i, i < segments),
            transition: 'background-color 0.05s',
          }}
        />
      ))}
    </div>
  );
};
