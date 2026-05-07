/**
 * NKSLibraryBrowser — Full NKS preset library browser
 *
 * Left sidebar: product list with artwork tiles
 * Right panel: preset grid with search, type/character filters
 *
 * Data comes from the server-side /api/nks/* endpoints which query
 * the komplete.db3 SQLite database maintained by Komplete Kontrol.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useNKSLibraryStore, type NKSPreset, type NKSProduct } from '@/stores/useNKSLibraryStore';

// ── Product tile ──────────────────────────────────────────────────────────────

const ProductTile = React.memo(({ product, selected, onClick }: {
  product: NKSProduct;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    className={`
      w-full flex items-center gap-2 px-2 py-1.5 text-left rounded
      transition-colors text-[11px] font-medium
      ${selected
        ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/40'
        : 'text-text-secondary hover:bg-dark-bgHover hover:text-text-primary border border-transparent'
      }
    `}
    onClick={onClick}
    title={`${product.name} (${product.presetCount} presets)`}
  >
    {/* Artwork thumbnail */}
    <div className="w-7 h-7 flex-shrink-0 rounded overflow-hidden bg-dark-bgTertiary border border-dark-border/50">
      {product.artworkUrl ? (
        <img
          src={product.artworkUrl}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-text-muted text-[8px]">
          NI
        </div>
      )}
    </div>
    {/* Name + count */}
    <div className="min-w-0">
      <div className="truncate capitalize">{product.name}</div>
      {product.presetCount > 0 && (
        <div className="text-[9px] text-text-muted">{product.presetCount} presets</div>
      )}
    </div>
  </button>
));

// ── Preset row ────────────────────────────────────────────────────────────────

const PresetRow = React.memo(({ preset, onLoad }: {
  preset: NKSPreset;
  onLoad: (preset: NKSPreset) => void;
}) => (
  <div
    className="flex items-center gap-2 px-3 py-1.5 hover:bg-dark-bgHover cursor-pointer group border-b border-dark-border/30"
    onDoubleClick={() => onLoad(preset)}
    title="Double-click to load"
  >
    {/* Device type badge */}
    <span className={`
      text-[8px] font-mono px-1 py-0.5 rounded flex-shrink-0
      ${preset.deviceType & 1 ? 'bg-accent-primary/20 text-accent-primary' : 'bg-accent-secondary/20 text-accent-secondary'}
    `}>
      {preset.deviceType & 1 ? 'INST' : 'FX'}
    </span>
    {/* Name */}
    <span className="text-[11px] text-text-primary truncate flex-1">{preset.name}</span>
    {/* Bank chain */}
    <span className="text-[9px] text-text-muted truncate max-w-[120px]">
      {[preset.bank, preset.subbank].filter(Boolean).join(' / ')}
    </span>
    {/* Types */}
    {preset.types && (
      <span className="text-[9px] text-accent-secondary/80 truncate max-w-[100px] hidden md:block">
        {preset.types.split(' / ')[0]}
      </span>
    )}
    {/* Load button */}
    <button
      className="opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary border border-accent-primary/40 flex-shrink-0"
      onClick={() => onLoad(preset)}
    >
      Load
    </button>
  </div>
));

// ── Main component ────────────────────────────────────────────────────────────

interface NKSLibraryBrowserProps {
  onLoadPreset?: (preset: NKSPreset) => void;
}

