/**
 * ChannelContextMenu - Dropdown (dots) button for channel operations.
 * Items come from useChannelMenuItems, shared with the right-click menus.
 */

import React from 'react';
import { DropdownButton } from '@components/common/ContextMenu';
import { useLiveModeStore } from '@stores/useLiveModeStore';
import type { ChannelData } from '@typedefs/tracker';
import { useChannelMenuItems, type ChannelMenuHandlers } from './useChannelMenuItems';

interface ChannelContextMenuProps extends ChannelMenuHandlers {
  channelIndex: number;
  channel: ChannelData;
  patternId: string;
  patternLength: number;
}

export const ChannelContextMenu: React.FC<ChannelContextMenuProps> = ({
  channelIndex,
  channel,
  patternId,
  patternLength: _patternLength,
  ...handlers
}) => {
  const isLiveMode = useLiveModeStore((s) => s.isLiveMode);
  const buildMenuItems = useChannelMenuItems(channelIndex, channel, patternId, handlers);
  return (
    <DropdownButton
      items={buildMenuItems}
      className={`
        p-1 rounded transition-colors
        ${isLiveMode
          ? 'text-accent-error hover:bg-accent-error/20'
          : 'text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
        }
      `}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="19" r="1" />
      </svg>
    </DropdownButton>
  );
};

