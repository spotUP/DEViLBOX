// src/hooks/dialogs/useNewSongWizard.ts
/**
 * useNewSongWizard — Shared logic hook for NewSongWizard (DOM) and PixiNewSongWizard (Pixi).
 *
 * Both dialogs call this hook and keep only their renderer-specific markup.
 * All store subscriptions, local state, and handlers live here.
 *
 * DOM reference:   src/components/dialogs/NewSongWizard.tsx
 * Pixi reference:  src/pixi/dialogs/PixiNewSongWizard.tsx
 */

import { useState, useCallback } from 'react';
import { useUIStore } from '@stores/useUIStore';
import { getGroupedPresets, SYSTEM_PRESETS } from '@constants/systemPresets';
import type { SystemPreset } from '@constants/systemPresets';
import { AMIGA_UADE_PRESET_IDS, getInstrumentPresetsForSystem } from '@constants/uadeInstrumentPresets';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useTabsStore } from '@stores/useTabsStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardStep = 1 | 2 | 3;
export type StartMode = 'empty' | 'preset';

// ─── Constants ────────────────────────────────────────────────────────────────

export const GROUPED_PRESETS = getGroupedPresets();

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNewSongWizard() {
  const isOpen = useUIStore((s) => s.newSongWizardOpen);
  const close = useUIStore((s) => s.closeNewSongWizard);

  const [step, setStep] = useState<WizardStep>(1);
  const [startMode, setStartMode] = useState<StartMode>('empty');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('amiga_protracker');
  const [withPresetInstruments, setWithPresetInstruments] = useState(true);

  // ── Reset helper ───────────────────────────────────────────────────────────

  const resetWizardState = useCallback(() => {
    setStep(1);
    setStartMode('empty');
    setSelectedPresetId('amiga_protracker');
    setWithPresetInstruments(true);
  }, []);

  // ── finish ─────────────────────────────────────────────────────────────────

  /**
   * Standard (non-template) finish: creates a new tab, applies system preset,
   * optionally loads starter instruments, tracks active system.
   *
   * The Pixi variant has an additional template-file code path that it handles
   * before calling this — this function handles only the shared non-template flow.
   */
  const finishStandard = useCallback(
    (mode: StartMode, loadInstruments: boolean, presetId: string) => {
      // 1. addTab() saves current project state and resets stores to blank.
      //    NOTE: addTab → restoreState → loadInstruments uses queueMicrotask to
      //    defer the instrument state reset. We must defer our work too, otherwise
      //    the microtask overwrites any instruments we create synchronously here.
      useTabsStore.getState().addTab();

      // Defer preset application so it runs AFTER loadInstruments' microtask.
      queueMicrotask(() => {
        // 2. Apply system preset (channel names, colors, count)
        if (mode === 'preset' && presetId) {
          useTrackerStore.getState().applySystemPreset(presetId);

          // 3. Apply Amiga song settings (hard-panning + BPM) if Amiga format
          if (AMIGA_UADE_PRESET_IDS.has(presetId)) {
            useTrackerStore.getState().applyAmigaSongSettings(presetId);
          }
        }

        // 4. Load starter instruments
        if (mode === 'preset' && loadInstruments && presetId) {
          const presets = getInstrumentPresetsForSystem(presetId);
          presets.forEach((inst) => {
            useInstrumentStore.getState().createInstrument(inst);
          });
        }

        // 5. Track active system for filtering
        useUIStore.getState().setActiveSystemPreset(
          mode === 'preset' ? presetId : null
        );

        useUIStore.getState().setStatusMessage('New project', false, 1500);
      });
    },
    []
  );

  /**
   * DOM finish — no template-file support.
   */
  const finish = useCallback(
    (mode: StartMode, loadInstruments: boolean) => {
      const presetId = selectedPresetId;
      finishStandard(mode, loadInstruments, presetId);
      resetWizardState();
      close();
    },
    [selectedPresetId, finishStandard, resetWizardState, close]
  );

  // ── Derived values ─────────────────────────────────────────────────────────

  const selectedPreset: SystemPreset | undefined = SYSTEM_PRESETS.find(
    (p) => p.id === selectedPresetId
  );

  const hasStarterInstruments =
    selectedPresetId !== '' &&
    getInstrumentPresetsForSystem(selectedPresetId).length > 0;

  const starterInstruments = getInstrumentPresetsForSystem(selectedPresetId);

  const stepCount = startMode === 'preset' ? (hasStarterInstruments ? 3 : 2) : 1;

  const nextLabel =
    step === 1
      ? 'Next'
      : step === 2
        ? hasStarterInstruments
          ? 'Next'
          : 'Finish'
        : 'Finish';

  // ── Navigation handlers ────────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    if (step === 1) {
      if (startMode === 'empty') {
        finish('empty', false);
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      if (hasStarterInstruments) {
        setStep(3);
      } else {
        finish('preset', false);
      }
    }
  }, [step, startMode, hasStarterInstruments, finish]);

  const handleBack = useCallback(() => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }, [step]);

  const handleCancel = useCallback(() => {
    resetWizardState();
    close();
  }, [resetWizardState, close]);

  const handleFinish = useCallback(() => {
    finish('preset', withPresetInstruments);
  }, [finish, withPresetInstruments]);

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    // Open state + close
    isOpen,
    close,

    // Wizard state
    step,
    setStep,
    startMode,
    setStartMode,
    selectedPresetId,
    setSelectedPresetId,
    withPresetInstruments,
    setWithPresetInstruments,

    // Derived
    selectedPreset,
    hasStarterInstruments,
    starterInstruments,
    stepCount,
    nextLabel,

    // Handlers
    finish,
    finishStandard,
    resetWizardState,
    handleNext,
    handleBack,
    handleCancel,
    handleFinish,
  };
}
