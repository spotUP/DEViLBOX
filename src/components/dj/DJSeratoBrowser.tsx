/**
 * DJSeratoBrowser - Browse and load tracks from a Serato DJ library
 *
 * Parses Serato's binary database and crate files, displays tracks
 * in a browsable list with crate sidebar. Tracks are loaded to decks
 * via the standard module loading pipeline.
 *
 * Note: This browser reads Serato's metadata (BPM, key, cue points)
 * but loads the audio files as tracker modules where possible.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Disc3, Search, Loader2, X, AlertCircle, FolderOpen, Music } from 'lucide-react';
import {
  pickAndReadSeratoLibrary,
  autoDetectSeratoLibrary,
  type SeratoLibrary,
  type SeratoTrack,
} from '@/lib/serato';
import { useDJStore } from '@/stores/useDJStore';

// ============================================================================
// TYPES
// ============================================================================

type SortKey = 'title' | 'artist' | 'bpm' | 'key' | 'duration' | 'genre';
type SortDir = 'asc' | 'desc';

interface DJSeratoBrowserProps {
  onClose?: () => void;
  onLoadTrackToDevice?: (track: SeratoTrack, deckId: 'A' | 'B' | 'C') => void;
}

// ============================================================================
// HELPERS
// ============================================================================

const SERATO_PATH_KEY = 'devilbox-serato-library-path';

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBPM(bpm: number): string {
  if (!bpm || bpm <= 0) return '--';
  return bpm.toFixed(1);
}

// ============================================================================
// COMPONENT
// ============================================================================

export const DJSeratoBrowser: React.FC<DJSeratoBrowserProps> = ({ onClose, onLoadTrackToDevice }) => {
  const [library, setLibrary] = useState<SeratoLibrary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCrate, setSelectedCrate] = useState<string | null>(null); // null = "All Tracks"
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Auto-detect on mount ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const tryAutoDetect = async () => {
      setLoading(true);
      try {
        const lib = await autoDetectSeratoLibrary();
        if (!cancelled && lib) {
          setLibrary(lib);
          localStorage.setItem(SERATO_PATH_KEY, lib.libraryPath);
        }
      } catch {
        // Auto-detect failed, that's OK
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    tryAutoDetect();
    return () => { cancelled = true; };
  }, []);

  // ── Manual browse ──────────────────────────────────────────────────────
  const handleBrowse = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lib = await pickAndReadSeratoLibrary();
      if (lib) {
        setLibrary(lib);
        localStorage.setItem(SERATO_PATH_KEY, lib.libraryPath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open Serato library');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Filtered + sorted tracks ───────────────────────────────────────────
  const filteredTracks = useMemo(() => {
    if (!library) return [];

    let tracks: SeratoTrack[];

    if (selectedCrate) {
      // Find crate and filter to its tracks
      const crate = library.crates.find(c => c.name === selectedCrate);
      if (!crate) return [];

      const cratePathSet = new Set(crate.tracks.map(p => p.toLowerCase()));
      tracks = library.tracks.filter(t =>
        cratePathSet.has(t.filePath.toLowerCase()) ||
        cratePathSet.has(t.filePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '')
      );
    } else {
      tracks = library.tracks;
    }

    // Search filter
    if (query) {
      const q = query.toLowerCase();
      tracks = tracks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        t.genre.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q)
      );
    }

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    tracks.sort((a, b) => {
      switch (sortKey) {
        case 'bpm': return (a.bpm - b.bpm) * dir;
        case 'duration': return (a.duration - b.duration) * dir;
        case 'artist': return a.artist.localeCompare(b.artist) * dir;
        case 'key': return a.key.localeCompare(b.key) * dir;
        case 'genre': return a.genre.localeCompare(b.genre) * dir;
        default: return a.title.localeCompare(b.title) * dir;
      }
    });

    return tracks;
  }, [library, selectedCrate, query, sortKey, sortDir]);

  // ── Sort toggle ────────────────────────────────────────────────────────
  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  // ── Not loaded yet — show setup ────────────────────────────────────────
  if (!library && !loading) {
    return (
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-3 max-h-[400px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Disc3 size={14} className="text-purple-400" />
            <h3 className="text-text-primary text-sm font-mono font-bold tracking-wider uppercase">
              Serato
            </h3>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
              <X size={14} />
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-mono px-2 py-1 bg-red-900/20 rounded border border-red-900/30">
            <AlertCircle size={10} />
            {error}
          </div>
        )}

        <div className="flex flex-col items-center justify-center py-6 text-text-muted">
          <Disc3 size={28} className="mb-3 opacity-40" />
          <p className="text-xs font-mono mb-3">Connect your Serato library</p>
          <button
            onClick={handleBrowse}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-900/30 border border-purple-700/50
                       rounded text-purple-300 text-xs font-mono hover:bg-purple-800/40 transition-colors"
          >
            <FolderOpen size={12} />
            Browse for _Serato_ folder
          </button>
          <p className="text-[10px] text-text-muted/60 mt-2 font-mono">
            Usually at ~/Music/_Serato_
          </p>
        </div>
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-2 max-h-[400px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Disc3 size={14} className="text-purple-400" />
            <h3 className="text-text-primary text-sm font-mono font-bold tracking-wider uppercase">Serato</h3>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1"><X size={14} /></button>
          )}
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-purple-400" />
          <span className="ml-2 text-xs font-mono text-text-muted">Reading Serato library...</span>
        </div>
      </div>
    );
  }

  // ── Main library view ──────────────────────────────────────────────────
  return (
    <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-2 max-h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Disc3 size={14} className="text-purple-400" />
          <h3 className="text-text-primary text-sm font-mono font-bold tracking-wider uppercase">
            Serato
          </h3>
          <span className="text-[10px] font-mono text-text-muted">
            {library!.tracks.length.toLocaleString()} tracks
            {library!.crates.length > 0 && ` / ${library!.crates.length} crates`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBrowse}
            className="text-text-muted hover:text-purple-400 p-1 transition-colors"
            title="Change Serato library"
          >
            <FolderOpen size={12} />
          </button>
          {onClose && (
            <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-mono px-2 py-1 bg-red-900/20 rounded border border-red-900/30">
          <AlertCircle size={10} />
          {error}
        </div>
      )}

      {/* Search + Crate filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tracks..."
            className="w-full pl-7 pr-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight
                       rounded text-text-primary placeholder:text-text-muted/40
                       focus:border-purple-600 focus:outline-none transition-colors"
          />
        </div>
        {/* Crate selector */}
        <select
          value={selectedCrate || ''}
          onChange={(e) => setSelectedCrate(e.target.value || null)}
          className="px-2 py-1.5 text-[10px] font-mono bg-dark-bg border border-dark-borderLight
                     rounded text-text-secondary cursor-pointer hover:bg-dark-bgHover transition-colors
                     max-w-[160px]"
        >
          <option value="">All Tracks</option>
          {library!.crates.map(c => (
            <option key={c.fileName} value={c.name}>
              {c.name} ({c.tracks.length})
            </option>
          ))}
        </select>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-mono text-text-muted border-b border-dark-borderLight">
        {([
          ['title', 'Title', 'flex-1 min-w-0'],
          ['artist', 'Artist', 'w-[120px]'],
          ['bpm', 'BPM', 'w-[50px] text-right'],
          ['key', 'Key', 'w-[40px]'],
          ['duration', 'Len', 'w-[40px] text-right'],
        ] as const).map(([key, label, cls]) => (
          <button
            key={key}
            onClick={() => toggleSort(key)}
            className={`${cls} hover:text-text-primary transition-colors text-left truncate ${
              sortKey === key ? 'text-purple-400' : ''
            }`}
          >
            {label}
            {sortKey === key && (
              <span className="ml-0.5">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
            )}
          </button>
        ))}
        <div className="w-[60px]" /> {/* space for deck buttons */}
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <Music size={24} className="mb-2 opacity-40" />
            <p className="text-xs font-mono">
              {query ? 'No matching tracks' : 'No tracks in this view'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filteredTracks.map((track, i) => (
              <div
                key={`${track.filePath}-${i}`}
                className="flex items-center gap-2 px-2 py-1.5 bg-dark-bg rounded border border-dark-borderLight
                           hover:border-dark-border transition-colors group"
              >
                <div className="flex-1 min-w-0 text-text-primary text-xs font-mono truncate">
                  {track.title || track.filePath.split(/[/\\]/).pop()}
                </div>
                <div className="w-[120px] text-text-muted text-[10px] font-mono truncate">
                  {track.artist}
                </div>
                <div className="w-[50px] text-right text-[10px] font-mono text-text-muted">
                  {formatBPM(track.bpm)}
                </div>
                <div className="w-[40px] text-[10px] font-mono text-text-muted">
                  {track.key || '--'}
                </div>
                <div className="w-[40px] text-right text-[10px] font-mono text-text-muted">
                  {formatDuration(track.duration)}
                </div>

                {/* Load to deck buttons */}
                {onLoadTrackToDevice ? (
                  <>
                    <button
                      onClick={() => onLoadTrackToDevice(track, 'A')}
                      className="px-2 py-1 text-[10px] font-mono font-bold rounded
                                 bg-blue-900/30 text-blue-400 border border-blue-800/50
                                 hover:bg-blue-800/40 hover:text-blue-300 transition-colors
                                 opacity-0 group-hover:opacity-100"
                    >
                      1
                    </button>
                    <button
                      onClick={() => onLoadTrackToDevice(track, 'B')}
                      className="px-2 py-1 text-[10px] font-mono font-bold rounded
                                 bg-red-900/30 text-red-400 border border-red-800/50
                                 hover:bg-red-800/40 hover:text-red-300 transition-colors
                                 opacity-0 group-hover:opacity-100"
                    >
                      2
                    </button>
                    {useDJStore.getState().thirdDeckActive && (
                      <button
                        onClick={() => onLoadTrackToDevice(track, 'C')}
                        className="px-2 py-1 text-[10px] font-mono font-bold rounded
                                   bg-emerald-900/30 text-emerald-400 border border-emerald-800/50
                                   hover:bg-emerald-800/40 hover:text-emerald-300 transition-colors
                                   opacity-0 group-hover:opacity-100"
                      >
                        3
                      </button>
                    )}
                  </>
                ) : (
                  <div className="w-[60px] flex justify-end gap-1">
                    <span className="text-[9px] font-mono text-text-muted/40 truncate">
                      {track.fileType || '--'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
