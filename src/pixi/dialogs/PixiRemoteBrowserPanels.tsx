/**
 * PixiRemoteBrowserPanels — GL-native Modland + HVSC remote browser panels.
 * Visually 1:1 with DOM FilePreviewPanel (ModlandPanel, HVSCPanel).
 *
 * Features: search bar, format filter (Modland), directory browsing (HVSC),
 * result list with download/load, pagination, loading states, error display.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { usePixiTheme } from '../theme';
import { useModalClose } from '@hooks/useDialogKeyboard';
import { Div, Txt } from '../layout';
import { PixiButton } from '../components/PixiButton';
import { PixiList } from '../components/PixiList';
import { PixiIcon } from '../components/PixiIcon';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { PixiSelect } from '../components/PixiSelect';
import type { SelectOption } from '../components/PixiSelect';
import {
  searchModland,
  getModlandFormats,
  downloadModlandFile,
  downloadTFMXCompanion,
  getModlandStatus,
  type ModlandFile,
  type ModlandFormat,
  type ModlandStatus,
} from '@/lib/modlandApi';
import {
  browseHVSC,
  downloadHVSCFile,
  searchHVSC,
  getFeaturedTunes,
  type HVSCEntry,
} from '@/lib/hvscApi';
import {
  batchGetRatings,
  setRating,
  removeRating,
  type RatingMap,
} from '@/lib/ratingsApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { PixiAuthModal } from './PixiAuthModal';
import type { PixiListItemRating } from '../components/PixiList';
import { tintBg } from '../colors';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const SEARCH_H = 40;
const ITEM_H = 38;
const PAD = 12;

// ---------------------------------------------------------------------------
// Modland Panel
// ---------------------------------------------------------------------------

interface ModlandPanelProps {
  isOpen: boolean;
  width: number;
  height: number;
  onLoadTrackerModule: (buffer: ArrayBuffer, filename: string) => Promise<void>;
  onClose: () => void;
}

const MODLAND_LIMIT = 50;

export const PixiModlandPanel: React.FC<ModlandPanelProps> = ({
  isOpen,
  width,
  height,
  onLoadTrackerModule,
  onClose,
}) => {
  const theme = usePixiTheme();

  useModalClose({ isOpen, onClose });

  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('');
  const [results, setResults] = useState<ModlandFile[]>([]);
  const [formats, setFormats] = useState<ModlandFormat[]>([]);
  const [status, setStatus] = useState<ModlandStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [ratings, setRatings] = useState<RatingMap>({});
  const [showAuthModal, setShowAuthModal] = useState(false);
  const isLoggedIn = useAuthStore(s => !!s.token);
  
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Fetch status + formats on open
  useEffect(() => {
    if (!isOpen) return;
    getModlandStatus().then(setStatus).catch(() => {});
    getModlandFormats().then(setFormats).catch(() => {});
  }, [isOpen]);

  const doSearch = useCallback(
    async (q: string, fmt: string, newOffset: number, append: boolean) => {
      if (!q && !fmt) {
        if (!append) setResults([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await searchModland({
          q: q || undefined,
          format: fmt || undefined,
          limit: MODLAND_LIMIT,
          offset: newOffset,
        });
        if (append) {
          setResults(prev => [...prev, ...data.results]);
        } else {
          setResults(data.results);
        }
        setHasMore(data.results.length === MODLAND_LIMIT);
        setOffset(newOffset);

        // Fetch ratings for new results
        const keys = data.results.map(r => r.full_path);
        if (keys.length > 0) {
          batchGetRatings('modland', keys).then(r => {
            setRatings(prev => append ? { ...prev, ...r } : r);
          }).catch(() => {});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(query, format, 0, false), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, format, doSearch]);

  const loadMore = useCallback(() => {
    doSearch(query, format, offset + MODLAND_LIMIT, true);
  }, [query, format, offset, doSearch]);

  const handleLoad = useCallback(async (file: ModlandFile) => {
    setLoading(true);
    setError(null);
    try {
      const [buffer, companion] = await Promise.all([
        downloadModlandFile(file.full_path),
        downloadTFMXCompanion(file.full_path),
      ]);
      if (companion) {
        const { UADEEngine } = await import('@engine/uade/UADEEngine');
        await UADEEngine.getInstance().addCompanionFile(companion.filename, companion.buffer);
      }
      await onLoadTrackerModule(buffer, file.filename);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download');
    } finally {
      setLoading(false);
    }
  }, [onLoadTrackerModule, onClose]);

  const handleRate = useCallback(async (id: string, star: number) => {
    if (!isLoggedIn) { setShowAuthModal(true); return; }
    const key = id; // id === full_path
    try {
      if (star === 0) {
        const res = await removeRating('modland', key);
        setRatings(prev => ({ ...prev, [key]: { avg: res.avg, count: res.count } }));
      } else {
        const res = await setRating('modland', key, star);
        setRatings(prev => ({ ...prev, [key]: { avg: res.avg, count: res.count, userRating: res.userRating } }));
      }
    } catch { /* ignore rating errors */ }
  }, [isLoggedIn]);

  // Format options for select — sorted alphabetically
  const formatOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [{ value: '', label: 'All formats' }];
    const sorted = [...formats].sort((a, b) => a.format.localeCompare(b.format));
    sorted.forEach(f => opts.push({ value: f.format, label: `${f.format} (${f.count.toLocaleString()})` }));
    return opts;
  }, [formats]);

  // List items from search results (with ratings)
  const listItems = useMemo(() =>
    results.map(file => {
      const r = ratings[file.full_path];
      // Also use server-returned avg_rating as fallback if batch hasn't loaded yet
      const ratingData = r || (file.avg_rating != null
        ? { avg: file.avg_rating, count: file.vote_count ?? 0 }
        : undefined);
      return {
        id: file.full_path,
        label: file.filename,
        sublabel: `${file.format} — ${file.author}`,
        dotColor: theme.success.color,
        rating: ratingData ? { avg: ratingData.avg, count: ratingData.count, userRating: r?.userRating } as PixiListItemRating : undefined,
      };
    }),
    [results, ratings],
  );

  const listH = height - SEARCH_H - PAD * 2;

  return (
    <>
    <Div layout={{ width, height, flexDirection: 'column' }}>
      {/* Search bar */}
      <Div
        layout={{
          width,
          height: SEARCH_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: PAD,
          paddingRight: PAD,
          backgroundColor: theme.bgTertiary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        {/* Status */}
        <Txt
          className="text-xs font-mono text-text-muted"
          layout={{}}
        >
          {status?.status === 'ready'
            ? `${status.totalFiles.toLocaleString()} files`
            : status?.status === 'indexing'
              ? 'Indexing...'
              : ''}
        </Txt>

        {/* Search input */}
        <PixiPureTextInput
          value={query}
          onChange={setQuery}
          placeholder="Search modules..."
          width={Math.max(100, width - 340)}
          height={26}
          fontSize={11}
        />

        {/* Format filter */}
        <PixiSelect
          options={formatOptions}
          value={format}
          onChange={setFormat}
          width={200}
          height={26}
          searchable
        />
      </Div>

      {/* Content */}
      <Div layout={{ flex: 1, padding: PAD, flexDirection: 'column' }}>
        {error && (
          <Div
            layout={{
              width: width - PAD * 2,
              padding: 8,
              marginBottom: 8,
              backgroundColor: tintBg(theme.error.color),
              borderWidth: 1,
              borderColor: theme.error.color,
              borderRadius: 4,
              flexDirection: 'row',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <PixiIcon name="warning" size={12} color={theme.error.color} layout={{}} />
            <Txt className="text-xs font-mono text-accent-error">
              {error}
            </Txt>
          </Div>
        )}

        {results.length === 0 && !loading ? (
          <Div layout={{ flex: 1, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 8 }}>
            <PixiIcon name="speaker" size={28} color={theme.textMuted.color} layout={{}} />
            <Txt className="text-sm font-mono text-text-muted">
              {query || format ? 'No results found' : 'Search the modland archive'}
            </Txt>
            <Txt className="text-xs font-mono text-text-muted" layout={{}}>
              165K+ tracker modules from ftp.modland.com
            </Txt>
          </Div>
        ) : (
          <Div layout={{ flexDirection: 'column', gap: 4 }}>
            <PixiList
              items={listItems}
              width={width - PAD * 2}
              height={listH - (hasMore ? 36 : 0)}
              itemHeight={ITEM_H}
              selectedId={null}
              onSelect={(id) => {
                const file = results.find(r => r.full_path === id);
                if (file) handleLoad(file);
              }}
              onRate={handleRate}
            />

            {hasMore && (
              <PixiButton
                label={loading ? 'Loading...' : 'Load more results'}
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={loadMore}
                layout={{ alignSelf: 'center', marginTop: 4 }}
              />
            )}
          </Div>
        )}

        {loading && results.length === 0 && (
          <Div layout={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Txt className="text-sm font-mono text-green-400">
              Loading...
            </Txt>
          </Div>
        )}
      </Div>
    </Div>
    <PixiAuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </>
  );
};

// ---------------------------------------------------------------------------
// HVSC Panel
// ---------------------------------------------------------------------------

interface HVSCPanelProps {
  isOpen: boolean;
  width: number;
  height: number;
  onLoadTrackerModule: (buffer: ArrayBuffer, filename: string) => Promise<void>;
  onClose: () => void;
}

export const PixiHVSCPanel: React.FC<HVSCPanelProps> = ({
  isOpen,
  width,
  height,
  onLoadTrackerModule,
  onClose,
}) => {
  const theme = usePixiTheme();

  useModalClose({ isOpen, onClose });

  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<HVSCEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HVSCEntry[]>([]);
  const [ratings, setRatings] = useState<RatingMap>({});
  const [showAuthModal, setShowAuthModal] = useState(false);
  const isLoggedIn = useAuthStore(s => !!s.token);
  
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Load featured tunes on open
  useEffect(() => {
    if (!isOpen) return;
    if (!path && !query) {
      setLoading(true);
      getFeaturedTunes()
        .then(tunes => { setEntries(tunes); setError(null); })
        .catch(err => setError(err instanceof Error ? err.message : 'Failed to load featured tunes'))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const browseDirectory = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await browseHVSC(p);
      setEntries(result.entries);
      setPath(p);
      setQuery('');
      setSearchResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to browse directory');
    } finally {
      setLoading(false);
    }
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q) {
      setSearchResults([]);
      if (!path) {
        getFeaturedTunes().then(setEntries).catch(() => {});
      } else {
        browseDirectory(path);
      }
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await searchHVSC(q, 100, 0);
      setSearchResults(res);

      // Fetch ratings for search results
      const keys = res.filter(e => !e.isDirectory).map(e => e.path);
      if (keys.length > 0) {
        batchGetRatings('hvsc', keys).then(setRatings).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [path, browseDirectory]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(query), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, doSearch]);

  const handleLoad = useCallback(async (entry: HVSCEntry) => {
    setLoading(true);
    setError(null);
    try {
      const buffer = await downloadHVSCFile(entry.path);
      const filename = entry.path.split('/').pop() || entry.name;
      await onLoadTrackerModule(buffer, filename);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download');
    } finally {
      setLoading(false);
    }
  }, [onLoadTrackerModule, onClose]);

  const handleEntryClick = useCallback((entry: HVSCEntry) => {
    if (entry.isDirectory) {
      browseDirectory(entry.path);
    } else {
      handleLoad(entry);
    }
  }, [browseDirectory, handleLoad]);

  const handleRate = useCallback(async (id: string, star: number) => {
    if (!isLoggedIn) { setShowAuthModal(true); return; }
    try {
      if (star === 0) {
        const res = await removeRating('hvsc', id);
        setRatings(prev => ({ ...prev, [id]: { avg: res.avg, count: res.count } }));
      } else {
        const res = await setRating('hvsc', id, star);
        setRatings(prev => ({ ...prev, [id]: { avg: res.avg, count: res.count, userRating: res.userRating } }));
      }
    } catch { /* ignore rating errors */ }
  }, [isLoggedIn]);

  // Build list items from either search results or browse entries
  const displayEntries = query ? searchResults : entries;

  const listItems = useMemo(() => {
    const items: { id: string; label: string; sublabel?: string; dotColor?: number; rating?: PixiListItemRating }[] = [];

    // Back button when browsing a directory
    if (path && !query) {
      items.push({
        id: '__back__',
        label: '..(back)',
        sublabel: '',
        dotColor: theme.textMuted.color,
      });
    }

    displayEntries.forEach(entry => {
      const r = ratings[entry.path];
      const ratingData = r || (entry.avg_rating != null
        ? { avg: entry.avg_rating, count: entry.vote_count ?? 0 }
        : undefined);
      items.push({
        id: entry.path,
        label: entry.name,
        sublabel: entry.isDirectory
          ? ''
          : `${entry.author ? `${entry.author} — ` : ''}${entry.size ? `${(entry.size / 1024).toFixed(1)} KB` : ''}`,
        dotColor: entry.isDirectory ? theme.accent.color : theme.textMuted.color,
        rating: !entry.isDirectory && ratingData
          ? { avg: ratingData.avg, count: ratingData.count, userRating: r?.userRating } as PixiListItemRating
          : undefined,
      });
    });

    return items;
  }, [displayEntries, path, query, ratings]);

  const listH = height - SEARCH_H - PAD * 2;

  return (
    <>
    <Div layout={{ width, height, flexDirection: 'column' }}>
      {/* Search bar */}
      <Div
        layout={{
          width,
          height: SEARCH_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: PAD,
          paddingRight: PAD,
          backgroundColor: theme.bgTertiary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiIcon name="speaker" size={12} color={theme.textMuted.color} layout={{}} />
        <Txt
          className="text-xs font-mono text-text-muted"
          layout={{}}
        >
          80K+ SID tunes
        </Txt>

        <PixiPureTextInput
          value={query}
          onChange={setQuery}
          placeholder="Search composers, songs..."
          width={Math.max(100, width - 280)}
          height={26}
          fontSize={11}
        />

        {path && (
          <Txt
            className="text-xs font-mono text-text-muted"
            layout={{ maxWidth: 200 }}
          >
            {path}
          </Txt>
        )}
      </Div>

      {/* Content */}
      <Div layout={{ flex: 1, padding: PAD, flexDirection: 'column' }}>
        {error && (
          <Div
            layout={{
              width: width - PAD * 2,
              padding: 8,
              marginBottom: 8,
              backgroundColor: tintBg(theme.error.color),
              borderWidth: 1,
              borderColor: theme.error.color,
              borderRadius: 4,
              flexDirection: 'row',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <PixiIcon name="warning" size={12} color={theme.error.color} layout={{}} />
            <Txt className="text-xs font-mono text-accent-error">
              {error}
            </Txt>
          </Div>
        )}

        {displayEntries.length === 0 && !loading ? (
          <Div layout={{ flex: 1, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 8 }}>
            <PixiIcon name="speaker" size={28} color={theme.textMuted.color} layout={{}} />
            <Txt className="text-sm font-mono text-text-muted">
              {query ? 'No results found' : 'Browse the HVSC collection'}
            </Txt>
            <Txt className="text-xs font-mono text-text-muted" layout={{}}>
              80K+ C64 SID tunes
            </Txt>
          </Div>
        ) : (
          <PixiList
            items={listItems}
            width={width - PAD * 2}
            height={listH}
            itemHeight={ITEM_H}
            selectedId={null}
            onSelect={(id) => {
              if (id === '__back__') {
                const parentPath = path.split('/').slice(0, -1).join('/');
                browseDirectory(parentPath);
                return;
              }
              const entry = displayEntries.find(e => e.path === id);
              if (entry) handleEntryClick(entry);
            }}
            onRate={handleRate}
          />
        )}

        {loading && displayEntries.length === 0 && (
          <Div layout={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Txt className="text-sm font-mono text-blue-400">
              Loading...
            </Txt>
          </Div>
        )}
      </Div>
    </Div>
    <PixiAuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </>
  );
};

// ---------------------------------------------------------------------------
// Unified Online Panel (merged Modland + HVSC)
// ---------------------------------------------------------------------------

type OnlineSearchSource = 'all' | 'modland' | 'hvsc';

interface OnlineResult {
  source: 'modland' | 'hvsc';
  key: string;
  filename: string;
  format: string;
  author: string;
  avg_rating?: number;
  vote_count?: number;
}

function modlandToOnlineResult(f: ModlandFile): OnlineResult {
  return { source: 'modland', key: f.full_path, filename: f.filename, format: f.format, author: f.author, avg_rating: f.avg_rating, vote_count: f.vote_count };
}

function hvscToOnlineResult(e: HVSCEntry): OnlineResult {
  return { source: 'hvsc', key: e.path, filename: e.name, format: 'SID', author: e.author || '', avg_rating: e.avg_rating, vote_count: e.vote_count };
}

interface OnlinePanelProps {
  isOpen: boolean;
  width: number;
  height: number;
  onLoadTrackerModule: (buffer: ArrayBuffer, filename: string) => Promise<void>;
  onClose: () => void;
}

const ONLINE_LIMIT = 50;

export const PixiOnlinePanel: React.FC<OnlinePanelProps> = ({
  isOpen,
  width,
  height,
  onLoadTrackerModule,
  onClose,
}) => {
  const theme = usePixiTheme();

  useModalClose({ isOpen, onClose });

  const [query, setQuery] = useState('');
  const [source, setSource] = useState<OnlineSearchSource>('all');
  const [format, setFormat] = useState('');
  const [results, setResults] = useState<OnlineResult[]>([]);
  const [formats, setFormats] = useState<ModlandFormat[]>([]);
  const [status, setStatus] = useState<ModlandStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [ratings, setRatings] = useState<RatingMap>({});
  const [showAuthModal, setShowAuthModal] = useState(false);
  const isLoggedIn = useAuthStore(s => !!s.token);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!isOpen) return;
    getModlandStatus().then(setStatus).catch(() => {});
    getModlandFormats().then(fmts => setFormats(fmts.sort((a, b) => a.format.localeCompare(b.format)))).catch(() => {});
  }, [isOpen]);

  const doSearch = useCallback(async (q: string, fmt: string, src: OnlineSearchSource, newOffset: number, append: boolean) => {
    if (!q && !fmt) {
      if (!append) setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let combined: OnlineResult[] = [];
      let moreResults = false;

      if (src === 'all' || src === 'modland') {
        const data = await searchModland({ q: q || undefined, format: fmt || undefined, limit: ONLINE_LIMIT, offset: newOffset });
        combined.push(...data.results.map(modlandToOnlineResult));
        if (data.results.length === ONLINE_LIMIT) moreResults = true;
      }

      if ((src === 'all' || src === 'hvsc') && q && !fmt) {
        try {
          const hvscResults = await searchHVSC(q, ONLINE_LIMIT, newOffset);
          combined.push(...hvscResults.filter(e => !e.isDirectory).map(hvscToOnlineResult));
          if (hvscResults.length === ONLINE_LIMIT) moreResults = true;
        } catch { /* HVSC may be unavailable */ }
      }

      if (src === 'all') combined.sort((a, b) => a.filename.localeCompare(b.filename));

      if (append) {
        setResults(prev => [...prev, ...combined]);
      } else {
        setResults(combined);
      }
      setHasMore(moreResults);
      setOffset(newOffset);

      const modlandKeys = combined.filter(r => r.source === 'modland').map(r => r.key);
      const hvscKeys = combined.filter(r => r.source === 'hvsc').map(r => r.key);
      const ratingPromises: Promise<RatingMap>[] = [];
      if (modlandKeys.length > 0) ratingPromises.push(batchGetRatings('modland', modlandKeys));
      if (hvscKeys.length > 0) ratingPromises.push(batchGetRatings('hvsc', hvscKeys));
      if (ratingPromises.length > 0) {
        Promise.all(ratingPromises).then(maps => {
          const merged = Object.assign({}, ...maps);
          setRatings(prev => append ? { ...prev, ...merged } : merged);
        }).catch(() => {});
      } else if (!append) {
        setRatings({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(query, format, source, 0, false), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, format, source, doSearch]);

  const loadMore = useCallback(() => {
    doSearch(query, format, source, offset + ONLINE_LIMIT, true);
  }, [query, format, source, offset, doSearch]);

  const handleLoad = useCallback(async (item: OnlineResult) => {
    setLoading(true);
    setError(null);
    try {
      let buffer: ArrayBuffer;
      if (item.source === 'hvsc') {
        buffer = await downloadHVSCFile(item.key);
      } else {
        const [modBuffer, companion] = await Promise.all([
          downloadModlandFile(item.key),
          downloadTFMXCompanion(item.key),
        ]);
        buffer = modBuffer;
        if (companion) {
          const { UADEEngine } = await import('@engine/uade/UADEEngine');
          await UADEEngine.getInstance().addCompanionFile(companion.filename, companion.buffer);
        }
      }
      await onLoadTrackerModule(buffer, item.filename);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download');
    } finally {
      setLoading(false);
    }
  }, [onLoadTrackerModule, onClose]);

  const handleRate = useCallback(async (id: string, star: number) => {
    if (!isLoggedIn) { setShowAuthModal(true); return; }
    const item = results.find(r => r.key === id);
    if (!item) return;
    try {
      if (star === 0) {
        const res = await removeRating(item.source, id);
        setRatings(prev => ({ ...prev, [id]: { avg: res.avg, count: res.count } }));
      } else {
        const res = await setRating(item.source, id, star);
        setRatings(prev => ({ ...prev, [id]: { avg: res.avg, count: res.count, userRating: res.userRating } }));
      }
    } catch { /* ignore */ }
  }, [isLoggedIn, results]);

  const sourceOptions: SelectOption[] = useMemo(() => [
    { value: 'all', label: 'All Sources' },
    { value: 'modland', label: 'Modland' },
    { value: 'hvsc', label: 'HVSC (SID)' },
  ], []);

  const formatOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [{ value: '', label: 'All formats' }];
    formats.forEach(f => opts.push({ value: f.format, label: `${f.format} (${f.count.toLocaleString()})` }));
    return opts;
  }, [formats]);

  const listItems = useMemo(() =>
    results.map(item => {
      const r = ratings[item.key];
      const ratingData = r || (item.avg_rating != null
        ? { avg: item.avg_rating, count: item.vote_count ?? 0 }
        : undefined);
      return {
        id: item.key,
        label: item.filename,
        sublabel: `${item.format} — ${item.author} (${item.source === 'hvsc' ? 'HVSC' : 'Modland'})`,
        dotColor: item.source === 'hvsc' ? theme.accent.color : theme.success.color,
        rating: ratingData ? { avg: ratingData.avg, count: ratingData.count, userRating: r?.userRating } as PixiListItemRating : undefined,
      };
    }),
    [results, ratings],
  );

  const listH = height - SEARCH_H - PAD * 2;

  return (
    <>
    <Div layout={{ width, height, flexDirection: 'column' }}>
      <Div
        layout={{
          width,
          height: SEARCH_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: PAD,
          paddingRight: PAD,
          backgroundColor: theme.bgTertiary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <Txt className="text-xs font-mono text-text-muted" layout={{}}>
          {status?.status === 'ready' ? `${status.totalFiles.toLocaleString()} files` : ''}
        </Txt>

        <PixiPureTextInput
          value={query}
          onChange={setQuery}
          placeholder="Search modules & SIDs..."
          width={Math.max(100, width - 500)}
          height={26}
          fontSize={11}
        />

        <PixiSelect
          options={sourceOptions}
          value={source}
          onChange={(v) => setSource(v as OnlineSearchSource)}
          width={120}
          height={26}
        />

        {source !== 'hvsc' && (
          <PixiSelect
            options={formatOptions}
            value={format}
            onChange={setFormat}
            width={200}
            height={26}
            searchable
          />
        )}
      </Div>

      <Div layout={{ flex: 1, padding: PAD, flexDirection: 'column' }}>
        {error && (
          <Div
            layout={{
              width: width - PAD * 2,
              padding: 8,
              marginBottom: 8,
              backgroundColor: tintBg(theme.error.color),
              borderWidth: 1,
              borderColor: theme.error.color,
              borderRadius: 4,
              flexDirection: 'row',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <PixiIcon name="warning" size={12} color={theme.error.color} layout={{}} />
            <Txt className="text-xs font-mono text-accent-error">{error}</Txt>
          </Div>
        )}

        {results.length === 0 && !loading ? (
          <Div layout={{ flex: 1, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 8 }}>
            <PixiIcon name="speaker" size={28} color={theme.textMuted.color} layout={{}} />
            <Txt className="text-sm font-mono text-text-muted">
              {query || format ? 'No results found' : 'Search online music archives'}
            </Txt>
            <Txt className="text-xs font-mono text-text-muted" layout={{}}>
              190K+ tracker modules &bull; 80K+ C64 SID tunes
            </Txt>
          </Div>
        ) : (
          <Div layout={{ flexDirection: 'column', gap: 4 }}>
            <PixiList
              items={listItems}
              width={width - PAD * 2}
              height={listH - (hasMore ? 36 : 0)}
              itemHeight={ITEM_H}
              selectedId={null}
              onSelect={(id) => {
                const item = results.find(r => r.key === id);
                if (item) handleLoad(item);
              }}
              onRate={handleRate}
            />

            {hasMore && (
              <PixiButton
                label={loading ? 'Loading...' : 'Load more results'}
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={loadMore}
                layout={{ alignSelf: 'center', marginTop: 4 }}
              />
            )}
          </Div>
        )}

        {loading && results.length === 0 && (
          <Div layout={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Txt className="text-sm font-mono text-accent-primary">Loading...</Txt>
          </Div>
        )}
      </Div>
    </Div>
    <PixiAuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </>
  );
};
