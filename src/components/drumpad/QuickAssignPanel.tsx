/**
 * QuickAssignPanel — Inline pad assignment panel, opens on right-click.
 *
 * Shows accordion sections for DJ FX, One Shots, Scratch, and Clear.
 * Each item is a colored chip button; clicking assigns it to the pad.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getDjFxByCategory } from '../../engine/drumpad/DjFxActions';
import type { DjFxAction } from '../../engine/drumpad/DjFxActions';
import { DJ_ONE_SHOT_PRESETS } from '../../constants/djOneShotPresets';
import {
  DJ_FX_CATEGORY_COLORS,
  ONE_SHOT_CATEGORY_COLORS,
  DEFAULT_SCRATCH_PADS,
} from '../../constants/djPadModeDefaults';
import { colorToHex } from '../../pixi/colors';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { PAD_INSTRUMENT_BASE } from '../../types/drumpad';

interface QuickAssignPanelProps {
  padId: number;
  anchorRect: DOMRect;
  onClose: () => void;
}

// One-shot categories (group by index ranges)
const ONE_SHOT_CATEGORIES: { name: string; indices: number[] }[] = [
  { name: 'Horns',       indices: [0, 1, 2, 3, 4, 5] },
  { name: 'Risers',      indices: [6, 7, 8, 9, 10] },
  { name: 'Impacts',     indices: [11, 12, 13, 14, 15, 16] },
  { name: 'Lasers',      indices: [17, 18, 19] },
  { name: 'Sirens',      indices: [20, 21, 22] },
  { name: 'Noise',       indices: [23, 24, 25, 26] },
  { name: 'Transitions', indices: [27, 28, 29, 30] },
];

export const QuickAssignPanel: React.FC<QuickAssignPanelProps> = ({ padId, anchorRect, onClose }) => {
  const [expanded, setExpanded] = useState<string>('djfx');
  const panelRef = useRef<HTMLDivElement>(null);
  const { updatePad } = useDrumPadStore();

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const assignDjFx = useCallback((action: DjFxAction) => {
    const catColor = DJ_FX_CATEGORY_COLORS[action.category] ?? 0x666666;
    updatePad(padId, {
      name: action.name,
      color: colorToHex(catColor),
      djFxAction: action.id,
      scratchAction: undefined,
      synthConfig: undefined,
      playMode: 'sustain',
    });
    onClose();
  }, [padId, updatePad, onClose]);

  const assignOneShot = useCallback((index: number, name: string, category: string) => {
    const catColor = ONE_SHOT_CATEGORY_COLORS[category] ?? 0x666666;
    const preset = DJ_ONE_SHOT_PRESETS[index];
    if (!preset) return;
    updatePad(padId, {
      name,
      color: colorToHex(catColor),
      synthConfig: {
        ...preset,
        id: PAD_INSTRUMENT_BASE + padId,
        name: preset.name ?? name,
      } as import('../../types/instrument/defaults').InstrumentConfig,
      instrumentNote: 'C3',
      djFxAction: undefined,
      scratchAction: undefined,
    });
    onClose();
  }, [padId, updatePad, onClose]);

  const assignScratch = useCallback((mapping: typeof DEFAULT_SCRATCH_PADS[0]) => {
    updatePad(padId, {
      name: mapping.label,
      color: mapping.color,
      scratchAction: mapping.actionId,
      djFxAction: undefined,
      synthConfig: undefined,
    });
    onClose();
  }, [padId, updatePad, onClose]);

  const clearPad = useCallback(() => {
    updatePad(padId, {
      name: `Pad ${padId}`,
      color: undefined,
      djFxAction: undefined,
      scratchAction: undefined,
      synthConfig: undefined,
      instrumentNote: undefined,
    });
    onClose();
  }, [padId, updatePad, onClose]);

  const fxGroups = getDjFxByCategory();

  // Position: try to place below the anchor, or above if no room
  const top = anchorRect.bottom + 4;
  const left = Math.min(anchorRect.left, window.innerWidth - 320);

  const sectionHeader = (id: string, label: string) => (
    <button
      className={`w-full text-left px-2 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
        expanded === id
          ? 'text-accent-primary bg-dark-bgTertiary'
          : 'text-text-muted hover:text-text-primary'
      }`}
      onClick={() => setExpanded(expanded === id ? '' : id)}
    >
      {expanded === id ? '- ' : '+ '}{label}
    </button>
  );

  return (
    <div
      ref={panelRef}
      className="fixed z-[99999] bg-dark-surface border border-dark-border rounded-lg shadow-2xl overflow-hidden"
      style={{ top, left, width: 300, maxHeight: 400, overflowY: 'auto' }}
    >
      <div className="px-2 py-1.5 border-b border-dark-border text-[10px] font-mono text-text-muted">
        Quick Assign — Pad {padId}
      </div>

      {/* DJ FX */}
      {sectionHeader('djfx', 'DJ FX')}
      {expanded === 'djfx' && (
        <div className="px-2 pb-2">
          {Object.entries(fxGroups).map(([category, actions]) => (
            <div key={category} className="mb-1.5">
              <div className="text-[9px] font-mono text-text-muted mb-0.5">{category}</div>
              <div className="flex flex-wrap gap-1">
                {actions.map((action) => {
                  const catColor = DJ_FX_CATEGORY_COLORS[action.category] ?? 0x666666;
                  return (
                    <button
                      key={action.id}
                      onClick={() => assignDjFx(action)}
                      className="px-1.5 py-0.5 text-[9px] font-mono text-white rounded transition-opacity hover:opacity-80"
                      style={{ backgroundColor: colorToHex(catColor) }}
                    >
                      {action.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* One Shots */}
      {sectionHeader('oneshots', 'One Shots')}
      {expanded === 'oneshots' && (
        <div className="px-2 pb-2">
          {ONE_SHOT_CATEGORIES.map((cat) => (
            <div key={cat.name} className="mb-1.5">
              <div className="text-[9px] font-mono text-text-muted mb-0.5">{cat.name}</div>
              <div className="flex flex-wrap gap-1">
                {cat.indices.map((idx) => {
                  const preset = DJ_ONE_SHOT_PRESETS[idx];
                  if (!preset) return null;
                  const catColor = ONE_SHOT_CATEGORY_COLORS[cat.name] ?? 0x666666;
                  return (
                    <button
                      key={idx}
                      onClick={() => assignOneShot(idx, preset.name ?? `Preset ${idx}`, cat.name)}
                      className="px-1.5 py-0.5 text-[9px] font-mono text-white rounded transition-opacity hover:opacity-80"
                      style={{ backgroundColor: colorToHex(catColor) }}
                    >
                      {preset.name ?? `Preset ${idx}`}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Scratch */}
      {sectionHeader('scratch', 'Scratch')}
      {expanded === 'scratch' && (
        <div className="px-2 pb-2">
          <div className="flex flex-wrap gap-1">
            {DEFAULT_SCRATCH_PADS.map((mapping) => (
              <button
                key={mapping.actionId}
                onClick={() => assignScratch(mapping)}
                className="px-1.5 py-0.5 text-[9px] font-mono text-white rounded transition-opacity hover:opacity-80"
                style={{ backgroundColor: mapping.color }}
              >
                {mapping.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clear */}
      <button
        onClick={clearPad}
        className="w-full px-2 py-1.5 text-[10px] font-mono text-accent-error hover:bg-accent-error/10 transition-colors border-t border-dark-border"
      >
        Clear Pad
      </button>
    </div>
  );
};
