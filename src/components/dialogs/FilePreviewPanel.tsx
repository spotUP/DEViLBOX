/**
 * FilePreviewPanel - Remote file browsing panels (Modland + HVSC)
 * for the FileBrowser dialog.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, FileAudio, ArrowLeft, Globe, Search, Loader2, Download, AlertCircle } from 'lucide-react';
import { CustomSelect } from '@components/common/CustomSelect';
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
import { StarRating } from '@/components/shared/StarRating';
import { AuthModal } from '@/components/dialogs/AuthModal';

// ── Modland Panel ────────────────────────────────────────────────────────

interface ModlandPanelProps {
  isOpen: boolean;
  onLoadTrackerModule?: (buffer: ArrayBuffer, filename: string) => Promise<void>;
  onClose: () => void;
}

const MODLAND_LIMIT = 50;

export const ModlandPanel: React.FC<ModlandPanelProps> = ({ isOpen, onLoadTrackerModule, onClose }) => {
  const [modlandQuery, setModlandQuery] = useState('');
  const [modlandFormat, setModlandFormat] = useState('');
  const [modlandResults, setModlandResults] = useState<ModlandFile[]>([]);
  const [modlandFormats, setModlandFormats] = useState<ModlandFormat[]>([]);
  const [modlandStatus, setModlandStatus] = useState<ModlandStatus | null>(null);
  const [modlandLoading, setModlandLoading] = useState(false);
  const [modlandError, setModlandError] = useState<string | null>(null);
  const [modlandOffset, setModlandOffset] = useState(0);
  const [modlandHasMore, setModlandHasMore] = useState(false);
  const [modlandDownloading, setModlandDownloading] = useState<Set<string>>(new Set());
  const [modlandRatings, setModlandRatings] = useState<RatingMap>({});
  const [showAuthModal, setShowAuthModal] = useState(false);
  const isLoggedIn = useAuthStore(s => !!s.token);
  const modlandSearchTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const modlandSearchRef = useRef<HTMLInputElement>(null);

  // Fetch modland status + formats when tab activates
  useEffect(() => {
    if (!isOpen) return;
    getModlandStatus().then(setModlandStatus).catch((err) => console.warn('Modland status unavailable:', err));
    getModlandFormats().then(setModlandFormats).catch((err) => console.warn('Modland formats unavailable:', err));
    setTimeout(() => modlandSearchRef.current?.focus(), 100);
  }, [isOpen]);

  const doModlandSearch = useCallback(
    async (q: string, fmt: string, newOffset: number, append: boolean) => {
      if (!q && !fmt) {
        if (!append) setModlandResults([]);
        return;
      }
      setModlandLoading(true);
      setModlandError(null);
      try {
        const data = await searchModland({
          q: q || undefined,
          format: fmt || undefined,
          limit: MODLAND_LIMIT,
          offset: newOffset,
        });
        if (append) {
          setModlandResults((prev) => [...prev, ...data.results]);
        } else {
          setModlandResults(data.results);
        }
        setModlandHasMore(data.results.length === MODLAND_LIMIT);
        setModlandOffset(newOffset);

        // Fetch ratings
        const keys = data.results.map(r => r.full_path);
        if (keys.length > 0) {
          batchGetRatings('modland', keys).then(r => {
            setModlandRatings(prev => append ? { ...prev, ...r } : r);
          }).catch(() => {});
        }
      } catch (err) {
        setModlandError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setModlandLoading(false);
      }
    },
    [],
  );

  // Debounced search trigger
  useEffect(() => {
    if (modlandSearchTimer.current) clearTimeout(modlandSearchTimer.current);
    modlandSearchTimer.current = setTimeout(() => {
      doModlandSearch(modlandQuery, modlandFormat, 0, false);
    }, 300);
    return () => {
      if (modlandSearchTimer.current) clearTimeout(modlandSearchTimer.current);
    };
  }, [modlandQuery, modlandFormat, doModlandSearch]);

  const modlandLoadMore = useCallback(() => {
    doModlandSearch(modlandQuery, modlandFormat, modlandOffset + MODLAND_LIMIT, true);
  }, [modlandQuery, modlandFormat, modlandOffset, doModlandSearch]);

  const handleModlandLoad = useCallback(
    async (file: ModlandFile) => {
      if (!onLoadTrackerModule) return;
      setModlandDownloading((prev) => new Set(prev).add(file.full_path));
      setModlandError(null);
      try {
        // Download primary file and optional TFMX companion in parallel
        const [buffer, companion] = await Promise.all([
          downloadModlandFile(file.full_path),
          downloadTFMXCompanion(file.full_path),
        ]);

        // Pre-write companion to UADE WASM filesystem before loading
        if (companion) {
          const { UADEEngine } = await import('@engine/uade/UADEEngine');
          await UADEEngine.getInstance().addCompanionFile(companion.filename, companion.buffer);
        }

        await onLoadTrackerModule(buffer, file.filename);
        onClose();
      } catch (err) {
        setModlandError(err instanceof Error ? err.message : 'Failed to download');
      } finally {
        setModlandDownloading((prev) => {
          const next = new Set(prev);
          next.delete(file.full_path);
          return next;
        });
      }
    },
    [onLoadTrackerModule, onClose],
  );

  const handleModlandRate = useCallback(async (key: string, star: number) => {
    if (!isLoggedIn) { setShowAuthModal(true); return; }
    try {
      if (star === 0) {
        const res = await removeRating('modland', key);
        setModlandRatings(prev => ({ ...prev, [key]: { avg: res.avg, count: res.count } }));
      } else {
        const res = await setRating('modland', key, star);
        setModlandRatings(prev => ({ ...prev, [key]: { avg: res.avg, count: res.count, userRating: res.userRating } }));
      }
    } catch { /* ignore */ }
  }, [isLoggedIn]);

  return (
    <>
      {/* Modland search bar */}
      <div className="flex-shrink-0 px-4 py-2 bg-dark-bgTertiary border-b border-dark-border flex gap-2 items-center">
        <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
          {modlandStatus?.status === 'ready' && (
            <span>{modlandStatus.totalFiles.toLocaleString()} files</span>
          )}
          {modlandStatus?.status === 'indexing' && (
            <span className="text-amber-400 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Indexing...
            </span>
          )}
        </div>
        <div className="flex-1 relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={modlandSearchRef}
            value={modlandQuery}
            onChange={(e) => setModlandQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search modules..."
            className="w-full pl-7 pr-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight
                       rounded text-text-primary placeholder:text-text-muted/40
                       focus:border-green-600 focus:outline-none transition-colors"
          />
        </div>
        <CustomSelect
          value={modlandFormat}
          onChange={(v) => setModlandFormat(v)}
          options={[
            { value: '', label: 'All formats' },
            ...[...modlandFormats].sort((a, b) => a.format.localeCompare(b.format)).map((f) => ({
              value: f.format,
              label: `${f.format} (${f.count.toLocaleString()})`,
            })),
          ]}
          className="px-2 py-1.5 text-[11px] font-mono bg-dark-bg border border-dark-borderLight
                     rounded text-text-secondary cursor-pointer hover:bg-dark-bgHover transition-colors"
        />
      </div>

      {/* Modland results */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="flex flex-col gap-1">
          {modlandError && (
            <div className="flex items-center gap-1.5 text-accent-error text-xs font-mono px-3 py-2 mb-2 bg-accent-error/10 rounded border border-accent-error/20">
              <AlertCircle size={12} />
              {modlandError}
            </div>
          )}

          {modlandResults.length === 0 && !modlandLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted">
              <Globe size={32} className="mb-3 opacity-40" />
              <p className="text-sm font-mono">
                {modlandQuery || modlandFormat ? 'No results found' : 'Search the modland archive'}
              </p>
              <p className="text-xs text-text-muted/60 mt-1">
                165K+ tracker modules from ftp.modland.com
              </p>
            </div>
          ) : (
            <>
              {modlandResults.map((file) => (
                <div
                  key={file.full_path}
                  className="flex items-center gap-3 px-3 py-2 bg-dark-bgTertiary rounded border border-transparent
                             hover:bg-dark-bgHover hover:border-dark-border transition-colors group cursor-pointer"
                  onDoubleClick={() => handleModlandLoad(file)}
                >
                  <FileAudio size={16} className="text-text-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-text-primary text-sm font-mono truncate">
                      {file.filename}
                    </div>
                    <div className="flex gap-3 text-xs text-text-muted items-center">
                      <span className="text-green-400/70">{file.format}</span>
                      <span>{file.author}</span>
                    </div>
                  </div>

                  {/* Star rating */}
                  {(() => {
                    const r = modlandRatings[file.full_path];
                    const avg = r?.avg ?? file.avg_rating ?? 0;
                    const count = r?.count ?? file.vote_count ?? 0;
                    return (
                      <StarRating
                        avg={avg}
                        count={count}
                        userRating={r?.userRating}
                        onRate={(star) => handleModlandRate(file.full_path, star)}
                      />
                    );
                  })()}

                  {modlandDownloading.has(file.full_path) ? (
                    <Loader2 size={14} className="animate-spin text-green-400 flex-shrink-0" />
                  ) : (
                    <button
                      onClick={() => handleModlandLoad(file)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded
                                 bg-green-900/30 text-green-400 border border-green-800/50
                                 hover:bg-green-800/40 hover:text-green-300 transition-colors
                                 opacity-0 group-hover:opacity-100 flex-shrink-0"
                    >
                      <Download size={12} />
                      Load
                    </button>
                  )}
                </div>
              ))}

              {modlandHasMore && (
                <button
                  onClick={modlandLoadMore}
                  disabled={modlandLoading}
                  className="mt-2 py-2 text-xs font-mono text-text-secondary bg-dark-bgTertiary
                             border border-dark-borderLight rounded hover:bg-dark-bgHover
                             hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  {modlandLoading ? (
                    <span className="flex items-center justify-center gap-1">
                      <Loader2 size={12} className="animate-spin" /> Loading...
                    </span>
                  ) : (
                    'Load more results'
                  )}
                </button>
              )}
            </>
          )}

          {modlandLoading && modlandResults.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-green-400" />
            </div>
          )}
        </div>
      </div>
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </>
  );
};

