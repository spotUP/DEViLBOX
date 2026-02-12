/**
 * useMIDIActions - Hook to connect MIDI CC mappings to tracker actions
 *
 * Subscribes to CCMapManager parameter changes and dispatches
 * corresponding tracker actions and TB-303 parameter updates.
 */

import { useEffect, useCallback } from 'react';
import { getCCMapManager } from '../midi/CCMapManager';
import { useTrackerStore, useTransportStore, useInstrumentStore } from '../stores';
import { useHistoryStore } from '../stores/useHistoryStore';
import { getToneEngine } from '../engine/ToneEngine';

/**
 * Hook to handle MIDI-triggered tracker actions and TB-303 parameters
 */
export function useMIDIActions() {
  // Handle tracker actions
  const handleAction = useCallback(
    (action: string) => {
      const {
        patterns,
        currentPatternIndex,
        setCurrentPattern,
        currentOctave,
        setCurrentOctave,
      } = useTrackerStore.getState();

      const {
        isPlaying,
        isLooping,
        play,
        stop,
        pause,
        setIsLooping,
        currentRow,
        setCurrentRow,
      } = useTransportStore.getState();

      const {
        currentInstrumentId,
        setCurrentInstrument,
        instruments,
      } = useInstrumentStore.getState();

      const {
        undo,
        redo,
      } = useHistoryStore.getState();

      switch (action) {
        // Transport
        case 'transport.play':
          if (!isPlaying) play();
          break;
        case 'transport.stop':
          stop();
          break;
        case 'transport.pause':
          pause();
          break;
        case 'transport.loop':
          setIsLooping(!isLooping);
          break;

        // Navigation
        case 'nav.patternUp':
          if (currentPatternIndex < patterns.length - 1) {
            setCurrentPattern(currentPatternIndex + 1);
          }
          break;
        case 'nav.patternDown':
          if (currentPatternIndex > 0) {
            setCurrentPattern(currentPatternIndex - 1);
          }
          break;
        case 'nav.rowUp':
          if (currentRow > 0) {
            setCurrentRow(currentRow - 1);
          }
          break;
        case 'nav.rowDown': {
          const pattern = patterns[currentPatternIndex];
          if (pattern && currentRow < pattern.length - 1) {
            setCurrentRow(currentRow + 1);
          }
          break;
        }
        case 'nav.toStart':
          setCurrentRow(0);
          break;
        case 'nav.toEnd': {
          const currentPattern = patterns[currentPatternIndex];
          if (currentPattern) {
            setCurrentRow(currentPattern.length - 1);
          }
          break;
        }

        // Editing
        case 'edit.octaveUp':
          if (currentOctave < 8) {
            setCurrentOctave(currentOctave + 1);
          }
          break;
        case 'edit.octaveDown':
          if (currentOctave > 0) {
            setCurrentOctave(currentOctave - 1);
          }
          break;
        case 'edit.instrumentUp':
          if (currentInstrumentId !== null) {
            const nextId = currentInstrumentId + 1;
            if (instruments.some(i => i.id === nextId)) {
              setCurrentInstrument(nextId);
            }
          }
          break;
        case 'edit.instrumentDown':
          if (currentInstrumentId !== null && currentInstrumentId > 1) {
            const prevId = currentInstrumentId - 1;
            if (instruments.some(i => i.id === prevId)) {
              setCurrentInstrument(prevId);
            }
          }
          break;
        case 'edit.undo':
          undo();
          break;
        case 'edit.redo':
          redo();
          break;

        default:
          // console.log(`[useMIDIActions] Unhandled action: ${action}`);
          break;
      }
    },
    []
  );

  // Handle TB-303 parameter updates via ToneEngine
  const handleTB303Parameter = useCallback(
    (paramName: string, value: number) => {
      const { instruments } = useInstrumentStore.getState();
      const engine = getToneEngine();
      const ccManager = getCCMapManager();

      // Get the controlled instrument ID (null means all TB-303s/Buzz3o3s)
      const controlledId = ccManager.getControlledInstrument();

      // Find target instruments (TB303 or Buzz3o3 with tb303 config)
      let targetInstruments = instruments.filter(i =>
        (i.synthType === 'TB303' || i.synthType === 'Buzz3o3') && i.tb303
      );

      // If a specific instrument is selected, filter to just that one
      if (controlledId !== null) {
        const specificInst = instruments.find(i => i.id === controlledId);
        if (specificInst && specificInst.tb303) {
          targetInstruments = [specificInst];
        } else if (specificInst) {
          // Selected instrument is not a TB-303/Buzz3o3, skip
          return;
        }
      }

      if (targetInstruments.length === 0) return;

      // Apply to all target instruments
      targetInstruments.forEach((tb303Instrument) => {
        if (!tb303Instrument.tb303) return;

        // Deep copy the tb303 config to avoid mutation
        const tb303Config = JSON.parse(JSON.stringify(tb303Instrument.tb303));

        switch (paramName) {
          case 'cutoff':
            if (tb303Config.filter) tb303Config.filter.cutoff = value;
            break;
          case 'resonance':
            if (tb303Config.filter) tb303Config.filter.resonance = value;
            break;
          case 'envMod':
            if (tb303Config.filterEnvelope) tb303Config.filterEnvelope.envMod = value;
            break;
          case 'decay':
            if (tb303Config.filterEnvelope) tb303Config.filterEnvelope.decay = value;
            break;
          case 'accent':
            if (tb303Config.accent) tb303Config.accent.amount = value;
            break;
          case 'slideTime':
            if (tb303Config.slide) tb303Config.slide.time = value;
            break;
          case 'overdrive':
            if (tb303Config.overdrive) tb303Config.overdrive.amount = value;
            break;
          case 'normalDecay':
            if (tb303Config.devilFish) tb303Config.devilFish.normalDecay = value;
            break;
          case 'accentDecay':
            if (tb303Config.devilFish) tb303Config.devilFish.accentDecay = value;
            break;
          case 'softAttack':
            if (tb303Config.devilFish) tb303Config.devilFish.softAttack = value;
            break;
          case 'vegSustain':
            if (tb303Config.devilFish) tb303Config.devilFish.vegSustain = value;
            break;
          case 'filterFM':
            if (tb303Config.devilFish) tb303Config.devilFish.filterFM = value;
            break;
          case 'filterTracking':
            if (tb303Config.devilFish) tb303Config.devilFish.filterTracking = value;
            break;
        }

        // Apply the update via ToneEngine
        engine.updateTB303Parameters(tb303Instrument.id, tb303Config);
      });
    },
    []
  );

  // Handle parameter changes from MIDI
  const handleParameterChange = useCallback(
    (_instrumentId: number, parameterPath: string, value: number) => {
      // Check if it's a tracker action (triggered by CC value > 64)
      if (parameterPath.startsWith('transport.') ||
          parameterPath.startsWith('nav.') ||
          parameterPath.startsWith('edit.') ||
          parameterPath.startsWith('channel.') ||
          parameterPath.startsWith('pattern.') ||
          parameterPath.startsWith('view.')) {

        // Actions are triggered when CC value crosses threshold (64)
        if (value > 64) {
          handleAction(parameterPath);
        }
        return;
      }

      // Handle TB-303 parameters
      if (parameterPath.startsWith('tb303.')) {
        const paramName = parameterPath.replace('tb303.', '');
        handleTB303Parameter(paramName, value);
        return;
      }
    },
    [handleAction, handleTB303Parameter]
  );

  // Subscribe to CCMapManager parameter changes
  useEffect(() => {
    const ccManager = getCCMapManager();
    const unsubscribe = ccManager.onParameterChange(handleParameterChange);
    return unsubscribe;
  }, [handleParameterChange]);
}

export default useMIDIActions;
