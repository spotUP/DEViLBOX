/**
 * DeckCuePoints - Hot cue button strip (8 slots)
 *
 * Supports both native (user-created) and Serato-imported cue points.
 * - Empty slot + click: set hot cue at current position
 * - Filled slot + click: jump to cue position
 * - Filled slot + Shift+click: delete hot cue
 *
 * Works in both tracker and audio playback modes.
 */

import React, { useCallback } from 'react';
import { useDJStore, type HotCue } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

// Default hot cue colors (CDJ-style: varied neon palette)
const HOT_CUE_COLORS = [
  '#E91E63', // 1: Pink
  '#FF9800', // 2: Orange
  '#2196F3', // 3: Blue
  '#4CAF50', // 4: Green
  '#9C27B0', // 5: Purple
  '#00BCD4', // 6: Cyan
  '#FFEB3B', // 7: Yellow
  '#F44336', // 8: Red
];

interface DeckCuePointsProps {
  deckId: 'A' | 'B' | 'C';
}

export const DeckCuePoints: React.FC<DeckCuePointsProps> = ({ deckId }) => {
  const hotCues = useDJStore((s) => s.decks[deckId].hotCues);
  const seratoCues = useDJStore((s) => s.decks[deckId].seratoCuePoints);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);

  const handleClick = useCallback((index: number, e: React.MouseEvent) => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const store = useDJStore.getState();
      const cue = store.decks[deckId].hotCues[index];

      // Shift+click = delete
      if (e.shiftKey && cue) {
        store.deleteHotCue(deckId, index);
        return;
      }

      if (cue) {
        // Jump to cue position
        const seconds = cue.position / 1000;
        if (deck.playbackMode === 'audio') {
          deck.audioPlayer.seek(seconds);
          store.setDeckState(deckId, {
            audioPosition: seconds,
            elapsedMs: cue.position,
          });
        } else {
          // Tracker mode: compute song position from ms
          const state = store.decks[deckId];
          if (state.durationMs > 0 && state.totalPositions > 0) {
            const pos = Math.floor((cue.position / state.durationMs) * state.totalPositions);
            deck.cue(Math.max(0, Math.min(pos, state.totalPositions - 1)), 0);
          }
        }
      } else {
        // Set new hot cue at current position
        let positionMs = 0;
        const state = store.decks[deckId];
        if (deck.playbackMode === 'audio') {
          positionMs = deck.audioPlayer.getPosition() * 1000;
        } else {
          positionMs = state.elapsedMs;
        }

        const newCue: HotCue = {
          position: positionMs,
          color: HOT_CUE_COLORS[index],
          name: '',
        };
        store.setHotCue(deckId, index, newCue);
      }
    } catch {
      // Engine not ready
    }
  }, [deckId]);

  // Merge: native hotCues take precedence; fill empty slots with Serato cues
  const mergedSlots = hotCues.map((native, i) => {
    if (native) return { position: native.position, color: native.color, name: native.name, isNative: true };
    const serato = seratoCues.find(c => c.index === i);
    if (serato) return { position: serato.position, color: serato.color, name: serato.name, isNative: false };
    return null;
  });

  // Show cue strip for audio mode always, for tracker mode if any cues exist
  const hasAnyCues = mergedSlots.some(s => s !== null);
  if (playbackMode !== 'audio' && !hasAnyCues) return null;

  return (
    <div className="flex gap-1">
      {mergedSlots.map((cue, i) => (
        <button
          key={i}
          onClick={(e) => handleClick(i, e)}
          className="flex-1 h-6 rounded text-[9px] font-mono font-bold transition-all border border-transparent"
          style={cue ? {
            backgroundColor: `${cue.color}30`,
            borderColor: `${cue.color}80`,
            color: cue.color,
          } : {
            backgroundColor: 'rgba(255,255,255,0.03)',
            color: 'rgba(255,255,255,0.15)',
          }}
          title={
            cue
              ? `${cue.name || `Cue ${i + 1}`} — ${formatCueTime(cue.position)}${cue.isNative ? '' : ' (Serato)'}${'\n'}Shift+click to delete`
              : `Cue ${i + 1} — click to set at current position`
          }
        >
          {cue ? (cue.name || (i + 1)) : (i + 1)}
        </button>
      ))}
    </div>
  );
};

function formatCueTime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  const frac = Math.floor((ms % 1000) / 10);
  return `${min}:${String(s).padStart(2, '0')}.${String(frac).padStart(2, '0')}`;
}
