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
import { listNewSongFormats } from '@/lib/formats/EditableFormatRegistry';
import '@lib/formats/EditableFormatRegistry.builtins';
import { notify } from '@stores/useNotificationStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardStep = 1 | 2 | 3;
/** Step 1 choice: a blank generic song, or pick a format / system in step 2. */
export type StartMode = 'empty' | 'browse';
/** Step 2 choice: a song format (real file in that format) or a system preset. */
export type WizardSelection = { kind: 'format'; formatId: string } | { kind: 'preset'; presetId: string };

// ─── Constants ────────────────────────────────────────────────────────────────

export const GROUPED_PRESETS = getGroupedPresets();

/** The browser's first group: every format a new song can start in. */
export const NEW_SONG_FORMATS = listNewSongFormats();

const DEFAULT_SELECTION: WizardSelection = { kind: 'preset', presetId: 'amiga_protracker' };

function defaultSelection(): WizardSelection {
  const first = NEW_SONG_FORMATS[0];
  return first ? { kind: 'format', formatId: first.formatId } : DEFAULT_SELECTION;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNewSongWizard() {
  const isOpen = useUIStore((s) => s.newSongWizardOpen);
  const close = useUIStore((s) => s.closeNewSongWizard);

  const [step, setStep] = useState<WizardStep>(1);
  const [startMode, setStartMode] = useState<StartMode>('empty');
  const [selection, setSelection] = useState<WizardSelection>(defaultSelection);
  const [withPresetInstruments, setWithPresetInstruments] = useState(true);
  const selectedPresetId = selection.kind === 'preset' ? selection.presetId : '';

  // ── Reset helper ───────────────────────────────────────────────────────────

  const resetWizardState = useCallback(() => {
    setStep(1);
    setStartMode('empty');
    setSelection(defaultSelection());
    setWithPresetInstruments(true);
  }, []);

  /** Starts the song for the given choice, then closes the wizard. */
  const finish = useCallback(
    (mode: StartMode, loadInstruments: boolean) => {
      const req = mode === 'empty'
        ? { kind: 'empty' as const }
        : selection.kind === 'format'
          ? selection
          : { kind: 'preset' as const, presetId: selection.presetId, loadInstruments };
      startNewSong(req).catch((err: unknown) => {
        notify.error(`New song failed: ${err instanceof Error ? err.message : String(err)}`);
      });
      resetWizardState();
      close();
    },
    [selection, resetWizardState, close]
  );

  // ── Derived values ─────────────────────────────────────────────────────────

  const selectedPreset: SystemPreset | undefined = SYSTEM_PRESETS.find(
    (p) => p.id === selectedPresetId
  );

  const hasStarterInstruments =
    selectedPresetId !== '' &&
    getInstrumentPresetsForSystem(selectedPresetId).length > 0;

  const starterInstruments = getInstrumentPresetsForSystem(selectedPresetId);

  const stepCount = startMode === 'browse' ? (hasStarterInstruments ? 3 : 2) : 1;

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
        finish('browse', false);
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
    finish('browse', withPresetInstruments);
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
    selection,
    setSelection,
    selectedPresetId,
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
