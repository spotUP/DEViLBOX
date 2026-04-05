/**
 * EditorControlsBar — Compact toolbar between FT2Toolbar and the pattern editor.
 *
 * Contains: view mode selector, hardware preset, subsong selector,
 * channel selector, ghost/edit/auto toggles, REC, mute, scrolling mode,
 * groove, FPS, and status message.
 *
 * Extracted from TrackerView.tsx to be reusable in both DOM and GL modes.
 */

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useUIStore } from '@stores';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useEditorControls } from '@hooks/views/useEditorControls';
import { BG_MODES, getBgModeLabel } from './TrackerVisualBackground';
import { getGroupedPresets } from '@/constants/systemPresets';
import { SubsongSelector } from './SubsongSelector';
import { SIDSubsongSelector } from './SIDSubsongSelector';
import { UADESubsongSelector } from './UADESubsongSelector';
import { ModuleInfoButton } from './ModuleInfoButton';
import { GenreAnalysisBadge } from './GenreAnalysisBadge';
import { GrooveSettingsModal } from '@components/dialogs/GrooveSettingsModal';
import { GROOVE_TEMPLATES } from '@typedefs/audio';
import {
  Eye, EyeOff,
  Activity, LayoutGrid, Cpu, SlidersHorizontal, Zap, Trash2,
} from 'lucide-react';

import { type TrackerViewMode } from '@stores/useUIStore';
import { useEditorStore, type PasteMode, MASK_NOTE, MASK_INSTRUMENT, MASK_VOLUME, MASK_EFFECT, MASK_EFFECT2 } from '@stores/useEditorStore';

export interface EditorControlsBarProps {
  viewMode: TrackerViewMode;
  onViewModeChange: (mode: TrackerViewMode) => void;
  gridChannelIndex: number;
  onGridChannelChange: (idx: number) => void;
  /** When provided, renders an "Edit" toggle button in the toolbar */
  showAdvancedEdit?: boolean;
  onToggleAdvancedEdit?: () => void;
  /** When provided, renders an "Auto" button that triggers this callback */
  onShowAutomation?: () => void;
  /** Optional drumpad callback override (defaults to openModal('drumpads')) */
  onShowDrumpads?: () => void;
  /** When provided, renders a "Cleanup" button in the toolbar */
  onShowCleanup?: () => void;
}

