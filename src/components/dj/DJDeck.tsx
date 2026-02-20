/**
 * DJDeck - Single deck panel containing all per-deck controls.
 *
 * Used twice in DJView: once for Deck A (left), once for Deck B (right).
 * Layout mirrors between A (left-aligned) and B (right-aligned).
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { detectBPM } from '@/engine/dj/DJBeatDetector';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { DeckTransport } from './DeckTransport';
import { DeckPitchSlider } from './DeckPitchSlider';
import { DeckNudge } from './DeckNudge';
import { DeckTrackInfo } from './DeckTrackInfo';
import { DeckTrackOverview } from './DeckTrackOverview';
import { DeckVisualizer } from './DeckVisualizer';
import { DeckTurntable } from './DeckTurntable';
import { DeckLoopControls } from './DeckLoopControls';
import { DeckScopes } from './DeckScopes';

interface DJDeckProps {
  deckId: 'A' | 'B';
}

export const DJDeck: React.FC<DJDeckProps> = ({ deckId }) => {
  const animFrameRef = useRef<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoadingDrop, setIsLoadingDrop] = useState(false);
  const [vizResetKey, setVizResetKey] = useState(0);
  const dragCountRef = useRef(0);

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
          // Update elapsed time + live effective BPM (accounts for Fxx mid-song changes + pitch multiplier)
          const liveBPM = Math.round(replayer.getBPM() * replayer.getTempoMultiplier() * 100) / 100;
          store.setDeckState(deckId, {
            elapsedMs: replayer.getElapsedMs(),
            effectiveBPM: liveBPM,
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

  // Subscribe to pitch changes in store and propagate to engine
  // This catches ALL pitch sources (slider, keyboard, sync button) in one place
  useEffect(() => {
    let prevPitch = useDJStore.getState().decks[deckId].pitchOffset;
    const unsubscribe = useDJStore.subscribe((state) => {
      const newPitch = state.decks[deckId].pitchOffset;
      if (newPitch !== prevPitch) {
        prevPitch = newPitch;
        try {
          getDJEngine().getDeck(deckId).setPitch(newPitch);
        } catch {
          // Engine might not be initialized yet
        }
      }
    });
    return unsubscribe;
  }, [deckId]);

  // Subscribe to channel mute mask changes and push to the deck's replayer.
  // Each deck owns its own mask so Deck A and Deck B are fully independent.
  useEffect(() => {
    let prevMask = useDJStore.getState().decks[deckId].channelMask;
    const unsubscribe = useDJStore.subscribe((state) => {
      const newMask = state.decks[deckId].channelMask;
      if (newMask !== prevMask) {
        prevMask = newMask;
        try {
          getDJEngine().getDeck(deckId).replayer.setChannelMuteMask(newMask);
        } catch {
          // Engine might not be initialized yet
        }
      }
    });
    return unsubscribe;
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

  // ── Drag-and-drop: load file directly to this deck ────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    if (e.dataTransfer.items && Array.from(e.dataTransfer.items).some(i => i.kind === 'file')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCountRef.current = 0;

    const file = Array.from(e.dataTransfer.files)[0];
    if (!file) return;

    setVizResetKey((k) => k + 1);
    setIsLoadingDrop(true);
    try {
      const song = await parseModuleToSong(file);
      cacheSong(file.name, song);
      const bpmResult = detectBPM(song);

      const engine = getDJEngine();
      await engine.loadToDeck(deckId, song);

      useDJStore.getState().setDeckState(deckId, {
        fileName: file.name,
        trackName: song.name || file.name,
        detectedBPM: bpmResult.bpm,
        effectiveBPM: bpmResult.bpm,
        totalPositions: song.songLength,
        songPos: 0,
        pattPos: 0,
        elapsedMs: 0,
        isPlaying: false,
      });
    } catch (err) {
      console.error(`[DJDeck] Failed to load ${file.name} to deck ${deckId}:`, err);
    } finally {
      setIsLoadingDrop(false);
    }
  }, [deckId]);

  const isB = deckId === 'B';
  const deckNum = isB ? '2' : '1';
  const deckColor = isB ? 'text-red-400' : 'text-blue-400';
  const deckBorderColor = isB ? 'border-red-900/30' : 'border-blue-900/30';
  const deckHighlight = isB ? 'border-red-500/60' : 'border-blue-500/60';

  return (
    <div
      className={`relative flex flex-col gap-2 p-3 bg-dark-bg rounded-lg border min-w-0 h-full transition-all ${
        isDragOver ? deckHighlight : deckBorderColor
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-dj-deck-drop
    >
      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 bg-black/70 rounded-lg flex items-center justify-center pointer-events-none">
          <div className={`text-lg font-mono font-bold ${deckColor}`}>
            Drop to load Deck {deckNum}
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoadingDrop && (
        <div className="absolute inset-0 z-10 bg-black/70 rounded-lg flex items-center justify-center pointer-events-none">
          <div className={`text-sm font-mono ${deckColor} animate-pulse`}>Loading...</div>
        </div>
      )}

      {/* Track info + turntable */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-mono font-bold tracking-[0.3em] uppercase ${deckColor} opacity-60 mb-1`}>
            Deck {deckNum}
          </div>
          <DeckTrackInfo deckId={deckId} />
        </div>
        <DeckScopes deckId={deckId} size={64} />
        <DeckTurntable deckId={deckId} />
      </div>

      {/* Track overview bar */}
      <DeckTrackOverview deckId={deckId} />

      {/* Main controls area: pattern display + pitch slider */}
      <div className={`flex gap-2 flex-1 min-h-0 ${isB ? 'flex-row-reverse' : ''}`}>
        {/* Pattern display */}
        <div className="flex-1 min-w-0 min-h-0">
          <DeckVisualizer deckId={deckId} resetKey={vizResetKey} />
        </div>

        {/* Pitch slider */}
        <div className="flex-shrink-0 self-stretch">
          <DeckPitchSlider deckId={deckId} />
        </div>
      </div>

      {/* Transport + Nudge + Loop */}
      <div className="flex items-center gap-2">
        <DeckTransport deckId={deckId} />
        <DeckNudge deckId={deckId} />
        <DeckLoopControls deckId={deckId} />
      </div>
    </div>
  );
};
