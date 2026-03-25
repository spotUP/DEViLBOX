/**
 * PixiViewHeader — Unified header bar for all GL views (except VJ).
 *
 * Provides: view selector dropdown | title label | children (view-specific controls)
 *
 * Standard height 36px, bgSecondary background, bottom border.
 */

import React, { useCallback } from 'react';
import { usePixiTheme } from '../theme';
import { PixiSelect, type SelectOption } from './PixiSelect';
import { PixiLabel } from './PixiLabel';
import { VIEW_OPTIONS, switchView } from '@/constants/viewOptions';

export const VIEW_HEADER_HEIGHT = 36;

const VIEW_MODE_OPTIONS: SelectOption[] = VIEW_OPTIONS.map(({ value, label }) => ({
  value,
  label,
}));

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

  const defaultViewChange = useCallback((val: string) => {
    switchView(val, activeView);
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

      {title ? <PixiLabel text={title} size="sm" weight="bold" color="accent" /> : null}
      {subtitle && <PixiLabel text={subtitle} size="sm" color="textMuted" />}

      {children}
    </layoutContainer>
  );
};
