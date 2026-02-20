/**
 * useButtonMappings - Register editor action handlers for MIDI button control
 */

import { useEffect } from 'react';
import { getButtonMapManager } from '../../midi/ButtonMapManager';
import { useTransportStore, useTrackerStore } from '../../stores';
import { useMIDIStore } from '../../stores/useMIDIStore';

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

    // DJ Transport actions (lazy-import DJEngine to avoid loading it eagerly)
    const registerDJActions = () => {
      try {
        const { getDJEngine } = require('../../engine/dj/DJEngine');
        const dj = getDJEngine();

        cleanups.push(manager.registerAction('dj.deckA.play', () => { dj.deckA.play(); }));
        cleanups.push(manager.registerAction('dj.deckA.pause', () => { dj.deckA.pause(); }));
        cleanups.push(manager.registerAction('dj.deckA.stop', () => { dj.deckA.stop(); }));
        cleanups.push(manager.registerAction('dj.deckA.cue', () => { dj.deckA.cue(0); }));
        cleanups.push(manager.registerAction('dj.deckB.play', () => { dj.deckB.play(); }));
        cleanups.push(manager.registerAction('dj.deckB.pause', () => { dj.deckB.pause(); }));
        cleanups.push(manager.registerAction('dj.deckB.stop', () => { dj.deckB.stop(); }));
        cleanups.push(manager.registerAction('dj.deckB.cue', () => { dj.deckB.cue(0); }));
        cleanups.push(manager.registerAction('dj.killAll', () => { dj.killAll(); }));

        // EQ kills (toggle on/off)
        cleanups.push(manager.registerAction('dj.deckA.eqKillLow', () => {
          dj.deckA.setEQKill('low', !dj.deckA.getEQKill('low'));
        }));
        cleanups.push(manager.registerAction('dj.deckA.eqKillMid', () => {
          dj.deckA.setEQKill('mid', !dj.deckA.getEQKill('mid'));
        }));
        cleanups.push(manager.registerAction('dj.deckA.eqKillHi', () => {
          dj.deckA.setEQKill('high', !dj.deckA.getEQKill('high'));
        }));
        cleanups.push(manager.registerAction('dj.deckB.eqKillLow', () => {
          dj.deckB.setEQKill('low', !dj.deckB.getEQKill('low'));
        }));
        cleanups.push(manager.registerAction('dj.deckB.eqKillMid', () => {
          dj.deckB.setEQKill('mid', !dj.deckB.getEQKill('mid'));
        }));
        cleanups.push(manager.registerAction('dj.deckB.eqKillHi', () => {
          dj.deckB.setEQKill('high', !dj.deckB.getEQKill('high'));
        }));
      } catch {
        // DJEngine not available — DJ actions won't be registered until it is
      }
    };

    // DJ knob page switching
    cleanups.push(manager.registerAction('dj.knobPage.next', () => {
      useMIDIStore.getState().nextDJKnobPage();
    }));
    cleanups.push(manager.registerAction('dj.knobPage.prev', () => {
      useMIDIStore.getState().prevDJKnobPage();
    }));

    registerDJActions();

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
