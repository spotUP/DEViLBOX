/**
 * PixiAutomationPanel — GL-native version of the DOM AutomationPanel.
 * Dynamically resolves parameters from the channel's instrument via NKS maps.
 * Reference: src/components/automation/AutomationPanel.tsx
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PixiLabel, PixiButton, PixiScrollView } from '../components';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { usePixiTheme, usePixiThemeId } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useModalClose } from '@hooks/useDialogKeyboard';
import { useTrackerStore, useAutomationStore } from '@stores';
import { useChannelAutomationParams } from '@hooks/useChannelAutomationParams';
import { interpolateAutomationValue } from '@typedefs/automation';

interface PixiAutomationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  width?: number;
  height?: number;
}

/** Small colored dot indicating automation data exists */
const DataDot: React.FC<{ color: number }> = ({ color }) => {
  const draw = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.circle(3, 3, 3);
      g.fill({ color });
    },
    [color],
  );
  return <pixiGraphics draw={draw} layout={{ width: 6, height: 6 }} />;
};

const PARAM_BTN_H = 22;
const GROUP_HEADER_H = 18;
const GROUP_GAP = 8;

export const PixiAutomationPanel: React.FC<PixiAutomationPanelProps> = ({
  isOpen,
  onClose,
  width = 700,
  height = 500,
}) => {
  const theme = usePixiTheme();
  const themeId = usePixiThemeId();
  const isCyan = themeId === 'cyan-lineart';

  // Snapshot of curves at dialog open for cancel support
  const snapshotRef = useRef<string | null>(null);

  // Escape key restores snapshot (cancel behavior)
  const handleEscapeClose = useCallback(() => {
    if (snapshotRef.current) {
      try {
        const restored = JSON.parse(snapshotRef.current);
        useAutomationStore.getState().loadCurves(restored);
      } catch { /* ignore */ }
    }
    onClose();
  }, [onClose]);

  useModalClose({ isOpen, onClose: handleEscapeClose });

  const patterns = useTrackerStore(s => s.patterns);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const getAutomation = useAutomationStore(s => s.getAutomation);
  const addCurve = useAutomationStore(s => s.addCurve);
  const addPoint = useAutomationStore(s => s.addPoint);
  const removePoint = useAutomationStore(s => s.removePoint);
  const allCurves = useAutomationStore(s => s.curves);

  const setActiveParameter = useAutomationStore(s => s.setActiveParameter);
  const setShowLane = useAutomationStore(s => s.setShowLane);
  const recordMode = useAutomationStore(s => s.recordMode);
  const setRecordMode = useAutomationStore(s => s.setRecordMode);
  const copyCurve = useAutomationStore(s => s.copyCurve);
  const pasteCurve = useAutomationStore(s => s.pasteCurve);

  const [selectedParameter, setSelectedParameter] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<number>(0);

  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;
  const channelIndex = Math.min(selectedChannel, numChannels - 1);

  const { groups, instrumentName } = useChannelAutomationParams(channelIndex);

  // Snapshot curves on open for cancel
  useEffect(() => {
    if (isOpen) {
      snapshotRef.current = JSON.stringify(useAutomationStore.getState().curves);
    }
  }, [isOpen]);

  // Auto-select first param when instrument changes
  useEffect(() => {
    if (groups.length === 0) return;
    const allKeys = groups.flatMap(g => g.params.map(p => p.key));
    if (!selectedParameter || !allKeys.includes(selectedParameter)) {
      requestAnimationFrame(() => setSelectedParameter(allKeys[0]));
    }
  }, [groups, selectedParameter]);

  // Ensure a real curve exists in the store for the active parameter
  const ensureCurve = useCallback(
    (patId: string, chIdx: number, param: string): string => {
      const existing = useAutomationStore.getState().curves.find(
        c => c.patternId === patId && c.channelIndex === chIdx && c.parameter === param,
      );
      if (existing) return existing.id;
      return addCurve(patId, chIdx, param);
    },
    [addCurve],
  );

  // Channel selector options
  const channelOptions: SelectOption[] = useMemo(
    () =>
      Array.from({ length: numChannels }, (_, i) => ({
        value: String(i),
        label: pattern?.channels[i]?.name || `Ch ${i + 1}`,
      })),
    [numChannels, pattern],
  );

  const handleChannelChange = useCallback(
    (val: string) => setSelectedChannel(Number(val)),
    [],
  );

  // Active param resolution
  const activeParam = selectedParameter ?? groups[0]?.params[0]?.key ?? 'tb303.cutoff';
  const automationCurve = pattern ? getAutomation(pattern.id, channelIndex, activeParam) : null;
  // Resolve real curve id (may be temp if not yet in store)
  const realCurveId = useMemo(() => {
    if (!pattern) return null;
    const found = allCurves.find(
      c => c.patternId === pattern.id && c.channelIndex === channelIndex && c.parameter === activeParam,
    );
    return found?.id ?? null;
  }, [allCurves, pattern, channelIndex, activeParam]);

  const handleParamClick = useCallback(
    (key: string) => {
      setSelectedParameter(key);
      setActiveParameter(channelIndex, key);
      setShowLane(channelIndex, true);
      // Ensure a real curve exists so the user can immediately draw points
      if (pattern) ensureCurve(pattern.id, channelIndex, key);
    },
    [channelIndex, setActiveParameter, setShowLane, pattern, ensureCurve],
  );

  // "Has data" indicator color
  const hasDataColor = isCyan ? 0x22D3EE : 0xFB923C;

  // Compute total content height for scroll view
  const paramContentHeight = useMemo(() => {
    if (groups.length === 0) return 40;
    let h = 0;
    for (const group of groups) {
      h += GROUP_HEADER_H + group.params.length * PARAM_BTN_H + GROUP_GAP;
    }
    return h;
  }, [groups]);

  const HEADER_H = 36;
  const FOOTER_H = 40;
  const PARAM_AREA_H = Math.min(180, paramContentHeight + 8);
  const EDITOR_H = height - HEADER_H - PARAM_AREA_H - FOOTER_H;
  const editorW = width - 24;
  const editorH = Math.max(40, EDITOR_H - 12);
  const patternLength = pattern?.channels[0]?.rows.length ?? 64;

  // Draw the curve editor background + grid + curve + control points
  const drawCurveEditor = useCallback(
    (g: GraphicsType) => {
      g.clear();
      // Background
      g.rect(0, 0, editorW, editorH);
      g.fill({ color: theme.bgTertiary.color, alpha: 0.5 });
      g.rect(0, 0, editorW, editorH);
      g.stroke({ color: theme.border.color, width: 1, alpha: 0.5 });
      // Horizontal grid at 25/50/75%
      for (const frac of [0.25, 0.5, 0.75]) {
        const y = editorH * (1 - frac);
        g.moveTo(0, y); g.lineTo(editorW, y);
        g.stroke({ color: theme.border.color, width: 1, alpha: 0.2 });
      }
      // Vertical grid every 4 rows, major every 16
      for (let r = 0; r <= patternLength; r += 4) {
        const x = (r / patternLength) * editorW;
        const isMajor = r % 16 === 0;
        g.moveTo(x, 0); g.lineTo(x, editorH);
        g.stroke({ color: theme.border.color, width: 1, alpha: isMajor ? 0.4 : 0.15 });
      }
      // Draw curve
      const points = automationCurve?.points;
      if (points && points.length > 0) {
        const curveColor = isCyan ? 0x22D3EE : 0x7C3AED;
        // Filled area under curve
        g.moveTo((points[0].row / patternLength) * editorW, editorH);
        for (let r = 0; r <= patternLength; r++) {
          const v = interpolateAutomationValue(points, r, automationCurve!.interpolation, automationCurve!.mode);
          const x = (r / patternLength) * editorW;
          const y = editorH * (1 - (v ?? 0));
          g.lineTo(x, y);
        }
        g.lineTo(editorW, editorH);
        g.closePath();
        g.fill({ color: curveColor, alpha: 0.12 });
        // Stroke line
        let first = true;
        for (let r = 0; r <= patternLength; r++) {
          const v = interpolateAutomationValue(points, r, automationCurve!.interpolation, automationCurve!.mode);
          const x = (r / patternLength) * editorW;
          const y = editorH * (1 - (v ?? 0));
          if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y);
        }
        g.stroke({ color: curveColor, width: 2, alpha: 0.8 });
        // Control points
        for (const pt of points) {
          const x = (pt.row / patternLength) * editorW;
          const y = editorH * (1 - pt.value);
          g.circle(x, y, 4);
          g.fill({ color: curveColor, alpha: 1 });
          g.circle(x, y, 4);
          g.stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
        }
      }
    },
    [editorW, editorH, patternLength, automationCurve, theme, isCyan],
  );

  // Click / drag in the editor area to add/move points
  const lastClickRef = useRef<{ time: number; row: number }>({ time: 0, row: -1 });
  const isDragging = useRef(false);

  const editorPointerDown = useCallback((e: FederatedPointerEvent) => {
    if (!pattern) return;
    const local = e.getLocalPosition(e.currentTarget);
    const row = Math.round((local.x / editorW) * patternLength);
    const value = 1 - (local.y / editorH);
    const clampedRow = Math.max(0, Math.min(patternLength - 1, row));
    const clampedValue = Math.max(0, Math.min(1, value));

    // Double-click to remove
    const now = Date.now();
    if (lastClickRef.current.row === clampedRow && now - lastClickRef.current.time < 300) {
      if (realCurveId) removePoint(realCurveId, clampedRow);
      lastClickRef.current = { time: 0, row: -1 };
      return;
    }
    lastClickRef.current = { time: now, row: clampedRow };

    const curveId = ensureCurve(pattern.id, channelIndex, activeParam);
    addPoint(curveId, clampedRow, clampedValue);
    isDragging.current = true;
  }, [pattern, editorW, editorH, patternLength, channelIndex, activeParam, ensureCurve, addPoint, removePoint, realCurveId]);

  const editorPointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!isDragging.current || !pattern) return;
    const local = e.getLocalPosition(e.currentTarget);
    const row = Math.round((local.x / editorW) * patternLength);
    const value = 1 - (local.y / editorH);
    const clampedRow = Math.max(0, Math.min(patternLength - 1, row));
    const clampedValue = Math.max(0, Math.min(1, value));
    const curveId = ensureCurve(pattern.id, channelIndex, activeParam);
    addPoint(curveId, clampedRow, clampedValue);
  }, [pattern, editorW, editorH, patternLength, channelIndex, activeParam, ensureCurve, addPoint]);

  const editorPointerUp = useCallback(() => { isDragging.current = false; }, []);

  // Cancel = handleEscapeClose (restore snapshot + close)
  const handleCancel = handleEscapeClose;

  // OK: just close (data is already live in the store)
  const handleOk = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  if (!pattern) {
    return (
      <layoutContainer
        layout={{
          width,
          height,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.bg.color,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 6,
        }}
      >
        <PixiLabel text="No pattern loaded" size="sm" color="textMuted" />
      </layoutContainer>
    );
  }

  return (
    <layoutContainer
      layout={{
        width,
        height,
        flexDirection: 'column',
        backgroundColor: theme.bg.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <layoutContainer
        layout={{
          width,
          height: HEADER_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 12,
          paddingRight: 8,
          gap: 10,
          backgroundColor: theme.bgSecondary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel text="Automation" size="xs" color="textSecondary" font="sans" />
        <PixiLabel
          text={`Pattern ${String(currentPatternIndex).padStart(2, '0')}: ${pattern.name}`}
          size="sm"
          weight="semibold"
          font="sans"
        />
        {instrumentName && (
          <PixiLabel text={`(${instrumentName})`} size="xs" color="textMuted" font="sans" />
        )}

        {/* Spacer */}
        <layoutContainer layout={{ flex: 1 }} />

        {/* Record / Copy / Paste */}
        <PixiButton
          label={recordMode ? 'REC' : 'Rec'}
          variant={recordMode ? 'primary' : 'default'}
          size="sm"
          color={recordMode ? 'red' : undefined}
          onClick={() => setRecordMode(!recordMode)}
          width={40}
          height={22}
        />
        <PixiButton
          label="Copy"
          variant="default"
          size="sm"
          onClick={() => {
            if (automationCurve?.id) copyCurve(automationCurve.id);
          }}
          width={42}
          height={22}
        />
        <PixiButton
          label="Paste"
          variant="default"
          size="sm"
          onClick={() => {
            if (pattern) pasteCurve(pattern.id, channelIndex, activeParam);
          }}
          width={46}
          height={22}
        />

        {/* Channel selector */}
        <PixiLabel text="Channel:" size="xs" color="textMuted" font="sans" />
        <PixiSelect
          options={channelOptions}
          value={String(channelIndex)}
          onChange={handleChannelChange}
          width={100}
          height={22}
        />

        {/* Close button */}
        <PixiButton label="x" variant="ghost" size="sm" onClick={handleCancel} width={24} height={22} />
      </layoutContainer>

      {/* Parameter selector — grouped by NKS section */}
      <layoutContainer
        layout={{
          width,
          height: PARAM_AREA_H,
          backgroundColor: theme.bgSecondary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        {groups.length > 0 ? (
          <PixiScrollView
            width={width}
            height={PARAM_AREA_H}
            contentHeight={paramContentHeight}
            direction="vertical"
          >
            <layoutContainer
              layout={{
                flexDirection: 'column',
                padding: 8,
                gap: GROUP_GAP,
                width: width - 16,
              }}
            >
              {groups.map(group => (
                <layoutContainer
                  key={group.label}
                  layout={{ flexDirection: 'column', gap: 2 }}
                >
                  {/* Section header */}
                  <pixiBitmapText
                    text={group.label.toUpperCase()}
                    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                    tint={theme.textMuted.color}
                    layout={{ marginBottom: 2 }}
                  />
                  {/* Param buttons */}
                  <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {group.params.map(param => {
                      const paramCurve = getAutomation(pattern.id, channelIndex, param.key);
                      const hasData = paramCurve.points.length > 0;
                      const isSelected = activeParam === param.key;

                      return (
                        <ParamButton
                          key={param.key}
                          name={param.name}
                          isSelected={isSelected}
                          hasData={hasData}
                          hasDataColor={hasDataColor}
                          theme={theme}
                          onClick={() => handleParamClick(param.key)}
                        />
                      );
                    })}
                  </layoutContainer>
                </layoutContainer>
              ))}
            </layoutContainer>
          </PixiScrollView>
        ) : (
          <layoutContainer
            layout={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <PixiLabel
              text="No instrument assigned to this channel"
              size="xs"
              color="textMuted"
            />
          </layoutContainer>
        )}
      </layoutContainer>

      {/* Automation Curve Editor — interactive click/drag to add points */}
      <layoutContainer
        layout={{
          width,
          height: EDITOR_H,
          padding: 12,
        }}
      >
        <pixiContainer
          eventMode="static"
          cursor="crosshair"
          onPointerDown={editorPointerDown}
          onPointerMove={editorPointerMove}
          onPointerUp={editorPointerUp}
          onPointerUpOutside={editorPointerUp}
          layout={{ width: editorW, height: editorH }}
        >
          <pixiGraphics
            draw={drawCurveEditor}
            layout={{ width: editorW, height: editorH }}
          />
        </pixiContainer>
      </layoutContainer>

      {/* Footer — Cancel / OK */}
      <layoutContainer
        layout={{
          width,
          height: FOOTER_H,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingRight: 12,
          gap: 8,
          backgroundColor: theme.bgSecondary.color,
          borderTopWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        {automationCurve && automationCurve.points.length > 0 && (
          <PixiLabel
            text={`${automationCurve.points.length} point${automationCurve.points.length !== 1 ? 's' : ''}`}
            size="xs"
            color="textMuted"
            font="mono"
            layout={{ marginRight: 'auto', marginLeft: 12 }}
          />
        )}
        <PixiButton label="Cancel" variant="default" size="sm" onClick={handleCancel} width={60} height={26} />
        <PixiButton label="OK" variant="primary" size="sm" onClick={handleOk} width={50} height={26} />
      </layoutContainer>
    </layoutContainer>
  );
};

/* ── ParamButton sub-component ─────────────────────────────────────────────── */

import type { PixiTheme } from '../theme';

interface ParamButtonProps {
  name: string;
  isSelected: boolean;
  hasData: boolean;
  hasDataColor: number;
  theme: PixiTheme;
  onClick: () => void;
}

const ParamButton: React.FC<ParamButtonProps> = ({
  name,
  isSelected,
  hasData,
  hasDataColor,
  theme,
  onClick,
}) => {
  const [hovered, setHovered] = useState(false);

  const bgColor = isSelected
    ? theme.accent.color
    : hasData
      ? (hasDataColor & 0xffffff) // tint bg with alpha via separate alpha
      : hovered
        ? theme.bgHover.color
        : theme.bgTertiary.color;

  const bgAlpha = isSelected ? 1 : hasData ? 0.2 : 1;

  const borderColor = isSelected
    ? theme.accent.color
    : hasData
      ? hasDataColor
      : hovered
        ? theme.borderLight.color
        : theme.border.color;

  const textColor = isSelected
    ? theme.textInverse.color
    : hasData
      ? hasDataColor
      : theme.textSecondary.color;

  const drawBg = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.roundRect(0, 0, 80, PARAM_BTN_H, 4);
      g.fill({ color: bgColor, alpha: bgAlpha });
      g.roundRect(0, 0, 80, PARAM_BTN_H, 4);
      g.stroke({ color: borderColor, width: 1 });
    },
    [bgColor, bgAlpha, borderColor],
  );

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={onClick}
      onClick={onClick}
      layout={{ width: 80, height: PARAM_BTN_H }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: 80, height: PARAM_BTN_H }} />
      <layoutContainer
        layout={{
          width: 80,
          height: PARAM_BTN_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 6,
          gap: 4,
        }}
      >
        {hasData && !isSelected && <DataDot color={hasDataColor} />}
        <pixiBitmapText
          text={name}
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
          tint={textColor}
          layout={{}}
        />
      </layoutContainer>
    </pixiContainer>
  );
};
