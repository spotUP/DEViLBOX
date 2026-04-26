/**
 * EditorControlsBar — Compact toolbar between FT2Toolbar and the pattern editor.
 *
 * Contains: view mode selector, hardware preset, subsong selector,
 * channel selector, ghost/edit/auto toggles, REC, mute, scrolling mode,
 * groove, FPS, and status message.
 *
 * Extracted from TrackerView.tsx to be reusable in both DOM and GL modes.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { useUIStore } from '@stores';
import { useAudioStore } from '@stores/useAudioStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useEditorControls } from '@hooks/views/useEditorControls';
import { BG_MODES, getBgModeLabel } from './TrackerVisualBackground';
import { getGroupedPresets } from '@/constants/systemPresets';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { SubsongSelector } from './SubsongSelector';
import { CustomSelect } from '@components/common/CustomSelect';
import { SIDSubsongSelector } from './SIDSubsongSelector';
import { UADESubsongSelector } from './UADESubsongSelector';
import { AVPSubsongSelector } from './AVPSubsongSelector';
import { ModuleInfoButton } from './ModuleInfoButton';
import { GenreAnalysisBadge } from './GenreAnalysisBadge';
import { GrooveSettingsModal } from '@components/dialogs/GrooveSettingsModal';
import { GROOVE_TEMPLATES } from '@typedefs/audio';
import {
  Activity, Cpu, Zap, Trash2,
} from 'lucide-react';

import { type TrackerViewMode } from '@stores/useUIStore';
import { DropdownButton, type MenuItemType } from '@components/common/ContextMenu';

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
  /** Find & Replace toggle */
  showFindReplace?: boolean;
  onShowFindReplace?: () => void;
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
  showFindReplace,
  onShowFindReplace,
}) => {
  // ── Shared hook ───────────────────────────────────────────────────────────
  const c = useEditorControls({
    onShowAutomation,
    onShowDrumpads: onShowDrumpadsProp,
  });

  // ── Local state ──────────────────────────────────────────────────────────
  const [showGrooveSettings, setShowGrooveSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  // Volume
  const masterVolume = useAudioStore(s => s.masterVolume);
  const setMasterVolume = useAudioStore(s => s.setMasterVolume);

  // DOM-only: UI store for view-mode switching and groove dialog command
  const modalOpen = useUIStore(s => s.modalOpen);
  const dialogOpen = useUIStore(s => s.dialogOpen);
  const closeDialogCommand = useUIStore(s => s.closeDialogCommand);

  // Handle groove-settings dialog command from keyboard shortcuts
  useEffect(() => {
    if (dialogOpen === 'groove-settings') {
      setShowGrooveSettings(true);
      closeDialogCommand();
    }
  }, [dialogOpen, closeDialogCommand]);

  // ── Grouped hardware presets ─────────────────────────────────────────────
  const groupedPresets = React.useMemo(() => getGroupedPresets(), []);

  // ── Current format detection for dropdown display ────────────────────────
  const editorMode = useFormatStore((s) => s.editorMode);
  const activeSystemPreset = useUIStore((s) => s.activeSystemPreset);
  const sourceFormat = useTrackerStore((s) => s.patterns[0]?.importMetadata?.sourceFormat);

  // Build DropdownButton menu items from grouped presets (with submenus)
  const hwMenuItems = useMemo<MenuItemType[]>(() => {
    return groupedPresets.map(group => ({
      id: `group:${group.label}`,
      label: group.label,
      submenu: group.presets.map(preset => ({
        id: preset.id,
        label: preset.name.toUpperCase(),
        radio: true,
        checked: activeSystemPreset === preset.id,
        onClick: () => c.handleHardwarePresetChange(preset.id),
      })),
    }));
  }, [groupedPresets, activeSystemPreset, c]);

  // Format info labels for tracker/platform formats
  const FORMAT_LABELS: Record<string, { name: string; platform: string }> = useMemo(() => ({
    // Amiga tracker formats
    'MOD': { name: 'ProTracker', platform: 'Amiga' },
    'STK': { name: 'SoundTracker', platform: 'Amiga' },
    'OKT': { name: 'Oktalyzer', platform: 'Amiga' },
    'MED': { name: 'OctaMED', platform: 'Amiga' },
    'DIGI': { name: 'DIGI Booster', platform: 'Amiga' },
    'DBM': { name: 'DigiBooster Pro', platform: 'Amiga' },
    'FC': { name: 'Future Composer', platform: 'Amiga' },
    'SFX': { name: 'SoundFX', platform: 'Amiga' },
    'SMON': { name: 'Sidmon I', platform: 'Amiga' },
    'SIDMON2': { name: 'Sidmon II', platform: 'Amiga' },
    'FRED': { name: 'Fred Editor', platform: 'Amiga' },
    'STP': { name: 'Soundtracker Pro II', platform: 'Amiga' },
    'HVL': { name: 'HivelyTracker', platform: 'Amiga' },
    'AHX': { name: 'AHX', platform: 'Amiga' },
    'TFMX': { name: 'TFMX', platform: 'Amiga' },
    'JamCracker': { name: 'JamCracker', platform: 'Amiga' },
    'SonicArranger': { name: 'Sonic Arranger', platform: 'Amiga' },
    'TCBTracker': { name: 'TCB Tracker', platform: 'Atari ST' },
    'AON': { name: 'Art of Noise', platform: 'Amiga' },
    'BD': { name: 'Ben Daglish', platform: 'Amiga' },
    'UADE': { name: 'UADE Replayer', platform: 'Amiga' },
    'Symphonie': { name: 'Symphonie', platform: 'Amiga' },
    'PumaTracker': { name: 'Puma Tracker', platform: 'Amiga' },
    'QuadraComposer': { name: 'Quadra Composer', platform: 'Amiga' },
    'DigitalSymphony': { name: 'Digital Symphony', platform: 'Amiga' },
    'FaceTheMusic': { name: 'Face the Music', platform: 'Amiga' },
    'GameMusicCreator': { name: 'Game Music Creator', platform: 'Amiga' },
    'ICE': { name: 'ICE Tracker', platform: 'Amiga' },
    // PC tracker formats
    'XM': { name: 'FastTracker II', platform: 'PC' },
    'IT': { name: 'Impulse Tracker', platform: 'PC' },
    'S3M': { name: 'Scream Tracker 3', platform: 'PC' },
    'STM': { name: 'Scream Tracker 2', platform: 'PC' },
    'MTM': { name: 'MultiTracker', platform: 'PC' },
    'ULT': { name: 'Ultra Tracker', platform: 'PC' },
    'AMS': { name: 'Extreme Tracker', platform: 'PC' },
    'DMF': { name: 'X-Tracker', platform: 'PC' },
    'PTM': { name: 'Poly Tracker', platform: 'PC' },
    'RTM': { name: 'Real Tracker', platform: 'PC' },
    'MadTracker2': { name: 'MadTracker 2', platform: 'PC' },
    'GraoumfTracker': { name: 'Graoumf Tracker', platform: 'PC' },
    'GraoumfTracker2': { name: 'Graoumf Tracker 2', platform: 'PC' },
    'IMF': { name: 'Imago Orpheus', platform: 'PC' },
    'XRNS': { name: 'Renoise', platform: 'PC' },
    // Chip/CPU formats
    'FUR': { name: 'Furnace', platform: 'Multi-chip' },
    'SID': { name: 'SID Player', platform: 'C64' },
    'NSF': { name: 'NES Sound Format', platform: 'NES' },
    'VGM': { name: 'Video Game Music', platform: 'Multi-chip' },
    'YM': { name: 'YM Player', platform: 'Atari ST' },
    'SAP': { name: 'SAP Player', platform: 'Atari 8-bit' },
    'AY': { name: 'AY Player', platform: 'ZX Spectrum' },
    // Editor modes without sourceFormat
    'MusicLine': { name: 'MusicLine', platform: 'PC' },
  }), []);

  // Build the display label for the current format
  const currentFormatLabel = useMemo(() => {
    if (sourceFormat && FORMAT_LABELS[sourceFormat]) {
      const f = FORMAT_LABELS[sourceFormat];
      return `${f.name} · ${f.platform}`;
    }
    if (sourceFormat) return sourceFormat.toUpperCase();
    if (editorMode === 'hively') return 'HivelyTracker · Amiga';
    if (editorMode === 'klystrack') return 'Klystrack · PC';
    if (editorMode === 'musicline') return 'MusicLine · PC';
    if (editorMode === 'goattracker') return 'GoatTracker · C64';
    if (editorMode === 'jamcracker') return 'JamCracker · Amiga';
    if (editorMode === 'sc68') return 'SC68 · Atari ST';
    if (editorMode === 'tfmx') return 'TFMX · Amiga';
    return null;
  }, [sourceFormat, editorMode, FORMAT_LABELS]);

  // Compute the display label for the hardware button
  const hwButtonLabel = useMemo(() => {
    if (activeSystemPreset) {
      for (const g of groupedPresets) {
        const p = g.presets.find(p => p.id === activeSystemPreset);
        if (p) return p.name.toUpperCase();
      }
    }
    if (currentFormatLabel) return currentFormatLabel.toUpperCase();
    return 'SELECT HARDWARE...';
  }, [activeSystemPreset, groupedPresets, currentFormatLabel]);

  const { fps } = c;
  const { quality, averageFps: avgFps } = fps;

  return (
    <div className="flex-shrink flex items-center justify-between px-2 py-1 bg-dark-bgTertiary border-b border-dark-border min-h-[28px] overflow-hidden">
      <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto scrollbar-hidden">
        {/* Master Volume */}
        <input
          type="range"
          value={masterVolume}
          onChange={(e) => setMasterVolume(Number(e.target.value))}
          min="-60"
          max="0"
          step="1"
          className="w-16 max-w-[4rem] shrink-0 grow-0"
          title={`Volume: ${masterVolume} dB`}
        />

        {/* Hardware System Preset Selector */}
        <div className="flex items-center gap-1.5">
          <Cpu size={14} className="shrink-0 text-text-secondary" />
          <DropdownButton
            items={hwMenuItems}
            className="h-6 px-2 bg-dark-bgSecondary text-text-secondary text-[10px] font-mono border border-dark-border rounded cursor-pointer hover:text-text-primary hover:border-accent-highlight/50 transition-colors"
          >
            {hwButtonLabel} ▾
          </DropdownButton>
        </div>

        {/* Subsong Selector */}
        <SubsongSelector />
        <SIDSubsongSelector />
        <UADESubsongSelector />
        <AVPSubsongSelector />
        <ModuleInfoButton />

        {/* Fullscreen toggle */}
        <button
          onClick={async () => {
            try {
              if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
              else await document.exitFullscreen();
            } catch (_) { /* ignore */ }
          }}
          className={`px-2 py-1 text-[10px] font-mono rounded font-medium transition-colors ${
            isFullscreen
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
          }`}
          title="Toggle Fullscreen (F11)"
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>

        {/* Sub-mode toggle (Tracker / Grid) */}
        <CustomSelect
          value={viewMode}
          onChange={(v) => _onViewModeChange(v as TrackerViewMode)}
          options={[
            { value: 'tracker', label: 'Tracker' },
            { value: 'grid', label: 'Grid' },
          ]}
        />



        {/* Master FX */}
        <button
          onClick={() => { const s = useUIStore.getState(); if (s.modalOpen === 'masterFx') { s.closeModal(); } else { s.openModal('masterFx'); } }}
          className={`flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded transition-colors ${
            modalOpen === 'masterFx'
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
          }`}
          title="Master effects chain"
        >
          Master FX
        </button>

        {/* Channel Selector (grid and piano roll views) */}
        {viewMode === 'grid' && (
          <>
            <span className="text-text-secondary text-[10px] font-medium">CH:</span>
            <CustomSelect
              value={String(gridChannelIndex)}
              onChange={(v) => onGridChannelChange(Number(v))}
              options={Array.from({ length: c.channelCount }, (_, idx) => ({
                value: String(idx),
                label: (idx + 1).toString().padStart(2, '0'),
              }))}
            />
          </>
        )}


        {/* Advanced Edit Toggle (tracker view only) */}
        {viewMode === 'tracker' && onToggleAdvancedEdit && (
          <button
            onClick={onToggleAdvancedEdit}
            className={`
              flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded transition-colors
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
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded transition-colors bg-dark-bgSecondary text-text-secondary hover:text-text-primary"
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
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded transition-colors bg-dark-bgSecondary text-text-secondary hover:text-text-primary"
            title="Analyze song and remove unused data"
          >
            <Trash2 size={12} />
            <span>Cleanup</span>
          </button>
        )}

        {/* Find & Replace */}
        {onShowFindReplace && (
          <button
            onClick={onShowFindReplace}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded transition-colors ${
              showFindReplace
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
            }`}
            title="Find & replace (Ctrl+F)"
          >
            Find
          </button>
        )}

        {/* Rec Button */}
        <button
          onClick={c.handleToggleRecord}
          className={`
            px-2 py-1 text-[10px] font-mono rounded font-medium transition-colors flex items-center gap-1
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

        {/* Mute Button */}
        <button
          onClick={c.handleToggleMute}
          className={`
            px-2 py-1 text-[10px] font-mono rounded font-medium transition-colors
            ${c.masterMuted
              ? 'bg-accent-error/20 text-accent-error'
              : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary'
            }
          `}
          title={c.masterMuted ? 'Unmute master output' : 'Mute master output'}
        >
          {c.masterMuted ? 'Unmute' : 'Mute'}
        </button>

        {/* Groove Settings Button */}
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

      {/* Right section: FPS */}
      <div className="flex-shrink-0 flex items-center gap-2">

        {/* FPS / Quality Indicator - Compact */}
      <div
        className={`
          flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold font-mono rounded border
          ${quality === 'low'
            ? 'bg-accent-error/20 text-accent-error border-accent-error/40'
            : quality === 'medium'
            ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
            : 'bg-green-500/20 text-green-400 border-green-500/40'
          }
        `}
        title={`Performance: ${quality.toUpperCase()} | Avg FPS: ${avgFps} | Current: ${fps.fps}`}
      >
        <span>{avgFps}</span>
        <span className="opacity-70">FPS</span>
        <div className={`w-1.5 h-1.5 rounded-full ${
          quality === 'low' ? 'bg-accent-error' :
          quality === 'medium' ? 'bg-orange-400' :
          'bg-green-400'
        } animate-pulse`} />
      </div>
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
      <span className="text-[10px] font-mono text-text-secondary min-w-[60px] text-center">{label}</span>
      <button onClick={next} className="p-0.5 text-text-muted hover:text-text-primary" title="Next visual mode">
        <ChevronRight size={12} />
      </button>
    </div>
  );
};