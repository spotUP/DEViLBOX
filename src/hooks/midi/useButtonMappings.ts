/**
 * useButtonMappings - Register editor action handlers for MIDI button control
 */

import { useEffect } from 'react';
import { getButtonMapManager } from '../../midi/ButtonMapManager';
import { useTransportStore, useTrackerStore } from '../../stores';

/**
 * Register all editor action handlers for MIDI button control
 */
export function useButtonMappings(): void {
  const { isPlaying, togglePlayPause, stop } = useTransportStore();
  const {
    currentPatternIndex,
    patterns,
    setCurrentPattern,
    currentOctave,
    setCurrentOctave,
    cursor,
    moveCursorToChannel,
  } = useTrackerStore();

  useEffect(() => {
    const manager = getButtonMapManager();
    manager.init();

    const cleanups: (() => void)[] = [];

    // Transport actions
    cleanups.push(
      manager.registerAction('transport.play', () => {
        togglePlayPause();
      })
    );

    cleanups.push(
      manager.registerAction('transport.stop', () => {
        stop();
      })
    );

    cleanups.push(
      manager.registerAction('transport.playFromStart', () => {
        // Stop and play from start
        stop();
        setTimeout(() => togglePlayPause(), 50);
      })
    );

    // Pattern navigation
    cleanups.push(
      manager.registerAction('pattern.next', () => {
        if (currentPatternIndex < patterns.length - 1) {
          setCurrentPattern(currentPatternIndex + 1);
        }
      })
    );

    cleanups.push(
      manager.registerAction('pattern.previous', () => {
        if (currentPatternIndex > 0) {
          setCurrentPattern(currentPatternIndex - 1);
        }
      })
    );

    cleanups.push(
      manager.registerAction('pattern.first', () => {
        setCurrentPattern(0);
      })
    );

    cleanups.push(
      manager.registerAction('pattern.last', () => {
        setCurrentPattern(patterns.length - 1);
      })
    );

    // Octave control
    cleanups.push(
      manager.registerAction('octave.up', () => {
        if (currentOctave < 8) {
          setCurrentOctave(currentOctave + 1);
        }
      })
    );

    cleanups.push(
      manager.registerAction('octave.down', () => {
        if (currentOctave > 0) {
          setCurrentOctave(currentOctave - 1);
        }
      })
    );

    // Channel navigation
    cleanups.push(
      manager.registerAction('channel.next', () => {
        const pattern = patterns[currentPatternIndex];
        if (pattern && cursor.channelIndex < pattern.channels.length - 1) {
          moveCursorToChannel(cursor.channelIndex + 1);
        }
      })
    );

    cleanups.push(
      manager.registerAction('channel.previous', () => {
        if (cursor.channelIndex > 0) {
          moveCursorToChannel(cursor.channelIndex - 1);
        }
      })
    );

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [
    isPlaying,
    togglePlayPause,
    stop,
    currentPatternIndex,
    patterns,
    setCurrentPattern,
    currentOctave,
    setCurrentOctave,
    cursor,
    moveCursorToChannel,
  ]);
}
