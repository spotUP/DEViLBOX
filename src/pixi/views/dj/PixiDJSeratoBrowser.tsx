/**
 * PixiDJSeratoBrowser — GL-native Serato library browser for the DJ view.
 *
 * GL port of src/components/dj/DJSeratoBrowser.tsx.
 * Renders entirely in Pixi — no DOM elements. Uses PixiList for virtual-scrolled
 * track list, PixiSelect for crate filtering, PixiPureTextInput for search.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { usePixiTheme } from '../../theme';
import { Div } from '../../layout';
import { PIXI_FONTS } from '../../fonts';
import { PixiButton } from '../../components/PixiButton';
import { PixiList } from '../../components/PixiList';
import { PixiSelect, type SelectOption } from '../../components/PixiSelect';
import { PixiPureTextInput } from '../../input/PixiPureTextInput';
import { PixiLabel } from '../../components/PixiLabel';
import {
  pickAndReadSeratoLibrary,
  autoDetectSeratoLibrary,
  type SeratoLibrary,
  type SeratoTrack,
} from '@/lib/serato';
import { useDJStore } from '@/stores/useDJStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey = 'title' | 'artist' | 'bpm' | 'key' | 'duration';
type SortDir = 'asc' | 'desc';

interface PixiDJSeratoBrowserProps {
  visible?: boolean;
  onLoadTrackToDevice?: (track: SeratoTrack, deckId: 'A' | 'B' | 'C') => void;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PANEL_W = 780;
const PANEL_H = 280;
const HEADER_H = 28;
const FILTER_H = 28;
const COL_HEADER_H = 22;
const PAD = 6;
const ROW_H = 26;

// Column widths
const COL_TITLE_W = 240;
const COL_ARTIST_W = 160;
const COL_BPM_W = 50;
const COL_KEY_W = 50;
const COL_DUR_W = 50;

// Colors
const PURPLE = 0x9333ea;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Column header definitions
// ---------------------------------------------------------------------------

const COLUMNS: { key: SortKey; label: string; width: number }[] = [
  { key: 'title', label: 'Title', width: COL_TITLE_W },
  { key: 'artist', label: 'Artist', width: COL_ARTIST_W },
  { key: 'bpm', label: 'BPM', width: COL_BPM_W },
  { key: 'key', label: 'Key', width: COL_KEY_W },
  { key: 'duration', label: 'Len', width: COL_DUR_W },
];

// ---------------------------------------------------------------------------
// PixiDJSeratoBrowser
// ---------------------------------------------------------------------------

export const PixiDJSeratoBrowser: React.FC<PixiDJSeratoBrowserProps> = ({
  visible = true,
  onLoadTrackToDevice,
}) => {
  const theme = usePixiTheme();
  const [library, setLibrary] = useState<SeratoLibrary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCrate, setSelectedCrate] = useState<string>('');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [hoveredTrackIdx, setHoveredTrackIdx] = useState<number | null>(null);

  // Auto-detect on mount
  useEffect(() => {
    let cancelled = false;
    const tryAutoDetect = async () => {
      setLoading(true);
      try {
        const lib = await autoDetectSeratoLibrary();
        if (!cancelled && lib) setLibrary(lib);
      } catch {
        // Auto-detect failed — user will browse manually
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    tryAutoDetect();
    return () => { cancelled = true; };
  }, []);

  // Manual browse
  const handleBrowse = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lib = await pickAndReadSeratoLibrary();
      if (lib) setLibrary(lib);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open Serato library');
    } finally {
      setLoading(false);
    }
  }, []);

  // Crate filter options
  const crateOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [{ value: '', label: 'All Tracks' }];
    if (library) {
      for (const c of library.crates) {
        opts.push({ value: c.name, label: `${c.name} (${c.tracks.length})` });
      }
    }
    return opts;
  }, [library]);

  // Filtered + sorted tracks
  const filteredTracks = useMemo(() => {
    if (!library) return [];

    let tracks: SeratoTrack[];
    if (selectedCrate) {
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
    tracks = [...tracks].sort((a, b) => {
      switch (sortKey) {
        case 'bpm': return (a.bpm - b.bpm) * dir;
        case 'duration': return (a.duration - b.duration) * dir;
        case 'artist': return a.artist.localeCompare(b.artist) * dir;
        case 'key': return a.key.localeCompare(b.key) * dir;
        default: return a.title.localeCompare(b.title) * dir;
      }
    });

    return tracks;
  }, [library, selectedCrate, query, sortKey, sortDir]);

  // Sort toggle
  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  // Build list items for PixiList
  const listItems = useMemo(() => {
    return filteredTracks.map((t, i) => ({
      id: `${i}`,
      label: t.title || t.filePath.split(/[/\\]/).pop() || '(unknown)',
      sublabel: `${t.artist}  |  ${formatBPM(t.bpm)}  |  ${t.key || '--'}  |  ${formatDuration(t.duration)}`,
    }));
  }, [filteredTracks]);

  // Handle list item select — show deck buttons
  const handleTrackSelect = useCallback((id: string) => {
    setHoveredTrackIdx(parseInt(id, 10));
  }, []);

  // Load track to deck
  const handleLoadToDeck = useCallback((deckId: 'A' | 'B' | 'C') => {
    if (hoveredTrackIdx == null || !onLoadTrackToDevice) return;
    const track = filteredTracks[hoveredTrackIdx];
    if (track) onLoadTrackToDevice(track, deckId);
  }, [hoveredTrackIdx, filteredTracks, onLoadTrackToDevice]);

  const thirdDeckActive = useDJStore(s => s.thirdDeckActive);

  if (!visible) return null;

  const listH = PANEL_H - HEADER_H - FILTER_H - COL_HEADER_H - PAD * 2;
  const listW = PANEL_W - PAD * 2;

  // ── Setup screen (no library loaded) ─────────────────────────────────
  if (!library && !loading) {
    return (
      <Div layout={{
        width: PANEL_W,
        height: PANEL_H,
        flexDirection: 'column',
        backgroundColor: theme.bgSecondary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 6,
        padding: PAD,
      }}>
        {/* Header */}
        <Div layout={{
          width: PANEL_W - PAD * 2,
          height: HEADER_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}>
          <PixiLabel text="SERATO" size="sm" weight="bold" font="mono" color="custom" customColor={PURPLE} />
        </Div>

        {error && (
          <Div layout={{
            width: PANEL_W - PAD * 2,
            padding: 6,
            backgroundColor: 0x2a0808,
            borderWidth: 1,
            borderColor: theme.error.color,
            borderRadius: 4,
            marginBottom: 4,
          }}>
            <PixiLabel text={error} size="xs" font="mono" color="error" />
          </Div>
        )}

        {/* Center content */}
        <Div layout={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}>
          <PixiLabel text="Connect your Serato library" size="xs" font="mono" color="textMuted" />
          <PixiButton
            label="Browse for _Serato_ folder"
            variant="default"
            size="sm"
            color="purple"
            onClick={handleBrowse}
          />
          <PixiLabel text="Usually at ~/Music/_Serato_" size="xs" font="mono" color="textMuted" layout={{ marginTop: 4 }} />
        </Div>
      </Div>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────
  if (loading) {
    return (
      <Div layout={{
        width: PANEL_W,
        height: PANEL_H,
        flexDirection: 'column',
        backgroundColor: theme.bgSecondary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 6,
        padding: PAD,
      }}>
        <Div layout={{
          width: PANEL_W - PAD * 2,
          height: HEADER_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}>
          <PixiLabel text="SERATO" size="sm" weight="bold" font="mono" color="custom" customColor={PURPLE} />
        </Div>
        <Div layout={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <PixiLabel text="Reading Serato library..." size="xs" font="mono" color="textMuted" />
        </Div>
      </Div>
    );
  }

  // ── Main library view ────────────────────────────────────────────────
  return (
    <Div layout={{
      width: PANEL_W,
      height: PANEL_H,
      flexDirection: 'column',
      backgroundColor: theme.bgSecondary.color,
      borderWidth: 1,
      borderColor: theme.border.color,
      borderRadius: 6,
      padding: PAD,
      gap: 2,
    }}>
      {/* Header row */}
      <Div layout={{
        width: PANEL_W - PAD * 2,
        height: HEADER_H,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}>
        <PixiLabel text="SERATO" size="sm" weight="bold" font="mono" color="custom" customColor={PURPLE} />
        <PixiLabel
          text={`${library!.tracks.length.toLocaleString()} tracks${library!.crates.length > 0 ? ` / ${library!.crates.length} crates` : ''}`}
          size="xs"
          font="mono"
          color="textMuted"
        />
        <Div layout={{ flex: 1 }} />
        <PixiButton
          label="Reload"
          variant="ghost"
          size="sm"
          onClick={handleBrowse}
        />
        {/* Deck load buttons (visible when a track is selected) */}
        {hoveredTrackIdx != null && onLoadTrackToDevice && (
          <>
            <PixiButton label="Deck 1" variant="default" size="sm" color="blue" onClick={() => handleLoadToDeck('A')} />
            <PixiButton label="Deck 2" variant="default" size="sm" color="red" onClick={() => handleLoadToDeck('B')} />
            {thirdDeckActive && (
              <PixiButton label="Deck 3" variant="default" size="sm" color="green" onClick={() => handleLoadToDeck('C')} />
            )}
          </>
        )}
      </Div>

      {error && (
        <Div layout={{
          width: PANEL_W - PAD * 2,
          padding: 6,
          backgroundColor: 0x2a0808,
          borderWidth: 1,
          borderColor: theme.error.color,
          borderRadius: 4,
        }}>
          <PixiLabel text={error} size="xs" font="mono" color="error" />
        </Div>
      )}

      {/* Search + crate filter row */}
      <Div layout={{
        width: PANEL_W - PAD * 2,
        height: FILTER_H,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}>
        <PixiPureTextInput
          value={query}
          onChange={setQuery}
          placeholder="Search tracks..."
          width={300}
          height={22}
          fontSize={11}
          font="mono"
        />
        <PixiSelect
          options={crateOptions}
          value={selectedCrate}
          onChange={setSelectedCrate}
          width={180}
          height={22}
          placeholder="All Tracks"
        />
      </Div>

      {/* Column headers */}
      <Div layout={{
        width: PANEL_W - PAD * 2,
        height: COL_HEADER_H,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderColor: theme.borderLight.color,
        gap: 4,
        paddingLeft: 4,
      }}>
        {COLUMNS.map(col => (
          <Div
            key={col.key}
            eventMode="static"
            cursor="pointer"
            onPointerUp={() => toggleSort(col.key)}
            layout={{
              width: col.width,
              height: COL_HEADER_H,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <pixiBitmapText
              text={`${col.label}${sortKey === col.key ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''}`}
              style={{
                fontFamily: PIXI_FONTS.MONO,
                fontSize: 12,
                fill: 0xffffff,
              }}
              tint={sortKey === col.key ? PURPLE : theme.textMuted.color}
              layout={{}}
            />
          </Div>
        ))}
      </Div>

      {/* Track list */}
      {filteredTracks.length === 0 ? (
        <Div layout={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <PixiLabel
            text={query ? 'No matching tracks' : 'No tracks in this view'}
            size="xs"
            font="mono"
            color="textMuted"
          />
        </Div>
      ) : (
        <PixiList
          items={listItems}
          width={listW}
          height={listH}
          itemHeight={ROW_H}
          selectedId={hoveredTrackIdx != null ? `${hoveredTrackIdx}` : null}
          onSelect={handleTrackSelect}
        />
      )}
    </Div>
  );
};

export default PixiDJSeratoBrowser;
