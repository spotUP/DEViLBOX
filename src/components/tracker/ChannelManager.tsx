/**
 * ChannelManager - OpenMPT-style Channel Manager Dialog
 *
 * Bulk channel management features:
 * - Drag & drop channel reordering
 * - Bulk mute/solo operations
 * - Record group assignment
 * - Channel color editing
 * - Channel naming
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTrackerStore } from '@stores';
import { Button } from '@components/ui/Button';
import {
  X,
  Volume2,
  VolumeX,
  Headphones,
  GripVertical,
  Circle,
  CheckCircle2,
  Palette,
} from 'lucide-react';

interface ChannelManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

// Record group colors
const RECORD_GROUP_COLORS = {
  0: '#6b7280', // gray - no group
  1: '#ef4444', // red - group 1
  2: '#3b82f6', // blue - group 2
};

export const ChannelManager: React.FC<ChannelManagerProps> = ({ isOpen, onClose }) => {
  const patterns = useTrackerStore((state) => state.patterns);
  const currentPatternIndex = useTrackerStore((state) => state.currentPatternIndex);
  const toggleChannelMute = useTrackerStore((state) => state.toggleChannelMute);
  const toggleChannelSolo = useTrackerStore((state) => state.toggleChannelSolo);
  const setChannelColor = useTrackerStore((state) => state.setChannelColor);
  const reorderChannel = useTrackerStore((state) => state.reorderChannel);
  const setChannelRecordGroup = useTrackerStore((state) => state.setChannelRecordGroup);

  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());
  const [draggedChannel, setDraggedChannel] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [channelNames, setChannelNames] = useState<Map<number, string>>(new Map());

  const pattern = patterns[currentPatternIndex];

  // Clear selection when dialog closes
  useEffect(() => {
    if (!isOpen) {
      requestAnimationFrame(() => {
        setSelectedChannels(new Set());
        setEditingName(null);
        setDraggedChannel(null);
        setDropTarget(null);
      });
    }
  }, [isOpen]);

  // Toggle channel selection
  const toggleSelection = useCallback((index: number, shiftKey: boolean) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (shiftKey && prev.size > 0) {
        // Range selection
        const lastSelected = Array.from(prev).pop() ?? 0;
        const start = Math.min(lastSelected, index);
        const end = Math.max(lastSelected, index);
        for (let i = start; i <= end; i++) {
          next.add(i);
        }
      } else if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Select all / none
  const selectAll = useCallback(() => {
    if (!pattern) return;
    setSelectedChannels(new Set(pattern.channels.map((_, i) => i)));
  }, [pattern]);

  const selectNone = useCallback(() => {
    setSelectedChannels(new Set());
  }, []);

  // Bulk mute
  const muteSelected = useCallback((mute: boolean) => {
    selectedChannels.forEach((index) => {
      const channel = pattern?.channels[index];
      if (channel && channel.muted !== mute) {
        toggleChannelMute(index);
      }
    });
  }, [selectedChannels, pattern, toggleChannelMute]);

  // Bulk solo
  const soloSelected = useCallback(() => {
    if (!pattern) return;
    // First unsolo all
    pattern.channels.forEach((ch, i) => {
      if (ch.solo) toggleChannelSolo(i);
    });
    // Then solo selected
    selectedChannels.forEach((index) => {
      toggleChannelSolo(index);
    });
  }, [selectedChannels, pattern, toggleChannelSolo]);

  // Set record group for selected channels
  const setRecordGroup = useCallback((group: 0 | 1 | 2) => {
    selectedChannels.forEach((index) => {
      setChannelRecordGroup(index, group);
    });
  }, [selectedChannels, setChannelRecordGroup]);

  // Drag and drop handlers
  const handleDragStart = useCallback((index: number) => {
    setDraggedChannel(index);
  }, []);

  const handleDragOver = useCallback((index: number) => {
    if (draggedChannel !== null && draggedChannel !== index) {
      setDropTarget(index);
    }
  }, [draggedChannel]);

  const handleDrop = useCallback((targetIndex: number) => {
    if (draggedChannel !== null && draggedChannel !== targetIndex) {
      reorderChannel(draggedChannel, targetIndex);
    }
    setDraggedChannel(null);
    setDropTarget(null);
  }, [draggedChannel, reorderChannel]);

  const handleDragEnd = useCallback(() => {
    setDraggedChannel(null);
    setDropTarget(null);
  }, []);

  // Channel name editing
  const startEditingName = useCallback((index: number) => {
    setEditingName(index);
  }, []);

  const saveName = useCallback((index: number, name: string) => {
    setChannelNames((prev) => {
      const next = new Map(prev);
      if (name.trim()) {
        next.set(index, name.trim());
      } else {
        next.delete(index);
      }
      return next;
    });
    setEditingName(null);
  }, []);

  // Color presets
  const colorPresets = useMemo(() => [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#06b6d4', // cyan
    '#3b82f6', // blue
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#6b7280', // gray
  ], []);

  if (!isOpen || !pattern) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-dark-bg border border-dark-border rounded-lg shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-dark-bgSecondary border-b border-dark-border">
          <h2 className="text-text-primary font-bold">Channel Manager</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-dark-bgSecondary/50 border-b border-dark-border">
          <Button variant="ghost" size="sm" onClick={selectAll}>
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={selectNone}>
            Select None
          </Button>
          <div className="w-px h-6 bg-border opacity-50" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => muteSelected(true)}
            disabled={selectedChannels.size === 0}
            title="Mute selected"
          >
            <VolumeX size={14} className="mr-1" />
            Mute
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => muteSelected(false)}
            disabled={selectedChannels.size === 0}
            title="Unmute selected"
          >
            <Volume2 size={14} className="mr-1" />
            Unmute
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={soloSelected}
            disabled={selectedChannels.size === 0}
            title="Solo selected"
          >
            <Headphones size={14} className="mr-1" />
            Solo
          </Button>
          <div className="w-px h-6 bg-border opacity-50" />
          <span className="text-xs text-text-secondary">Record Group:</span>
          {([0, 1, 2] as const).map((group) => (
            <button
              key={group}
              onClick={() => setRecordGroup(group)}
              disabled={selectedChannels.size === 0}
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                selectedChannels.size === 0 ? 'opacity-30' : ''
              }`}
              style={{
                borderColor: RECORD_GROUP_COLORS[group],
                backgroundColor: group === 0 ? 'transparent' : RECORD_GROUP_COLORS[group] + '20',
              }}
            >
              {group || '-'}
            </button>
          ))}
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {pattern.channels.map((channel, index) => {
              const isSelected = selectedChannels.has(index);
              const recordGroup = channel.recordGroup ?? 0;
              const channelName = channelNames.get(index) || channel.name || `Channel ${index + 1}`;
              const isDragging = draggedChannel === index;
              const isDropTarget = dropTarget === index;

              return (
                <div
                  key={channel.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    handleDragOver(index);
                  }}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => toggleSelection(index, e.shiftKey)}
                  className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-600/30 border border-blue-500'
                      : 'bg-dark-bgSecondary hover:bg-dark-bgSecondary/80 border border-transparent'
                  } ${isDragging ? 'opacity-50' : ''} ${
                    isDropTarget ? 'border-dashed border-yellow-500' : ''
                  }`}
                >
                  {/* Drag handle */}
                  <GripVertical size={16} className="text-text-secondary cursor-grab" />

                  {/* Selection checkbox */}
                  {isSelected ? (
                    <CheckCircle2 size={16} className="text-blue-400" />
                  ) : (
                    <Circle size={16} className="text-text-secondary" />
                  )}

                  {/* Channel number */}
                  <span className="w-8 text-sm font-mono text-text-secondary">
                    {(index + 1).toString().padStart(2, '0')}
                  </span>

                  {/* Channel name */}
                  {editingName === index ? (
                    <input
                      type="text"
                      defaultValue={channelName}
                      autoFocus
                      onBlur={(e) => saveName(index, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveName(index, e.currentTarget.value);
                        if (e.key === 'Escape') setEditingName(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-dark-bg px-2 py-1 rounded text-sm text-text-primary border border-dark-border"
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm text-text-primary truncate"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startEditingName(index);
                      }}
                    >
                      {channelName}
                    </span>
                  )}

                  {/* Record group indicator */}
                  {recordGroup > 0 && (
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: RECORD_GROUP_COLORS[recordGroup as 1 | 2] }}
                    >
                      {recordGroup}
                    </span>
                  )}

                  {/* Channel color */}
                  <div className="relative group">
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 rounded border border-dark-border"
                      style={{ backgroundColor: channel.color || '#6b7280' }}
                    >
                      <Palette size={12} className="opacity-0 group-hover:opacity-100 text-white" />
                    </button>
                    {/* Color picker dropdown */}
                    <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-wrap gap-1 p-2 bg-dark-bg border border-dark-border rounded shadow-lg z-10 w-24">
                      {colorPresets.map((color) => (
                        <button
                          key={color}
                          onClick={(e) => {
                            e.stopPropagation();
                            setChannelColor(index, color);
                          }}
                          className="w-6 h-6 rounded border border-dark-border hover:scale-110 transition-transform"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Mute/Solo indicators */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleChannelMute(index);
                    }}
                    className={`p-1 rounded ${
                      channel.muted ? 'text-red-500 bg-red-500/20' : 'text-text-secondary hover:bg-dark-bg'
                    }`}
                    title={channel.muted ? 'Unmute' : 'Mute'}
                  >
                    {channel.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleChannelSolo(index);
                    }}
                    className={`p-1 rounded ${
                      channel.solo ? 'text-yellow-500 bg-yellow-500/20' : 'text-text-secondary hover:bg-dark-bg'
                    }`}
                    title={channel.solo ? 'Unsolo' : 'Solo'}
                  >
                    <Headphones size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-4 py-3 bg-dark-bgSecondary border-t border-dark-border">
          <span className="text-xs text-text-secondary">
            {selectedChannels.size} of {pattern.channels.length} channels selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
