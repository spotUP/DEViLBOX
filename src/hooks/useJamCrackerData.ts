/**
 * useJamCrackerData — loads JamCracker pattern data from the WASM engine and
 * tracks playback position, returning everything JamCrackerView needs.
 *
 * Flow:
 *   1. Watch jamCrackerFileData in FormatStore
 *   2. Load it into JamCrackerEngine (await loadTune)
 *   3. Fetch song structure (getSongStructure) → songInfo + entries
 *   4. Fetch pattern data for current position (getPatternData) → channels
 *   5. Subscribe to position updates → activePos / currentRow / isPlaying
 *   6. Expose refreshPatternData so cell edits can re-fetch
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useFormatStore } from '@stores/useFormatStore';
import { useTransportStore } from '@stores/useTransportStore';
import { JamCrackerEngine } from '@engine/jamcracker/JamCrackerEngine';
import { jcToChannels } from '@/components/jamcracker/jamcrackerAdapter';
import type { JCSongInfo, JCPatternData } from '@/components/jamcracker/jamcrackerAdapter';
import type { FormatChannel } from '@/components/shared/format-editor-types';

export interface UseJamCrackerDataResult {
  /** Song-level metadata returned by the WASM engine */
  songInfo: JCSongInfo | null;
  /** Pattern data converted to format-agnostic FormatChannel[] for the editor */
  channels: FormatChannel[];
  /** Set the edit cursor position (ignored during playback) */
  setEditPos: (pos: number) => void;
  /** Currently visible song-order position (playback pos during play, edit pos at rest) */
  activePos: number;
  /** Current row within the active pattern */
  currentRow: number;
  /** Whether playback is active */
  isPlaying: boolean;
  /** Pattern index at activePos (-1 if unknown) */
  patIdx: number;
  /** Number of rows in the current pattern */
  numRows: number;
  /** Re-fetch pattern data from the engine (call after a cell edit) */
  refreshPatternData: () => void;
}

export function useJamCrackerData(): UseJamCrackerDataResult {
  const jamCrackerFileData = useFormatStore(s => s.jamCrackerFileData);
  const isPlaying = useTransportStore(s => s.isPlaying);

  const [songInfo, setSongInfo] = useState<JCSongInfo | null>(null);
  const [channels, setChannels] = useState<FormatChannel[]>([]);
  const [editPos, setEditPos] = useState(0);
  const [playPos, setPlayPos] = useState(0);
  const [currentRow, setCurrentRow] = useState(0);
  const [patIdx, setPatIdx] = useState(-1);
  const [numRows, setNumRows] = useState(0);

  // Keep refs so callbacks don't re-register on every render
  const songInfoRef = useRef<JCSongInfo | null>(null);
  const patIdxRef = useRef(-1);

  const activePos = isPlaying ? playPos : editPos;

  // Derive pattern index from song order entries + active position
  const getPatIdxForPos = useCallback((info: JCSongInfo, pos: number): number => {
    if (!info.entries || pos < 0 || pos >= info.entries.length) return -1;
    return info.entries[pos] ?? -1;
  }, []);

  const loadPatternData = useCallback(async (info: JCSongInfo, pos: number) => {
    const pidx = getPatIdxForPos(info, pos);
    if (pidx < 0) {
      setChannels([]);
      setPatIdx(-1);
      setNumRows(0);
      return;
    }

    if (!JamCrackerEngine.hasInstance()) return;
    const engine = JamCrackerEngine.getInstance();

    try {
      const data: JCPatternData = await engine.getPatternData(pidx);
      const rows = data.numRows || 0;
      setPatIdx(pidx);
      patIdxRef.current = pidx;
      setNumRows(rows);
      setChannels(jcToChannels(data, rows));
    } catch (err) {
      console.error('[useJamCrackerData] getPatternData failed:', err);
      setChannels([]);
    }
  }, [getPatIdxForPos]);

  const refreshPatternData = useCallback(() => {
    const info = songInfoRef.current;
    if (!info) return;
    const pos = isPlaying ? playPos : editPos;
    loadPatternData(info, pos);
  }, [isPlaying, playPos, editPos, loadPatternData]);

  // Main effect: load file data → engine → song structure → pattern data
  useEffect(() => {
    if (!jamCrackerFileData) {
      setSongInfo(null);
      setChannels([]);
      setPatIdx(-1);
      setNumRows(0);
      songInfoRef.current = null;
      return;
    }

    let cancelled = false;
    let unsubPos: (() => void) | null = null;

    (async () => {
      try {
        const engine = JamCrackerEngine.getInstance();
        await engine.ready();
        if (cancelled) return;

        // Load the tune — resolves once the WASM 'loaded' message arrives
        await engine.loadTune(jamCrackerFileData.slice(0));
        if (cancelled) return;

        // Fetch song structure
        const structure = await engine.getSongStructure();
        if (cancelled) return;

        const info: JCSongInfo = {
          songLen: structure.songLen,
          numPats: structure.numPats,
          numInst: structure.numInst,
          entries: structure.entries,
        };
        setSongInfo(info);
        songInfoRef.current = info;

        // Fetch initial pattern data for position 0
        await loadPatternData(info, 0);
        if (cancelled) return;

        // Subscribe to position updates from WASM engine
        unsubPos = engine.onPositionUpdate((update) => {
          if (cancelled) return;
          setPlayPos(update.songPos);
          setCurrentRow(update.row);

          // Update pattern data when song position changes
          const pidx = getPatIdxForPos(info, update.songPos);
          if (pidx !== patIdxRef.current && pidx >= 0) {
            loadPatternData(info, update.songPos);
          }
        });
      } catch (err) {
        console.error('[useJamCrackerData] Failed to load:', err);
      }
    })();

    return () => {
      cancelled = true;
      unsubPos?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jamCrackerFileData]);

  // When edit position changes while stopped, reload pattern data
  useEffect(() => {
    if (isPlaying) return;
    const info = songInfoRef.current;
    if (!info) return;
    loadPatternData(info, editPos);
  }, [editPos, isPlaying, loadPatternData]);

  return {
    songInfo,
    channels,
    setEditPos,
    activePos,
    currentRow,
    isPlaying,
    patIdx,
    numRows,
    refreshPatternData,
  };
}
