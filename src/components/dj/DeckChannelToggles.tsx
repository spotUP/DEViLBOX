/**
 * DeckChannelToggles - Channel mute/solo buttons for one DJ deck
 *
 * Row of 4 toggle buttons (1-4) plus an ALL button. Active channels
 * show accent color, muted channels are dim. Shift+click enables
 * solo mode (mute all others, enable only clicked channel).
 */

import React, { useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';

interface DeckChannelTogglesProps {
  deckId: 'A' | 'B';
}

const NUM_CHANNELS = 4;
const BUTTON_SIZE = 28;

export const DeckChannelToggles: React.FC<DeckChannelTogglesProps> = ({ deckId }) => {
  const channelMask = useDJStore((s) => s.decks[deckId].channelMask);
  const toggleDeckChannel = useDJStore((s) => s.toggleDeckChannel);
  const setAllDeckChannels = useDJStore((s) => s.setAllDeckChannels);

  const handleChannelClick = useCallback(
    (channelIndex: number, e: React.MouseEvent) => {
      if (e.shiftKey) {
        // Solo mode: set mask to only this channel
        const store = useDJStore.getState();
        // First disable all, then enable only this one
        store.setAllDeckChannels(deckId, false);
        store.toggleDeckChannel(deckId, channelIndex);
      } else {
        toggleDeckChannel(deckId, channelIndex);
      }
    },
    [deckId, toggleDeckChannel]
  );

  const handleAllClick = useCallback(() => {
    setAllDeckChannels(deckId, true);
  }, [deckId, setAllDeckChannels]);

  const isChannelEnabled = (index: number): boolean => {
    return (channelMask & (1 << index)) !== 0;
  };

  const allEnabled = (() => {
    for (let i = 0; i < NUM_CHANNELS; i++) {
      if (!isChannelEnabled(i)) return false;
    }
    return true;
  })();

  return (
    <div className="flex items-center gap-1">
      {/* Channel toggle buttons */}
      {Array.from({ length: NUM_CHANNELS }, (_, i) => {
        const enabled = isChannelEnabled(i);
        return (
          <button
            key={i}
            onClick={(e) => handleChannelClick(i, e)}
            className={`
              flex items-center justify-center font-mono text-xs font-bold
              rounded-sm transition-all duration-75 select-none
              shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]
              active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] active:translate-y-[0.5px]
              ${
                enabled
                  ? 'bg-accent-primary text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),0_0_8px_var(--color-accent-glow)]'
                  : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-borderLight'
              }
            `}
            style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}
            title={`Channel ${i + 1} (Shift+click to solo)`}
          >
            {i + 1}
          </button>
        );
      })}

      {/* ALL button */}
      <button
        onClick={handleAllClick}
        className={`
          flex items-center justify-center font-mono font-bold
          rounded-sm transition-all duration-75 select-none
          shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]
          active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] active:translate-y-[0.5px]
          ${
            allEnabled
              ? 'bg-accent-primary/60 text-white'
              : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-borderLight'
          }
        `}
        style={{ width: BUTTON_SIZE + 8, height: BUTTON_SIZE, fontSize: 9 }}
        title="Enable all channels"
      >
        ALL
      </button>
    </div>
  );
};