interface HVSCPanelProps {
  isOpen: boolean;
  onLoadTrackerModule?: (buffer: ArrayBuffer, filename: string) => Promise<void>;
  onClose: () => void;
}

export const HVSCPanel: React.FC<HVSCPanelProps> = ({ isOpen, onLoadTrackerModule, onClose }) => {
  const [hvscPath, setHvscPath] = useState('');
  const [hvscEntries, setHvscEntries] = useState<HVSCEntry[]>([]);
  const [hvscLoading, setHvscLoading] = useState(false);
  const [hvscError, setHvscError] = useState<string | null>(null);
  const [hvscQuery, setHvscQuery] = useState('');
  const [hvscSearchResults, setHvscSearchResults] = useState<HVSCEntry[]>([]);
  const [hvscDownloading, setHvscDownloading] = useState<Set<string>>(new Set());
  const [hvscRatings, setHvscRatings] = useState<RatingMap>({});
  const [showAuthModal, setShowAuthModal] = useState(false);
  const isLoggedIn = useAuthStore(s => !!s.token);
  const hvscSearchRef = useRef<HTMLInputElement>(null);
  const hvscSearchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Fetch HVSC featured tunes when tab activates
  useEffect(() => {
    if (!isOpen) return;
    
    if (!hvscPath && !hvscQuery) {
      setHvscLoading(true);
      getFeaturedTunes()
        .then((tunes) => {
          setHvscEntries(tunes);
          setHvscError(null);
          const keys = tunes.filter(t => !t.isDirectory).map(t => t.path);
          if (keys.length > 0) batchGetRatings('hvsc', keys).then(r => setHvscRatings(prev => ({ ...prev, ...r }))).catch(() => {});
        })
        .catch((err) => {
          setHvscError(err instanceof Error ? err.message : 'Failed to load featured tunes');
        })
        .finally(() => setHvscLoading(false));
    }
    
    setTimeout(() => hvscSearchRef.current?.focus(), 100);
  }, [isOpen]);

  // Browse HVSC directory
  const browseHVSCDirectory = useCallback(async (path: string) => {
    setHvscLoading(true);
    setHvscError(null);
    try {
      const result = await browseHVSC(path);
      setHvscEntries(result.entries);
      setHvscPath(path);
      setHvscQuery('');
      setHvscSearchResults([]);
      const keys = result.entries.filter((e: HVSCEntry) => !e.isDirectory).map((e: HVSCEntry) => e.path);
      if (keys.length > 0) batchGetRatings('hvsc', keys).then(r => setHvscRatings(prev => ({ ...prev, ...r }))).catch(() => {});
    } catch (err) {
      setHvscError(err instanceof Error ? err.message : 'Failed to browse directory');
    } finally {
      setHvscLoading(false);
    }
  }, []);

  // Search HVSC
  const doHVSCSearch = useCallback(async (query: string) => {
    if (!query) {
      setHvscSearchResults([]);
      if (!hvscPath) {
        getFeaturedTunes().then(setHvscEntries).catch((err) => console.warn('HVSC featured tunes unavailable:', err));
      } else {
        browseHVSCDirectory(hvscPath);
      }
      return;
    }
    
    setHvscLoading(true);
    setHvscError(null);
    try {
      const results = await searchHVSC(query, 100, 0);
      setHvscSearchResults(results);

      // Fetch ratings
      const keys = results.filter(e => !e.isDirectory).map(e => e.path);
      if (keys.length > 0) {
        batchGetRatings('hvsc', keys).then(setHvscRatings).catch(() => {});
      }
    } catch (err) {
      setHvscError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setHvscLoading(false);
    }
  }, [hvscPath, browseHVSCDirectory]);

  // Debounced HVSC search
  useEffect(() => {
    if (hvscSearchTimer.current) clearTimeout(hvscSearchTimer.current);
    hvscSearchTimer.current = setTimeout(() => {
      doHVSCSearch(hvscQuery);
    }, 300);
    return () => {
      if (hvscSearchTimer.current) clearTimeout(hvscSearchTimer.current);
    };
  }, [hvscQuery, doHVSCSearch]);

  // Handle HVSC file download and load
  const handleHVSCLoad = useCallback(
    async (entry: HVSCEntry) => {
      if (!onLoadTrackerModule) return;
      setHvscDownloading((prev) => new Set(prev).add(entry.path));
      setHvscError(null);
      try {
        const buffer = await downloadHVSCFile(entry.path);
        const filename = entry.path.split('/').pop() || entry.name;
        await onLoadTrackerModule(buffer, filename);
        onClose();
      } catch (err) {
        setHvscError(err instanceof Error ? err.message : 'Failed to download');
      } finally {
        setHvscDownloading((prev) => {
          const next = new Set(prev);
          next.delete(entry.path);
          return next;
        });
      }
    },
    [onLoadTrackerModule, onClose],
  );

  // Handle HVSC directory navigation
  const handleHVSCDirectoryClick = useCallback((entry: HVSCEntry) => {
    if (entry.isDirectory) {
      browseHVSCDirectory(entry.path);
    } else {
      handleHVSCLoad(entry);
    }
  }, [browseHVSCDirectory, handleHVSCLoad]);

  const handleHvscRate = useCallback(async (key: string, star: number) => {
    if (!isLoggedIn) { setShowAuthModal(true); return; }
    try {
      if (star === 0) {
        const res = await removeRating('hvsc', key);
        setHvscRatings(prev => ({ ...prev, [key]: { avg: res.avg, count: res.count } }));
      } else {
        const res = await setRating('hvsc', key, star);
        setHvscRatings(prev => ({ ...prev, [key]: { avg: res.avg, count: res.count, userRating: res.userRating } }));
      }
    } catch { /* ignore */ }
  }, [isLoggedIn]);

  return (
    <>
      {/* HVSC search/browse bar */}
      <div className="flex-shrink-0 px-4 py-2 bg-dark-bgTertiary border-b border-dark-border flex gap-2 items-center">
        <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
          <FileAudio size={12} />
          <span>80K+ SID tunes</span>
        </div>
        <div className="flex-1 relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={hvscSearchRef}
            value={hvscQuery}
            onChange={(e) => setHvscQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search composers, songs..."
            className="w-full pl-7 pr-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight
                       rounded text-text-primary placeholder:text-text-muted/40
                       focus:border-blue-600 focus:outline-none transition-colors"
          />
        </div>
        {hvscPath && (
          <div className="text-xs text-text-muted font-mono truncate max-w-[200px]">
            {hvscPath}
          </div>
        )}
      </div>

      {/* HVSC content */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="flex flex-col gap-1">
          {hvscError && (
            <div className="flex items-center gap-1.5 text-accent-error text-xs font-mono px-3 py-2 mb-2 bg-accent-error/10 rounded border border-accent-error/20">
              <AlertCircle size={12} />
              {hvscError}
            </div>
          )}

          {/* Show search results if searching, otherwise show browse entries */}
          {hvscQuery ? (
            // Search results
            hvscSearchResults.length === 0 && !hvscLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                <FileAudio size={32} className="mb-3 opacity-40" />
                <p className="text-sm font-mono">No results found</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {hvscSearchResults.map((entry) => (
                  <div
                    key={entry.path}
                    className="flex items-center gap-3 px-3 py-2 bg-dark-bgTertiary rounded border border-transparent
                               hover:bg-dark-bgHover hover:border-dark-border transition-colors group cursor-pointer"
                    onClick={() => entry.isDirectory ? browseHVSCDirectory(entry.path) : handleHVSCLoad(entry)}
                  >
                    {entry.isDirectory ? (
                      <Folder size={16} className="text-blue-400 flex-shrink-0" />
                    ) : (
                      <FileAudio size={16} className="text-text-muted flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-text-primary text-sm font-mono truncate">
                        {entry.name}
                      </div>
                      <div className="flex text-xs text-text-muted truncate items-center gap-1">
                        <span>{entry.author ? `${entry.author} — ` : ''}{entry.path}</span>
                      </div>
                    </div>

                    {/* Star rating */}
                    {!entry.isDirectory && (() => {
                      const r = hvscRatings[entry.path];
                      const avg = r?.avg ?? entry.avg_rating ?? 0;
                      const count = r?.count ?? entry.vote_count ?? 0;
                      return (
                        <StarRating
                          avg={avg}
                          count={count}
                          userRating={r?.userRating}
                          onRate={(star) => handleHvscRate(entry.path, star)}
                        />
                      );
                    })()}

                    {!entry.isDirectory && (
                      hvscDownloading.has(entry.path) ? (
                        <Loader2 size={14} className="animate-spin text-blue-400 flex-shrink-0" />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleHVSCLoad(entry);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded
                                     bg-blue-900/30 text-blue-400 border border-blue-800/50
                                     hover:bg-blue-800/40 hover:text-blue-300 transition-colors
                                     opacity-0 group-hover:opacity-100 flex-shrink-0"
                        >
                          <Download size={12} />
                          Load
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            // Browse mode (featured or directory)
            hvscEntries.length === 0 && !hvscLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                <FileAudio size={32} className="mb-3 opacity-40" />
                <p className="text-sm font-mono">Browse the HVSC collection</p>
                <p className="text-xs text-text-muted/60 mt-1">
                  80K+ C64 SID tunes
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {/* Back button for directories */}
                {hvscPath && (
                  <div
                    className="flex items-center gap-3 px-3 py-2 bg-dark-bgTertiary/50 rounded border border-dark-borderLight
                               hover:bg-dark-bgHover hover:border-dark-border transition-colors cursor-pointer"
                    onClick={() => {
                      const parentPath = hvscPath.split('/').slice(0, -1).join('/');
                      browseHVSCDirectory(parentPath);
                    }}
                  >
                    <ArrowLeft size={16} className="text-text-muted" />
                    <span className="text-text-secondary text-sm font-mono">..(back)</span>
                  </div>
                )}

                {hvscEntries.map((entry) => (
                  <div
                    key={entry.path}
                    className="flex items-center gap-3 px-3 py-2 bg-dark-bgTertiary rounded border border-transparent
                               hover:bg-dark-bgHover hover:border-dark-border transition-colors group cursor-pointer"
                    onClick={() => handleHVSCDirectoryClick(entry)}
                  >
                    {entry.isDirectory ? (
                      <Folder size={16} className="text-blue-400 flex-shrink-0" />
                    ) : (
                      <FileAudio size={16} className="text-text-muted flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-text-primary text-sm font-mono truncate">
                        {entry.name}
                      </div>
                      {entry.size && (
                        <div className="text-xs text-text-muted">
                          {(entry.size / 1024).toFixed(1)} KB
                        </div>
                      )}
                    </div>

                    {/* Star rating */}
                    {!entry.isDirectory && (() => {
                      const r = hvscRatings[entry.path];
                      const avg = r?.avg ?? entry.avg_rating ?? 0;
                      const count = r?.count ?? entry.vote_count ?? 0;
                      return (
                        <StarRating
                          avg={avg}
                          count={count}
                          userRating={r?.userRating}
                          onRate={(star) => handleHvscRate(entry.path, star)}
                        />
                      );
                    })()}

                    {!entry.isDirectory && (
                      hvscDownloading.has(entry.path) ? (
                        <Loader2 size={14} className="animate-spin text-blue-400 flex-shrink-0" />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleHVSCLoad(entry);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded
                                     bg-blue-900/30 text-blue-400 border border-blue-800/50
                                     hover:bg-blue-800/40 hover:text-blue-300 transition-colors
                                     opacity-0 group-hover:opacity-100 flex-shrink-0"
                        >
                          <Download size={12} />
                          Load
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {hvscLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-blue-400" />
            </div>
          )}
        </div>
      </div>
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </>
  );
};
