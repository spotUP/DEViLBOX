/**
 * EditorControlsBar — Compact toolbar between FT2Toolbar and the pattern editor.
 *
 * Contains: view mode selector, hardware preset, subsong selector,
 * channel selector, ghost/edit/auto toggles, REC, mute, scrolling mode,
 * groove, FPS, and status message.
 *
 * Extracted from TrackerView.tsx to be reusable in both DOM and GL modes.
 */

import React, { useState, useCallback } from 'react';
import { useTrackerStore, useTransportStore, useAudioStore, useUIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useFPSMonitor } from '@hooks/useFPSMonitor';
import { GROOVE_TEMPLATES } from '@typedefs/audio';
import { SYSTEM_PRESETS, getGroupedPresets } from '@/constants/systemPresets';
import { SubsongSelector } from './SubsongSelector';
import { GrooveSettingsModal } from '@components/dialogs/GrooveSettingsModal';
import { notify } from '@stores/useNotificationStore';
import {
  Eye, EyeOff, List, Grid3x3, Piano, Radio,
  Activity, LayoutGrid, Cpu, SlidersHorizontal,
} from 'lucide-react';

type ViewMode = 'tracker' | 'grid' | 'pianoroll' | 'tb303' | 'arrangement' | 'dj' | 'drumpad' | 'vj';

export interface EditorControlsBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  gridChannelIndex: number;
  onGridChannelChange: (idx: number) => void;
}

