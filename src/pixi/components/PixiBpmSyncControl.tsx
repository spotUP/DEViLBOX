/**
 * PixiBpmSyncControl — GL-native BPM sync control.
 *
 * Shows a SYNC toggle button, note-division dropdown, and computed ms display.
 * Mirrors DOM BpmSyncControl (src/components/effects/BpmSyncControl.tsx).
 */

import React, { useMemo, useCallback } from 'react';
import { useTransportStore } from '@stores/useTransportStore';
import {
  SYNC_DIVISIONS,
  bpmToMs,
  type SyncDivision,
} from '@engine/bpmSync';
import { PixiButton } from './PixiButton';
import { PixiSelect, type SelectOption } from './PixiSelect';
import { PixiLabel } from './PixiLabel';
import { usePixiTheme } from '../theme';

interface PixiBpmSyncControlProps {
  /** Current bpmSync value (0 or 1) */
  bpmSync: number;
  /** Current syncDivision value */
  syncDivision: SyncDivision;
  /** Called when user toggles sync on/off */
  onToggleSync: (enabled: boolean) => void;
  /** Called when user selects a new division */
  onChangeDivision: (division: SyncDivision) => void;
  layout?: Record<string, unknown>;
}

export const PixiBpmSyncControl: React.FC<PixiBpmSyncControlProps> = ({
  bpmSync,
  syncDivision,
  onToggleSync,
  onChangeDivision,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const bpm = useTransportStore((s) => s.bpm);
  const isOn = bpmSync === 1;

  const computedMs = useMemo(
    () => (isOn ? bpmToMs(bpm, syncDivision) : null),
    [isOn, bpm, syncDivision],
  );

  // Build flat options from SYNC_DIVISIONS (grouped labels for clarity)
  const divisionOptions: SelectOption[] = useMemo(() => {
    return SYNC_DIVISIONS.map((d) => ({
      value: d.value,
      label: `${d.label} (${d.category})`,
      group: d.category,
    }));
  }, []);

  const handleToggle = useCallback(() => {
    onToggleSync(!isOn);
  }, [isOn, onToggleSync]);

  const handleDivisionChange = useCallback((value: string) => {
    onChangeDivision(value as SyncDivision);
  }, [onChangeDivision]);

  const msText = useMemo(() => {
    if (computedMs === null) return '';
    return computedMs < 1000
      ? `${Math.round(computedMs)}ms`
      : `${(computedMs / 1000).toFixed(2)}s`;
  }, [computedMs]);

  return (
    <layoutContainer
      layout={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
        ...layoutProp,
      }}
    >
      {/* SYNC toggle button */}
      <PixiButton
        label="Sync"
        icon="metronome"
        size="sm"
        variant={isOn ? 'primary' : 'default'}
        active={isOn}
        onClick={handleToggle}
      />

      {isOn && (
        <>
          {/* Division dropdown */}
          <PixiSelect
            options={divisionOptions}
            value={syncDivision}
            onChange={handleDivisionChange}
            width={100}
            height={24}
          />

          {/* Computed ms readout */}
          {msText && (
            <PixiLabel
              text={msText}
              size="xs"
              weight="bold"
              color="custom"
              customColor={theme.success.color}
            />
          )}
        </>
      )}
    </layoutContainer>
  );
};
