/**
 * DeckStemControls — Per-stem mute/unmute buttons for DJ decks.
 *
 * Shows when stems are available (after Demucs separation).
 * Each stem gets a colored pill button — click to toggle mute.
 * Also includes a master stem mode toggle.
 */

import React, { useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import * as DJActions from '@/engine/dj/DJActions';

interface DeckStemControlsProps {
  deckId: 'A' | 'B' | 'C';
}

const STEM_COLORS: Record<string, string> = {
  drums: '#f97316',   // orange
  bass: '#3b82f6',    // blue
  vocals: '#ec4899',  // pink
  other: '#22c55e',   // green
  guitar: '#a855f7',  // purple
  piano: '#eab308',   // yellow
};

const STEM_LABELS: Record<string, string> = {
  drums: 'DRM',
  bass: 'BAS',
  vocals: 'VOX',
  other: 'OTH',
  guitar: 'GTR',
  piano: 'PNO',
};

export const DeckStemControls: React.FC<DeckStemControlsProps> = ({ deckId }) => {
  const stemsAvailable = useDJStore((s) => s.decks[deckId].stemsAvailable);
  const stemMode = useDJStore((s) => s.decks[deckId].stemMode);
  const stemNames = useDJStore((s) => s.decks[deckId].stemNames);
  const stemMutes = useDJStore((s) => s.decks[deckId].stemMutes);

  const handleToggleStemMode = useCallback(() => {
    DJActions.setStemMode(deckId, !stemMode);
  }, [deckId, stemMode]);

  const handleStemToggle = useCallback((stemName: string) => {
    // Auto-enable stem mode on first stem toggle
    if (!stemMode) {
      DJActions.setStemMode(deckId, true);
    }
    DJActions.toggleStemMute(deckId, stemName);
  }, [deckId, stemMode]);

  if (!stemsAvailable || stemNames.length === 0) return null;

  return (
    <div className="flex gap-1 px-1 py-0.5 items-center">
      {/* Stem mode toggle */}
      <button
        onClick={handleToggleStemMode}
        title={stemMode ? 'Switch to full mix' : 'Switch to stem playback'}
        className={`
          px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide
          border transition-colors duration-100 cursor-pointer select-none outline-none
          ${stemMode
            ? 'bg-accent-highlight/20 border-accent-highlight text-accent-highlight'
            : 'bg-dark-bgTertiary border-dark-borderLight text-text-muted hover:text-text-primary hover:border-text-muted'
          }
        `}
      >
        STEM
      </button>

      {/* Per-stem mute buttons — only shown when stem mode is active */}
      {stemMode && stemNames.map((name) => {
        const isMuted = stemMutes[name] ?? false;
        const color = STEM_COLORS[name] ?? '#888';
        const label = STEM_LABELS[name] ?? name.substring(0, 3).toUpperCase();

        return (
          <button
            key={name}
            onClick={() => handleStemToggle(name)}
            title={`${isMuted ? 'Unmute' : 'Mute'} ${name}`}
            className={`
              px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide
              border transition-colors duration-100 cursor-pointer select-none outline-none
            `}
            style={{
              backgroundColor: isMuted ? 'transparent' : `${color}22`,
              borderColor: isMuted ? 'var(--dark-borderLight, #555)' : color,
              color: isMuted ? 'var(--text-muted, #888)' : color,
              textDecoration: isMuted ? 'line-through' : 'none',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};