export const EditorControlsBar: React.FC<EditorControlsBarProps> = React.memo(({
  viewMode,
  onViewModeChange: _onViewModeChange,
  gridChannelIndex,
  onGridChannelChange,
  showAdvancedEdit,
  onToggleAdvancedEdit,
  onShowAutomation,
  onShowDrumpads: onShowDrumpadsProp,
  onShowCleanup,
}) => {
  // ── Shared hook ───────────────────────────────────────────────────────────
  const c = useEditorControls({
    onShowAutomation,
    onShowDrumpads: onShowDrumpadsProp,
  });

  // ── Local state ──────────────────────────────────────────────────────────
  const [showGrooveSettings, setShowGrooveSettings] = useState(false);

  // DOM-only: UI store for view-mode switching and groove dialog command
  const dialogOpen = useUIStore(s => s.dialogOpen);
  const closeDialogCommand = useUIStore(s => s.closeDialogCommand);

  // Handle groove-settings dialog command from keyboard shortcuts
  useEffect(() => {
    if (dialogOpen === 'groove-settings') {
      setShowGrooveSettings(true);
      closeDialogCommand();
    }
  }, [dialogOpen, closeDialogCommand]);

  const pasteMode = useEditorStore((s) => s.pasteMode);
  const setPasteMode = useEditorStore((s) => s.setPasteMode);
  const pasteMask = useEditorStore((s) => s.pasteMask);
  const toggleMaskBit = useEditorStore((s) => s.toggleMaskBit);

  // ── Grouped hardware presets ─────────────────────────────────────────────
  const groupedPresets = React.useMemo(() => getGroupedPresets(), []);

  const { fps } = c;
  const { quality, averageFps: avgFps } = fps;

  return (
    <div className="flex-shrink flex items-center justify-between px-2 py-1 bg-dark-bgTertiary border-b border-dark-border min-h-[28px]">
      <div className="flex items-center gap-2">
        {/* Hardware System Preset Selector */}
        <div className="flex items-center gap-1.5">
          <Cpu size={14} className="shrink-0 text-text-secondary" />
          <select
            className="px-3 py-1.5 rounded-md text-xs font-mono border transition-all cursor-pointer border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"
            onChange={(e) => c.handleHardwarePresetChange(e.target.value)}
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
        <SIDSubsongSelector />
        <UADESubsongSelector />
        <ModuleInfoButton />

        {/* Channel Selector (grid and piano roll views) */}
        {(viewMode === 'grid' || viewMode === 'pianoroll') && (
          <>
            <span className="text-text-secondary text-[10px] font-medium">CH:</span>
            <select
              value={gridChannelIndex}
              onChange={(e) => onGridChannelChange(Number(e.target.value))}
              className="px-3 py-1.5 rounded-md text-xs font-mono border transition-all cursor-pointer border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary"
            >
              {Array.from({ length: c.channelCount }, (_, idx) => (
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
            onClick={c.handleToggleGhosts}
            className={`
              flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors
              ${c.showGhostPatterns
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
              }
            `}
            title={c.showGhostPatterns ? 'Hide ghost patterns' : 'Show ghost patterns'}
          >
            {c.showGhostPatterns ? <Eye size={12} /> : <EyeOff size={12} />}
            <span>Ghosts</span>
          </button>
        )}

        {/* Advanced Edit Toggle (tracker view only) */}
        {viewMode === 'tracker' && onToggleAdvancedEdit && (
          <button
            onClick={onToggleAdvancedEdit}
            className={`
              flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors
              ${showAdvancedEdit
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
              }
            `}
            title="Toggle Advanced Edit Panel"
          >
            <Zap size={12} />
            <span>Edit</span>
          </button>
        )}

        {/* Automation Editor Toggle (tracker view) */}
        {viewMode === 'tracker' && (
          <button
            onClick={c.handleShowAutoEditor}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors bg-dark-bgSecondary text-text-secondary hover:text-text-primary"
            title="Open Automation Editor"
          >
            <Activity size={12} />
            <span>Automation</span>
          </button>
        )}

        {/* Song Cleanup Dialog */}
        {onShowCleanup && (
          <button
            onClick={onShowCleanup}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors bg-dark-bgSecondary text-text-secondary hover:text-text-primary"
            title="Analyze song and remove unused data"
          >
            <Trash2 size={12} />
            <span>Cleanup</span>
          </button>
        )}

        {/* Drumpad Editor Toggle */}
        <button
          onClick={c.handleShowDrumpads}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors bg-dark-bgSecondary text-text-secondary hover:text-text-primary"
          title="Open Drumpad Editor"
        >
          <LayoutGrid size={12} />
          <span>Pads</span>
        </button>

        {/* Rec Button (with settings access) */}
        <div className="flex items-center gap-1">
          <button
            onClick={c.handleToggleRecord}
            className={`
              px-2 py-1 text-xs rounded font-medium transition-colors flex items-center gap-1
              ${c.recordMode
                ? 'bg-accent-error text-text-primary animate-pulse'
                : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
              }
            `}
            title="Toggle Recording Mode (Space)"
          >
            <div className={`w-2 h-2 rounded-full ${c.recordMode ? 'bg-white' : 'bg-accent-error'}`} />
            REC
          </button>
          <button
            onClick={c.handleRecSettings}
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
          onClick={c.handleToggleMute}
          className={`
            px-2 py-1 text-xs rounded font-medium transition-colors
            ${c.masterMuted
              ? 'bg-accent-error/20 text-accent-error'
              : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
            }
          `}
          title={c.masterMuted ? 'Unmute master output' : 'Mute master output'}
        >
          {c.masterMuted ? 'Unmute' : 'Mute'}
        </button>

        {/* Separator */}
        <div className="w-px h-4 bg-border opacity-50 mx-1" />

        {/* Paste Mode & Mask */}
        <div className="flex items-center gap-1">
          <select
            value={pasteMode}
            onChange={(e) => setPasteMode(e.target.value as PasteMode)}
            className="h-5 bg-dark-bgSecondary text-text-secondary text-[10px] border border-dark-border rounded px-1 cursor-pointer hover:text-text-primary focus:outline-none"
            title="Paste mode"
          >
            <option value="overwrite">Paste</option>
            <option value="mix">Mix</option>
            <option value="flood">Flood</option>
            <option value="insert">Insert</option>
          </select>
          <div className="flex gap-px" title="Paste mask — toggle columns">
            {([
              ['N', MASK_NOTE],
              ['I', MASK_INSTRUMENT],
              ['V', MASK_VOLUME],
              ['E', MASK_EFFECT],
              ['E2', MASK_EFFECT2],
            ] as const).map(([label, bit]) => (
              <button
                key={label}
                className={`px-1 h-5 text-[9px] font-mono rounded transition-colors ${
                  pasteMask & (bit as number)
                    ? 'bg-accent-primary/30 text-accent-primary'
                    : 'bg-dark-bgSecondary text-text-muted hover:text-text-secondary'
                }`}
                onClick={() => toggleMaskBit('paste', bit as number)}
                title={`Toggle ${label} in paste`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Stepped/Smooth Scrolling Toggle */}
        <button
          onClick={c.handleToggleSmooth}
          className={`
            px-2 py-1 text-xs rounded font-medium transition-colors
            ${c.smoothScrolling
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
            }
          `}
          title={c.smoothScrolling ? 'Switch to stepped scrolling' : 'Switch to smooth scrolling'}
        >
          {c.smoothScrolling ? 'Smooth' : 'Stepped'}
        </button>

        {/* Groove Settings Button */}
        <div className="flex items-center gap-1 ml-1 pl-2 border-l border-dark-border">
          <button
            onClick={() => setShowGrooveSettings(true)}
            className={`px-2 py-1 text-[10px] rounded font-mono font-bold transition-colors ${
              c.grooveActive
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
            }`}
            title={`Groove Settings (Current: ${GROOVE_TEMPLATES.find(g => g.id === c.grooveTemplateId)?.name || 'None'})`}
          >
            Groove
          </button>
          {showGrooveSettings && <GrooveSettingsModal onClose={() => setShowGrooveSettings(false)} />}
        </div>

        {/* Genre Analysis Badge */}
        <GenreAnalysisBadge />

        {/* Visual Background mode cycle (only when enabled) */}
        <VisualBgCycler />

        {/* Status Message (ProTracker Style) */}
        {c.statusMessage && (
          <div className="flex items-center px-3 ml-2 pl-3 border-l border-dark-border">
            <span className="text-accent-primary font-bold tracking-[0.3em] text-[11px] animate-pulse font-mono">
              {c.statusMessage.toUpperCase()}
            </span>
          </div>
        )}

        {/* IT Mask Indicator (persistent when itMaskVariables behavior is active) */}
        {c.maskDisplay && (
          <div className="flex items-center px-2 ml-1 pl-2 border-l border-dark-border">
            <span className="text-cyan-400 font-bold text-[10px] font-mono tracking-wider">
              [MASK: {c.maskDisplay}]
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

/** Compact < MODE > cycler for tracker visual background */
const VisualBgCycler: React.FC = () => {
  const enabled = useSettingsStore(s => s.trackerVisualBg);
  const modeIndex = useSettingsStore(s => s.trackerVisualMode);
  const setMode = useSettingsStore(s => s.setTrackerVisualMode);

  if (!enabled) return null;

  const total = BG_MODES.length;
  const current = BG_MODES[modeIndex % total];
  const label = current ? getBgModeLabel(current) : '?';

  const prev = () => setMode((modeIndex - 1 + total) % total);
  const next = () => setMode((modeIndex + 1) % total);

  return (
    <div className="flex items-center gap-0.5 ml-1 pl-2 border-l border-dark-border">
      <button onClick={prev} className="p-0.5 text-text-muted hover:text-text-primary" title="Previous visual mode">
        <ChevronLeft size={12} />
      </button>
      <span className="text-[9px] font-mono text-text-secondary min-w-[60px] text-center">{label}</span>
      <button onClick={next} className="p-0.5 text-text-muted hover:text-text-primary" title="Next visual mode">
        <ChevronRight size={12} />
      </button>
    </div>
  );
};
