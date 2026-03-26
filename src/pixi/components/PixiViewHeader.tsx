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

export const VIEW_HEADER_HEIGHT = 36;

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
  title,
  subtitle,
  children,
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
        backgroundColor: theme.bgSecondary.color,
        borderBottomWidth: 1,
        borderColor: theme.border.color,
      }}
    >
      {/* View switcher moved to NavBar — always visible in all views */}

      {title ? <PixiLabel text={title} size="sm" weight="bold" color="accent" /> : null}
      {subtitle && <PixiLabel text={subtitle} size="sm" color="textMuted" />}

      {children}
    </layoutContainer>
  );
};
