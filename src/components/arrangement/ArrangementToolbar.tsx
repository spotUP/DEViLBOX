/**
 * ArrangementToolbar - Tool buttons, zoom, snap, and controls
 * Includes "ARRANGEMENT" label and keyboard shortcuts in button titles
 */

import React from 'react';
import {
  MousePointer2,
  Pencil,
  Eraser,
  Scissors,
  ZoomIn,
  ZoomOut,
  Plus,
  Maximize2,
  Eye,
  Play,
  Square,
} from 'lucide-react';
import { useArrangementStore } from '@stores/useArrangementStore';
import { useUIStore, useTransportStore } from '@stores';
import type { ArrangementToolMode } from '@/types/arrangement';

const SNAP_OPTIONS = [
  { label: 'Row', value: 1 },
  { label: 'Beat', value: 6 },
  { label: '1/2 Bar', value: 12 },
  { label: 'Bar', value: 24 },
  { label: '2 Bars', value: 48 },
  { label: '4 Bars', value: 96 },
  { label: 'Off', value: 0 },
];

export const ArrangementToolbar: React.FC = () => {
  const {
    tool, setTool,
    view, setPixelsPerRow, setSnapDivision, setFollowPlayback,
    zoomToFit, addTrack,
  } = useArrangementStore();

  const { isPlaying, togglePlayPause, stop } = useTransportStore();

  const handleZoomIn = () => setPixelsPerRow(Math.min(32, view.pixelsPerRow * 1.5));
  const handleZoomOut = () => setPixelsPerRow(Math.max(0.5, view.pixelsPerRow / 1.5));

  const toolBtn = (mode: ArrangementToolMode, icon: React.ReactNode, label: string, shortcut: string) => (
    <button
      className={`p-1.5 rounded text-xs transition-colors ${
        tool === mode
          ? 'bg-accent-primary text-white'
          : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-border hover:text-text-primary'
      }`}
      onClick={() => setTool(mode)}
      title={`${label} (${shortcut})`}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-bgSecondary border-b border-dark-border text-xs select-none">
      {/* View switcher */}
      <select
        value="arrangement"
        onChange={(e) => {
          if (e.target.value !== 'arrangement') {
            useUIStore.getState().setActiveView('tracker');
          }
        }}
        className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-dark-bgTertiary text-text-muted border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer"
        title="Switch view"
      >
        <option value="tracker">Tracker</option>
        <option value="arrangement">Arrangement</option>
      </select>

      <div className="w-px h-5 bg-dark-border" />

      {/* Transport Controls */}
      <div className="flex items-center gap-1">
        <button
          className={`p-1.5 rounded text-xs transition-colors ${
            isPlaying
              ? 'bg-green-600 text-white'
              : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-border hover:text-text-primary'
          }`}
          onClick={togglePlayPause}
          title="Play/Pause (Space)"
        >
          <Play size={14} fill={isPlaying ? 'currentColor' : 'none'} />
        </button>
        <button
          className="p-1.5 rounded bg-dark-bgTertiary text-text-secondary hover:bg-dark-border hover:text-text-primary"
          onClick={stop}
          title="Stop (Space when playing)"
        >
          <Square size={14} />
        </button>
      </div>

      <div className="w-px h-5 bg-dark-border" />

      {/* Tools */}
      <div className="flex items-center gap-1">
        {toolBtn('select', <MousePointer2 size={14} />, 'Select', 'V')}
        {toolBtn('draw', <Pencil size={14} />, 'Draw', 'D')}
        {toolBtn('erase', <Eraser size={14} />, 'Erase', 'E')}
        {toolBtn('split', <Scissors size={14} />, 'Split', 'S')}
      </div>

      <div className="w-px h-5 bg-dark-border" />

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <button
          className="p-1 rounded bg-dark-bgTertiary text-text-secondary hover:bg-dark-border hover:text-text-primary"
          onClick={handleZoomOut}
          title="Zoom Out (Ctrl+-)"
        >
          <ZoomOut size={14} />
        </button>
        <span className="text-text-muted w-10 text-center">{view.pixelsPerRow.toFixed(1)}</span>
        <button
          className="p-1 rounded bg-dark-bgTertiary text-text-secondary hover:bg-dark-border hover:text-text-primary"
          onClick={handleZoomIn}
          title="Zoom In (Ctrl++)"
        >
          <ZoomIn size={14} />
        </button>
        <button
          className="p-1 rounded bg-dark-bgTertiary text-text-secondary hover:bg-dark-border hover:text-text-primary"
          onClick={zoomToFit}
          title="Zoom to Fit (Ctrl+0)"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      <div className="w-px h-5 bg-dark-border" />

      {/* Snap */}
      <div className="flex items-center gap-1">
        <span className="text-text-muted">Snap:</span>
        <select
          className="bg-dark-bgTertiary border border-dark-border rounded px-1.5 py-0.5 text-text-primary text-xs"
          value={view.snapDivision}
          onChange={(e) => setSnapDivision(Number(e.target.value))}
        >
          {SNAP_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="w-px h-5 bg-dark-border" />

      {/* Follow Playback */}
      <button
        className={`p-1 rounded text-xs flex items-center gap-1 ${
          view.followPlayback
            ? 'bg-accent-primary/20 text-accent-primary'
            : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-border'
        }`}
        onClick={() => setFollowPlayback(!view.followPlayback)}
        title="Follow Playback (F)"
      >
        <Eye size={14} />
        <span>Follow</span>
      </button>

      <div className="flex-1" />

      {/* Add Track */}
      <button
        className="p-1.5 rounded bg-dark-bgTertiary text-text-secondary hover:bg-dark-border hover:text-text-primary flex items-center gap-1"
        onClick={() => addTrack()}
        title="Add Track (Ctrl+T)"
      >
        <Plus size={14} />
        <span>Track</span>
      </button>
    </div>
  );
};
