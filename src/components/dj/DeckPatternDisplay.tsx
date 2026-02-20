/**
 * DeckPatternDisplay - Pattern view for DJ decks
 *
 * Uses the shared ReadOnlyPatternCanvas from the tracker to render
 * pattern data with identical visual fidelity (canvas, JetBrains Mono,
 * same colors and caching as PatternEditorCanvas).
 */

import React, { useMemo } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { ReadOnlyPatternCanvas } from '@/components/tracker/ReadOnlyPatternCanvas';

interface DeckPatternDisplayProps {
  deckId: 'A' | 'B';
}

export const DeckPatternDisplay: React.FC<DeckPatternDisplayProps> = ({ deckId }) => {
  const songPos = useDJStore((s) => s.decks[deckId].songPos);
  const pattPos = useDJStore((s) => s.decks[deckId].pattPos);
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);

  const { patternData, numChannels } = useMemo(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const song = deck.replayer.getSong();
      if (!song || !song.songPositions || song.songPositions.length === 0) {
        return { patternData: null, numChannels: 4 };
      }
      const patternIndex = song.songPositions[songPos] ?? 0;
      return {
        patternData: song.patterns[patternIndex] ?? null,
        numChannels: song.numChannels,
      };
    } catch {
      return { patternData: null, numChannels: 4 };
    }
  }, [deckId, songPos]);

  return (
    <div className="bg-dark-bg border border-dark-border rounded-sm overflow-hidden w-full h-full">
      <ReadOnlyPatternCanvas
        pattern={patternData}
        currentRow={pattPos}
        numChannels={numChannels}
        isPlaying={isPlaying}
      />
    </div>
  );
};
