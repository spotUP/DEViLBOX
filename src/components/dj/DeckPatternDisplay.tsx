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

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { startScratch, setScratchVelocity, stopScratch } from '@/engine/dj/DJActions';
import { ReadOnlyPatternCanvas } from '@/components/tracker/ReadOnlyPatternCanvas';
import { DJOscilloscope } from '@/components/visualization/DJOscilloscope';

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

  // ── Vertical drag to scratch ──────────────────────────────────────────────
  const isDraggingRef = useRef(false);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityRef = useRef(0);
  const decayRafRef = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!patternData) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    lastYRef.current = e.clientY;
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;

    if (decayRafRef.current) {
      cancelAnimationFrame(decayRafRef.current);
      decayRafRef.current = 0;
    }

    startScratch(deckId);
    setScratchVelocity(deckId, 0);
  }, [deckId, patternData]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastTimeRef.current) / 1000;
    const dy = e.clientY - lastYRef.current;
    // Drag up = forward (positive velocity), drag down = backward
    const v = Math.max(-4, Math.min(4, (-dy / dt) / 200));
    velocityRef.current = v;
    setScratchVelocity(deckId, v);
    lastYRef.current = e.clientY;
    lastTimeRef.current = now;
  }, [deckId]);

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    // Momentum decay back to 1× over 300ms (cubic ease-out)
    const fromV = velocityRef.current;
    const startTime = performance.now();
    const DECAY_MS = 300;
    const decay = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / DECAY_MS);
      const eased = 1 - (1 - t) * (1 - t) * (1 - t);
      const v = fromV + (1 - fromV) * eased;
      setScratchVelocity(deckId, v);
      if (t < 1) {
        decayRafRef.current = requestAnimationFrame(decay);
      } else {
        decayRafRef.current = 0;
        stopScratch(deckId, 0);
      }
    };
    decayRafRef.current = requestAnimationFrame(decay);
  }, [deckId]);

  return (
    <div
      className="bg-dark-bg border border-dark-border rounded-sm overflow-hidden w-full h-full"
      style={{ cursor: patternData ? 'grab' : 'default', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {patternData ? (
        <ReadOnlyPatternCanvas
          pattern={patternData}
          currentRow={visualRow}
          numChannels={numChannels}
          isPlaying={isPlaying}
        />
      ) : (
        <DJOscilloscope />
      )}
    </div>
  );
};
