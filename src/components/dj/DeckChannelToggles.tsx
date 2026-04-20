/**
 * DeckChannelToggles - Channel mute/fx-target buttons for one DJ deck
 *
 * Row of 4 toggle buttons (1-4) + ALL + MUTE/FX mode chip.
 * Click semantic branches on `channelModeUI` (mirrors DeckScopes):
 *   'mute' → primary=bg-accent-primary (red). Click = mute/unmute.
 *            Shift+click = solo (mute everything else).
 *   'fx'   → primary=bg-accent-highlight (amber). Click = toggle fx target.
 *            Shift+click = solo-in-fx-set (replace the target set with
 *            just this channel).
 */

import React, { useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';

interface DeckChannelTogglesProps {
  deckId: 'A' | 'B' | 'C';
}

const NUM_CHANNELS = 4;
const BUTTON_SIZE = 40;

export const DeckChannelToggles: React.FC<DeckChannelTogglesProps> = ({ deckId }) => {
  const channelMask = useDJStore((s) => s.decks[deckId].channelMask);
  const fxTargetChannels = useDJStore((s) => s.decks[deckId].fxTargetChannels);
  const mode = useDJStore((s) => s.decks[deckId].channelModeUI);

  const handleChannelClick = useCallback(
    (channelIndex: number, e: React.MouseEvent) => {
      const store = useDJStore.getState();
      const currentMode = store.decks[deckId].channelModeUI;
      if (currentMode === 'fx') {
        if (e.shiftKey) {
          store.setFxTarget(deckId, [channelIndex]);
        } else {
          store.toggleFxTarget(deckId, channelIndex);
        }
        return;
      }
      // mute mode
      if (e.shiftKey) {
        store.setAllDeckChannels(deckId, false);
        store.toggleDeckChannel(deckId, channelIndex);
      } else {
        store.toggleDeckChannel(deckId, channelIndex);
      }
    },
    [deckId]
  );

  const handleAllClick = useCallback(() => {
    const store = useDJStore.getState();
    if (store.decks[deckId].channelModeUI === 'fx') {
      store.clearFxTarget(deckId);
    } else {
      store.setAllDeckChannels(deckId, true);
    }
  }, [deckId]);

  const handleModeToggle = useCallback(() => {
    const store = useDJStore.getState();
    const next: 'mute' | 'fx' = store.decks[deckId].channelModeUI === 'mute' ? 'fx' : 'mute';
    store.setChannelMode(deckId, next);
  }, [deckId]);

  const isChannelEnabled = (index: number): boolean => {
    return (channelMask & (1 << index)) !== 0;
  };

  const isFxTargeted = (index: number): boolean => fxTargetChannels.has(index);

  const allEnabled = (() => {
    for (let i = 0; i < NUM_CHANNELS; i++) {
      if (!isChannelEnabled(i)) return false;
    }
    return true;
  })();
  const noFxTargets = fxTargetChannels.size === 0;
  const isFxMode = mode === 'fx';

  return (
    <div className="flex items-center gap-1">
      {/* Channel toggle buttons — colour depends on mode */}
      {Array.from({ length: NUM_CHANNELS }, (_, i) => {
        const enabled = isChannelEnabled(i);
        const targeted = isFxTargeted(i);
        const active = isFxMode ? targeted : enabled;
        return (
          <button
            key={i}
            onClick={(e) => handleChannelClick(i, e)}
            className={`
              flex items-center justify-center font-mono text-xs font-bold
              rounded-sm transition-all duration-75 select-none border border-dark-border
              active:translate-y-[0.5px]
              ${
                active
                  ? (isFxMode
                      ? 'bg-accent-highlight text-text-inverse'
                      : 'bg-accent-primary text-text-primary')
                  : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover'
              }
            `}
            style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}
            title={
              isFxMode
                ? `Channel ${i + 1} — FX target ${targeted ? 'on' : 'off'} (Shift+click to solo-in-set)`
                : `Channel ${i + 1} (Shift+click to solo)`
            }
          >
            {i + 1}
          </button>
        );
      })}

      {/* ALL button — meaning depends on mode */}
      <button
        onClick={handleAllClick}
        className={`
          flex items-center justify-center font-mono font-bold
          rounded-sm transition-all duration-75 select-none border border-dark-border
          active:translate-y-[0.5px]
          ${
            isFxMode
              ? (noFxTargets
                  ? 'bg-accent-highlight/60 text-text-inverse'
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover')
              : (allEnabled
                  ? 'bg-accent-primary/60 text-text-primary'
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover')
          }
        `}
        style={{ width: BUTTON_SIZE + 8, height: BUTTON_SIZE, fontSize: 9 }}
        title={isFxMode ? 'Clear FX target set (applies to all)' : 'Enable all channels'}
      >
        ALL
      </button>

      {/* Mode chip */}
      <button
        onClick={handleModeToggle}
        className={`
          flex items-center justify-center font-mono font-bold select-none
          rounded-sm border transition-colors duration-75
          ${isFxMode
            ? 'bg-accent-highlight text-text-inverse border-accent-highlight'
            : 'bg-dark-bgTertiary text-text-secondary border-dark-border hover:bg-dark-bgHover'}
        `}
        style={{ width: 32, height: BUTTON_SIZE, fontSize: 9, letterSpacing: '0.1em' }}
        title={`Click-mode: ${isFxMode ? 'FX TARGET' : 'MUTE'} — toggle to switch`}
      >
        {isFxMode ? 'FX' : 'MUT'}
      </button>
    </div>
  );
};
