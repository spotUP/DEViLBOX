/**
 * NKSLibraryBrowser — Full NKS preset library browser
 *
 * Left sidebar: product list with artwork tiles
 * Right panel: preset grid with search, type/character filters
 *
 * Data comes from the server-side /api/nks/* endpoints which query
 * the komplete.db3 SQLite database maintained by Komplete Kontrol,
 * plus /api/devilbox-presets/* for bundled DEViLBOX synth presets.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useNKSLibraryStore,
  type DevilboxPreset,
  type DevilboxProduct,
  type NKSPreset,
} from '@/stores/useNKSLibraryStore';
import { notify } from '@stores/useNotificationStore';

const HELM_CATEGORIES = ['Arp', 'Bass', 'Chip', 'Harsh', 'Keys', 'Lead', 'Pad', 'Percussion', 'SFX'] as const;

type LibraryPreset = NKSPreset | DevilboxPreset;

const ProductTile = React.memo(({
  label,
  presetCount,
  selected,
  onClick,
  artworkUrl,
  fallbackLabel,
  capitalize = false,
}: {
  label: string;
  presetCount: number;
  selected: boolean;
  onClick: () => void;
  artworkUrl?: string | null;
  fallbackLabel: string;
  capitalize?: boolean;
}) => (
  <button
    className={[
      'w-full flex items-center gap-2 px-2 py-1.5 text-left rounded transition-colors text-[11px] font-medium border',
      selected
        ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/40'
        : 'text-text-secondary hover:bg-dark-bgHover hover:text-text-primary border-transparent',
    ].join(' ')}
    onClick={onClick}
    title={`${label} (${presetCount} presets)`}
  >
    <div className="w-7 h-7 flex-shrink-0 rounded overflow-hidden bg-dark-bgTertiary border border-dark-border/50">
      {artworkUrl ? (
        <img
          src={artworkUrl}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-text-muted text-[8px]">
          {fallbackLabel}
        </div>
      )}
    </div>
    <div className="min-w-0">
      <div className={capitalize ? 'truncate capitalize' : 'truncate'}>{label}</div>
      {presetCount > 0 && (
        <div className="text-[9px] text-text-muted">{presetCount} presets</div>
      )}
    </div>
  </button>
));

const NKSPresetRow = React.memo(({ preset, onLoad }: {
  preset: NKSPreset;
  onLoad: (preset: NKSPreset) => void;
}) => (
  <div
    className="flex items-center gap-2 px-3 py-1.5 hover:bg-dark-bgHover cursor-pointer group border-b border-dark-border/30"
    onDoubleClick={() => onLoad(preset)}
    title="Double-click to load"
  >
    <span className={[
      'text-[8px] font-mono px-1 py-0.5 rounded flex-shrink-0',
      preset.deviceType & 1 ? 'bg-accent-primary/20 text-accent-primary' : 'bg-accent-secondary/20 text-accent-secondary',
    ].join(' ')}>
      {preset.deviceType & 1 ? 'INST' : 'FX'}
    </span>
    <span className="text-[11px] text-text-primary truncate flex-1">{preset.name}</span>
    <span className="text-[9px] text-text-muted truncate max-w-[120px]">
      {[preset.bank, preset.subbank].filter(Boolean).join(' / ')}
    </span>
    {preset.types && (
      <span className="text-[9px] text-accent-secondary/80 truncate max-w-[100px] hidden md:block">
        {preset.types.split(' / ')[0]}
      </span>
    )}
    <button
      className="opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary border border-accent-primary/40 flex-shrink-0"
      onClick={() => onLoad(preset)}
    >
      Load
    </button>
  </div>
));

const DevilboxPresetRow = React.memo(({ preset, onLoad }: {
  preset: DevilboxPreset;
  onLoad: (preset: DevilboxPreset) => void;
}) => (
  <div
    className="flex items-center gap-2 px-3 py-1.5 hover:bg-dark-bgHover cursor-pointer group border-b border-dark-border/30"
    onClick={() => onLoad(preset)}
    title="Click to load preset"
  >
    <span className="text-[8px] font-mono px-1 py-0.5 rounded flex-shrink-0 bg-accent-secondary/20 text-accent-secondary uppercase">
      {preset.synth}
    </span>
    <span className="text-[11px] text-text-primary truncate flex-1">{preset.name}</span>
    <span className="text-[9px] text-text-muted truncate max-w-[120px]">{preset.category}</span>
    {preset.tags.length > 0 && (
      <span className="text-[9px] text-accent-primary/80 truncate max-w-[100px] hidden md:block">
        {preset.tags[0]}
      </span>
    )}
    <span className="opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary border border-accent-primary/40 flex-shrink-0">
      Load
    </span>
  </div>
));

interface NKSLibraryBrowserProps {
  onLoadPreset?: (preset: LibraryPreset) => void;
}

export const NKSLibraryBrowser: React.FC<NKSLibraryBrowserProps> = ({ onLoadPreset }) => {
  const {
    status,
    products,
    productsLoading,
    devilboxProducts,
    devilboxProductsLoading,
    presets,
    presetsLoading,
    presetsTotal,
    presetsOffset,
    devilboxPresets,
    devilboxPresetsLoading,
    selectedProduct,
    selectedDevilboxSynth,
    searchQuery,
    filterType,
    filterCharacter,
    types,
    characters,
    loadStatus,
    loadProducts,
    loadDevilboxProducts,
    loadPresets,
    loadDevilboxPresets,
    loadTypes,
    loadCharacters,
    selectProduct,
    setSelectedProduct,
    setSelectedDevilboxSynth,
    setSearch,
    setFilterType,
    setFilterCharacter,
    resetFilters,
  } = useNKSLibraryStore();

  const [searchInput, setSearchInput] = useState(searchQuery);
  const [devilboxCategory, setDevilboxCategory] = useState('');
  const searchTimer = useRef<number | null>(null);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    void loadStatus();
    void loadProducts();
    void loadDevilboxProducts();
    void loadTypes();
    void loadCharacters();
    void loadPresets();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDevilboxProduct = useMemo(
    () => devilboxProducts.find((product) => product.id === selectedDevilboxSynth) ?? null,
    [devilboxProducts, selectedDevilboxSynth],
  );

  const displayedPresets = selectedDevilboxSynth ? devilboxPresets : presets;
  const displayedTotal = selectedDevilboxSynth ? devilboxPresets.length : presetsTotal;
  const displayedLoading = selectedDevilboxSynth ? devilboxPresetsLoading : presetsLoading;
  const isHelmSelected = selectedDevilboxSynth === 'helm';
  const hasFilters = selectedDevilboxSynth
    ? Boolean(selectedDevilboxSynth || devilboxCategory || searchInput)
    : Boolean(selectedProduct || searchQuery || filterType || filterCharacter);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchInput(value);
    if (searchTimer.current !== null) {
      clearTimeout(searchTimer.current);
    }
    searchTimer.current = window.setTimeout(() => {
      setSearch(value);
      if (selectedDevilboxSynth) {
        void loadDevilboxPresets(selectedDevilboxSynth, devilboxCategory, value);
      }
    }, 300);
  }, [devilboxCategory, loadDevilboxPresets, selectedDevilboxSynth, setSearch]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (selectedDevilboxSynth) {
      return;
    }
    const element = event.currentTarget;
    if (presetsLoading || presetsOffset >= presetsTotal) {
      return;
    }
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 100) {
      void loadPresets(true);
    }
  }, [loadPresets, presetsLoading, presetsOffset, presetsTotal, selectedDevilboxSynth]);

  const handleLoadNKSPreset = useCallback((preset: NKSPreset) => {
    onLoadPreset?.(preset);
  }, [onLoadPreset]);

  const handleLoadDevilboxPreset = useCallback(async (preset: DevilboxPreset) => {
    try {
      const response = await fetch(`/api/devilbox-presets/preset-data?path=${encodeURIComponent(preset.path)}`);
      if (!response.ok) {
        throw new Error(`Preset load failed (${response.status})`);
      }

      if (preset.synth === 'helm') {
        const data = await response.json();
        window.dispatchEvent(new CustomEvent('devilbox:load-helm-preset', { detail: { data } }));
      } else {
        const data = await response.arrayBuffer();
        window.dispatchEvent(new CustomEvent('devilbox:load-dexed-preset', { detail: { data } }));
      }

      onLoadPreset?.(preset);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : `Failed to load ${preset.name}`);
    }
  }, [onLoadPreset]);

  const handleSelectNKSProduct = useCallback((product: string | null) => {
    setSelectedDevilboxSynth(null);
    setDevilboxCategory('');
    selectProduct(product);
  }, [selectProduct, setSelectedDevilboxSynth]);

  const handleSelectDevilboxProduct = useCallback((product: DevilboxProduct) => {
    setSelectedProduct(null);
    setSelectedDevilboxSynth(product.id);
    setDevilboxCategory('');
    void loadDevilboxPresets(product.id, '', searchInput);
  }, [loadDevilboxPresets, searchInput, setSelectedDevilboxSynth, setSelectedProduct]);

  const handleCategoryChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const category = event.target.value;
    setDevilboxCategory(category);
    if (selectedDevilboxSynth) {
      void loadDevilboxPresets(selectedDevilboxSynth, category, searchInput);
    }
  }, [loadDevilboxPresets, searchInput, selectedDevilboxSynth]);

  const handleReset = useCallback(() => {
    setDevilboxCategory('');
    setSearchInput('');
    resetFilters();
  }, [resetFilters]);

  return (
    <div className="flex flex-col h-full bg-dark-bg text-text-primary overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-border bg-dark-bgSecondary flex-shrink-0">
        <span className="text-[11px] font-mono text-accent-primary font-semibold tracking-wider">
          {selectedDevilboxProduct ? 'DEViLBOX PRESETS' : 'NKS LIBRARY'}
        </span>
        {status && (
          <span className="text-[9px] text-text-muted ml-auto">
            {selectedDevilboxProduct
              ? `${selectedDevilboxProduct.name} · ${selectedDevilboxProduct.presetCount} factory presets`
              : status.presetCount > 0
                ? `${status.presetCount.toLocaleString()} presets · ${status.productCount} products`
                : `${status.niResourcesProducts} products (library empty — install via Native Access)`}
          </span>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-52 flex-shrink-0 flex flex-col border-r border-dark-border bg-dark-bgSecondary overflow-hidden">
          <div className="px-2 py-1.5 border-b border-dark-border">
            <span className="text-[9px] font-mono text-text-muted uppercase tracking-widest">Libraries</span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border p-1 space-y-2">
            <div className="space-y-0.5">
              <div className="px-1 py-1 text-[9px] font-mono uppercase tracking-widest text-text-muted">NKS Products</div>
              <button
                className={[
                  'w-full text-left px-2 py-1 rounded text-[11px] font-medium transition-colors',
                  !selectedProduct && !selectedDevilboxSynth
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'text-text-secondary hover:bg-dark-bgHover hover:text-text-primary',
                ].join(' ')}
                onClick={() => handleSelectNKSProduct(null)}
              >
                All Products
              </button>
              {productsLoading && (
                <div className="text-[10px] text-text-muted text-center py-2">Loading…</div>
              )}
              {products.map((product) => (
                <ProductTile
                  key={product.name}
                  label={product.name}
                  presetCount={product.presetCount}
                  selected={selectedProduct === product.name && !selectedDevilboxSynth}
                  onClick={() => handleSelectNKSProduct(product.name)}
                  artworkUrl={product.artworkUrl}
                  fallbackLabel="NI"
                  capitalize
                />
              ))}
            </div>

            <div className="border-t border-dark-border pt-2 space-y-0.5">
              <div className="px-1 py-1 text-[9px] font-mono uppercase tracking-widest text-accent-secondary">DEViLBOX Synths</div>
              {devilboxProductsLoading && (
                <div className="text-[10px] text-text-muted text-center py-2">Loading…</div>
              )}
              {devilboxProducts.map((product) => (
                <ProductTile
                  key={product.id}
                  label={product.name}
                  presetCount={product.presetCount}
                  selected={selectedDevilboxSynth === product.id}
                  onClick={() => handleSelectDevilboxProduct(product)}
                  fallbackLabel="🎛️"
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-dark-border bg-dark-bgSecondary flex-shrink-0">
            <input
              type="text"
              value={searchInput}
              onChange={handleSearchChange}
              placeholder={selectedDevilboxSynth ? 'Search factory presets…' : 'Search presets…'}
              className="flex-1 min-w-0 bg-dark-bgTertiary border border-dark-borderLight rounded px-2 py-0.5 text-[11px] text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50"
            />

            {isHelmSelected && (
              <select
                value={devilboxCategory}
                onChange={handleCategoryChange}
                className="bg-dark-bgTertiary border border-dark-borderLight rounded px-1 py-0.5 text-[10px] text-text-secondary font-mono focus:outline-none"
              >
                <option value="">All Categories</option>
                {HELM_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            )}

            {!selectedDevilboxSynth && types.length > 0 && (
              <select
                value={filterType}
                onChange={(event) => setFilterType(event.target.value)}
                className="bg-dark-bgTertiary border border-dark-borderLight rounded px-1 py-0.5 text-[10px] text-text-secondary font-mono focus:outline-none"
              >
                <option value="">All Types</option>
                {types.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            )}

            {!selectedDevilboxSynth && characters.length > 0 && (
              <select
                value={filterCharacter}
                onChange={(event) => setFilterCharacter(event.target.value)}
                className="bg-dark-bgTertiary border border-dark-borderLight rounded px-1 py-0.5 text-[10px] text-text-secondary font-mono focus:outline-none"
              >
                <option value="">All Characters</option>
                {characters.map((character) => <option key={character} value={character}>{character}</option>)}
              </select>
            )}

            {hasFilters && (
              <button
                onClick={handleReset}
                className="text-[9px] px-1.5 py-0.5 rounded bg-accent-error/20 text-accent-error border border-accent-error/30 flex-shrink-0"
              >
                Clear
              </button>
            )}

            <span className="text-[9px] text-text-muted flex-shrink-0">
              {displayedTotal.toLocaleString()}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
            {displayedPresets.length === 0 && !displayedLoading && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted py-12">
                {selectedDevilboxSynth ? (
                  <>
                    <div className="text-[13px] font-medium text-text-secondary">No factory presets match</div>
                    <div className="text-[11px] text-center max-w-xs leading-relaxed">
                      Adjust the search or category filter to browse the bundled {selectedDevilboxProduct?.name} presets.
                    </div>
                  </>
                ) : status?.presetCount === 0 ? (
                  <>
                    <div className="text-[13px] font-medium text-text-secondary">NKS Library is empty</div>
                    <div className="text-[11px] text-center max-w-xs leading-relaxed">
                      Install NKS instruments via <span className="text-accent-primary">Native Access</span> to
                      populate the browser, or use the <span className="text-accent-secondary">DEViLBOX Synths</span> section for bundled presets.
                    </div>
                    <div className="text-[9px] font-mono text-text-muted/70 text-center">
                      Komplete Kontrol/Browser Data/komplete.db3
                    </div>
                  </>
                ) : (
                  <div className="text-[12px]">No presets match</div>
                )}
              </div>
            )}

            {displayedPresets.map((preset) => (
              'path' in preset ? (
                <DevilboxPresetRow
                  key={preset.id}
                  preset={preset}
                  onLoad={handleLoadDevilboxPreset}
                />
              ) : (
                <NKSPresetRow
                  key={preset.id}
                  preset={preset}
                  onLoad={handleLoadNKSPreset}
                />
              )
            ))}

            {displayedLoading && (
              <div className="text-[10px] text-text-muted text-center py-3">Loading…</div>
            )}

            {!selectedDevilboxSynth && !presetsLoading && presetsOffset < presetsTotal && (
              <button
                className="w-full text-[10px] text-text-muted py-2 hover:text-text-secondary"
                onClick={() => loadPresets(true)}
              >
                Load more ({presetsTotal - presetsOffset} remaining)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
