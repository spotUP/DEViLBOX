/**
 * DeckPatternDisplay - Pattern view for DJ decks
 *
 * Uses the shared ReadOnlyPatternCanvas from the tracker to render
 * pattern data with identical visual fidelity (canvas, JetBrains Mono,
 * same colors and caching as PatternEditorCanvas).
 *
 * During scratch patterns, the display follows the scratch direction:
 * - Forward phases: replayer naturally advances pattPos
 * - Backward phases: visual row offset simulates backward scrolling
 */

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { ReadOnlyPatternCanvas } from '@/components/tracker/ReadOnlyPatternCanvas';

interface DeckPatternDisplayProps {
  deckId: 'A' | 'B' | 'C';
}

export const DeckPatternDisplay: React.FC<DeckPatternDisplayProps> = ({ deckId }) => {
  const songPos = useDJStore((s) => s.decks[deckId].songPos);
  const pattPos = useDJStore((s) => s.decks[deckId].pattPos);
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const fileName = useDJStore((s) => s.decks[deckId].fileName);
  const totalPositions = useDJStore((s) => s.decks[deckId].totalPositions);
  const activePatternName = useDJStore((s) => s.decks[deckId].activePatternName);

  // During backward scratch phases, accumulate a visual backward offset.
  // pattPos from the replayer won't move backward (replayer is frozen), so we
  // simulate backward scrolling by decrementing a visual offset at ~30fps.
  const [visualOffset, setVisualOffset] = useState(0);
  const lastTickRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!activePatternName) {
      // No scratch — reset offset
      setVisualOffset(0);
      lastTickRef.current = 0;
      return;
    }

    const tick = () => {
      const now = performance.now();
      const store = useDJStore.getState();
      const vel = store.decks[deckId].scratchVelocity;

      if (lastTickRef.current > 0 && vel < -0.1) {
        // Backward phase: estimate rows per second from velocity and BPM.
        // At 125 BPM with 6 rows/beat (typical), ~12.5 rows/sec at 1× speed.
        const bpm = store.decks[deckId].effectiveBPM || 125;
        const rowsPerSec = (bpm / 60) * 6; // ~6 rows per beat (common for tracker modules)
        const dt = (now - lastTickRef.current) / 1000;
        const rowDelta = Math.abs(vel) * rowsPerSec * dt;
        setVisualOffset((prev) => prev + rowDelta);
      } else if (vel > 0.1) {
        // Forward phase: replayer handles pattPos naturally — decay offset toward 0
        setVisualOffset((prev) => prev > 0 ? Math.max(0, prev - 2) : 0);
      }

      lastTickRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
    };
  }, [deckId, activePatternName]);

  const { patternData, numChannels, numRows } = useMemo(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const song = deck.replayer.getSong();
      if (!song || !song.songPositions || song.songPositions.length === 0) {
        return { patternData: null, numChannels: 4, numRows: 64 };
      }
      const patternIndex = song.songPositions[songPos] ?? 0;
      const pat = song.patterns[patternIndex] ?? null;
      return {
        patternData: pat,
        numChannels: song.numChannels,
        numRows: pat ? pat.length : 64,
      };
    } catch {
      return { patternData: null, numChannels: 4, numRows: 64 };
    }
  }, [deckId, songPos, fileName, totalPositions]);

  // Compute visual row: during backward scratch, subtract offset from pattPos
  const visualRow = activePatternName && visualOffset > 0
    ? ((pattPos - Math.round(visualOffset)) % numRows + numRows) % numRows
    : pattPos;

  return (
    <div className="bg-dark-bg border border-dark-border rounded-sm overflow-hidden w-full h-full">
      <ReadOnlyPatternCanvas
        pattern={patternData}
        currentRow={visualRow}
        numChannels={numChannels}
        isPlaying={isPlaying}
      />
    </div>
  );
};
