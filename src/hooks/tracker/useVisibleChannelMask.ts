/**
 * The visible-channel mask of the song in the tracker store (visibleChannels.ts),
 * for the views that draw the classic channel grid. Subscribes to a primitive
 * key, so an edit that changes no channel's visibility re-renders nothing.
 */
import { useMemo } from 'react';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useCursorStore } from '@stores/useCursorStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { channelMaskKey, maskFromKey, visibleChannelMask } from '@/lib/tracker/visibleChannels';

export function useVisibleChannelMask(): boolean[] {
  const showUnused = useSettingsStore((s) => s.showUnusedChannels);
  const reveal = useCursorStore((s) => s.cursor.channelIndex);
  const key = useTrackerStore((s) => channelMaskKey(visibleChannelMask(s.patterns, { showUnused, revealChannel: reveal })));
  return useMemo(() => maskFromKey(key), [key]);
}
