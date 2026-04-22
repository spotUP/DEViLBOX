/**
 * DeckStemControls — Per-stem mute/unmute + dub send buttons for DJ decks.
 *
 * Three states:
 * 1. Track loaded, no stems → show "✂ STEMS" button to trigger separation
 * 2. Separation in progress → show progress bar
 * 3. Stems available → show stem mute + dub send controls
 */

import React, { useCallback, useState } from 'react';
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
  const fileName = useDJStore((s) => s.decks[deckId].fileName);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const stemsAvailable = useDJStore((s) => s.decks[deckId].stemsAvailable);
  const stemMode = useDJStore((s) => s.decks[deckId].stemMode);
  const stemNames = useDJStore((s) => s.decks[deckId].stemNames);
  const stemMutes = useDJStore((s) => s.decks[deckId].stemMutes);
  const stemDubSends = useDJStore((s) => s.decks[deckId].stemDubSends);
  const stemSeparationProgress = useDJStore((s) => s.decks[deckId].stemSeparationProgress);

  // Check if any other deck is currently separating (Demucs is single-flight)
  const anyDeckSeparating = useDJStore((s) =>
    Object.values(s.decks).some((d) => d.stemSeparationProgress != null && d.stemSeparationProgress >= 0)
  );

  const [error, setError] = useState<string | null>(null);

  const handleSeparate = useCallback(async () => {
    setError(null);
    try {
      await DJActions.separateStems(deckId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stem separation failed';
      setError(msg);
      setTimeout(() => setError(null), 5000);
    }
  }, [deckId]);

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

  const handleDubToggle = useCallback((stemName: string) => {
    DJActions.toggleStemDubSend(deckId, stemName);
  }, [deckId]);

  // No track loaded — hide entirely
  if (!fileName) return null;

  // ── Separation in progress ───────────────────────────────────────────────
  if (stemSeparationProgress != null && stemSeparationProgress >= 0) {
    const pct = Math.round(stemSeparationProgress * 100);
    return (
      <div className="flex items-center gap-2 px-1 py-0.5">
        <div className="flex-1 h-3 bg-dark-bgTertiary rounded-full overflow-hidden border border-dark-borderLight">
          <div
            className="h-full bg-accent-highlight transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[9px] font-mono text-accent-highlight whitespace-nowrap">
          {pct < 10 ? 'Loading model…' : `Separating ${pct}%`}
        </span>
      </div>
    );
  }

  // ── Error display ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center gap-1 px-1 py-0.5">
        <span className="text-[9px] font-mono text-accent-error truncate">{error}</span>
      </div>
    );
  }

  // ── No stems yet — show "Separate" button ────────────────────────────────
  if (!stemsAvailable) {
    // Only show for audio playback mode (tracker mode hasn't rendered yet)
    if (playbackMode !== 'audio') return null;

    const isBusy = anyDeckSeparating;
    return (
      <div className="flex items-center gap-1 px-1 py-0.5">
        <button
          onClick={handleSeparate}
          disabled={isBusy}
          title={isBusy ? 'Separation in progress on another deck' : 'Separate track into stems (drums, bass, vocals, other)'}
          className={`
            px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide
            border transition-colors duration-100 cursor-pointer select-none outline-none
            ${isBusy
              ? 'bg-dark-bgTertiary border-dark-borderLight text-text-muted opacity-50 cursor-not-allowed'
              : 'bg-accent-highlight/10 border-accent-highlight/50 text-accent-highlight hover:bg-accent-highlight/20 hover:border-accent-highlight'
            }
          `}
        >
          ✂ STEMS
        </button>
      </div>
    );
  }

  // ── Stems available — show mute + dub controls ───────────────────────────
  return (
    <div className="flex flex-col gap-0.5 px-1 py-0.5">
      {/* Row 1: Stem mode toggle + per-stem mute buttons */}
      <div className="flex gap-1 items-center">
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

      {/* Row 2: Per-stem DUB send toggles — only shown in stem mode */}
      {stemMode && (
        <div className="flex gap-1 items-center">
          <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-text-muted select-none">
            DUB
          </span>
          {stemNames.map((name) => {
            const isDubSend = stemDubSends[name] ?? false;
            const color = STEM_COLORS[name] ?? '#888';
            const label = STEM_LABELS[name] ?? name.substring(0, 3).toUpperCase();

            return (
              <button
                key={`dub-${name}`}
                onClick={() => handleDubToggle(name)}
                title={`${isDubSend ? 'Remove' : 'Send'} ${name} to dub effects`}
                className={`
                  px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide
                  border transition-colors duration-100 cursor-pointer select-none outline-none
                `}
                style={{
                  backgroundColor: isDubSend ? `${color}33` : 'transparent',
                  borderColor: isDubSend ? color : 'var(--dark-borderLight, #555)',
                  color: isDubSend ? color : 'var(--text-muted, #888)',
                  boxShadow: isDubSend ? `0 0 6px ${color}44` : 'none',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
