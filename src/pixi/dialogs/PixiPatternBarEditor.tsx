/**
 * PixiPatternBarEditor — Native GL replacement for the DOM ParameterEditor.
 *
 * OpenMPT-style bar chart editor for volume, effect type, and effect param.
 * Rendered entirely within the Pixi scene graph using:
 *  - pixiGraphics for the bar chart, grid lines
 *  - pixiBitmapText for Y-axis labels and info text
 *  - PixiButton for toolbar controls
 *  - PixiModal as the full-screen backdrop
 *
 * Activated via openModal('parameterEditor', { field, channelIndex, startRow, endRow })
 * and rendered in PixiRoot.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FederatedPointerEvent, FederatedWheelEvent, Graphics as GraphicsType } from 'pixi.js';
import { PixiButton, PixiModal } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores';
import type { TrackerCell } from '@typedefs';

// ─── Field presets (1:1 with DOM ParameterEditor) ─────────────────────────────

type ParameterField = 'volume' | 'effect' | 'effectParam';
type EditMode = 'overwrite' | 'fill_blanks' | 'add' | 'scale';

interface FieldPreset {
  label: string;
  min: number;
  max: number;
  default: number;
  color: number;
  format: (v: number) => string;
}

const FIELD_PRESETS: Record<ParameterField, FieldPreset> = {
  volume: {
    label: 'Volume',
    min: 0, max: 64, default: 64,
    color: 0x22c55e,
    format: (v) => v.toString(16).toUpperCase().padStart(2, '0'),
  },
  effectParam: {
    label: 'Effect Param',
    min: 0, max: 255, default: 0,
    color: 0xf59e0b,
    format: (v) => v.toString(16).toUpperCase().padStart(2, '0'),
  },
  effect: {
    label: 'Effect Type',
    min: 0, max: 35, default: 0,
    color: 0x8b5cf6,
    format: (v) => (v < 10 ? v.toString() : String.fromCharCode(55 + v)),
  },
};

// ─── Chart constants ───────────────────────────────────────────────────────────

const BAR_W = 12;
const BAR_GAP = 2;
const AXIS_W = 30;     // Left padding for Y-axis labels
const PADDING_Y = 14;  // Top/bottom padding within chart
const CHART_H = 188;   // Total chart graphic height

// ─── Modal dimensions ─────────────────────────────────────────────────────────

const MODAL_W = 700;
const MODAL_H = 376;

// ─── Helper: extract pattern values ──────────────────────────────────────────

function extractValues(
  field: ParameterField,
  channelIndex: number,
  startRow: number,
  endRow: number,
): number[] {
  const { patterns, currentPatternIndex } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  const preset = FIELD_PRESETS[field];
  const result: number[] = [];

  for (let row = startRow; row <= endRow; row++) {
    const cell = pattern?.channels[channelIndex]?.rows[row];
    let value = preset.default;
    if (cell) {
      switch (field) {
        case 'volume': value = cell.volume ?? preset.default; break;
        case 'effect':
          if (cell.effect && cell.effect !== '...') value = parseInt(cell.effect[0], 16) || 0;
          break;
        case 'effectParam':
          if (cell.effect && cell.effect !== '...' && cell.effect.length >= 3)
            value = parseInt(cell.effect.substring(1), 16) || 0;
          break;
      }
    }
    result.push(value);
  }
  return result;
}

// ─── Inner component (rendered when modal is open) ───────────────────────────

interface PixiPatternBarEditorInnerProps {
  field: ParameterField;
  channelIndex: number;
  startRow: number;
  endRow: number;
  onClose: () => void;
}

const PixiPatternBarEditorInner: React.FC<PixiPatternBarEditorInnerProps> = ({
  field,
  channelIndex,
  startRow,
  endRow,
  onClose,
}) => {
  const theme = usePixiTheme();
  const setCell = useTrackerStore((s) => s.setCell);
  const useHexNumbers = useUIStore((s) => s.useHexNumbers);

  const preset = FIELD_PRESETS[field];
  const rowCount = endRow - startRow + 1;

  // ─── Values state ──────────────────────────────────────────────────────────

  const [values, setValues] = useState<number[]>(() =>
    extractValues(field, channelIndex, startRow, endRow),
  );
  const [preview, setPreview] = useState<number[] | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('overwrite');
  const [isDragging, setIsDragging] = useState(false);
  const [scrollX, setScrollX] = useState(0);

  const valuesRef = useRef(values);
  useEffect(() => { valuesRef.current = values; }, [values]);
  const editModeRef = useRef(editMode);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);

  // ─── Chart sizing ──────────────────────────────────────────────────────────

  const CHART_AREA_H = CHART_H - PADDING_Y * 2;
  const chartContentW = AXIS_W + rowCount * (BAR_W + BAR_GAP) + 4;
  const chartViewW = MODAL_W - 40; // view width inside modal padding
  const maxScrollX = Math.max(0, chartContentW - chartViewW);

  // ─── Coordinate mapping ────────────────────────────────────────────────────

  const chartRef = useRef<GraphicsType>(null);

  const getRowAndValue = useCallback((globalX: number, globalY: number): { rowIndex: number; value: number } | null => {
    const chart = chartRef.current;
    if (!chart) return null;
    const bounds = chart.getBounds();
    const localX = globalX - bounds.x + scrollX;
    const localY = globalY - bounds.y;

    const rowIndex = Math.floor((localX - AXIS_W) / (BAR_W + BAR_GAP));
    if (rowIndex < 0 || rowIndex >= rowCount) return null;

    const normalizedY = 1 - (localY - PADDING_Y) / CHART_AREA_H;
    const value = Math.round(preset.min + normalizedY * (preset.max - preset.min));
    return { rowIndex, value: Math.max(preset.min, Math.min(preset.max, value)) };
  }, [scrollX, rowCount, preset, CHART_AREA_H]);

  // ─── Apply value ───────────────────────────────────────────────────────────

  const applyValue = useCallback((rowIndex: number, value: number, mode: EditMode) => {
    setValues(prev => {
      const next = [...prev];
      const cur = next[rowIndex];
      switch (mode) {
        case 'overwrite': next[rowIndex] = value; break;
        case 'fill_blanks': if (cur === 0 || cur === preset.default) next[rowIndex] = value; break;
        case 'add': next[rowIndex] = Math.max(preset.min, Math.min(preset.max, cur + (value - Math.round(preset.max / 2)))); break;
        case 'scale': next[rowIndex] = Math.round(cur * (value / preset.max)); break;
      }
      return next;
    });
  }, [preset]);

  // ─── Pointer handlers ──────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const result = getRowAndValue(e.globalX, e.globalY);
    if (!result) return;
    setIsDragging(true);
    setPreview(null);
    if (e.button === 2) {
      applyValue(result.rowIndex, result.value, 'overwrite');
      return;
    }
    applyValue(result.rowIndex, result.value, editModeRef.current);
  }, [getRowAndValue, applyValue]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    const result = getRowAndValue(e.globalX, e.globalY);
    if (isDragging && result) {
      applyValue(result.rowIndex, result.value, editModeRef.current);
      setPreview(null);
    } else if (!isDragging && result) {
      setPreview(() => {
        const next = [...valuesRef.current];
        next[result.rowIndex] = result.value;
        return next;
      });
    } else if (!result) {
      setPreview(null);
    }
  }, [isDragging, getRowAndValue, applyValue]);

  const handlePointerUp = useCallback(() => { setIsDragging(false); }, []);
  const handlePointerLeave = useCallback(() => { setIsDragging(false); setPreview(null); }, []);

  const handleWheel = useCallback((e: FederatedWheelEvent) => {
    e.stopPropagation();
    setScrollX(prev => Math.max(0, Math.min(maxScrollX, prev + e.deltaX + e.deltaY)));
  }, [maxScrollX]);

  // ─── Bar chart draw ────────────────────────────────────────────────────────

  const displayValues = preview ?? values;

  const drawChart = useCallback((g: GraphicsType) => {
    const dv = preview ?? valuesRef.current;
    g.clear();

    // Background
    g.rect(0, 0, Math.max(chartViewW, chartContentW), CHART_H);
    g.fill({ color: 0x0f0f1e });

    // Clip scroll offset
    const sx = scrollX;

    // Grid lines (horizontal, at 0%, 25%, 50%, 75%, 100%)
    for (let i = 0; i <= 4; i++) {
      const y = PADDING_Y + CHART_AREA_H * (i / 4);
      g.moveTo(AXIS_W - sx, y);
      g.lineTo(Math.max(chartViewW, chartContentW) - 4, y);
      g.stroke({ color: 0x252545, width: 1 });
    }

    // Bars
    dv.forEach((value, idx) => {
      const x = AXIS_W + idx * (BAR_W + BAR_GAP) - sx;
      if (x + BAR_W < 0 || x > chartViewW + AXIS_W) return; // skip off-screen
      const normalized = (value - preset.min) / Math.max(1, preset.max - preset.min);
      const barH = Math.max(2, Math.round(normalized * CHART_AREA_H));
      const y = PADDING_Y + (CHART_AREA_H - barH);
      g.rect(x, y, BAR_W, barH);
      g.fill({ color: preset.color, alpha: 0.85 });
      // Bright top edge
      g.rect(x, y, BAR_W, 2);
      g.fill({ color: preset.color, alpha: 1.0 });
    });
  }, [displayValues, scrollX, chartContentW, chartViewW, preset, CHART_AREA_H]);

  // ─── Y-axis labels ─────────────────────────────────────────────────────────

  const yAxisLabels = useMemo(() => {
    return [0, 1, 2, 3, 4].map(i => ({
      text: preset.format(Math.round(preset.max - (preset.max - preset.min) * (i / 4))),
      y: PADDING_Y + CHART_AREA_H * (i / 4) - 5,
    }));
  }, [preset, CHART_AREA_H]);

  // ─── Generate patterns ─────────────────────────────────────────────────────

  const generatePattern = useCallback((type: 'ramp_up' | 'ramp_down' | 'triangle' | 'random' | 'sine') => {
    const range = preset.max - preset.min;
    setValues(Array.from({ length: rowCount }, (_, i) => {
      const t = i / (rowCount - 1 || 1);
      switch (type) {
        case 'ramp_up':    return Math.round(preset.min + t * range);
        case 'ramp_down':  return Math.round(preset.max - t * range);
        case 'triangle':   return Math.round(preset.min + Math.abs(1 - 2 * t) * range);
        case 'random':     return Math.round(preset.min + Math.random() * range);
        case 'sine':       return Math.round(preset.min + ((Math.sin(t * Math.PI * 2) + 1) / 2) * range);
        default:           return preset.default;
      }
    }));
  }, [rowCount, preset]);

  const interpolate = useCallback(() => {
    if (values.length < 2) return;
    const s = values[0], e2 = values[values.length - 1];
    setValues(values.map((_, i) => Math.round(s + (e2 - s) * (i / (values.length - 1)))));
  }, [values]);

  const reset = useCallback(() => {
    setValues(extractValues(field, channelIndex, startRow, endRow));
  }, [field, channelIndex, startRow, endRow]);

  // ─── Apply to pattern ──────────────────────────────────────────────────────

  const applyToPattern = useCallback(() => {
    const { patterns, currentPatternIndex } = useTrackerStore.getState();
    values.forEach((value, idx) => {
      const row = startRow + idx;
      const cell = patterns[currentPatternIndex]?.channels[channelIndex]?.rows[row];
      if (!cell) return;
      const updates: Partial<TrackerCell> = {};
      switch (field) {
        case 'volume': updates.volume = value; break;
        case 'effect': {
          const param = (cell.effect || '000').length >= 3 ? (cell.effect || '000').substring(1) : '00';
          updates.effect = preset.format(value) + param;
          break;
        }
        case 'effectParam': {
          const effectType = cell.effect?.[0] || '0';
          updates.effect = effectType + value.toString(16).toUpperCase().padStart(2, '0');
          break;
        }
      }
      setCell(channelIndex, row, updates);
    });
    onClose();
  }, [values, field, channelIndex, startRow, preset, setCell, onClose]);

  // ─── Row number format ─────────────────────────────────────────────────────

  const fmtRow = useCallback((row: number) =>
    useHexNumbers ? row.toString(16).toUpperCase().padStart(2, '0') : row.toString().padStart(2, '0'),
  [useHexNumbers]);

  // ─── Toolbar button colors ─────────────────────────────────────────────────

  const MODE_LABELS: [EditMode, string][] = [
    ['overwrite', 'Overwrite'], ['fill_blanks', 'Fill Empty'], ['add', 'Add'], ['scale', 'Scale'],
  ];

  return (
    <>
      {/* ─── Info bar ────────────────────────────────────────────────────── */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: 20,
          alignItems: 'center',
          paddingLeft: 12,
          paddingRight: 12,
          backgroundColor: theme.bgSecondary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <pixiBitmapText
          text={`Channel ${channelIndex + 1}  •  Rows ${fmtRow(startRow)}-${fmtRow(endRow)}  (${rowCount} rows)`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
      </layoutContainer>

      {/* ─── Toolbar ─────────────────────────────────────────────────────── */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: 32,
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 4,
          backgroundColor: theme.bgSecondary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        {/* Edit mode buttons */}
        <pixiBitmapText
          text="Mode:"
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ marginRight: 2 }}
        />
        {MODE_LABELS.map(([mode, label]) => (
          <PixiButton
            key={mode}
            label={label}
            variant={editMode === mode ? 'primary' : 'ghost'}
            size="sm"
            width={label.length > 8 ? 72 : 60}
            height={22}
            onClick={() => setEditMode(mode)}
          />
        ))}

        {/* Separator */}
        <layoutContainer layout={{ width: 1, height: 18, backgroundColor: theme.border.color, marginLeft: 4, marginRight: 4 }} />

        {/* Generate buttons */}
        <pixiBitmapText
          text="Gen:"
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ marginRight: 2 }}
        />
        {([['ramp_up', '\u2197'], ['ramp_down', '\u2198'], ['triangle', '\u2227'], ['sine', '\u223f'], ['random', '?']] as [string, string][]).map(([type, icon]) => (
          <PixiButton
            key={type}
            label={icon}
            variant="ghost"
            size="sm"
            width={24}
            height={22}
            onClick={() => generatePattern(type as 'ramp_up' | 'ramp_down' | 'triangle' | 'sine' | 'random')}
          />
        ))}

        {/* Separator */}
        <layoutContainer layout={{ width: 1, height: 18, backgroundColor: theme.border.color, marginLeft: 4, marginRight: 4 }} />

        {/* Tools */}
        <PixiButton label="Interp" variant="ghost" size="sm" width={44} height={22} onClick={interpolate} />
        <PixiButton label="Reset" variant="ghost" size="sm" width={38} height={22} onClick={reset} />
      </layoutContainer>

      {/* ─── Chart area ──────────────────────────────────────────────────── */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: CHART_H,
          overflow: 'hidden',
          backgroundColor: 0x0f0f1e,
        }}
      >
        {/* Y-axis labels */}
        <layoutContainer
          layout={{ width: AXIS_W, height: CHART_H, position: 'relative' }}
        >
          {yAxisLabels.map((lbl, i) => (
            <pixiBitmapText
              key={i}
              text={lbl.text}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
              tint={0x666688}
              layout={{ position: 'absolute', top: lbl.y, right: 4 }}
            />
          ))}
        </layoutContainer>

        {/* Bar chart */}
        <pixiGraphics
          ref={chartRef}
          draw={drawChart}
          eventMode="static"
          cursor="crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerUpOutside={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onWheel={handleWheel}
          layout={{ flex: 1, height: CHART_H }}
        />
      </layoutContainer>

      {/* ─── Help text ───────────────────────────────────────────────────── */}
      <layoutContainer
        layout={{
          height: 20,
          paddingLeft: 12,
          justifyContent: 'center',
          backgroundColor: theme.bgSecondary.color,
          borderTopWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <pixiBitmapText
          text="Click+drag to paint  •  Right-click for single precision  •  Scroll to pan"
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
      </layoutContainer>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: 44,
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingRight: 12,
          gap: 8,
          backgroundColor: theme.bgSecondary.color,
          borderTopWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiButton label="Cancel" variant="ghost" size="sm" width={60} height={28} onClick={onClose} />
        <PixiButton label="Apply" variant="primary" size="sm" width={60} height={28} onClick={applyToPattern} />
      </layoutContainer>
    </>
  );
};

// ─── Public component (wraps with PixiModal) ──────────────────────────────────

interface PixiPatternBarEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiPatternBarEditor: React.FC<PixiPatternBarEditorProps> = ({
  isOpen,
  onClose,
}) => {
  const modalData = useUIStore((s) => s.modalData);

  const field = (modalData?.field as ParameterField | undefined) ?? 'volume';
  const channelIndex = (modalData?.channelIndex as number | undefined) ?? 0;
  const startRow = (modalData?.startRow as number | undefined) ?? 0;
  const endRow = (modalData?.endRow as number | undefined) ?? 0;

  const titleMap: Record<ParameterField, string> = {
    volume: 'Volume Editor',
    effect: 'Effect Type Editor',
    effectParam: 'Effect Param Editor',
  };

  return (
    <PixiModal
      isOpen={isOpen}
      onClose={onClose}
      title={titleMap[field]}
      width={MODAL_W}
      height={MODAL_H}
    >
      {isOpen && (
        <PixiPatternBarEditorInner
          field={field}
          channelIndex={channelIndex}
          startRow={startRow}
          endRow={endRow}
          onClose={onClose}
        />
      )}
    </PixiModal>
  );
};
