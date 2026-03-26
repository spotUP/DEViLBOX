/**
 * PixiViewHeader — Unified header bar for all GL views (except VJ).
 *
 * Provides: view selector dropdown | title label | children (view-specific controls)
 *
 * Standard height 36px, bgSecondary background, bottom border.
 */

import React from 'react';
import { usePixiTheme } from '../theme';
import { PixiLabel } from './PixiLabel';
import { PixiSelect } from './PixiSelect';

export const VIEW_HEADER_HEIGHT = 36;

/** View mode options matching DOM EditorControlsBar's <select> */
const VIEW_MODE_OPTIONS = [
  { value: 'tracker', label: 'Tracker' },
  { value: 'grid', label: 'Grid' },
  { value: 'pianoroll', label: 'Piano Roll' },
  { value: 'tb303', label: 'TB-303' },
  { value: 'arrangement', label: 'Arrangement' },
  { value: 'dj', label: 'DJ Mixer' },
  { value: 'vj', label: 'VJ View' },
  { value: 'mixer', label: 'Mixer' },
  { value: 'studio', label: 'Studio' },
  { value: 'split', label: 'Split View' },
];

export interface PixiViewHeaderProps {
  /** Current view value for the selector dropdown */
  activeView: string;
  /** Bold accent title shown after the dropdown */
  title: string;
  /** Dimmer text after the title */
  subtitle?: string;
  /** View-specific controls rendered after the title */
  children?: React.ReactNode;
  /** Custom onChange — if not provided, uses default view switching logic */
  onViewChange?: (value: string) => void;
}

export const PixiViewHeader: React.FC<PixiViewHeaderProps> = ({
  activeView,
  title,
  subtitle,
  children,
  onViewChange,
}) => {
  const theme = usePixiTheme();

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
        overflow: 'hidden',
        backgroundColor: theme.bgSecondary.color,
        borderBottomWidth: 1,
        borderColor: theme.border.color,
      }}
    >
      {/* View selector dropdown — matches DOM EditorControlsBar */}
      {onViewChange && (
        <PixiSelect
          options={VIEW_MODE_OPTIONS}
          value={activeView}
          onChange={onViewChange}
          width={110}
          height={24}
        />
      )}

      {title ? <PixiLabel text={title} size="sm" weight="bold" color="accent" /> : null}
      {subtitle && <PixiLabel text={subtitle} size="sm" color="textMuted" />}

      {children}
    </layoutContainer>
  );
};
