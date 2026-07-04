/**
 * KontaktInstrumentBrowser — Browse and load Kontakt instruments.
 *
 * Shows all instruments from komplete.db3 with search/filter.
 * Cached instruments (✅) load instantly via state restore + open GUI.
 * Uncached instruments open Kontakt's GUI for manual first-time loading.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useKontaktStore } from '@stores/useKontaktStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { notify } from '@stores/useNotificationStore';
import { Button } from '@components/ui/Button';
import { Piano, Search, Wifi, Loader2, RefreshCw, Save, Eye } from 'lucide-react';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { KontaktInstrument } from '@/engine/kontakt/protocol';

interface KontaktInstrumentBrowserProps {
  onClose: () => void;
}

export const KontaktInstrumentBrowser: React.FC<KontaktInstrumentBrowserProps> = () => {
  const bridgeStatus = useKontaktStore((s) => s.bridgeStatus);
  const instruments = useKontaktStore((s) => s.instruments);
  const pluginName = useKontaktStore((s) => s.pluginName);
  const currentPreset = useKontaktStore((s) => s.currentPreset);
  const error = useKontaktStore((s) => s.error);
  const connect = useKontaktStore((s) => s.connect);
  const loadInstrument = useKontaktStore((s) => s.loadInstrument);
  const cacheState = useKontaktStore((s) => s.cacheState);
  const showGUI = useKontaktStore((s) => s.showGUI);
  const loadPlugin = useKontaktStore((s) => s.loadPlugin);
  const listInstruments = useKontaktStore((s) => s.listInstruments);
  const createInstrument = useInstrumentStore((s) => s.createInstrument);

  const [searchQuery, setSearchQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const isReady = bridgeStatus === 'ready';

  useEffect(() => {
    if (bridgeStatus === 'disconnected' || bridgeStatus === 'error') {
      connect().catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const vendors = useMemo(() => {
    const vendorSet = new Set(instruments.map((i) => i.vendor).filter(Boolean));
    return Array.from(vendorSet).sort();
  }, [instruments]);

  const filtered = useMemo(() => {
    let list = instruments;
    if (vendorFilter) {
      list = list.filter((i) => i.vendor === vendorFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.vendor.toLowerCase().includes(q),
      );
    }
    // Show cached instruments first
    return [...list].sort((a, b) => {
      if (a.cached !== b.cached) return a.cached ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [instruments, vendorFilter, searchQuery]);

  const handleLoad = useCallback(
    (inst: KontaktInstrument) => {
      if (inst.cached) {
        setLoading(inst.name);
        loadInstrument(inst.name);
        createInstrument({
          name: inst.name,
          synthType: 'Kontakt' as InstrumentConfig['synthType'],
        });
        notify.success(`Loading ${inst.name}...`);
        setTimeout(() => setLoading(null), 3000);
      } else {
        // No cached state — load empty Kontakt and open GUI for manual loading
        if (!pluginName) {
          loadPlugin('Native Instruments: Kontakt 8');
        }
        setTimeout(() => showGUI(), 1000);
        notify.warning(
          `${inst.name} needs first-time setup. Load it in Kontakt's browser, then click "Save State".`,
        );
      }
    },
    [loadInstrument, loadPlugin, showGUI, pluginName, createInstrument],
  );

  const handleCacheState = useCallback(() => {
    const name = currentPreset || pluginName || 'Unknown';
    cacheState(name);
    notify.success(`Saved state for "${name}" — future loads will be instant`);
  }, [cacheState, currentPreset, pluginName]);

  const handleRetry = useCallback(async () => {
    try {
      await connect();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Bridge connection failed');
    }
  }, [connect]);

  // Not connected
  if (!isReady) {
    const isConnecting = bridgeStatus === 'connecting';
    const isError = bridgeStatus === 'error';
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-text-secondary">
        {isConnecting ? (
          <>
            <Loader2 size={24} className="animate-spin text-accent-primary" />
            <span className="text-[11px]">Connecting to Kontakt bridge...</span>
          </>
        ) : (
          <>
            <Wifi size={24} className="text-text-muted" />
            <span className="text-[11px]">
              {isError ? error || 'Bridge connection failed' : 'Kontakt bridge not connected'}
            </span>
            <Button variant="default" onClick={handleRetry}>
              <RefreshCw size={12} className="mr-1" />
              Retry
            </Button>
          </>
        )}
      </div>
    );
  }

  const cachedCount = instruments.filter((i) => i.cached).length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-border">
        <Piano size={14} className="text-accent-primary" />
        <span className="text-[11px] font-medium text-text-primary">
          Kontakt Instruments
        </span>
        <span className="text-[9px] text-text-muted ml-1">
          {instruments.length} total · {cachedCount} ready
        </span>
        <div className="flex-1" />
        {pluginName && (
          <Button variant="ghost" onClick={handleCacheState} title="Save current instrument state for instant loading">
            <Save size={12} className="mr-1" />
            Save State
          </Button>
        )}
        {pluginName && (
          <Button variant="ghost" onClick={() => showGUI()} title="Open Kontakt GUI">
            <Eye size={12} className="mr-1" />
            Show GUI
          </Button>
        )}
        <Button variant="ghost" onClick={listInstruments} title="Refresh instrument list">
          <RefreshCw size={12} />
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-dark-border">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search instruments..."
            className="w-full pl-7 pr-2 py-1 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-accent-primary"
          />
        </div>
        <select
          value={vendorFilter || ''}
          onChange={(e) => setVendorFilter(e.target.value || null)}
          className="bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary text-[11px] font-mono px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent-primary"
        >
          <option value="">All Vendors</option>
          {vendors.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Instrument List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-[11px]">
            No instruments found
          </div>
        ) : (
          <div className="divide-y divide-dark-border/50">
            {filtered.map((inst) => (
              <button
                key={inst.path || inst.name}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                  'hover:bg-dark-bgHover',
                  loading === inst.name ? 'bg-accent-primary/10' : '',
                  currentPreset === inst.name ? 'bg-accent-primary/15 border-l-2 border-accent-primary' : '',
                ].join(' ')}
                onClick={() => handleLoad(inst)}
                disabled={loading === inst.name}
              >
                <div className="flex-shrink-0 w-5 text-center">
                  {loading === inst.name ? (
                    <Loader2 size={14} className="animate-spin text-accent-primary" />
                  ) : inst.cached ? (
                    <span className="text-accent-success text-[12px]">✓</span>
                  ) : (
                    <span className="text-text-muted text-[10px]">○</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-text-primary truncate font-medium">
                    {inst.name}
                  </div>
                  {inst.vendor && (
                    <div className="text-[9px] text-text-muted truncate">
                      {inst.vendor}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {inst.cached ? (
                    <span className="text-[9px] text-accent-success bg-accent-success/10 px-1.5 py-0.5 rounded">
                      Ready
                    </span>
                  ) : (
                    <span className="text-[9px] text-text-muted bg-dark-bgTertiary px-1.5 py-0.5 rounded">
                      Setup
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
