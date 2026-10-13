/**
 * Deck C's scratch fader and slip lanes (D1): the crossfader each Auto Scratch stroke opens and the slip between
 * platter and record, from the same render the stroke plays (`deckCMotion`, the demo's viz capture). One motion
 * consumer; DOM writes per frame through refs (no React state per frame).
 */
import React, { useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { deckCMotionNow, subscribeDeckCMotion } from '@/engine/dj/scratch/deckCMotion';

/** dj_viz `SLIP_REF`: |slip| mapped to full scale. */
const SLIP_REF = 3.0;

export const DeckCScratchLanes: React.FC = () => {
  const faderRef = useRef<HTMLDivElement>(null);
  const slipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeDeckCMotion();
    let raf = 0;
    const tick = () => {
      const m = deckCMotionNow(Tone.getContext().rawContext.currentTime);
      const fade = m ? m.fade : 0;
      const slip = m ? Math.max(-1, Math.min(1, m.slip / SLIP_REF)) : 0;
      if (faderRef.current) faderRef.current.style.left = `${(fade * 100).toFixed(2)}%`;
      if (slipRef.current) {
        slipRef.current.style.left = slip >= 0 ? '50%' : `${(50 + slip * 50).toFixed(2)}%`;
        slipRef.current.style.width = `${(Math.abs(slip) * 50).toFixed(2)}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); unsubscribe(); };
  }, []);

  return (
    <div className="flex flex-col gap-1 px-2 py-1 bg-dark-bgSecondary border border-dark-border rounded" data-testid="deck-c-scratch-lanes">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-text-muted w-20 shrink-0">Scratch Fader</span>
        <div className="relative flex-1 h-2 bg-dark-bgTertiary rounded">
          <div ref={faderRef} data-testid="deck-c-fader" className="absolute top-0 h-2 w-1 -ml-0.5 bg-accent-primary rounded" style={{ left: '0%' }} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-text-muted w-20 shrink-0">Slip</span>
        <div className="relative flex-1 h-2 bg-dark-bgTertiary rounded">
          <div className="absolute top-0 left-1/2 h-2 w-px bg-dark-borderLight" />
          <div ref={slipRef} data-testid="deck-c-slip" className="absolute top-0 h-2 bg-accent-secondary rounded" style={{ left: '50%', width: '0%' }} />
        </div>
      </div>
    </div>
  );
};
