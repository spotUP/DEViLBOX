/**
 * ChannelHeaderContextMenu - right-click menu on a channel header.
 * Same items as the dots button (useChannelMenuItems), shown at the cursor
 * through the shared ContextMenu component.
 */

import React from 'react';
import { ContextMenu } from '@components/common/ContextMenu';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useChannelMenuItems, type ChannelMenuHandlers } from './useChannelMenuItems';

interface ChannelHeaderContextMenuProps {
  position: { x: number; y: number } | null;
  channelIndex: number;
  onClose: () => void;
  handlers: ChannelMenuHandlers;
}

export const ChannelHeaderContextMenu: React.FC<ChannelHeaderContextMenuProps> = ({
  position,
  channelIndex,
  onClose,
  handlers,
}) => {
  const pattern = useTrackerStore((s) => s.patterns[s.currentPatternIndex]);
  const build = useChannelMenuItems(channelIndex, pattern?.channels[channelIndex], pattern?.id ?? '', handlers);
  if (!position) return null;
  return <ContextMenu items={build()} position={position} onClose={onClose} />;
};
