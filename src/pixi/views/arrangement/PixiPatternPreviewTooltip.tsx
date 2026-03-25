/**
 * PixiPatternPreviewTooltip — Pixi/GL version of the pattern preview tooltip.
 * Shows a mini tracker grid when hovering over a clip in the arrangement.
 *
 * Visually 1:1 with the DOM PatternPreviewTooltip component.
 * Uses the same shared getPatternPreviewData() for data.
 */

import { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { getPatternPreviewData, type PatternPreviewData } from '@/hooks/arrangement/usePatternPreview';
import { CELL_NOTE, CELL_INSTRUMENT, CELL_EFFECT, CELL_EMPTY } from '../../colors';

interface PixiPatternPreviewTooltipProps {
  patternId: string | null;
  offsetRows?: number;
  x: number;
  y: number;
  visible: boolean;
}

const ROW_H = 13;
const CHAR_W = 5.5;
const PAD = 8;
const MAX_CHANNELS = 4;
const MAX_ROWS = 8;

export const PixiPatternPreviewTooltip: React.FC<PixiPatternPreviewTooltipProps> = ({
  patternId,
  offsetRows = 0,
  x,
  y,
  visible,
}) => {
  const theme = usePixiTheme();

  const preview: PatternPreviewData | null = useMemo(() => {
    if (!visible || !patternId) return null;
    return getPatternPreviewData(patternId, MAX_ROWS, offsetRows);
  }, [visible, patternId, offsetRows]);

  const tooltipW = useMemo(() => {
    if (!preview) return 0;
    const chCount = Math.min(preview.channelCount, MAX_CHANNELS);
    // Row num (3 chars) + per channel (note 3 + inst 2 + effect 3 + gaps)
    return PAD * 2 + 20 + chCount * (3 + 2 + 3 + 2) * CHAR_W;
  }, [preview]);

  const tooltipH = useMemo(() => {
    if (!preview) return 0;
    return PAD * 2 + 14 + preview.previewRows * ROW_H + (preview.totalRows > preview.previewRows ? 12 : 0);
  }, [preview]);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    if (!preview) return;
    g.roundRect(0, 0, tooltipW, tooltipH, 4);
    g.fill({ color: theme.bgSecondary.color, alpha: 0.95 });
    g.roundRect(0, 0, tooltipW, tooltipH, 4);
    g.stroke({ color: theme.border.color, width: 1 });
  }, [preview, tooltipW, tooltipH, theme]);

  if (!visible || !preview || preview.rows.length === 0) return null;

  const chCount = Math.min(preview.channelCount, MAX_CHANNELS);

  return (
    <pixiContainer
      layout={{
        position: 'absolute',
        left: x + 12,
        top: Math.max(0, y - tooltipH - 10),
      }}
      eventMode="none"
    >
      <pixiGraphics draw={drawBg} layout={{ width: tooltipW, height: tooltipH }} />

      {/* Header */}
      <pixiBitmapText
        text={`${preview.patternName}  P${String(preview.patternIndex).padStart(2, '0')} (${preview.totalRows} rows)`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.textSecondary.color}
        layout={{ position: 'absolute', left: PAD, top: PAD }}
      />

      {/* Mini tracker grid */}
      {preview.rows.map((row, rowIdx) => {
        const ry = PAD + 14 + rowIdx * ROW_H;
        return (
          <pixiContainer key={rowIdx} layout={{ position: 'absolute', left: PAD, top: ry, flexDirection: 'row', gap: 2 }}>
            {/* Row number */}
            <pixiBitmapText
              text={String(offsetRows + rowIdx).padStart(2, '0')}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{ width: 16 }}
            />
            {/* Channel cells */}
            {row.slice(0, chCount).map((cell, chIdx) => (
              <pixiContainer key={chIdx} layout={{ flexDirection: 'row', gap: 1 }}>
                <pixiBitmapText
                  text={cell.note}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                  tint={cell.note === '---' ? CELL_EMPTY : CELL_NOTE}
                  layout={{}}
                />
                <pixiBitmapText
                  text={cell.instrument}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                  tint={cell.instrument === '..' ? CELL_EMPTY : CELL_INSTRUMENT}
                  layout={{}}
                />
                <pixiBitmapText
                  text={cell.effect}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                  tint={cell.effect === '...' ? CELL_EMPTY : CELL_EFFECT}
                  layout={{}}
                />
              </pixiContainer>
            ))}
          </pixiContainer>
        );
      })}

      {/* "... N more rows" */}
      {preview.totalRows > preview.previewRows && (
        <pixiBitmapText
          text={`... ${preview.totalRows - preview.previewRows} more rows`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ position: 'absolute', left: PAD, top: PAD + 14 + preview.previewRows * ROW_H + 2 }}
        />
      )}
    </pixiContainer>
  );
};
