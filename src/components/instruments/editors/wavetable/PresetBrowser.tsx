/**
 * PresetBrowser — filterable grid of chip waveform presets.
 *
 * Sources:
 * - Factory: FURNACE_WAVETABLE_PRESETS (100+ shipped presets)
 * - User: localStorage-backed list saved from the studio
 *
 * Click to load, double-click to load + close.
 */

import React, { useMemo, useState } from 'react';
import { Search, Save, X } from 'lucide-react';
import { WaveformThumbnail } from '@components/instruments/shared';
import { FURNACE_WAVETABLE_PRESETS, type FurnaceWavetablePreset } from '@constants/furnaceWavetablePresets';
import { resample, requantize } from './waveformOps';

const USER_PRESET_KEY = 'devilbox:wavetable:user-presets';

interface UserPreset {
  id: string;
  name: string;
  len: number;
  max: number;
  data: number[];
  savedAt: number;
}

function loadUserPresets(): UserPreset[] {
  try {
    const raw = localStorage.getItem(USER_PRESET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveUserPresets(presets: UserPreset[]): void {
  try {
    localStorage.setItem(USER_PRESET_KEY, JSON.stringify(presets));
  } catch (err) {
    console.warn('[WaveformStudio] Failed to save user preset:', err);
  }
}

interface PresetBrowserProps {
  currentLen: number;
  currentMax: number;
  currentData: number[];
  onLoad: (data: number[], len: number, max: number) => void;
}

type Category = 'all' | '32x16' | '32x32' | '128x256' | 'user';

export const PresetBrowser: React.FC<PresetBrowserProps> = ({
  currentLen, currentMax, currentData, onLoad,
}) => {
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => loadUserPresets());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (category === 'user') {
      return userPresets.filter((p) => !q || p.name.toLowerCase().includes(q));
    }
    return FURNACE_WAVETABLE_PRESETS.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [category, query, userPresets]);

  const handleLoadFactory = (preset: FurnaceWavetablePreset) => {
    // Resample to current length, requantize to current max
    const resampled = resample(preset.data, currentLen);
    const requantized = requantize(resampled, preset.max, currentMax);
    onLoad(requantized, currentLen, currentMax);
  };

  const handleLoadUser = (preset: UserPreset) => {
    const resampled = resample(preset.data, currentLen);
    const requantized = requantize(resampled, preset.max, currentMax);
    onLoad(requantized, currentLen, currentMax);
  };

  const handleSaveCurrent = () => {
    const name = window.prompt('Preset name:', `Custom ${userPresets.length + 1}`);
    if (!name) return;
    const newPreset: UserPreset = {
      id: `user-${Date.now()}`,
      name: name.trim(),
      len: currentLen,
      max: currentMax,
      data: [...currentData],
      savedAt: Date.now(),
    };
    const updated = [...userPresets, newPreset];
    setUserPresets(updated);
    saveUserPresets(updated);
  };

  const handleDeleteUser = (id: string) => {
    const updated = userPresets.filter((p) => p.id !== id);
    setUserPresets(updated);
    saveUserPresets(updated);
  };

  const CATEGORIES: Array<{ id: Category; label: string }> = [
    { id: 'all', label: 'All' },
    { id: '32x16', label: '4-bit' },
    { id: '32x32', label: '5-bit' },
    { id: '128x256', label: '8-bit' },
    { id: 'user', label: 'User' },
  ];

  return (
    <div className="space-y-2 p-2 bg-dark-bgSecondary rounded border border-dark-border">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono font-bold text-text-primary uppercase">
          Preset Browser
        </span>
        <button
          onClick={handleSaveCurrent}
          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono bg-dark-bg text-text-muted hover:text-accent-highlight border border-dark-border hover:border-accent-highlight/50"
        >
          <Save size={10} />
          Save current
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5 bg-dark-bg border border-dark-border rounded p-0.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase transition-colors ${
                category === c.id
                  ? 'bg-accent-highlight/20 text-accent-highlight'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex-1 flex items-center gap-1 bg-dark-bg border border-dark-border rounded px-2">
          <Search size={11} className="text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search presets…"
            className="flex-1 bg-transparent text-[10px] font-mono text-text-primary focus:outline-none py-1"
          />
        </div>
      </div>

      {/* Grid */}
      <div
        className="grid gap-1.5 max-h-64 overflow-y-auto pr-1"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}
      >
        {category === 'user' ? (
          <>
            {(filtered as UserPreset[]).map((preset) => (
              <div key={preset.id} className="relative group">
                <button
                  onClick={() => handleLoadUser(preset)}
                  className="w-full flex flex-col items-center gap-0.5 p-1.5 rounded border border-dark-border bg-dark-bg hover:border-accent-highlight/50 transition-colors"
                >
                  <WaveformThumbnail
                    data={preset.data}
                    maxValue={preset.max}
                    width={80} height={30}
                    color="#22d3ee"
                    style="line"
                  />
                  <span className="font-mono text-[9px] text-text-primary truncate w-full text-center">
                    {preset.name}
                  </span>
                  <span className="font-mono text-[8px] text-text-muted">
                    {preset.len}×{preset.max + 1}
                  </span>
                </button>
                <button
                  onClick={() => handleDeleteUser(preset.id)}
                  title="Delete preset"
                  className="absolute top-0.5 right-0.5 p-0.5 bg-dark-bgSecondary text-text-muted hover:text-accent-error rounded opacity-0 group-hover:opacity-100"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center text-[10px] font-mono text-text-muted py-4">
                No user presets yet. Click "Save current" to add one.
              </div>
            )}
          </>
        ) : (
          (filtered as FurnaceWavetablePreset[]).map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleLoadFactory(preset)}
              className="flex flex-col items-center gap-0.5 p-1.5 rounded border border-dark-border bg-dark-bg hover:border-accent-highlight/50 transition-colors"
            >
              <WaveformThumbnail
                data={preset.data}
                maxValue={preset.max}
                width={80} height={30}
                color="#22d3ee"
                style="line"
              />
              <span className="font-mono text-[9px] text-text-primary truncate w-full text-center">
                {preset.name}
              </span>
              <span className="font-mono text-[8px] text-text-muted">
                {preset.len}×{preset.max + 1}
              </span>
            </button>
          ))
        )}
        {category !== 'user' && filtered.length === 0 && (
          <div className="col-span-full text-center text-[10px] font-mono text-text-muted py-4">
            No matching presets.
          </div>
        )}
      </div>
    </div>
  );
};
