/**
 * DJFileBrowser - File browser for loading tracker modules to DJ decks.
 *
 * Parses module files (MOD, XM, IT, S3M, Furnace) into TrackerSong objects
 * and loads them to the selected deck. Each entry shows BPM and duration.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Upload, Music, X, Loader2, ListPlus } from 'lucide-react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { detectBPM, estimateSongDuration } from '@/engine/dj/DJBeatDetector';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { isUADEFormat } from '@/lib/import/formats/UADEParser';
import { cacheSong } from '@/engine/dj/DJSongCache';
import { loadUADEToDeck, isUADECached } from '@/engine/dj/DJUADEPrerender';
import { getDJPipeline } from '@/engine/dj/DJPipeline';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import type { TrackerSong } from '@/engine/TrackerReplayer';

interface LoadedFile {
  name: string;
  song: TrackerSong;
  bpm: number;
  duration: number; // seconds
  format: string;
  rawBuffer?: ArrayBuffer; // Raw file buffer for pipeline rendering
  isUADE?: boolean;
  isCached?: boolean; // Whether module is pre-rendered in cache
}

interface DJFileBrowserProps {
  onClose?: () => void;
}

export const DJFileBrowser: React.FC<DJFileBrowserProps> = ({ onClose }) => {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'bpm' | 'format'>('name');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    setLoading(true);
    setError(null);

    const newFiles: LoadedFile[] = [];

    for (const file of Array.from(selectedFiles)) {
      try {
        const buffer = await file.arrayBuffer();
        const isUADE = isUADEFormat(file.name);

        const song = await parseModuleToSong(file);
        const bpmResult = detectBPM(song);
        const duration = estimateSongDuration(song);

        // Cache the parsed song for playlist deck-loading
        cacheSong(file.name, song);

        // Check if module is already pre-rendered in cache
        const cached = await isUADECached(buffer);

        newFiles.push({
          name: file.name,
          song,
          bpm: bpmResult.bpm,
          duration,
          format: file.name.split('.').pop()?.toUpperCase() ?? 'MOD',
          rawBuffer: buffer, // Store buffer for all formats (pipeline rendering)
          isUADE,
          isCached: cached,
        });
      } catch (err) {
        console.error(`[DJFileBrowser] Failed to parse ${file.name}:`, err);
        setError(`Failed to load ${file.name}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    setFiles(prev => [...prev, ...newFiles]);
    setLoading(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const loadToDeck = useCallback(async (file: LoadedFile, deckId: 'A' | 'B' | 'C') => {
    if (!file.song) return;

    const engine = getDJEngine();

    try {
      if (file.rawBuffer) {
        if (file.isUADE) {
          // UADE path — loadUADEToDeck now handles the full render + wait cycle
          const result = await loadUADEToDeck(
            engine, deckId, file.rawBuffer, file.name, true, file.bpm, file.song.name
          );
          setFiles(prev => prev.map(f =>
            f.name === file.name ? { ...f, isCached: result.cached } : f
          ));
        } else {
          // Non-UADE tracker (XM/IT/S3M/etc.) — also render FIRST, then load audio directly
          useDJStore.getState().setDeckState(deckId, {
            fileName: file.name,
            trackName: file.song.name || file.name,
            detectedBPM: file.bpm,
            effectiveBPM: file.bpm,
            analysisState: 'rendering',
            isPlaying: false,
          });

          const result = await getDJPipeline().loadOrEnqueue(file.rawBuffer, file.name, deckId, 'high');
          await engine.loadAudioToDeck(deckId, result.wavData, file.name, file.song.name || file.name, result.analysis?.bpm || file.bpm);
          console.log(`[DJFileBrowser] Loaded ${file.name} in audio mode (skipped tracker bugs)`);
        }
      } else {
        // This should not happen if rawBuffer is captured during selection
        console.warn(`[DJFileBrowser] No raw buffer for ${file.name}, cannot render for DJ mode`);
      }
    } catch (err) {
      console.error(`[DJFileBrowser] Failed to load ${file.name} to deck ${deckId}:`, err);
      setError(`Failed to load to deck: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const sortedFiles = [...files].sort((a, b) => {
    switch (sortBy) {
      case 'bpm': return a.bpm - b.bpm;
      case 'format': return a.format.localeCompare(b.format);
      default: return a.name.localeCompare(b.name);
    }
  });

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-3 flex flex-col gap-2 max-h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-text-primary text-sm font-mono font-bold tracking-wider uppercase">
          File Browser
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-bgTertiary border border-dark-borderLight
                       rounded text-text-secondary text-xs font-mono hover:bg-dark-bgHover hover:text-text-primary
                       transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {loading ? 'Loading...' : 'Add Files'}
          </button>
          {onClose && (
            <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
              <X size={14} />
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="*/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="text-red-400 text-[10px] font-mono px-2 py-1 bg-red-900/20 rounded border border-red-900/30">
          {error}
        </div>
      )}

      {/* Sort buttons */}
      <div className="flex gap-1 text-[10px] font-mono">
        {(['name', 'bpm', 'format'] as const).map(key => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`px-2 py-0.5 rounded transition-colors ${
              sortBy === key
                ? 'bg-dark-bgActive text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {key.toUpperCase()}
          </button>
        ))}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {sortedFiles.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <Music size={24} className="mb-2 opacity-40" />
            <p className="text-xs font-mono">Drop modules here or click Add Files</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {sortedFiles.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 px-2 py-1.5 bg-dark-bg rounded border border-dark-borderLight
                           hover:border-dark-border transition-colors group"
              >
                {/* File info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="text-text-primary text-xs font-mono truncate">{file.name}</div>
                    {file.isCached && (
                      <span className="text-[8px] font-mono px-1 py-0.5 bg-green-900/30 text-green-400 rounded border border-green-700/30">
                        CACHED
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 text-[10px] text-text-muted font-mono">
                    <span>{file.format}</span>
                    {file.bpm > 0 && <span>{file.bpm} BPM</span>}
                    {file.duration > 0 && <span>{formatDuration(file.duration)}</span>}
                  </div>
                </div>

                {/* Add to playlist */}
                <button
                  onClick={() => {
                    const playlistId = useDJPlaylistStore.getState().activePlaylistId;
                    if (!playlistId) return;
                    useDJPlaylistStore.getState().addTrack(playlistId, {
                      fileName: file.name,
                      trackName: file.song.name || file.name,
                      format: file.format,
                      bpm: file.bpm,
                      duration: file.duration,
                      addedAt: Date.now(),
                    });
                  }}
                  className="p-1 text-text-muted hover:text-amber-400 transition-colors
                             opacity-0 group-hover:opacity-100"
                  title="Add to active playlist"
                >
                  <ListPlus size={12} />
                </button>

                {/* Load buttons */}
                <button
                  onClick={() => loadToDeck(file, 'A')}
                  className="px-2 py-1 text-[10px] font-mono font-bold rounded
                             bg-blue-900/30 text-blue-400 border border-blue-800/50
                             hover:bg-blue-800/40 hover:text-blue-300 transition-colors
                             opacity-0 group-hover:opacity-100"
                >
                  1
                </button>
                <button
                  onClick={() => loadToDeck(file, 'B')}
                  className="px-2 py-1 text-[10px] font-mono font-bold rounded
                             bg-red-900/30 text-red-400 border border-red-800/50
                             hover:bg-red-800/40 hover:text-red-300 transition-colors
                             opacity-0 group-hover:opacity-100"
                >
                  2
                </button>
                {useDJStore.getState().thirdDeckActive && (
                  <button
                    onClick={() => loadToDeck(file, 'C')}
                    className="px-2 py-1 text-[10px] font-mono font-bold rounded
                               bg-emerald-900/30 text-emerald-400 border border-emerald-800/50
                               hover:bg-emerald-800/40 hover:text-emerald-300 transition-colors
                               opacity-0 group-hover:opacity-100"
                  >
                    3
                  </button>
                )}
                <button
                  onClick={() => removeFile(i)}
                  className="p-0.5 text-text-muted hover:text-accent-error transition-colors
                             opacity-0 group-hover:opacity-100"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
