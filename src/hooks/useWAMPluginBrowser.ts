/**
 * useWAMPluginBrowser — Shared hook for WAM plugin browsing and loading.
 *
 * Provides grouped/filtered plugin lists from the curated registry.
 * Used by both DOM and Pixi WAM browser components.
 */

import { useMemo, useState } from 'react';
import { WAM_SYNTH_PLUGINS, type WAMPluginEntry } from '@/constants/wamPlugins';

export interface WAMPluginGroup {
  category: string;
  plugins: WAMPluginEntry[];
}

export function useWAMPluginBrowser(filter?: {
  type?: 'instrument' | 'effect' | 'utility';
  search?: string;
}) {
  const [customUrls, setCustomUrls] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('devilbox-wam-custom-urls');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const filteredPlugins = useMemo(() => {
    let plugins = WAM_SYNTH_PLUGINS;

    if (filter?.type) {
      plugins = plugins.filter(p => p.type === filter.type);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      plugins = plugins.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }

    return plugins;
  }, [filter?.type, filter?.search]);

  const groups = useMemo(() => {
    const map = new Map<string, WAMPluginEntry[]>();
    for (const p of filteredPlugins) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return Array.from(map.entries()).map(([category, plugins]) => ({
      category,
      plugins,
    }));
  }, [filteredPlugins]);

  const addCustomUrl = (url: string) => {
    const updated = [...customUrls, url];
    setCustomUrls(updated);
    localStorage.setItem('devilbox-wam-custom-urls', JSON.stringify(updated));
  };

  const removeCustomUrl = (url: string) => {
    const updated = customUrls.filter(u => u !== url);
    setCustomUrls(updated);
    localStorage.setItem('devilbox-wam-custom-urls', JSON.stringify(updated));
  };

  return {
    plugins: filteredPlugins,
    groups,
    customUrls,
    addCustomUrl,
    removeCustomUrl,
    totalCount: WAM_SYNTH_PLUGINS.length,
  };
}
