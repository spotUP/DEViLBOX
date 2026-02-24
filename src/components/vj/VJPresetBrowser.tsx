/**
 * VJPresetBrowser — Searchable, categorized browser for Milkdrop presets.
 *
 * Features:
 *   - All 395 butterchurn presets (main + extra + extra2 + MD1 + nonMinimal)
 *   - Author-based categories (parsed from preset names)
 *   - Full-text search
 *   - Favorites (persisted to localStorage)
 *   - Instant preview on click (loads preset with blend)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Star, X, ChevronRight } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PresetEntry {
  name: string;
  author: string;
  pack: string;
  idx: number;      // global index across all packs
}

export interface VJPresetBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (name: string, idx: number) => void;
  currentPresetIdx: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const FAVORITES_KEY = 'devilbox-vj-favorites';
const ALL_CATEGORY = '★ All';
const FAVORITES_CATEGORY = '♥ Favorites';

// ─── Preset loading (lazy, cached) ────────────────────────────────────────────

let cachedPresets: PresetEntry[] | null = null;
let cachedPresetMap: Record<string, object> | null = null;

async function loadAllPresets(): Promise<{ entries: PresetEntry[]; presetMap: Record<string, object> }> {
  if (cachedPresets && cachedPresetMap) {
    return { entries: cachedPresets, presetMap: cachedPresetMap };
  }

  const [mainMod, extraMod, extra2Mod, md1Mod, nmMod] = await Promise.all([
    import('butterchurn-presets'),
    import('butterchurn-presets/lib/butterchurnPresetsExtra.min.js' as string),
    import('butterchurn-presets/lib/butterchurnPresetsExtra2.min.js' as string),
    import('butterchurn-presets/lib/butterchurnPresetsMD1.min.js' as string),
    import('butterchurn-presets/lib/butterchurnPresetsNonMinimal.min.js' as string),
  ]);

  const packs: { mod: any; label: string }[] = [
    { mod: mainMod.default || mainMod, label: 'Main' },
    { mod: extraMod.default || extraMod, label: 'Extra' },
    { mod: extra2Mod.default || extra2Mod, label: 'Extra 2' },
    { mod: md1Mod.default || md1Mod, label: 'MD1' },
    { mod: nmMod.default || nmMod, label: 'NonMinimal' },
  ];

  const allMap: Record<string, object> = {};
  const entries: PresetEntry[] = [];
  let idx = 0;

  for (const { mod, label } of packs) {
    const presets = typeof mod.getPresets === 'function' ? mod.getPresets() : mod;
    for (const name of Object.keys(presets).sort()) {
      if (allMap[name]) continue; // dedupe
      allMap[name] = presets[name];
      entries.push({ name, author: parseAuthor(name), pack: label, idx });
      idx++;
    }
  }

  cachedPresets = entries;
  cachedPresetMap = allMap;
  return { entries, presetMap: allMap };
}

/** Extract primary author from Milkdrop preset name */
function parseAuthor(name: string): string {
  // Patterns: "Author - Title", "Author + Author2 - Title", "_Author - Title"
  const cleaned = name.replace(/^[_$]+\s*/, '');
  const dashIdx = cleaned.indexOf(' - ');
  if (dashIdx > 0) {
    let author = cleaned.slice(0, dashIdx).trim();
    // "Author + Author2" → "Author"
    const plusIdx = author.indexOf(' + ');
    if (plusIdx > 0) author = author.slice(0, plusIdx).trim();
    // "Author (feat X)" → "Author"
    const parenIdx = author.indexOf('(');
    if (parenIdx > 0) author = author.slice(0, parenIdx).trim();
    if (author.length > 0 && author.length < 40) return author;
  }
  return 'Other';
}

export function getPresetMap(): Record<string, object> | null {
  return cachedPresetMap;
}

// ─── Favorites persistence ────────────────────────────────────────────────────

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favs: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
}

// ─── Component ────────────────────────────────────────────────────────────────

export const VJPresetBrowser: React.FC<VJPresetBrowserProps> = ({
  isOpen,
  onClose,
  onSelectPreset,
  currentPresetIdx,
}) => {
  const [entries, setEntries] = useState<PresetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load presets on mount
  useEffect(() => {
    if (!isOpen) return;
    loadAllPresets().then(({ entries: e }) => {
      setEntries(e);
      setLoading(false);
    });
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen && !loading) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen, loading]);

  // Build categories
  const categories = useMemo(() => {
    const authorCounts = new Map<string, number>();
    for (const e of entries) {
      authorCounts.set(e.author, (authorCounts.get(e.author) || 0) + 1);
    }
    const sorted = [...authorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
    return [
      { name: ALL_CATEGORY, count: entries.length },
      { name: FAVORITES_CATEGORY, count: favorites.size },
      ...sorted,
    ];
  }, [entries, favorites.size]);

  // Filter entries
  const filtered = useMemo(() => {
    let result = entries;

    if (category === FAVORITES_CATEGORY) {
      result = result.filter(e => favorites.has(e.name));
    } else if (category !== ALL_CATEGORY) {
      result = result.filter(e => e.author === category);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e => e.name.toLowerCase().includes(q));
    }

    return result;
  }, [entries, category, search, favorites]);

  const toggleFavorite = useCallback((name: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      saveFavorites(next);
      return next;
    });
  }, []);

  const handleSelect = useCallback((entry: PresetEntry) => {
    onSelectPreset(entry.name, entry.idx);
  }, [onSelectPreset]);

  // Keyboard: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-20 flex bg-black/80 backdrop-blur-sm">
      {/* Sidebar: Categories */}
      <div className="w-48 flex-shrink-0 bg-dark-bg border-r border-dark-border flex flex-col overflow-hidden">
        <div className="p-3 border-b border-dark-border">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Categories</h3>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {categories.map(cat => (
            <button
              key={cat.name}
              onClick={() => setCategory(cat.name)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${
                category === cat.name
                  ? 'bg-accent/20 text-accent'
                  : 'text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
              }`}
            >
              <span className="truncate">{cat.name}</span>
              <span className="text-[10px] text-text-muted ml-1">{cat.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-3 border-b border-dark-border bg-dark-bg">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search presets..."
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded focus:border-accent focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="text-xs text-text-muted whitespace-nowrap">
            {filtered.length} presets
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-dark-bgHover text-text-muted hover:text-text-primary transition-colors"
            title="Close browser"
          >
            <X size={16} />
          </button>
        </div>

        {/* Preset list */}
        <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-text-muted text-sm">
              Loading presets...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-text-muted text-sm">
              No presets found
            </div>
          ) : (
            filtered.map(entry => {
              const isActive = entry.idx === currentPresetIdx;
              const isFav = favorites.has(entry.name);
              return (
                <div
                  key={entry.name}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors group ${
                    isActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
                  }`}
                  onClick={() => handleSelect(entry)}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(entry.name); }}
                    className={`flex-shrink-0 transition-colors ${
                      isFav ? 'text-yellow-400' : 'text-transparent group-hover:text-text-muted/40'
                    }`}
                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star size={12} fill={isFav ? 'currentColor' : 'none'} />
                  </button>
                  <span className="flex-1 text-xs truncate font-mono">{entry.name}</span>
                  <span className="text-[10px] text-text-muted flex-shrink-0">{entry.pack}</span>
                  {isActive && (
                    <ChevronRight size={12} className="flex-shrink-0 text-accent" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
