// src/hooks/dialogs/useGrooveSettings.ts
/**
 * useGrooveSettings — Shared logic hook for GrooveSettingsModal (DOM) and PixiGrooveSettingsModal (Pixi).
 *
 * Both dialogs call this hook and keep only their renderer-specific markup.
 * All store subscriptions and derived constants live here.
 */

import { useTransportStore } from '@stores/useTransportStore';
import { GROOVE_TEMPLATES } from '@typedefs/audio';

// ─── Constants (exported for use in both renderers) ───────────────────────────

export const GROOVE_CATEGORIES = ['straight', 'shuffle', 'swing', 'funk', 'hip-hop', 'custom'] as const;

export type GrooveCategory = (typeof GROOVE_CATEGORIES)[number];

export const GROOVE_RESOLUTIONS: { steps: number; label: string }[] = [
  { steps: 2, label: '16th' },
  { steps: 4, label: '8th' },
  { steps: 8, label: '4th' },
  { steps: 16, label: '1b' },
  { steps: 32, label: '2b' },
  { steps: 64, label: '4b' },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGrooveSettings() {
  const swing = useTransportStore((s) => s.swing);
  const setSwing = useTransportStore((s) => s.setSwing);
  const grooveSteps = useTransportStore((s) => s.grooveSteps);
  const setGrooveSteps = useTransportStore((s) => s.setGrooveSteps);
  const jitter = useTransportStore((s) => s.jitter);
  const setJitter = useTransportStore((s) => s.setJitter);
  const useMpcScale = useTransportStore((s) => s.useMpcScale);
  const setUseMpcScale = useTransportStore((s) => s.setUseMpcScale);
  const grooveTemplateId = useTransportStore((s) => s.grooveTemplateId);
  const setGrooveTemplate = useTransportStore((s) => s.setGrooveTemplate);

  const swingMin = useMpcScale ? 50 : 0;
  const swingMax = useMpcScale ? 75 : 200;
  const swingDefaultValue = useMpcScale ? 50 : 100;

  return {
    // Store values
    swing, setSwing,
    grooveSteps, setGrooveSteps,
    jitter, setJitter,
    useMpcScale, setUseMpcScale,
    grooveTemplateId, setGrooveTemplate,
    // Derived
    swingMin,
    swingMax,
    swingDefaultValue,
  };
}

// Re-export GROOVE_TEMPLATES so renderers don't need a separate import
export { GROOVE_TEMPLATES };
