// src/hooks/dialogs/useNewSongWizard.ts
/**
 * useNewSongWizard — Logic hook for NewSongWizard.
 *
 * The dialog keeps only its markup; all store subscriptions, local state and
 * handlers live here.
 *
 * Dialog: src/components/dialogs/NewSongWizard.tsx
 */

import { useState, useCallback } from 'react';
import { useUIStore } from '@stores/useUIStore';
import { getGroupedPresets, SYSTEM_PRESETS } from '@constants/systemPresets';
import type { SystemPreset } from '@constants/systemPresets';
import { getInstrumentPresetsForSystem } from '@constants/uadeInstrumentPresets';
import { startNewSong } from '@/lib/song/startNewSong';
import type { NewSongMode } from '@/lib/song/startNewSong';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardStep = 1 | 2 | 3;
export type StartMode = NewSongMode;

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

  /**
   * DOM finish — no template-file support.
   */
  const finish = useCallback(
    (mode: StartMode, loadInstruments: boolean) => {
      const presetId = selectedPresetId;
      void startNewSong(mode, loadInstruments, presetId);
      resetWizardState();
      close();
    },
    [selectedPresetId, resetWizardState, close]
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
    resetWizardState,
    handleNext,
    handleBack,
    handleCancel,
    handleFinish,
  };
}
