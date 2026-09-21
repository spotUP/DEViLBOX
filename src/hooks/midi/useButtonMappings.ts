/**
 * useButtonMappings - Register editor action handlers for MIDI button control
 */

import { useEffect } from 'react';
import { getButtonMapManager } from '../../midi/ButtonMapManager';
import { useTransportStore, useTrackerStore, useCursorStore } from '../../stores';
import { useEditorStore } from '../../stores/useEditorStore';
import { useMIDIStore } from '../../stores/useMIDIStore';
import { useVocoderStore } from '../../stores/useVocoderStore';
import { getDJEngine } from '../../engine/dj/DJEngine';

/**
 * Register all editor action handlers for MIDI button control
 */
export function useButtonMappings(): void {
  const { isPlaying, togglePlayPause, stop } = useTransportStore();
  const cursor = useCursorStore((s) => s.cursor);
  const moveCursorToChannel = useCursorStore((s) => s.moveCursorToChannel);
  const {
    currentPatternIndex,
    patterns,
    setCurrentPattern,
  } = useTrackerStore();
  const {
    currentOctave,
    setCurrentOctave,
  } = useEditorStore();

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
        // Stop then play immediately — no artificial delay
        if (isPlaying) stop();
        togglePlayPause();
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

    // DJ Transport actions.
    //
    // The engine is resolved INSIDE each handler, not here. Registering an
    // action must not build a DJEngine — that allocates its audio graph — and
    // a button press is the first moment one is genuinely needed. This used to
    // be a `require()` for the same reason, which never ran, so none of these
    // actions has ever been registered.
    const registerDJActions = () => {
      cleanups.push(manager.registerAction('dj.deckA.play', () => { getDJEngine().deckA.play(); }));
      cleanups.push(manager.registerAction('dj.deckA.pause', () => { getDJEngine().deckA.pause(); }));
      cleanups.push(manager.registerAction('dj.deckA.stop', () => { getDJEngine().deckA.stop(); }));
      cleanups.push(manager.registerAction('dj.deckA.cue', () => { getDJEngine().deckA.cue(0); }));
      cleanups.push(manager.registerAction('dj.deckB.play', () => { getDJEngine().deckB.play(); }));
      cleanups.push(manager.registerAction('dj.deckB.pause', () => { getDJEngine().deckB.pause(); }));
      cleanups.push(manager.registerAction('dj.deckB.stop', () => { getDJEngine().deckB.stop(); }));
      cleanups.push(manager.registerAction('dj.deckB.cue', () => { getDJEngine().deckB.cue(0); }));
      cleanups.push(manager.registerAction('dj.killAll', () => { getDJEngine().killAll(); }));

      // EQ kills (toggle on/off)
      cleanups.push(manager.registerAction('dj.deckA.eqKillLow', () => {
        getDJEngine().deckA.setEQKill('low', !getDJEngine().deckA.getEQKill('low'));
      }));
      cleanups.push(manager.registerAction('dj.deckA.eqKillMid', () => {
        getDJEngine().deckA.setEQKill('mid', !getDJEngine().deckA.getEQKill('mid'));
      }));
      cleanups.push(manager.registerAction('dj.deckA.eqKillHi', () => {
        getDJEngine().deckA.setEQKill('high', !getDJEngine().deckA.getEQKill('high'));
      }));
      cleanups.push(manager.registerAction('dj.deckB.eqKillLow', () => {
        getDJEngine().deckB.setEQKill('low', !getDJEngine().deckB.getEQKill('low'));
      }));
      cleanups.push(manager.registerAction('dj.deckB.eqKillMid', () => {
        getDJEngine().deckB.setEQKill('mid', !getDJEngine().deckB.getEQKill('mid'));
      }));
      cleanups.push(manager.registerAction('dj.deckB.eqKillHi', () => {
        getDJEngine().deckB.setEQKill('high', !getDJEngine().deckB.getEQKill('high'));
      }));
    };

    // DJ knob page switching
    cleanups.push(manager.registerAction('dj.knobPage.next', () => {
      useMIDIStore.getState().nextDJKnobPage();
    }));
    cleanups.push(manager.registerAction('dj.knobPage.prev', () => {
      useMIDIStore.getState().prevDJKnobPage();
    }));

    // Vocoder push-to-talk (toggle — for momentary buttons, note-on/off is handled by DJControllerMapper)
    cleanups.push(manager.registerAction('vocoder.ptt', () => {
      const { pttActive, setPTT } = useVocoderStore.getState();
      setPTT(!pttActive);
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
