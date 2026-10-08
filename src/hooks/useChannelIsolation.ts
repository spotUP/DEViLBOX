import { useEffect, useSyncExternalStore } from 'react';
import {
  getChannelIsolationSnapshot,
  refreshChannelIsolation,
  subscribeChannelIsolation,
} from '@engine/tone/ChannelRoutedEffects';
import { useFormatStore } from '@stores/useFormatStore';

/**
 * Whether an effect can be aimed at channels with the song that is playing,
 * and if not, the reason to show beside the disabled channel buttons.
 *
 * Asks the engine layer (the same answer the master chain routes by), not the
 * editor mode: classic mode alone says nothing about whether the playing
 * engine can take a channel out of the mix.
 */
export function useChannelIsolation(): { usable: boolean; reason: string | null } {
  const editorMode = useFormatStore((s) => s.editorMode);
  const status = useSyncExternalStore(subscribeChannelIsolation, getChannelIsolationSnapshot, getChannelIsolationSnapshot);
  useEffect(() => { void refreshChannelIsolation(); }, [editorMode]);
  return { usable: status.engine !== null, reason: status.reason };
}
