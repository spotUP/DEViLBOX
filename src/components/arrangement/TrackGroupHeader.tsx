/**
 * TrackGroupHeader - Collapsible group header for track groups
 */

import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useArrangementStore } from '@stores/useArrangementStore';
import type { TrackGroup } from '@/types/arrangement';

interface TrackGroupHeaderProps {
  group: TrackGroup;
}

export const TrackGroupHeader: React.FC<TrackGroupHeaderProps> = ({ group }) => {
  const { toggleGroupCollapse } = useArrangementStore();

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 border-b border-dark-border bg-dark-bgTertiary select-none cursor-pointer hover:bg-dark-border/50"
      onClick={() => toggleGroupCollapse(group.id)}
    >
      {group.collapsed ? (
        <ChevronRight size={12} className="text-text-muted" />
      ) : (
        <ChevronDown size={12} className="text-text-muted" />
      )}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: group.color || '#888' }}
      />
      <span className="text-xs font-medium text-text-primary truncate flex-1">
        {group.name}
      </span>
      <span className="text-[9px] text-text-muted">
        {group.collapsed ? '...' : ''}
      </span>
    </div>
  );
};
