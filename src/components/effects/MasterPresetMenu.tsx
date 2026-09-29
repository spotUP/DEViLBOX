import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { MASTER_FX_PRESETS, type MasterFxPreset } from '@constants/fxPresets';
import { groupMasterPresets, filterUserPresets } from './masterPresetSearch';

export interface MasterPresetMenuProps<U extends { name: string }> {
  userPresets: readonly U[];
  onLoadPreset: (preset: MasterFxPreset) => void;
  onLoadUserPreset: (preset: U) => void;
  onDeleteUserPreset: (name: string) => void;
  /** Shows a "No FX" row first when given. */
  onClear?: () => void;
  /** The name of the preset the current chain fingerprint-matches, for highlighting. */
  currentPresetName: string | null;
  /** True when the current chain is empty — highlights the "No FX" row instead. */
  noFxActive: boolean;
  /** Called on Escape when the search box is already empty — the caller closes the menu. */
  onRequestClose: () => void;
  /** Attached to the menu's root element so callers can detect outside clicks. */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  className: string;
  style?: React.CSSProperties;
}

const activeRowClass = 'bg-accent-primary/10 text-accent-primary';

/**
 * The master FX preset list: a search box on top, then user presets, then the
 * factory presets by category. One list for the Master FX dialog and the
 * master effects panel.
 *
 * Stays open across preset selections so the owner can click through presets
 * and listen (2026-09-29 ask); the caller closes it on outside click / Escape
 * via `onRequestClose` and its own click-outside handling.
 */
export function MasterPresetMenu<U extends { name: string }>({
  userPresets, onLoadPreset, onLoadUserPreset, onDeleteUserPreset, onClear,
  currentPresetName, noFxActive, onRequestClose, containerRef, className, style,
}: MasterPresetMenuProps<U>) {
  const [query, setQuery] = useState('');
  const groups = groupMasterPresets(MASTER_FX_PRESETS, query);
  const users = filterUserPresets(userPresets, query);

  // Scrolls the current preset's row into view once, when the menu opens.
  const activeRowRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    activeRowRef.current?.scrollIntoView?.({ block: 'center' });
  }, []);
  const setActiveRow = (active: boolean) => (active ? (el: HTMLElement | null) => { activeRowRef.current = el; } : undefined);

  return (
    <div ref={containerRef} className={`${className} flex flex-col`} style={style}>
      <div className="p-2 border-b border-dark-border bg-dark-bgSecondary">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            autoFocus
            type="text"
            placeholder="Search presets or effects..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.stopPropagation();
              if (query) setQuery('');
              else onRequestClose();
            }}
            className="w-full pl-7 pr-7 py-1 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto scrollbar-modern">
        {onClear && !query && (
          <button
            ref={setActiveRow(noFxActive)}
            onClick={onClear}
            className={`w-full px-3 py-2 text-left text-xs font-mono border-b border-dark-border transition-colors ${
              noFxActive ? activeRowClass : 'text-text-muted hover:bg-dark-bgHover hover:text-text-primary'
            }`}
          >
            No FX
          </button>
        )}

        {users.length > 0 && (
          <>
            <div className="px-3 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary sticky top-0">
              User Presets
            </div>
            {users.map((preset) => {
              const active = preset.name === currentPresetName;
              return (
                <div
                  key={preset.name}
                  ref={setActiveRow(active)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer group ${active ? activeRowClass : 'hover:bg-dark-bgHover'}`}
                >
                  <span onClick={() => onLoadUserPreset(preset)} className={`text-sm flex-1 ${active ? 'text-accent-primary' : 'text-text-primary'}`}>
                    {preset.name}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteUserPreset(preset.name); }}
                    className="text-text-muted hover:text-accent-error opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete preset"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
            <div className="border-t border-dark-border" />
          </>
        )}

        {groups.map(([category, presets]) => (
          <div key={category}>
            <div className="px-3 py-2 text-xs text-text-muted font-medium uppercase tracking-wide bg-dark-bgTertiary sticky top-0">
              {category}
            </div>
            {presets.map((preset) => {
              const active = preset.name === currentPresetName;
              return (
                <div
                  key={preset.name}
                  ref={setActiveRow(active)}
                  onClick={() => onLoadPreset(preset)}
                  className={`px-3 py-2 cursor-pointer ${active ? activeRowClass : 'hover:bg-dark-bgHover'}`}
                >
                  <div className={`text-sm ${active ? 'text-accent-primary' : 'text-text-primary'}`}>{preset.name}</div>
                  <div className="text-xs text-text-muted">{preset.description}</div>
                </div>
              );
            })}
          </div>
        ))}

        {groups.length === 0 && users.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-text-muted">No presets match "{query}"</div>
        )}
      </div>
    </div>
  );
}
