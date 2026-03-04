/**
 * PixiRemotePatternView — Read-only pattern grid showing the peer's current pattern.
 * Matches the DOM RemotePatternView 1:1: FT2-style toolbar, channel headers,
 * playback position highlight, dynamic channel count, column visibility toggles,
 * and effect column support.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { PixiLabel, PixiButton } from '../../components';
import { PixiScrollView } from '../../components/PixiScrollView';
import { usePixiTheme } from '../../theme';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function formatNote(note: number): string {
  if (note <= 0) return '---';
  if (note === 97 || note === 255) return '===';
  const octave = Math.floor((note - 1) / 12);
  const name = NOTE_NAMES[(note - 1) % 12];
  return `${name}${octave}`;
}

function formatHex(val: number, digits: number): string {
  if (val <= 0) return '.'.repeat(digits);
  return val.toString(16).toUpperCase().padStart(digits, '0');
}

function formatEffect(effTyp: number, eff: number): string {
  if (effTyp <= 0 && eff <= 0) return '...';
  const t = effTyp > 0 ? effTyp.toString(16).toUpperCase() : '.';
  const p = eff > 0 ? eff.toString(16).toUpperCase().padStart(2, '0') : '..';
  return `${t}${p}`;
}

const ROW_HEIGHT = 16;
const CHAR_WIDTH = 7;
const ROW_NUM_WIDTH = 28;
const HEADER_HEIGHT = 32;
const TOOLBAR_ROW_HEIGHT = 18;
const TOOLBAR_HEIGHT = TOOLBAR_ROW_HEIGHT * 2 + 28; // 2 rows + friend indicator
const CHANNEL_HEADER_HEIGHT = 24;
const COLUMN_TOGGLE_HEIGHT = 20;
const COLLAPSED_WIDTH = 28;

const CHANNEL_COLORS = [
  0x4488ff, 0xff4488, 0x44ff88, 0xffaa44,
  0x8844ff, 0xff8844, 0x44ffaa, 0xaa44ff,
];

interface ColumnVisibility {
  note: boolean;
  inst: boolean;
  vol: boolean;
  fx: boolean;
}

export const PixiRemotePatternView: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const theme = usePixiTheme();
  const peerPatternIndex = useCollaborationStore(s => s.peerPatternIndex);
  const peerCursorRow = useCollaborationStore(s => s.peerCursorRow);
  const patterns = useTrackerStore(s => s.patterns);
  const patternOrder = useTrackerStore(s => s.patternOrder);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);
  const bpm = useTransportStore(s => s.bpm);
  const speed = useTransportStore(s => s.speed);

  const storeColVis = useTrackerStore(s => s.columnVisibility);
  const showAcid = storeColVis.flag1 || storeColVis.flag2;

  const [showColumns, setShowColumns] = useState<ColumnVisibility>({
    note: true, inst: true, vol: true, fx: false,
  });

  const toggleColumn = useCallback((col: keyof ColumnVisibility) => {
    setShowColumns(prev => ({ ...prev, [col]: !prev[col] }));
  }, []);

  const pattern = patterns[peerPatternIndex] ?? null;
  const channels = pattern ? pattern.channels : [];
  const channelCount = channels.length;
  const rowCount = pattern?.length ?? 0;
  const songLength = patternOrder.length;
  const contentHeight = rowCount * ROW_HEIGHT;

  // Compute per-channel cell width based on visible columns and collapsed state
  const channelWidths = useMemo(() => {
    return channels.map((ch) => {
      if (ch.collapsed) return COLLAPSED_WIDTH;
      let w = 4; // padding
      if (showColumns.note) w += CHAR_WIDTH * 3 + 4;
      if (showColumns.inst) w += CHAR_WIDTH * 2 + 4;
      if (showColumns.vol) w += CHAR_WIDTH * 2 + 4;
      if (showColumns.fx) w += CHAR_WIDTH * 3 + 4;
      if (showAcid) w += CHAR_WIDTH * 2 + 4;
      if (showColumns.fx) w += CHAR_WIDTH * 2 + 4; // probability when fx visible
      return Math.max(w, 24);
    });
  }, [channels, showColumns, showAcid]);

  const totalChannelsWidth = channelWidths.reduce((a, b) => a + b, 0);

  if (!pattern) {
    return (
      <layoutContainer
        layout={{
          width,
          height,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.bg.color,
        }}
      >
        <PixiLabel text="Waiting for friend's view..." size="sm" font="sans" color="textMuted" />
      </layoutContainer>
    );
  }

  const gridHeight = height - TOOLBAR_HEIGHT - CHANNEL_HEADER_HEIGHT - COLUMN_TOGGLE_HEIGHT;

  return (
    <layoutContainer
      layout={{
        flexDirection: 'column',
        width,
        height,
        backgroundColor: theme.bg.color,
      }}
    >
      {/* ── Read-only FT2 Toolbar ── */}
      <layoutContainer
        layout={{
          flexDirection: 'column',
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          backgroundColor: theme.bgSecondary.color,
        }}
      >
        {/* Friend indicator */}
        <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 16, marginBottom: 2 }}>
          <PixiLabel text="Friend's View" size="xs" weight="bold" color="accent" />
          <PixiLabel text="(read-only)" size="xs" color="textMuted" />
        </layoutContainer>

        {/* Row 1: Position, BPM, Pattern */}
        <layoutContainer layout={{ flexDirection: 'row', height: TOOLBAR_ROW_HEIGHT, gap: 16 }}>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <PixiLabel text="Pos:" size="xs" font="mono" color="textSecondary" />
            <PixiLabel text={String(currentPositionIndex).padStart(3, '0')} size="xs" font="mono" color="text" />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <PixiLabel text="BPM:" size="xs" font="mono" color="textSecondary" />
            <PixiLabel text={String(bpm).padStart(3, '0')} size="xs" font="mono" color="text" />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <PixiLabel text="Pat:" size="xs" font="mono" color="textSecondary" />
            <PixiLabel text={String(peerPatternIndex).padStart(3, '0')} size="xs" font="mono" color="text" />
          </layoutContainer>
        </layoutContainer>

        {/* Row 2: Song Length, Speed, Pattern Length */}
        <layoutContainer layout={{ flexDirection: 'row', height: TOOLBAR_ROW_HEIGHT, gap: 16 }}>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <PixiLabel text="Len:" size="xs" font="mono" color="textSecondary" />
            <PixiLabel text={String(songLength).padStart(3, '0')} size="xs" font="mono" color="text" />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <PixiLabel text="Spd:" size="xs" font="mono" color="textSecondary" />
            <PixiLabel text={String(speed).padStart(3, '0')} size="xs" font="mono" color="text" />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <PixiLabel text="Rows:" size="xs" font="mono" color="textSecondary" />
            <PixiLabel text={String(rowCount).padStart(3, '0')} size="xs" font="mono" color="text" />
          </layoutContainer>
          {isPlaying && (
            <PixiLabel text="PLAYING" size="xs" weight="bold" color="success" />
          )}
        </layoutContainer>
      </layoutContainer>

      {/* ── Column visibility toggles ── */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: COLUMN_TOGGLE_HEIGHT,
          alignItems: 'center',
          paddingLeft: 4,
          gap: 2,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <PixiLabel text="Show:" size="xs" font="sans" color="textMuted" layout={{ marginRight: 4 }} />
        <PixiButton
          label="Note"
          size="sm"
          variant={showColumns.note ? 'primary' : 'ghost'}
          onClick={() => toggleColumn('note')}
          height={16}
          layout={{ paddingLeft: 4, paddingRight: 4 }}
        />
        <PixiButton
          label="Inst"
          size="sm"
          variant={showColumns.inst ? 'primary' : 'ghost'}
          onClick={() => toggleColumn('inst')}
          height={16}
          layout={{ paddingLeft: 4, paddingRight: 4 }}
        />
        <PixiButton
          label="Vol"
          size="sm"
          variant={showColumns.vol ? 'primary' : 'ghost'}
          onClick={() => toggleColumn('vol')}
          height={16}
          layout={{ paddingLeft: 4, paddingRight: 4 }}
        />
        <PixiButton
          label="Fx"
          size="sm"
          variant={showColumns.fx ? 'primary' : 'ghost'}
          onClick={() => toggleColumn('fx')}
          height={16}
          layout={{ paddingLeft: 4, paddingRight: 4 }}
        />
      </layoutContainer>

      {/* ── Channel headers ── */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: CHANNEL_HEADER_HEIGHT,
          alignItems: 'center',
          paddingLeft: 2,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <layoutContainer layout={{ width: ROW_NUM_WIDTH }}>
          <PixiLabel text="ROW" size="xs" font="mono" color="textMuted" />
        </layoutContainer>
        {channels.map((ch, idx) => {
          const chColor = CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
          const tintBg = (chColor >> 2) & 0x3f3f3f;
          const w = channelWidths[idx];
          if (ch.collapsed) {
            return (
              <layoutContainer
                key={ch.id}
                layout={{
                  width: w,
                  height: CHANNEL_HEADER_HEIGHT,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: tintBg,
                }}
              >
                <PixiLabel
                  text={(idx + 1).toString().padStart(2, '0')}
                  size="xs"
                  font="mono"
                  color="textMuted"
                />
              </layoutContainer>
            );
          }
          return (
            <layoutContainer
              key={ch.id}
              layout={{
                width: w,
                height: CHANNEL_HEADER_HEIGHT,
                flexDirection: 'column',
                justifyContent: 'center',
                paddingLeft: 2,
                backgroundColor: tintBg,
              }}
            >
              <PixiLabel
                text={`${(idx + 1).toString().padStart(2, '0')} ${ch.shortName || ch.name || `CH${idx + 1}`}`}
                size="xs"
                font="mono"
                color={ch.muted ? 'textMuted' : 'textSecondary'}
              />
            </layoutContainer>
          );
        })}
      </layoutContainer>

      {/* ── Pattern grid ── */}
      {rowCount > 0 && (
        <PixiScrollView
          width={width}
          height={gridHeight}
          contentHeight={contentHeight}
          direction="vertical"
          showScrollbar={true}
        >
          <layoutContainer layout={{ flexDirection: 'column' }}>
            {Array.from({ length: rowCount }, (_, row) => {
              const isHighlight = row % 16 === 0;
              const isBeat = row % 4 === 0;
              const isPeerCursor = row === peerCursorRow;
              const isPlaybackRow = isPlaying && row === currentRow;

              let bgColor: number | undefined;
              if (isPlaybackRow) {
                bgColor = theme.accent.color;
              } else if (isPeerCursor) {
                bgColor = 0x2a4060;
              } else if (isHighlight) {
                bgColor = theme.trackerRowHighlight.color;
              } else if (isBeat) {
                bgColor = theme.trackerRowEven.color;
              }

              const textColor = isPlaybackRow ? 'custom' as const : undefined;
              const playbackTextCustomColor = isPlaybackRow ? 0x000000 : undefined;

              return (
                <layoutContainer
                  key={row}
                  layout={{
                    flexDirection: 'row',
                    height: ROW_HEIGHT,
                    alignItems: 'center',
                    paddingLeft: 2,
                    ...(bgColor !== undefined ? { backgroundColor: bgColor } : {}),
                  }}
                >
                  {/* Row number */}
                  <layoutContainer layout={{ width: ROW_NUM_WIDTH }}>
                    <PixiLabel
                      text={row.toString(16).toUpperCase().padStart(2, '0')}
                      size="xs"
                      font="mono"
                      color={textColor ?? 'textMuted'}
                      customColor={playbackTextCustomColor}
                    />
                  </layoutContainer>

                  {/* Cells per channel */}
                  {channels.map((ch, chIdx) => {
                    const chColor = CHANNEL_COLORS[chIdx % CHANNEL_COLORS.length];
                    const colBg = (chIdx % 2 === 0) ? ((chColor >> 3) & 0x1f1f1f) : undefined;
                    const w = channelWidths[chIdx];

                    if (ch.collapsed) {
                      return <layoutContainer key={chIdx} layout={{ width: w, ...(colBg !== undefined ? { backgroundColor: colBg } : {}) }} />;
                    }

                    const cell = ch.rows[row];
                    if (!cell) return <layoutContainer key={chIdx} layout={{ width: w, ...(colBg !== undefined ? { backgroundColor: colBg } : {}) }} />;

                    const parts: string[] = [];
                    if (showColumns.note) parts.push(formatNote(cell.note));
                    if (showColumns.inst) parts.push(formatHex(cell.instrument, 2));
                    if (showColumns.vol) parts.push(formatHex(cell.volume, 2));
                    if (showColumns.fx) parts.push(formatEffect(cell.effTyp, cell.eff));
                    if (showAcid) {
                      const f = cell.flag1 ?? 0;
                      parts.push(f === 1 ? 'A' : f === 2 ? 'S' : '.');
                    }
                    if (showColumns.fx) {
                      const p = cell.probability ?? 0;
                      parts.push(p > 0 ? p.toString(16).toUpperCase().padStart(2, '0') : '..');
                    }
                    const text = parts.join(' ');

                    const isEmpty = cell.note <= 0 && cell.instrument <= 0 && cell.volume <= 0
                      && (!showColumns.fx || (cell.effTyp <= 0 && cell.eff <= 0));

                    return (
                      <layoutContainer key={chIdx} layout={{ width: w, ...(colBg !== undefined ? { backgroundColor: colBg } : {}) }}>
                        <PixiLabel
                          text={text}
                          size="xs"
                          font="mono"
                          color={textColor ?? (isEmpty ? 'textMuted' : 'text')}
                          customColor={playbackTextCustomColor}
                        />
                      </layoutContainer>
                    );
                  })}
                </layoutContainer>
              );
            })}
          </layoutContainer>
        </PixiScrollView>
      )}
    </layoutContainer>
  );
};