export const NKSLibraryBrowser: React.FC<NKSLibraryBrowserProps> = ({ onLoadPreset }) => {
  const {
    status, products, productsLoading,
    presets, presetsLoading, presetsTotal, presetsOffset,
    selectedProduct, searchQuery,
    filterType, filterCharacter,
    types, characters,
    loadStatus, loadProducts, loadPresets, loadTypes, loadCharacters,
    selectProduct, setSearch, setFilterType, setFilterCharacter, resetFilters,
  } = useNKSLibraryStore();

  const [searchInput, setSearchInput] = useState(searchQuery);
  const searchTimer = useRef<number | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    void loadStatus();
    void loadProducts();
    void loadTypes();
    void loadCharacters();
    void loadPresets();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => setSearch(val), 300);
  }, [setSearch]);

  // Infinite scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (presetsLoading) return;
    if (presetsOffset >= presetsTotal) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      void loadPresets(true);
    }
  }, [presetsLoading, presetsOffset, presetsTotal, loadPresets]);

  const handleLoadPreset = useCallback((preset: NKSPreset) => {
    onLoadPreset?.(preset);
  }, [onLoadPreset]);

  const hasFilters = !!(selectedProduct || searchQuery || filterType || filterCharacter);

  return (
    <div className="flex flex-col h-full bg-dark-bg text-text-primary overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-border bg-dark-bgSecondary flex-shrink-0">
        <span className="text-[11px] font-mono text-accent-primary font-semibold tracking-wider">NKS LIBRARY</span>
        {status && (
          <span className="text-[9px] text-text-muted ml-auto">
            {status.presetCount > 0
              ? `${status.presetCount.toLocaleString()} presets · ${status.productCount} products`
              : `${status.niResourcesProducts} products (library empty — install via Native Access)`
            }
          </span>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar — products */}
        <div className="w-52 flex-shrink-0 flex flex-col border-r border-dark-border bg-dark-bgSecondary overflow-hidden">
          <div className="px-2 py-1.5 border-b border-dark-border">
            <span className="text-[9px] font-mono text-text-muted uppercase tracking-widest">Products</span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border p-1 space-y-0.5">
            {/* All products option */}
            <button
              className={`w-full text-left px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                !selectedProduct
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
              }`}
              onClick={() => selectProduct(null)}
            >
              All Products
            </button>

            {productsLoading && (
              <div className="text-[10px] text-text-muted text-center py-2">Loading…</div>
            )}

            {products.map(p => (
              <ProductTile
                key={p.name}
                product={p}
                selected={selectedProduct === p.name}
                onClick={() => selectProduct(p.name)}
              />
            ))}
          </div>
        </div>

        {/* Right — filters + preset list */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Filter bar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-dark-border bg-dark-bgSecondary flex-shrink-0">
            {/* Search */}
            <input
              type="text"
              value={searchInput}
              onChange={handleSearchChange}
              placeholder="Search presets…"
              className="flex-1 min-w-0 bg-dark-bgTertiary border border-dark-borderLight rounded px-2 py-0.5 text-[11px] text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50"
            />

            {/* Type filter */}
            {types.length > 0 && (
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="bg-dark-bgTertiary border border-dark-borderLight rounded px-1 py-0.5 text-[10px] text-text-secondary font-mono focus:outline-none"
              >
                <option value="">All Types</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}

            {/* Character filter */}
            {characters.length > 0 && (
              <select
                value={filterCharacter}
                onChange={e => setFilterCharacter(e.target.value)}
                className="bg-dark-bgTertiary border border-dark-borderLight rounded px-1 py-0.5 text-[10px] text-text-secondary font-mono focus:outline-none"
              >
                <option value="">All Characters</option>
                {characters.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            {/* Clear */}
            {hasFilters && (
              <button
                onClick={resetFilters}
                className="text-[9px] px-1.5 py-0.5 rounded bg-accent-error/20 text-accent-error border border-accent-error/30 flex-shrink-0"
              >
                Clear
              </button>
            )}

            <span className="text-[9px] text-text-muted flex-shrink-0">
              {presetsTotal.toLocaleString()}
            </span>
          </div>

          {/* Preset list */}
          <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
            {presets.length === 0 && !presetsLoading && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted py-12">
                {status?.presetCount === 0 ? (
                  <>
                    <div className="text-[13px] font-medium text-text-secondary">NKS Library is empty</div>
                    <div className="text-[11px] text-center max-w-xs leading-relaxed">
                      Install NKS instruments via <span className="text-accent-primary">Native Access</span> to
                      populate the browser. The library is read from:
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

            {presets.map(preset => (
              <PresetRow
                key={preset.id}
                preset={preset}
                onLoad={handleLoadPreset}
              />
            ))}

            {presetsLoading && (
              <div className="text-[10px] text-text-muted text-center py-3">Loading…</div>
            )}

            {!presetsLoading && presetsOffset < presetsTotal && (
              <button
                className="w-full text-[10px] text-text-muted py-2 hover:text-text-secondary"
                onClick={() => loadPresets(true)}
              >
                Load more ({presetsTotal - presetsOffset} remaining)
              </button>
            )}

            <div ref={listEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};
