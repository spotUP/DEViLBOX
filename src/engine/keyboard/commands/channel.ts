/**
 * Channel Commands - Mute, solo, and channel operations
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';

/**
 * Toggle mute on current channel
 */
export function muteChannel(): boolean {
  const { cursor, toggleChannelMute, patterns, currentPatternIndex } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (!pattern) return false;
  
  toggleChannelMute(cursor.channelIndex);
  
  // Check new state after toggle
  const newMuted = useTrackerStore.getState().patterns[currentPatternIndex].channels[cursor.channelIndex].muted;
  useUIStore.getState().setStatusMessage(
    newMuted ? `Channel ${cursor.channelIndex + 1} muted` : `Channel ${cursor.channelIndex + 1} unmuted`,
    false,
    1000
  );
  
  return true;
}

/**
 * Toggle solo on current channel
 */
export function soloChannel(): boolean {
  const { cursor, toggleChannelSolo, patterns, currentPatternIndex } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (!pattern) return false;
  
  toggleChannelSolo(cursor.channelIndex);
  
  // Check new state after toggle
  const newSoloed = useTrackerStore.getState().patterns[currentPatternIndex].channels[cursor.channelIndex].solo;
  useUIStore.getState().setStatusMessage(
    newSoloed ? `Channel ${cursor.channelIndex + 1} soloed` : `Channel ${cursor.channelIndex + 1} unsolo`,
    false,
    1000
  );
  
  return true;
}

/**
 * Unmute all channels
 */
export function unmuteAll(): boolean {
  const { patterns, currentPatternIndex, toggleChannelMute, toggleChannelSolo } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (!pattern) return false;
  
  // Unmute all muted channels, unsolo all soloed channels
  pattern.channels.forEach((channel, idx) => {
    if (channel.muted) {
      toggleChannelMute(idx);
    }
    if (channel.solo) {
      toggleChannelSolo(idx);
    }
  });
  
  useUIStore.getState().setStatusMessage('All channels unmuted', false, 1000);
  return true;
}

/**
 * Set channel to track number (1-8) for chord recording
 */
function createSetTrackCommand(track: number) {
  return function(): boolean {
    const { moveCursorToChannel } = useTrackerStore.getState();
    moveCursorToChannel(track - 1);
    useUIStore.getState().setStatusMessage(`Channel ${track}`, false, 1000);
    return true;
  };
}

export const setTrack1 = createSetTrackCommand(1);
export const setTrack2 = createSetTrackCommand(2);
export const setTrack3 = createSetTrackCommand(3);
export const setTrack4 = createSetTrackCommand(4);
export const setTrack5 = createSetTrackCommand(5);
export const setTrack6 = createSetTrackCommand(6);
export const setTrack7 = createSetTrackCommand(7);
export const setTrack8 = createSetTrackCommand(8);
