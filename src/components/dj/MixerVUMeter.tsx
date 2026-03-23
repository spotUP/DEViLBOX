/**
 * MixerVUMeter - LED-style VU meter for one DJ deck
 *
 * 20-segment vertical meter with peak hold. Uses direct DOM manipulation
 * instead of React state to avoid re-renders on every frame.
 * Throttled to ~15fps (sufficient for visual VU response).
 */

import React, { useRef, useEffect } from 'react';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface MixerVUMeterProps {
  deckId: 'A' | 'B' | 'C';
}

const VU_SEGMENTS = 20;
const PEAK_HOLD_MS = 1500;
const PEAK_DECAY_SEGMENTS_PER_SEC = 12;

/** Map a dB level to 0-20 segment count */
function levelToSegments(dBLevel: number): number {
  if (dBLevel <= -60) return 0;
  if (dBLevel >= 0) return VU_SEGMENTS;
  return Math.round(((dBLevel + 60) / 60) * VU_SEGMENTS);
}

const COLORS = {
  off: 'var(--color-bg-tertiary)',
  green: 'var(--color-success)',
  yellow: 'var(--color-warning)',
  red: 'var(--color-error)',
};

function getSegmentColor(index: number): string {
  if (index >= 17) return COLORS.red;
  if (index >= 12) return COLORS.yellow;
  return COLORS.green;
}

export const MixerVUMeter: React.FC<MixerVUMeterProps> = ({ deckId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const peakRef = useRef(-1);
  const peakTimeRef = useRef(0);
  const prevSegmentsRef = useRef(-1);
  const prevPeakRef = useRef(-1);

  useEffect(() => {
    mountedRef.current = true;
    let lastTime = performance.now();

    const tick = (now: number) => {
      if (!mountedRef.current) return;

      const dt = (now - lastTime) / 1000;
      lastTime = now;

      let segments = 0;
      let peak = -1;

      try {
        const dB = getDJEngine().getDeck(deckId).getLevel();
        const dbVal = typeof dB === 'number' ? dB : -Infinity;
        segments = levelToSegments(dbVal);

        // Peak hold logic
        if (segments >= peakRef.current) {
          peakRef.current = segments;
          peakTimeRef.current = now;
        } else if (now - peakTimeRef.current > PEAK_HOLD_MS) {
          peakRef.current = Math.max(segments, peakRef.current - PEAK_DECAY_SEGMENTS_PER_SEC * dt);
        }
        peak = Math.round(peakRef.current);
      } catch {
        // Engine not ready
      }

      // Only update DOM if values changed
      if (segments !== prevSegmentsRef.current || peak !== prevPeakRef.current) {
        prevSegmentsRef.current = segments;
        prevPeakRef.current = peak;

        const container = containerRef.current;
        if (container) {
          const children = container.children;
          for (let i = 0; i < VU_SEGMENTS; i++) {
            const el = children[i] as HTMLElement;
            if (!el) continue;
            // Children are in reverse order (flex-col-reverse), so child 0 = segment 0 (bottom)
            const isLit = i < segments;
            const isPeak = !isLit && i === peak - 1 && peak > segments;
            el.style.backgroundColor = isLit || isPeak ? getSegmentColor(i) : COLORS.off;
            el.style.opacity = isPeak ? '0.85' : '1';
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [deckId]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col-reverse gap-[1px] justify-center"
      style={{ width: 12 }}
      title={`Deck ${deckId === 'A' ? '1' : '2'} level meter`}
    >
      {Array.from({ length: VU_SEGMENTS }, (_, i) => (
        <div
          key={i}
          className="rounded-[1px]"
          style={{
            width: 12,
            height: 5,
            backgroundColor: COLORS.off,
          }}
        />
      ))}
    </div>
  );
};
