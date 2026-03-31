// src/hooks/views/useEditorControls.ts
/**
 * useEditorControls — Shared logic hook for EditorControlsBar (DOM) and
 * PixiEditorControlsBar (Pixi).
 *
 * Both views call this hook and keep only their renderer-specific markup.
 * All store subscriptions, derived state, and handler callbacks live here.
 */

import { useCallback } from 'react';
import { useTrackerStore, useTransportStore, useAudioStore, useUIStore, useEditorStore } from '@stores';
import { formatMaskDisplay } from '@stores/useEditorStore';
import { useShallow } from 'zustand/react/shallow';
import { useFPSMonitor } from '@hooks/useFPSMonitor';
import { SYSTEM_PRESETS } from '@/constants/systemPresets';
import { notify } from '@stores/useNotificationStore';
import { useTrackerAnalysis } from '@/hooks/useTrackerAnalysis';

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useEditorControls(opts?: {
  /** DOM variant: optional override for the automation editor action */
  onShowAutomation?: () => void;
  /** DOM variant: optional override for the drumpads action */
  onShowDrumpads?: () => void;
}) {
  // ── Store state ───────────────────────────────────────────────────────────

  const { recordMode, showGhostPatterns, activeBehavior, copyMask } = useEditorStore(
    useShallow((s) => ({
      recordMode: s.recordMode,
      showGhostPatterns: s.showGhostPatterns,
      activeBehavior: s.activeBehavior,
      copyMask: s.copyMask,
    })),
  );

  const { channelCount, applySystemPreset } = useTrackerStore(
    useShallow((s) => ({
      channelCount: s.patterns[s.currentPatternIndex]?.channels?.length || 4,
      applySystemPreset: s.applySystemPreset,
    })),
  );

  const { grooveTemplateId, swing, jitter, smoothScrolling } = useTransportStore(
    useShallow((s) => ({
      grooveTemplateId: s.grooveTemplateId,
      swing: s.swing,
      jitter: s.jitter,
      smoothScrolling: s.smoothScrolling,
    })),
  );

  const masterMuted = useAudioStore((s) => s.masterMuted);
  const statusMessage = useUIStore((s) => s.statusMessage);

  // ── FPS monitor ──────────────────────────────────────────────────────────

  const fps = useFPSMonitor();

  // ── Derived state ─────────────────────────────────────────────────────────

  const grooveActive = (grooveTemplateId !== 'straight' && swing > 0) || jitter > 0;

  // IT mask display string (only relevant when itMaskVariables behavior is active)
  const maskDisplay = activeBehavior.itMaskVariables ? formatMaskDisplay(copyMask) : null;

  // ── Tracker audio analysis (capture + analyze during playback) ────────────
  // Called here so exactly one component in the tree runs the effect regardless
  // of which renderer is active.
  useTrackerAnalysis();

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleToggleRecord = useCallback(() => {
    useEditorStore.getState().toggleRecordMode();
  }, []);

  const handleToggleGhosts = useCallback(() => {
    const s = useEditorStore.getState();
    s.setShowGhostPatterns(!s.showGhostPatterns);
  }, []);

  const handleToggleMute = useCallback(() => {
    useAudioStore.getState().toggleMasterMute();
  }, []);

  const handleToggleSmooth = useCallback(() => {
    const s = useTransportStore.getState();
    s.setSmoothScrolling(!s.smoothScrolling);
  }, []);

  const handleShowAutoEditor = useCallback(() => {
    if (opts?.onShowAutomation) opts.onShowAutomation();
    else useUIStore.getState().openModal('automation');
  }, [opts?.onShowAutomation]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleShowDrumpads = useCallback(() => {
    if (opts?.onShowDrumpads) opts.onShowDrumpads();
    else useUIStore.getState().openModal('drumpads');
  }, [opts?.onShowDrumpads]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRecSettings = useCallback(() => {
    useUIStore.getState().openModal('settings');
  }, []);

  const handleGrooveSettings = useCallback(() => {
    useUIStore.getState().openModal('grooveSettings');
  }, []);

  const handleAdvancedEdit = useCallback(() => {
    useUIStore.getState().openModal('advancedEdit');
  }, []);

  const handleHardwarePresetChange = useCallback(
    (presetId: string) => {
      if (presetId === 'none' || presetId === '__group__') return;
      applySystemPreset(presetId);
      notify.success(
        `Hardware System: ${SYSTEM_PRESETS.find((p) => p.id === presetId)?.name.toUpperCase()}`,
      );
    },
    [applySystemPreset],
  );

  return {
    // Store values
    recordMode,
    showGhostPatterns,
    channelCount,
    grooveTemplateId,
    swing,
    jitter,
    smoothScrolling,
    masterMuted,
    statusMessage,
    // Derived
    grooveActive,
    maskDisplay,
    // FPS
    fps,
    // Handlers
    handleToggleRecord,
    handleToggleGhosts,
    handleToggleMute,
    handleToggleSmooth,
    handleShowAutoEditor,
    handleShowDrumpads,
    handleRecSettings,
    handleGrooveSettings,
    handleAdvancedEdit,
    handleHardwarePresetChange,
  };
}
