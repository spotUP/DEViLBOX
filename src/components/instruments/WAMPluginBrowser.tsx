/**
 * WAMPluginBrowser — DOM version of the WAM plugin browser.
 * Browse curated WAM 2.0 plugins by category, search, load into instrument slot.
 * Visually 1:1 with Pixi version. Data from shared useWAMPluginBrowser hook.
 */

import React, { useState } from 'react';
import { useWAMPluginBrowser } from '@/hooks/useWAMPluginBrowser';

interface WAMPluginBrowserProps {
  onSelectPlugin: (url: string, name: string) => void;
  onClose?: () => void;
  typeFilter?: 'instrument' | 'effect';
}

const TYPE_COLORS: Record<string, string> = {
  instrument: 'var(--color-synth-filter)',
  effect: 'var(--color-synth-effects)',
  utility: 'var(--color-synth-pan)',
};

export const WAMPluginBrowser: React.FC<WAMPluginBrowserProps> = ({
  onSelectPlugin,
  onClose,
  typeFilter,
}) => {
  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState<'instrument' | 'effect' | undefined>(typeFilter);
  const [customUrl, setCustomUrl] = useState('');

  const { groups, customUrls, addCustomUrl, removeCustomUrl, totalCount } = useWAMPluginBrowser({
    type: activeType,
    search: search || undefined,
  });

  return (
    <div className="flex flex-col bg-dark-bg border border-dark-border rounded-lg overflow-hidden" style={{ maxHeight: 480 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-bgSecondary border-b border-dark-border">
        <div className="flex items-center gap-2">
          <span className="text-text-secondary text-sm font-medium">WAM Plugins</span>
          <span className="text-text-muted text-xs">({totalCount})</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-sm">x</button>
        )}
      </div>

      {/* Search + type filter */}
      <div className="flex gap-2 px-3 py-2 border-b border-dark-border">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search plugins..."
          className="flex-1 input text-xs"
        />
        <div className="flex gap-1">
          <button
            onClick={() => setActiveType(undefined)}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              !activeType ? 'bg-accent-primary text-text-inverse border-accent-primary' : 'bg-dark-bgTertiary text-text-secondary border-dark-border'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveType('instrument')}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              activeType === 'instrument' ? 'bg-accent-primary text-text-inverse border-accent-primary' : 'bg-dark-bgTertiary text-text-secondary border-dark-border'
            }`}
          >
            Synths
          </button>
          <button
            onClick={() => setActiveType('effect')}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              activeType === 'effect' ? 'bg-accent-primary text-text-inverse border-accent-primary' : 'bg-dark-bgTertiary text-text-secondary border-dark-border'
            }`}
          >
            Effects
          </button>
        </div>
      </div>

      {/* Plugin list */}
      <div className="flex-1 overflow-y-auto scrollbar-modern">
        {groups.map((group) => (
          <div key={group.category}>
            <div className="px-3 py-1 text-[9px] font-mono uppercase tracking-wider text-text-muted bg-dark-bgTertiary border-b border-dark-border">
              {group.category}
            </div>
            {group.plugins.map((plugin) => (
              <button
                key={plugin.url}
                onClick={() => onSelectPlugin(plugin.url, plugin.name)}
                className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-dark-bgHover border-b border-dark-border transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: TYPE_COLORS[plugin.type] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-text-primary text-xs font-medium truncate">{plugin.name}</div>
                  <div className="text-text-muted text-[10px] truncate">{plugin.description}</div>
                </div>
                <span className="text-text-muted text-[9px] flex-shrink-0">{plugin.type}</span>
              </button>
            ))}
          </div>
        ))}

        {groups.length === 0 && (
          <div className="px-3 py-8 text-text-muted text-xs text-center">No plugins found</div>
        )}
      </div>

      {/* Custom URL section */}
      <div className="border-t border-dark-border px-3 py-2 bg-dark-bgSecondary">
        <div className="text-[9px] font-mono text-text-muted uppercase mb-1">Custom URL</div>
        <div className="flex gap-1">
          <input
            type="text"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://example.com/plugin/index.js"
            className="flex-1 input text-xs"
          />
          <button
            onClick={() => {
              if (customUrl.trim()) {
                onSelectPlugin(customUrl.trim(), 'Custom WAM');
                addCustomUrl(customUrl.trim());
                setCustomUrl('');
              }
            }}
            className="btn btn-sm text-xs"
          >
            Load
          </button>
        </div>
        {customUrls.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {customUrls.map((url) => (
              <button
                key={url}
                onClick={() => onSelectPlugin(url, 'Custom WAM')}
                className="text-[9px] px-1.5 py-0.5 rounded bg-dark-bgTertiary text-text-muted border border-dark-border hover:text-text-primary truncate max-w-[200px]"
                title={url}
              >
                {url.split('/').pop()}
                <span
                  className="ml-1 text-accent-error cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); removeCustomUrl(url); }}
                >
                  x
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
