/**
 * PixiAutomationLaneStrip — GL version of the automation lane strip.
 * Renders below the pattern editor with user-configurable parameter lanes.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { usePixiTheme } from '@/pixi/theme';
import {
  type AutomationParamDef,
  type AutomationFormat,
  getParamsForFormat,
  groupParams,
} from '@/engine/automation/AutomationParams';
import { getAutomationCapture } from '@/engine/automation/AutomationCapture';

interface LaneConfig {
  id: string;
  paramId: string | null;
  height: number;
}

interface PixiAutomationLaneStripProps {
  width: number;
  format: AutomationFormat;
  formatConfig?: { sidCount?: number; channelCount?: number; chipType?: string };
  patternLength: number;
  currentRow: number;
  isPlaying: boolean;
}

const HEADER_H = 20;
const LANE_HEADER_H = 16;

let laneIdCounter = 0;

export const PixiAutomationLaneStrip: React.FC<PixiAutomationLaneStripProps> = ({
  width,
  format,
  formatConfig,
  patternLength,
  currentRow,
  isPlaying,
}) => {
  const theme = usePixiTheme();
  const [lanes, setLanes] = useState<LaneConfig[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  // Track which lane is showing param picker (-1 = none)
  const [pickerLaneIdx, setPickerLaneIdx] = useState(-1);

  const allParams = useMemo(
    () => getParamsForFormat(format, formatConfig),
    [format, formatConfig],
  );
  const paramGroups = useMemo(() => groupParams(allParams), [allParams]);
  const paramById = useMemo(() => {
    const map = new Map<string, AutomationParamDef>();
    for (const p of allParams) map.set(p.id, p);
    return map;
  }, [allParams]);

  const addLane = useCallback(() => {
    setLanes(prev => [...prev, {
      id: `plane-${++laneIdCounter}`,
      paramId: null,
      height: 48,
    }]);
  }, []);

  const removeLane = useCallback((idx: number) => {
    setLanes(prev => prev.filter((_, i) => i !== idx));
    if (pickerLaneIdx === idx) setPickerLaneIdx(-1);
  }, [pickerLaneIdx]);

  const setLaneParam = useCallback((idx: number, paramId: string) => {
    setLanes(prev => prev.map((l, i) => i === idx ? { ...l, paramId } : l));
    setPickerLaneIdx(-1);
  }, []);

  const cycleLaneHeight = useCallback((idx: number) => {
    setLanes(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const heights = [24, 48, 72];
      const next = heights[(heights.indexOf(l.height) + 1) % heights.length];
      return { ...l, height: next };
    }));
  }, []);

  // Total height calculation
  const totalHeight = collapsed
    ? HEADER_H
    : HEADER_H + lanes.reduce((sum, l) => sum + l.height, 0);

  // Draw the header background
  const drawHeader = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, HEADER_H).fill({ color: theme.bgTertiary.color });
    g.rect(0, HEADER_H - 1, width, 1).fill({ color: theme.border.color });
  }, [width, theme]);

  // Draw a lane (header + curve)
  const drawLane = useCallback((g: GraphicsType, lane: LaneConfig, _laneIdx: number) => {
    g.clear();
    const h = lane.height;

    // Lane header bg
    g.rect(0, 0, width, LANE_HEADER_H).fill({ color: theme.bgTertiary.color });
    g.rect(0, LANE_HEADER_H - 1, width, 1).fill({ color: theme.border.color, alpha: 0.3 });

    // Curve area bg
    g.rect(0, LANE_HEADER_H, width, h - LANE_HEADER_H).fill({ color: theme.bg.color });

    // Bottom border
    g.rect(0, h - 1, width, 1).fill({ color: theme.border.color });

    // Draw curve if param selected
    if (lane.paramId) {
      const capture = getAutomationCapture();
      const entries = capture.getAll(lane.paramId);
      const curveTop = LANE_HEADER_H;
      const curveH = h - LANE_HEADER_H;

      if (entries.length > 0) {
        const maxTick = Math.max(patternLength, entries[entries.length - 1].tick + 1);

        // Fill area
        g.moveTo((entries[0].tick / maxTick) * width, curveTop + (1 - entries[0].value) * curveH);
        for (let i = 1; i < entries.length; i++) {
          g.lineTo((entries[i].tick / maxTick) * width, curveTop + (1 - entries[i].value) * curveH);
        }
        const lastE = entries[entries.length - 1];
        g.lineTo((lastE.tick / maxTick) * width, curveTop + curveH);
        g.lineTo((entries[0].tick / maxTick) * width, curveTop + curveH);
        g.closePath();
        g.fill({ color: theme.accent.color, alpha: 0.08 });

        // Stroke
        g.moveTo((entries[0].tick / maxTick) * width, curveTop + (1 - entries[0].value) * curveH);
        for (let i = 1; i < entries.length; i++) {
          g.lineTo((entries[i].tick / maxTick) * width, curveTop + (1 - entries[i].value) * curveH);
        }
        g.stroke({ color: theme.accent.color, alpha: 0.8, width: 1.5 });
      } else {
        // Empty — dashed center line
        const cy = curveTop + curveH / 2;
        for (let x = 0; x < width; x += 12) {
          g.moveTo(x, cy);
          g.lineTo(Math.min(x + 6, width), cy);
        }
        g.stroke({ color: theme.textMuted.color, alpha: 0.15, width: 1 });
      }

      // Playback position
      if (isPlaying && patternLength > 0) {
        const px = (currentRow / patternLength) * width;
        g.moveTo(px, curveTop);
        g.lineTo(px, curveTop + curveH);
        g.stroke({ color: 0xffffff, alpha: 0.3, width: 1 });
      }
    }
  }, [width, theme, patternLength, currentRow, isPlaying]);

  // Draw parameter picker overlay
  const drawPicker = useCallback((g: GraphicsType) => {
    g.clear();
    const pickerW = Math.min(240, width - 20);
    const itemH = 14;
    // Count total items (groups + params)
    let totalItems = 0;
    for (const group of paramGroups) {
      totalItems += 1 + group.params.length;
    }
    const pickerH = Math.min(totalItems * itemH + 8, 300);
    const x = 10;
    const y = 0;

    // Background
    g.roundRect(x, y, pickerW, pickerH, 4).fill({ color: theme.bgSecondary.color });
    g.roundRect(x, y, pickerW, pickerH, 4).stroke({ color: theme.border.color, width: 1 });
  }, [width, theme, paramGroups]);

  if (lanes.length === 0 && collapsed) return null;

  return (
    <pixiContainer layout={{ width, height: totalHeight, flexShrink: 0 }}>
      {/* Header */}
      <pixiContainer layout={{ width, height: HEADER_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 6, gap: 4 }}>
        <pixiGraphics draw={drawHeader} layout={{ position: 'absolute', width, height: HEADER_H }} />

        {/* Collapse toggle */}
        <pixiContainer eventMode="static" cursor="pointer" onPointerUp={() => setCollapsed(!collapsed)}>
          <pixiBitmapText
            eventMode="none"
            text={collapsed ? '\u25B6' : '\u25BC'}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={theme.textMuted.color}
          />
        </pixiContainer>

        <pixiBitmapText
          text="Automation"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
          tint={theme.textSecondary.color}
        />

        <pixiBitmapText
          text={`${lanes.length}`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          alpha={0.5}
        />

        <pixiContainer layout={{ flex: 1 }} />

        {/* Add Lane button */}
        <pixiContainer eventMode="static" cursor="pointer" onPointerUp={addLane}>
          <pixiBitmapText
            eventMode="none"
            text="+ Add Lane"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={theme.textMuted.color}
          />
        </pixiContainer>
      </pixiContainer>

      {/* Lanes */}
      {!collapsed && lanes.map((lane, idx) => {
        const paramDef = lane.paramId ? paramById.get(lane.paramId) : undefined;
        return (
          <pixiContainer key={lane.id} layout={{ width, height: lane.height }}>
            <pixiGraphics
              draw={(g: GraphicsType) => drawLane(g, lane, idx)}
              layout={{ position: 'absolute', width, height: lane.height }}
            />

            {/* Lane header labels */}
            <pixiContainer layout={{ width, height: LANE_HEADER_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 4, gap: 3 }}>
              {/* Remove button */}
              <pixiContainer eventMode="static" cursor="pointer" onPointerUp={() => removeLane(idx)}>
                <pixiBitmapText
                  eventMode="none"
                  text="x"
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                />
              </pixiContainer>

              {/* Parameter name (clickable to open picker) */}
              <pixiContainer eventMode="static" cursor="pointer" onPointerUp={() => setPickerLaneIdx(pickerLaneIdx === idx ? -1 : idx)}>
                <pixiBitmapText
                  eventMode="none"
                  text={paramDef ? paramDef.label : 'Select param...'}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                  tint={paramDef ? theme.textSecondary.color : theme.textMuted.color}
                  alpha={paramDef ? 1 : 0.5}
                />
              </pixiContainer>

              <pixiContainer layout={{ flex: 1 }} />

              {/* Size toggle */}
              <pixiContainer eventMode="static" cursor="pointer" onPointerUp={() => cycleLaneHeight(idx)}>
                <pixiBitmapText
                  eventMode="none"
                  text={lane.height === 24 ? 'S' : lane.height === 48 ? 'M' : 'L'}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                />
              </pixiContainer>
            </pixiContainer>

            {/* Parameter picker overlay */}
            {pickerLaneIdx === idx && (
              <pixiContainer layout={{ position: 'absolute', top: LANE_HEADER_H, left: 4, width: Math.min(240, width - 20) }}>
                <pixiGraphics draw={drawPicker} layout={{ position: 'absolute', width: Math.min(240, width - 20), height: 200 }} />
                <pixiContainer layout={{ flexDirection: 'column', padding: 4, gap: 1, maxHeight: 290, overflow: 'hidden' }}>
                  {paramGroups.map(group => (
                    <pixiContainer key={group.label} layout={{ flexDirection: 'column', gap: 0 }}>
                      <pixiBitmapText
                        text={group.label}
                        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
                        tint={theme.accent.color}
                        alpha={0.7}
                      />
                      {group.params.map(p => (
                        <pixiContainer
                          key={p.id}
                          eventMode="static"
                          cursor="pointer"
                          onPointerUp={() => setLaneParam(idx, p.id)}
                          layout={{ paddingLeft: 8, paddingTop: 1, paddingBottom: 1 }}
                        >
                          <pixiBitmapText
                            eventMode="none"
                            text={p.label}
                            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                            tint={lane.paramId === p.id ? theme.accent.color : theme.textSecondary.color}
                          />
                        </pixiContainer>
                      ))}
                    </pixiContainer>
                  ))}
                </pixiContainer>
              </pixiContainer>
            )}
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
};
