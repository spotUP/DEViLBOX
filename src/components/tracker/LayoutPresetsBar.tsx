/**
 * LayoutPresetsBar — Numbered layout preset buttons (1-4).
 * Click to load, long-press or Ctrl+click to save current layout.
 * Shows in the EditorControlsBar.
 */

import React, { useCallback, useRef } from 'react';
import { useUIStore } from '@stores';

export const LayoutPresetsBar: React.FC = () => {
  const layoutPresets = useUIStore(s => s.layoutPresets);
  const activeLayoutPreset = useUIStore(s => s.activeLayoutPreset);
  const saveLayoutPreset = useUIStore(s => s.saveLayoutPreset);
  const loadLayoutPreset = useUIStore(s => s.loadLayoutPreset);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback((slot: number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+click = save
      saveLayoutPreset(slot);
    } else if (layoutPresets[slot]) {
      // Click = load (if preset exists)
      loadLayoutPreset(slot);
    } else {
      // No preset yet — save to this slot
      saveLayoutPreset(slot);
    }
  }, [layoutPresets, saveLayoutPreset, loadLayoutPreset]);

  const handlePointerDown = useCallback((slot: number) => {
    longPressTimer.current = setTimeout(() => {
      saveLayoutPreset(slot);
      longPressTimer.current = null;
    }, 600);
  }, [saveLayoutPreset]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  return (
    <div className="flex items-center gap-0.5" title="Layout presets — click to load, ⌘+click to save">
      <span className="text-[8px] font-mono text-ft2-textDim uppercase mr-0.5">Layout</span>
      {[0, 1, 2, 3].map((slot) => {
        const preset = layoutPresets[slot];
        const isActive = activeLayoutPreset === slot;
        const isEmpty = !preset;
        return (
          <button
            key={slot}
            onClick={(e) => handleClick(slot, e)}
            onPointerDown={() => handlePointerDown(slot)}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className={`w-5 h-5 text-[10px] font-mono font-bold rounded transition-colors ${
              isActive
                ? 'bg-accent-primary/30 text-accent-primary border border-accent-primary/50'
                : isEmpty
                  ? 'bg-dark-bgSecondary/50 text-ft2-textDim hover:text-text-secondary border border-transparent'
                  : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary border border-dark-border'
            }`}
            title={preset ? `${preset.name} — click to load, ⌘+click to overwrite` : `Empty — click to save current layout`}
          >
            {slot + 1}
          </button>
        );
      })}
    </div>
  );
};
