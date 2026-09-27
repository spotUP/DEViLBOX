/**
 * GlobalLaneCurves — vertical column overlay rendering curves stored at
 * channelIndex = -1 (the global FX lane).
 *
 * Sits in the GLOBAL_LANE_W slot reserved at the left of channel 0 in
 * PatternEditorCanvas. Renders one column per curve as a stacked SVG so
 * AutoDub global moves (springSlam, sonarPing, riddimSection, etc.) and
 * bus-wide continuous params (dub.echoWet, dub.hpfCutoff, ...) are visible
 * inline with the pattern, just like per-channel automation lanes.
 *
 * Edits like a channel lane (useLaneEditing): press or drag in a curve's
 * slice to write points, double-click to remove one, right-click for presets
 * / clear / remove. Parameters are added with the AutomationParameterPicker
 * above the lane (channelIndex -1). This replaced MasterDubLane, a second
 * 48 px column drawn on top of this one that held a wide single-parameter
 * editor ("Mas" menu, 2026-09-28).
 */

import React, { useMemo, useRef } from 'react';
import { useAutomationStore } from '@stores';
import { interpolateAutomationValue } from '@typedefs/automation';
import type { AutomationCurve } from '@typedefs/automation';
import { useLaneEditing } from './useLaneEditing';

interface Props {
  patternId: string;
  patternLength: number;
  rowHeight: number;
  /** X offset where the lane should start (typically LINE_NUMBER_WIDTH). */
  laneLeft: number;
  /** Total width of the lane column (typically GLOBAL_LANE_W). */
  laneWidth: number;
  /**
   * Where this pattern's row 0 sits inside the overlay. The overlay starts
   * above the current pattern by the previous pattern's ghost rows; drawing
   * at 0 put every global curve that many rows too early.
   */
  topOffset?: number;
}

const COLOR_DUB    = 'var(--color-accent-highlight)';
const COLOR_GLOBAL = 'var(--color-accent-secondary)';

function colorFor(parameter: string): string {
  if (parameter.startsWith('dub.')) return COLOR_DUB;
  if (parameter.startsWith('global.')) return COLOR_GLOBAL;
  return COLOR_DUB;
}

export const GlobalLaneCurves: React.FC<Props> = ({
  patternId,
  patternLength,
  rowHeight,
  laneLeft,
  laneWidth,
  topOffset = 0,
}) => {
  const allCurves = useAutomationStore(s => s.curves);
  const containerRef = useRef<HTMLDivElement>(null);
  const { beginDraw, removePointAt, openMenu, menuElement } = useLaneEditing({ containerRef, rowHeight, patternLength });

  /** Curves that belong to this pattern's global lane (channelIndex = -1). */
  const globalCurves = useMemo<AutomationCurve[]>(() => {
    return allCurves.filter(c =>
      c.patternId === patternId
      && c.channelIndex === -1
      && c.points.length > 0,
    );
  }, [allCurves, patternId]);

  const totalHeight = patternLength * rowHeight;
  if (totalHeight <= 0 || laneWidth < 4) return null;

  // Stack curves side-by-side within the lane width. Each curve gets an equal
  // slice; values 0..1 are mapped to the slice's horizontal range so a 1.0
  // step touches the right edge of its slice.
  const perCurve = Math.max(4, Math.floor((laneWidth - 2) / globalCurves.length));

  return (
    <div
      ref={containerRef}
      data-global-lane
      style={{
        position: 'absolute',
        top: topOffset,
        left: laneLeft,
        width: laneWidth,
        height: totalHeight,
        pointerEvents: 'none',
        // The whole lane area sits on top of the canvas grid; a faint
        // background tint matches the header so the reserved slot is
        // visible even when no curves exist.
        background: 'color-mix(in srgb, var(--color-accent-highlight) 4%, transparent)',
        borderRight: '1px solid color-mix(in srgb, var(--color-accent-highlight) 30%, transparent)',
      }}
    >
      <svg
        width={laneWidth}
        height={totalHeight}
        style={{ display: 'block' }}
      >
        {globalCurves.map((curve, idx) => {
          const sliceLeft = 1 + idx * perCurve;
          const sliceWidth = perCurve - 1;
          const stroke = colorFor(curve.parameter);

          // Walk every row, sample the interpolated value, build a step path.
          // Values < 0.02 are treated as "off" so the empty stretches stay
          // dark instead of a thin line at x = sliceLeft.
          let prevX: number | null = null;
          const segments: string[] = [];
          for (let row = 0; row < patternLength; row++) {
            const v = interpolateAutomationValue(
              curve.points, row, curve.interpolation, curve.mode,
            );
            if (v === null || v < 0.02) {
              prevX = null;
              continue;
            }
            const x = sliceLeft + Math.min(sliceWidth, v * sliceWidth);
            const yTop = row * rowHeight;
            const yBot = yTop + rowHeight;
            if (prevX === null) {
              segments.push(`M ${x} ${yTop} L ${x} ${yBot}`);
            } else {
              segments.push(`M ${prevX} ${yTop} L ${x} ${yTop} L ${x} ${yBot}`);
            }
            prevX = x;
          }

          return (
            <g key={curve.id}>
              {/* Slice divider on the right of each curve except the last */}
              {idx < globalCurves.length - 1 && (
                <line
                  x1={sliceLeft + perCurve - 1}
                  x2={sliceLeft + perCurve - 1}
                  y1={0}
                  y2={totalHeight}
                  stroke="color-mix(in srgb, var(--color-text-muted) 12%, transparent)"
                  strokeWidth={1}
                />
              )}
              <path
                d={segments.join(' ')}
                fill="none"
                stroke={stroke}
                strokeWidth={1.5}
                strokeLinejoin="miter"
              />
            </g>
          );
        })}
      </svg>
      {/* One hit area per curve slice - the editing surface. */}
      {globalCurves.map((curve, idx) => {
        const sliceLeft = 1 + idx * perCurve;
        const sliceWidth = perCurve - 1;
        return (
          <div
            key={`hit-${curve.id}`}
            data-global-lane-curve={curve.parameter}
            title={curve.parameter}
            style={{ position: 'absolute', top: 0, left: sliceLeft, width: sliceWidth, height: totalHeight, pointerEvents: 'auto', cursor: 'crosshair' }}
            // laneValueAt maps x in [laneLeft+1, laneLeft+laneWidth-1] to 0..1;
            // the slice draws value v at sliceLeft + v * sliceWidth.
            onPointerDown={(e) => beginDraw(e, curve, sliceLeft - 1, 0, sliceWidth + 2)}
            onDoubleClick={(e) => removePointAt(e, curve, 0)}
            onContextMenu={(e) => openMenu(e, curve.id)}
          />
        );
      })}
      {menuElement}
    </div>
  );
};
