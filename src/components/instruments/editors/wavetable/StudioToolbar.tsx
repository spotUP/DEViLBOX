/**
 * StudioToolbar — top strip of the Waveform Studio.
 *
 * Contains: mode switcher (draw/harmonic/math/presets), chip target
 * dropdown, quick operations (DC, normalize, invert, reverse,
 * mirror, quarter reflect, phase align), A/B snapshot, layout toggle.
 *
 * All design tokens — no hardcoded colors. Icons from lucide-react.
 */

import React from 'react';
import {
  Pencil, BarChart3, FunctionSquare, LibraryBig,
  Minus, Maximize2, FlipVertical, FlipHorizontal, ArrowLeftRight,
  Split, RotateCcw, Contrast, Maximize, Minimize, X,
} from 'lucide-react';
import { CHIP_TARGET_ORDER, CHIP_TARGETS, type ChipTargetId } from './chipTargets';

export type StudioMode = 'draw' | 'harmonic' | 'math' | 'presets';
export type StudioLayout = 'compact' | 'studio';

interface StudioToolbarProps {
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  chipTarget: ChipTargetId;
  onChipTargetChange: (id: ChipTargetId) => void;
  layout: StudioLayout;
  onLayoutChange: (layout: StudioLayout) => void;

  onDcRemove: () => void;
  onNormalize: () => void;
  onInvert: () => void;
  onReverse: () => void;
  onMirror: () => void;
  onQuarterReflect: () => void;
  onPhaseAlign: () => void;

  hasCompareBuffer: boolean;
  onCaptureCompare: () => void;
  onClearCompare: () => void;
  onSwapCompare: () => void;
}

const MODE_TABS: Array<{ id: StudioMode; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'harmonic', label: 'Harmonic', icon: BarChart3 },
  { id: 'math', label: 'Math', icon: FunctionSquare },
  { id: 'presets', label: 'Presets', icon: LibraryBig },
];

const IconBtn: React.FC<{
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, active, children }) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded transition-colors border ${
      active
        ? 'bg-accent-highlight/20 text-accent-highlight border-accent-highlight/50'
        : 'bg-dark-bgSecondary text-text-muted hover:text-text-primary border-dark-border hover:border-dark-border/80'
    }`}
  >
    {children}
  </button>
);

export const StudioToolbar: React.FC<StudioToolbarProps> = ({
  mode, onModeChange,
  chipTarget, onChipTargetChange,
  layout, onLayoutChange,
  onDcRemove, onNormalize, onInvert, onReverse,
  onMirror, onQuarterReflect, onPhaseAlign,
  hasCompareBuffer, onCaptureCompare, onClearCompare, onSwapCompare,
}) => {
  return (
    <div className="flex items-center flex-wrap gap-2 px-2 py-1.5 bg-dark-bg border-b border-dark-border">
      {/* Layout toggle */}
      <IconBtn
        onClick={() => onLayoutChange(layout === 'compact' ? 'studio' : 'compact')}
        title={layout === 'compact' ? 'Expand Studio' : 'Compact view'}
      >
        {layout === 'compact' ? <Maximize size={14} /> : <Minimize size={14} />}
      </IconBtn>

      {/* Mode tabs */}
      {layout === 'studio' && (
        <div className="flex items-center gap-0.5 border border-dark-border rounded bg-dark-bgSecondary p-0.5">
          {MODE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = mode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onModeChange(tab.id)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold uppercase transition-colors ${
                  isActive
                    ? 'bg-accent-highlight/20 text-accent-highlight'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Icon size={12} />
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Chip target dropdown */}
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-mono text-text-muted uppercase">Chip:</span>
        <select
          value={chipTarget}
          onChange={(e) => onChipTargetChange(e.target.value as ChipTargetId)}
          className="bg-dark-bgSecondary border border-dark-border rounded px-1.5 py-1 text-[10px] font-mono text-text-primary hover:border-accent-highlight/50 focus:outline-none focus:border-accent-highlight/50"
        >
          {CHIP_TARGET_ORDER.map((id) => (
            <option key={id} value={id}>
              {CHIP_TARGETS[id].name}
            </option>
          ))}
        </select>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-dark-border" />

      {/* Quick ops */}
      <div className="flex items-center gap-1">
        <IconBtn onClick={onDcRemove} title="Remove DC offset (center waveform)"><Minus size={14} /></IconBtn>
        <IconBtn onClick={onNormalize} title="Normalize to full range"><Maximize2 size={14} /></IconBtn>
        <IconBtn onClick={onInvert} title="Invert vertically"><FlipVertical size={14} /></IconBtn>
        <IconBtn onClick={onReverse} title="Reverse (time-flip)"><FlipHorizontal size={14} /></IconBtn>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-dark-border" />

      {/* Symmetry ops */}
      <div className="flex items-center gap-1">
        <IconBtn onClick={onMirror} title="Mirror left half to right"><Split size={14} /></IconBtn>
        <IconBtn onClick={onQuarterReflect} title="Quarter-wave reflect (symmetric)"><Contrast size={14} /></IconBtn>
        <IconBtn onClick={onPhaseAlign} title="Rotate peak to index 0"><RotateCcw size={14} /></IconBtn>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-dark-border" />

      {/* A/B compare */}
      <div className="flex items-center gap-1">
        {!hasCompareBuffer ? (
          <button
            onClick={onCaptureCompare}
            title="Capture current waveform as B (for A/B compare)"
            className="px-2 py-1 rounded text-[10px] font-mono font-bold bg-dark-bgSecondary text-text-muted hover:text-text-primary border border-dark-border"
          >
            A/B
          </button>
        ) : (
          <>
            <button
              onClick={onSwapCompare}
              title="Swap A↔B"
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold bg-violet-600/20 text-violet-400 border border-violet-500/50"
            >
              <ArrowLeftRight size={12} />
              A↔B
            </button>
            <button
              onClick={onClearCompare}
              title="Clear compare snapshot"
              className="p-1.5 rounded text-text-muted hover:text-accent-error border border-dark-border"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
