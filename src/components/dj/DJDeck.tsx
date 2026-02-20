/**
 * DJDeck - Single deck panel containing all per-deck controls.
 *
 * Used twice in DJView: once for Deck A (left), once for Deck B (right).
 * Layout mirrors between A (left-aligned) and B (right-aligned).
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useDJStore, useDeckState } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { DeckTransport } from './DeckTransport';
import { DeckPitchSlider } from './DeckPitchSlider';
import { DeckNudge } from './DeckNudge';
import { DeckTrackInfo } from './DeckTrackInfo';
import { DeckTrackOverview } from './DeckTrackOverview';
import { DeckPatternDisplay } from './DeckPatternDisplay';
import { DeckScopes } from './DeckScopes';
import { DeckChannelToggles } from './DeckChannelToggles';
import { DeckLoopControls } from './DeckLoopControls';

interface DJDeckProps {
  deckId: 'A' | 'B';
}

export const DJDeck: React.FC<DJDeckProps> = ({ deckId }) => {
  const deckState = useDeckState(deckId);
  const animFrameRef = useRef<number>(0);

  // Poll replayer position and update store at ~30fps
  useEffect(() => {
    let running = true;

    const poll = () => {
      if (!running) return;

      try {
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        const replayer = deck.replayer;

        if (replayer.isPlaying()) {
          const store = useDJStore.getState();
          store.setDeckPosition(deckId, replayer.getSongPos(), replayer.getPattPos());
          store.setDeckState(deckId, {
            elapsedMs: replayer.getElapsedMs(),
          });
        }
      } catch {
        // Engine might not be initialized yet
      }

      animFrameRef.current = requestAnimationFrame(poll);
    };

    animFrameRef.current = requestAnimationFrame(poll);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [deckId]);

  // Wire replayer callbacks to store
  useEffect(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);

      deck.replayer.onRowChange = (_row, _pattern, _position) => {
        // Position updates handled by RAF polling above
      };

      deck.replayer.onSongEnd = () => {
        useDJStore.getState().setDeckPlaying(deckId, false);
      };
    } catch {
      // Engine might not be initialized yet
    }
  }, [deckId]);

  const isB = deckId === 'B';
  const deckColor = isB ? 'text-red-400' : 'text-blue-400';
  const deckBorderColor = isB ? 'border-red-900/30' : 'border-blue-900/30';

  return (
    <div className={`flex flex-col gap-2 p-3 bg-dark-bg rounded-lg border ${deckBorderColor} min-w-0`}>
      {/* Deck label */}
      <div className={`text-xs font-mono font-bold tracking-[0.3em] uppercase ${deckColor} opacity-60`}>
        Deck {deckId}
      </div>

      {/* Track info */}
      <DeckTrackInfo deckId={deckId} />

      {/* Track overview bar */}
      <DeckTrackOverview deckId={deckId} />

      {/* Main controls area: pattern display + pitch slider */}
      <div className={`flex gap-2 ${isB ? 'flex-row-reverse' : ''}`}>
        {/* Pattern display */}
        <div className="flex-1 min-w-0">
          <DeckPatternDisplay deckId={deckId} />
        </div>

        {/* Pitch slider */}
        <div className="flex-shrink-0">
          <DeckPitchSlider deckId={deckId} />
        </div>
      </div>

      {/* Transport + Nudge */}
      <div className="flex items-center gap-2">
        <DeckTransport deckId={deckId} />
        <DeckNudge deckId={deckId} />
      </div>

      {/* Loop controls */}
      <DeckLoopControls deckId={deckId} />

      {/* Bottom row: scopes + channel toggles */}
      <div className="flex items-end gap-2">
        <DeckScopes deckId={deckId} />
        <DeckChannelToggles deckId={deckId} />
      </div>
    </div>
  );
};
