/**
 * Shared helpers and types for visual effect editors
 */

import type { EffectConfig } from '@typedefs/instrument';
import { BpmSyncControl } from '../BpmSyncControl';
import { isEffectBpmSynced, getEffectSyncDivision, type SyncDivision } from '@engine/bpmSync';

export interface VisualEffectEditorProps {
  effect: EffectConfig;
  onUpdateParameter: (key: string, value: number | string) => void;
  onUpdateParameters?: (params: Record<string, number | string>) => void;
  onUpdateWet: (wet: number) => void;
}

/**
 * Section header component — pedal panel label (re-exported with 'lg' size)
 */
export { SectionHeader } from '@components/instruments/shared';

/**
 * Helper to get parameter value with default
 */
export function getParam(effect: EffectConfig, key: string, defaultValue: number): number {
  const value = effect.parameters[key];
  return typeof value === 'number' ? value : defaultValue;
}

/**
 * Helper to render BpmSyncControl for syncable effect editors.
 * When sync is ON, the synced knob should be visually dimmed.
 */
export function renderBpmSync(
  effect: EffectConfig,
  onUpdateParameter: (key: string, value: number | string) => void,
) {
  const synced = isEffectBpmSynced(effect.parameters);
  const division = getEffectSyncDivision(effect.parameters);
  return (
    <BpmSyncControl
      bpmSync={synced ? 1 : 0}
      syncDivision={division}
      onToggleSync={(enabled) => onUpdateParameter('bpmSync', enabled ? 1 : 0)}
      onChangeDivision={(div: SyncDivision) => onUpdateParameter('syncDivision', div)}
    />
  );
}
