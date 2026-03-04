/**
 * PixiLocalPatternView — Read-only view of YOUR current pattern for "both" mode.
 * Mirrors PixiRemotePatternView layout but shows the local user's current pattern
 * instead of the peer's pattern.
 */

import React, { useMemo } from 'react';
import { PixiLabel } from '../../components';
import { PixiScrollView } from '../../components/PixiScrollView';
import { usePixiTheme } from '../../theme';
import { useTrackerStore } from '@stores';

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

const ROW_HEIGHT = 16;
const CHAR_WIDTH = 7;
const ROW_NUM_WIDTH = 28;
const CHANNEL_HEADER_HEIGHT = 24;
const TOOLBAR_ROW_HEIGHT = 18;
const TOOLBAR_HEIGHT = TOOLBAR_ROW_HEIGHT + 4;

interface PixiLocalPatternViewProps {
  width: number;
  height: number;
  isPlaying: boolean;
  currentRow: number;
}

export const PixiLocalPatternView: React.FC<PixiLocalPatternViewProps> = ({
  width, height, isPlaying, currentRow,
}) => {
  const theme = usePixiTheme();
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const patterns = useTrackerStore(s => s.patterns);

  const pattern = patterns[currentPatternIndex] ?? null;
  const channels = pattern ? pattern.channels : [];
  const rowCount = pattern?.length ?? 0;
  const contentHeight = rowCount * ROW_HEIGHT;

  const cellWidth = useMemo(() => {
    // note + inst + vol
    return CHAR_WIDTH * 3 + 4 + CHAR_WIDTH * 2 + 4 + CHAR_WIDTH * 2 + 8;
  }, []);

  if (!pattern) {
    return (
      <layoutContainer
        layout={{ width, height, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg.color }}
      >
        <PixiLabel text="No pattern selected" size="sm" font="sans" color="textMuted" />
      </layoutContainer>
    );
  }

  const gridHeight = height - TOOLBAR_HEIGHT - CHANNEL_HEADER_HEIGHT;

  return (
    <layoutContainer
      layout={{ flexDirection: 'column', width, height, backgroundColor: theme.bg.color }}
    >
      {/* Mini toolbar */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: TOOLBAR_HEIGHT,
          alignItems: 'center',
          paddingLeft: 8,
          gap: 16,
          backgroundColor: theme.bgSecondary.color,
        }}
      >
        <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
          <PixiLabel text="Pat:" size="xs" font="mono" color="textSecondary" />
          <PixiLabel text={String(currentPatternIndex).padStart(3, '0')} size="xs" font="mono" color="text" />
        </layoutContainer>
        <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
          <PixiLabel text="Rows:" size="xs" font="mono" color="textSecondary" />
          <PixiLabel text={String(rowCount).padStart(3, '0')} size="xs" font="mono" color="text" />
        </layoutContainer>
        {isPlaying && (
          <PixiLabel text="PLAYING" size="xs" weight="bold" color="success" />
        )}
      </layoutContainer>

      {/* Channel headers */}
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
        {channels.map((ch, idx) => (
          <layoutContainer
            key={ch.id}
            layout={{ width: cellWidth, height: CHANNEL_HEADER_HEIGHT, justifyContent: 'center', paddingLeft: 2 }}
          >
            <PixiLabel
              text={`${(idx + 1).toString().padStart(2, '0')} ${ch.shortName || ch.name || `CH${idx + 1}`}`}
              size="xs"
              font="mono"
              color={ch.muted ? 'textMuted' : 'textSecondary'}
            />
          </layoutContainer>
        ))}
      </layoutContainer>

      {/* Pattern grid */}
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
              const isPlaybackRow = isPlaying && row === currentRow;

              let bgColor: number | undefined;
              if (isPlaybackRow) {
                bgColor = theme.accent.color;
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
                  <layoutContainer layout={{ width: ROW_NUM_WIDTH }}>
                    <PixiLabel
                      text={row.toString(16).toUpperCase().padStart(2, '0')}
                      size="xs"
                      font="mono"
                      color={textColor ?? 'textMuted'}
                      customColor={playbackTextCustomColor}
                    />
                  </layoutContainer>

                  {channels.map((ch, chIdx) => {
                    const cell = ch.rows[row];
                    if (!cell) return <layoutContainer key={chIdx} layout={{ width: cellWidth }} />;

                    const text = `${formatNote(cell.note)} ${formatHex(cell.instrument, 2)} ${formatHex(cell.volume, 2)}`;
                    const isEmpty = cell.note <= 0 && cell.instrument <= 0 && cell.volume <= 0;

                    return (
                      <layoutContainer key={chIdx} layout={{ width: cellWidth }}>
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
