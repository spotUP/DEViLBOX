/**
 * PixiRemotePatternView — Read-only pattern grid showing the peer's current pattern.
 * Renders a simplified view of pattern data using PixiLabel for each cell.
 */

import React, { useMemo } from 'react';
import { PixiLabel } from '../../components';
import { PixiScrollView } from '../../components/PixiScrollView';
import { usePixiTheme } from '../../theme';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { useTrackerStore } from '@stores';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function formatNote(note: number): string {
  if (note <= 0) return '---';
  if (note === 97) return '===';
  if (note === 255) return '===';
  const octave = Math.floor((note - 1) / 12);
  const name = NOTE_NAMES[(note - 1) % 12];
  return `${name}${octave}`;
}

function formatHex(val: number, digits: number): string {
  if (val <= 0) return '.'.repeat(digits);
  return val.toString(16).toUpperCase().padStart(digits, '0');
}

const ROW_HEIGHT = 16;
const CELL_WIDTH = 90;
const ROW_NUM_WIDTH = 28;
const MAX_CHANNELS = 8;
const HEADER_HEIGHT = 32;

export const PixiRemotePatternView: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const theme = usePixiTheme();
  const peerPatternIndex = useCollaborationStore(s => s.peerPatternIndex);
  const patterns = useTrackerStore(s => s.patterns);

  const pattern = patterns[peerPatternIndex] ?? null;
  const channels = pattern ? pattern.channels.slice(0, MAX_CHANNELS) : [];
  const rowCount = pattern?.length ?? 0;
  const contentHeight = rowCount * ROW_HEIGHT;

  const headerText = pattern
    ? `Friend's Pattern — ${pattern.name || `Pattern ${peerPatternIndex}`}`
    : "Friend's Pattern — (none)";

  const channelHeaders = useMemo(() => {
    return channels.map((ch, i) => ch.shortName || ch.name || `CH${i + 1}`);
  }, [channels]);

  return (
    <layoutContainer
      layout={{
        flexDirection: 'column',
        width,
        height,
        backgroundColor: theme.bg.color,
      }}
    >
      {/* Header */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          height: HEADER_HEIGHT,
          paddingLeft: 8,
          paddingRight: 8,
          gap: 8,
          backgroundColor: theme.bgSecondary.color,
        }}
      >
        <PixiLabel text={headerText} size="sm" weight="semibold" font="sans" color="text" />
      </layoutContainer>

      {/* Channel headers row */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: ROW_HEIGHT + 4,
          alignItems: 'center',
          paddingLeft: 2,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <layoutContainer layout={{ width: ROW_NUM_WIDTH }}>
          <PixiLabel text="##" size="xs" font="mono" color="textMuted" />
        </layoutContainer>
        {channelHeaders.map((name, i) => (
          <layoutContainer key={i} layout={{ width: CELL_WIDTH }}>
            <PixiLabel text={name} size="xs" font="mono" color="textSecondary" />
          </layoutContainer>
        ))}
      </layoutContainer>

      {/* Scrollable pattern rows */}
      {rowCount > 0 && (
        <PixiScrollView
          width={width}
          height={height - HEADER_HEIGHT - ROW_HEIGHT - 4}
          contentHeight={contentHeight}
          direction="vertical"
          showScrollbar={true}
        >
          <layoutContainer layout={{ flexDirection: 'column' }}>
            {Array.from({ length: rowCount }, (_, row) => {
              const isHighlight = row % 16 === 0;
              const isBeat = row % 4 === 0;
              const bgColor = isHighlight
                ? theme.trackerRowHighlight.color
                : isBeat
                  ? theme.trackerRowEven.color
                  : undefined;

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
                      color="textMuted"
                    />
                  </layoutContainer>

                  {/* Cells per channel */}
                  {channels.map((ch, chIdx) => {
                    const cell = ch.rows[row];
                    if (!cell) return <layoutContainer key={chIdx} layout={{ width: CELL_WIDTH }} />;

                    const noteStr = formatNote(cell.note);
                    const instStr = formatHex(cell.instrument, 2);
                    const volStr = formatHex(cell.volume, 2);
                    const text = `${noteStr} ${instStr} ${volStr}`;

                    const isEmpty = cell.note <= 0 && cell.instrument <= 0 && cell.volume <= 0;

                    return (
                      <layoutContainer key={chIdx} layout={{ width: CELL_WIDTH }}>
                        <PixiLabel
                          text={text}
                          size="xs"
                          font="mono"
                          color={isEmpty ? 'textMuted' : 'text'}
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