export const EditorControlsBar: React.FC<EditorControlsBarProps> = React.memo(({
  viewMode,
  onViewModeChange,
  gridChannelIndex,
  onGridChannelChange,
}) => {
  // ── Store state ──────────────────────────────────────────────────────────
  const {
    recordMode,
    showGhostPatterns,
    channelCount,
    applySystemPreset,
  } = useTrackerStore(useShallow(s => ({
    recordMode: s.recordMode,
    showGhostPatterns: s.showGhostPatterns,
    channelCount: s.patterns[s.currentPatternIndex]?.channels?.length || 4,
    applySystemPreset: s.applySystemPreset,
  })));

  const {
    grooveTemplateId,
    swing,
    jitter,
    useMpcScale,
    smoothScrolling,
  } = useTransportStore(useShallow(s => ({
    grooveTemplateId: s.grooveTemplateId,
    swing: s.swing,
    jitter: s.jitter,
    useMpcScale: s.useMpcScale,
    smoothScrolling: s.smoothScrolling,
  })));

  const masterMuted = useAudioStore(s => s.masterMuted);
  const statusMessage = useUIStore(s => s.statusMessage);
  const setActiveView = useUIStore(s => s.setActiveView);

  const fps = useFPSMonitor();

  // ── Local state ──────────────────────────────────────────────────────────
  const [showGrooveSettings, setShowGrooveSettings] = useState(false);

  // ── Grouped hardware presets ─────────────────────────────────────────────
  const groupedPresets = React.useMemo(() => getGroupedPresets(), []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleViewModeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as ViewMode;
    if (val === 'arrangement' || val === 'dj' || val === 'drumpad' || val === 'pianoroll' || val === 'vj') {
      setActiveView(val);
    } else {
      onViewModeChange(val);
    }
  }, [setActiveView, onViewModeChange]);

  const handleToggleGhosts = useCallback(() => {
    const s = useTrackerStore.getState();
    s.setShowGhostPatterns(!s.showGhostPatterns);
  }, []);

  const handleToggleRecord = useCallback(() => {
    useTrackerStore.getState().toggleRecordMode();
  }, []);

  const handleToggleMute = useCallback(() => {
    useAudioStore.getState().toggleMasterMute();
  }, []);

  const handleToggleSmooth = useCallback(() => {
    const s = useTransportStore.getState();
    s.setSmoothScrolling(!s.smoothScrolling);
  }, []);

  const handleShowAutoEditor = useCallback(() => {
    useUIStore.getState().openModal('automation');
  }, []);

  const handleShowDrumpads = useCallback(() => {
    useUIStore.getState().openModal('drumpads');
  }, []);

  const handleRecSettings = useCallback(() => {
    useUIStore.getState().openModal('settings');
  }, []);

  const handleHardwarePresetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetId = e.target.value;
    if (presetId === 'none') return;
    applySystemPreset(presetId);
    notify.success(`Hardware System: ${SYSTEM_PRESETS.find(p => p.id === presetId)?.name.toUpperCase()}`);
  }, [applySystemPreset]);

  const grooveActive = grooveTemplateId !== 'straight' || swing !== (useMpcScale ? 50 : 100) || jitter > 0;

  const { quality, averageFps: avgFps } = fps;

  return (
    <div className="flex-shrink flex items-center justify-between px-2 py-1 bg-dark-bgTertiary border-b border-dark-border min-h-[28px]">
      <div className="flex items-center gap-2">
        {/* View Mode Dropdown */}
        <div className="flex items-center gap-1">
          {viewMode === 'tracker' && <List size={14} className="shrink-0 text-text-secondary" />}
          {viewMode === 'grid' && <Grid3x3 size={14} className="shrink-0 text-text-secondary" />}
          {viewMode === 'pianoroll' && <Piano size={14} className="shrink-0 text-text-secondary" />}
          {viewMode === 'tb303' && <Radio size={14} className="shrink-0 text-text-secondary" />}
          <select
            value={viewMode}
            onChange={handleViewModeChange}
            className="px-2 py-1 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors"
            title="Select editor view"
          >
            <option value="tracker">Tracker</option>
            <option value="grid">Grid</option>
            <option value="pianoroll">Piano Roll</option>
            <option value="tb303">TB-303</option>
            <option value="arrangement">Arrangement</option>
            <option value="dj">DJ Mixer</option>
            <option value="drumpad">Drum Pads</option>
            <option value="vj">VJ View</option>
          </select>
        </div>

        {/* Hardware System Preset Selector */}
        <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-dark-border">
          <Cpu size={14} className="shrink-0 text-text-secondary" />
          <select
            className="px-2 py-1 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer outline-none"
            onChange={handleHardwarePresetChange}
            defaultValue="none"
            title="Select Hardware System Preset (NES, SMS, Genesis, etc.)"
          >
            <option value="none" disabled>SELECT HARDWARE...</option>
            {groupedPresets.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.presets.map(preset => (
                  <option key={preset.id} value={preset.id} className="bg-dark-bgPrimary text-text-primary">{preset.name.toUpperCase()}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Subsong Selector */}
        <SubsongSelector />

        {/* Channel Selector (grid and piano roll views) */}
        {(viewMode === 'grid' || viewMode === 'pianoroll') && (
          <>
            <span className="text-text-secondary text-[10px] font-medium">CH:</span>
            <select
              value={gridChannelIndex}
              onChange={(e) => onGridChannelChange(Number(e.target.value))}
              className="px-2 py-1 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors"
            >
              {Array.from({ length: channelCount }, (_, idx) => (
                <option key={idx} value={idx}>
                  {(idx + 1).toString().padStart(2, '0')}
                </option>
              ))}
            </select>
          </>
        )}

        {/* Ghost Patterns Toggle (tracker view) */}
        {viewMode === 'tracker' && (
          <button
            onClick={handleToggleGhosts}
            className={`
              flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors
              ${showGhostPatterns
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
              }
            `}
            title={showGhostPatterns ? 'Hide ghost patterns' : 'Show ghost patterns'}
          >
            {showGhostPatterns ? <Eye size={12} /> : <EyeOff size={12} />}
            <span>Ghosts</span>
          </button>
        )}

        {/* Automation Editor Toggle (tracker view) */}
        {viewMode === 'tracker' && (
          <button
            onClick={handleShowAutoEditor}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors bg-dark-bgSecondary text-text-secondary hover:text-text-primary"
            title="Open Automation Editor"
          >
            <Activity size={12} />
            <span>Auto</span>
          </button>
        )}

        {/* Drumpad Editor Toggle */}
        <button
          onClick={handleShowDrumpads}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors bg-dark-bgSecondary text-text-secondary hover:text-text-primary"
          title="Open Drumpad Editor"
        >
          <LayoutGrid size={12} />
          <span>Pads</span>
        </button>

        {/* Rec Button (with settings access) */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleRecord}
            className={`
              px-2 py-1 text-xs rounded font-medium transition-colors flex items-center gap-1
              ${recordMode
                ? 'bg-accent-error text-white animate-pulse'
                : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
              }
            `}
            title="Toggle Recording Mode (Space)"
          >
            <div className={`w-2 h-2 rounded-full ${recordMode ? 'bg-white' : 'bg-accent-error'}`} />
            REC
          </button>
          <button
            onClick={handleRecSettings}
            className="p-1 rounded bg-dark-bgSecondary text-text-secondary hover:text-text-primary transition-colors"
            title="Recording Settings (Quantize, Edit Step...)"
          >
            <SlidersHorizontal size={12} />
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-border opacity-50 mx-1" />

        {/* Mute Button */}
        <button
          onClick={handleToggleMute}
          className={`
            px-2 py-1 text-xs rounded font-medium transition-colors
            ${masterMuted
              ? 'bg-accent-error/20 text-accent-error'
              : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
            }
          `}
          title={masterMuted ? 'Unmute master output' : 'Mute master output'}
        >
          {masterMuted ? 'Unmute' : 'Mute'}
        </button>

        {/* Stepped/Smooth Scrolling Toggle */}
        <button
          onClick={handleToggleSmooth}
          className={`
            px-2 py-1 text-xs rounded font-medium transition-colors
            ${smoothScrolling
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
            }
          `}
          title={smoothScrolling ? 'Switch to stepped scrolling' : 'Switch to smooth scrolling'}
        >
          {smoothScrolling ? 'Smooth' : 'Stepped'}
        </button>

        {/* Groove Settings Button */}
        <div className="flex items-center gap-1 ml-1 pl-2 border-l border-dark-border">
          <button
            onClick={() => setShowGrooveSettings(true)}
            className={`px-2 py-1 text-[10px] rounded font-mono font-bold transition-colors ${
              grooveActive
                ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50'
                : 'bg-dark-bgSecondary text-text-secondary border border-dark-border hover:text-text-primary'
            }`}
            title={`Groove Settings (Current: ${GROOVE_TEMPLATES.find(g => g.id === grooveTemplateId)?.name || 'None'})`}
          >
            GROOVE
          </button>
          {showGrooveSettings && <GrooveSettingsModal onClose={() => setShowGrooveSettings(false)} />}
        </div>

        {/* Status Message (ProTracker Style) */}
        {statusMessage && (
          <div className="flex items-center px-3 ml-2 pl-3 border-l border-dark-border">
            <span className="text-accent-primary font-bold tracking-[0.3em] text-[11px] animate-pulse font-mono">
              {statusMessage.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* FPS / Quality Indicator - Compact */}
      <div
        className={`
          flex items-center gap-1 px-2 py-0.5 text-xs rounded font-mono
          ${quality === 'low'
            ? 'bg-accent-error/20 text-accent-error'
            : quality === 'medium'
            ? 'bg-orange-500/20 text-orange-400'
            : 'bg-green-500/20 text-green-400'
          }
        `}
        title={`Performance: ${quality.toUpperCase()} | Avg FPS: ${avgFps} | Current: ${fps.fps}`}
      >
        <span className="font-bold">{avgFps}</span>
        <span className="text-[10px] opacity-70">FPS</span>
        <div className={`w-1.5 h-1.5 rounded-full ${
          quality === 'low' ? 'bg-accent-error' :
          quality === 'medium' ? 'bg-orange-400' :
          'bg-green-400'
        } animate-pulse`} />
      </div>
    </div>
  );
});
