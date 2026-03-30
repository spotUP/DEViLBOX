/**
 * PixiViewHeader — Unified header bar for all GL views (except VJ).
 *
 * Provides: title label | children (view-specific controls)
 *
 * Standard height 36px, bgSecondary background, bottom border.
 * View switching is handled by the app-level PixiNavBar dropdown.
 */

import React from 'react';
import { usePixiTheme } from '../theme';
import { PixiLabel } from './PixiLabel';

export const VIEW_HEADER_HEIGHT = 36;

export interface PixiViewHeaderProps {
  /** Current view value (for reference, no longer drives a dropdown here) */
  activeView: string;
  /** Bold accent title shown in the header */
  title: string;
  /** Dimmer text after the title */
  subtitle?: string;
  /** View-specific controls rendered after the title */
  children?: React.ReactNode;
  /** @deprecated View switching moved to PixiNavBar — kept for API compat */
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
        flexShrink: 0,
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
      {title ? <PixiLabel text={title} size="sm" weight="bold" color="accent" /> : null}
      {subtitle && <PixiLabel text={subtitle} size="sm" color="textMuted" />}

      {children}
    </layoutContainer>
  );
};
