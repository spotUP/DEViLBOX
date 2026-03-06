/**
 * PixiViewHeader — Unified header bar for all GL views (except VJ).
 *
 * Provides: view selector dropdown | title label | children (view-specific controls)
 *
 * Standard height 36px, bgSecondary background, bottom border.
 */

import React, { useCallback } from 'react';
import { useUIStore } from '@stores/useUIStore';
import { usePixiTheme } from '../theme';
import { PixiSelect, type SelectOption } from './PixiSelect';
import { PixiLabel } from './PixiLabel';

export const VIEW_HEADER_HEIGHT = 36;

const VIEW_MODE_OPTIONS: SelectOption[] = [
  { value: 'tracker',     label: 'Tracker' },
  { value: 'grid',        label: 'Grid' },
  { value: 'pianoroll',   label: 'Piano Roll' },
  { value: 'tb303',       label: 'TB-303' },
  { value: 'arrangement', label: 'Arrangement' },
  { value: 'dj',          label: 'DJ Mixer' },
  { value: 'drumpad',     label: 'Drum Pads' },
  { value: 'mixer',       label: 'Mixer' },
  { value: 'vj',          label: 'VJ View' },
  { value: 'studio',      label: 'Studio' },
  { value: 'split',       label: 'Split View' },
];

export interface PixiViewHeaderProps {
  /** Current view value for the selector dropdown */
  activeView: string;
  /** Bold accent title shown after the dropdown */
  title: string;
  /** View-specific controls rendered after the title */
  children?: React.ReactNode;
  /** Custom onChange — if not provided, uses default view switching logic */
  onViewChange?: (value: string) => void;
}

export const PixiViewHeader: React.FC<PixiViewHeaderProps> = ({
  activeView,
  title,
  children,
  onViewChange,
}) => {
  const theme = usePixiTheme();

  const defaultViewChange = useCallback((val: string) => {
    if (val === activeView) return;
    const store = useUIStore.getState();
    // tracker/grid/tb303 are sub-modes of the tracker view
    if (val === 'tracker' || val === 'grid' || val === 'tb303') {
      setTimeout(() => {
        store.setActiveView('tracker');
        store.setTrackerViewMode(val as any);
      }, 0);
    } else {
      setTimeout(() => store.setActiveView(val as any), 0);
    }
  }, [activeView]);

  const handleChange = onViewChange ?? defaultViewChange;

  return (
    <layoutContainer
      layout={{
        width: '100%',
        height: VIEW_HEADER_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 8,
        gap: 6,
        backgroundColor: theme.bgSecondary.color,
        borderBottomWidth: 1,
        borderColor: theme.border.color,
      }}
    >
      <PixiSelect
        options={VIEW_MODE_OPTIONS}
        value={activeView}
        onChange={handleChange}
        width={110}
        height={24}
      />

      <PixiLabel text={title} size="sm" weight="bold" color="accent" />

      {children}
    </layoutContainer>
  );
};
