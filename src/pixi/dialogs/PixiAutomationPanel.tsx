/**
 * PixiAutomationPanel — GL-native version of the DOM AutomationPanel.
 * Dynamically resolves parameters from the channel's instrument via NKS maps.
 * Reference: src/components/automation/AutomationPanel.tsx
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PixiLabel, PixiButton, PixiScrollView } from '../components';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { usePixiTheme, usePixiThemeId } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useTrackerStore, useAutomationStore } from '@stores';
import { useChannelAutomationParams } from '@hooks/useChannelAutomationParams';

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

  const patterns = useTrackerStore(s => s.patterns);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const getAutomation = useAutomationStore(s => s.getAutomation);
  const setAutomation = useAutomationStore(s => s.setAutomation);
  const setActiveParameter = useAutomationStore(s => s.setActiveParameter);
  const setShowLane = useAutomationStore(s => s.setShowLane);

  const [selectedParameter, setSelectedParameter] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<number>(0);

  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;
  const channelIndex = Math.min(selectedChannel, numChannels - 1);

  const { groups, instrumentName } = useChannelAutomationParams(channelIndex);

  // Auto-select first param when instrument changes
  useEffect(() => {
    if (groups.length === 0) return;
    const allKeys = groups.flatMap(g => g.params.map(p => p.key));
    if (!selectedParameter || !allKeys.includes(selectedParameter)) {
      requestAnimationFrame(() => setSelectedParameter(allKeys[0]));
    }
  }, [groups, selectedParameter]);

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

  const handleParamClick = useCallback(
    (key: string) => {
      setSelectedParameter(key);
      setActiveParameter(channelIndex, key);
      setShowLane(channelIndex, true);
    },
    [channelIndex, setActiveParameter, setShowLane],
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
  const PARAM_AREA_H = Math.min(180, paramContentHeight + 8);
  const EDITOR_H = height - HEADER_H - PARAM_AREA_H;

  // Placeholder for the curve editor
  const drawEditorPlaceholder = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 0, width - 24, EDITOR_H - 12);
      g.fill({ color: theme.bgTertiary.color, alpha: 0.5 });
      g.rect(0, 0, width - 24, EDITOR_H - 12);
      g.stroke({ color: theme.border.color, width: 1, alpha: 0.5 });
    },
    [width, EDITOR_H, theme],
  );

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
        <PixiButton label="x" variant="ghost" size="sm" onClick={onClose} width={24} height={22} />
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

      {/* Automation Curve Editor — placeholder */}
      <layoutContainer
        layout={{
          flex: 1,
          width,
          padding: 12,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <pixiGraphics
          draw={drawEditorPlaceholder}
          layout={{ position: 'absolute', left: 12, top: 6, width: width - 24, height: EDITOR_H - 12 }}
        />
        <PixiLabel text="Automation Curve Editor" size="sm" color="textMuted" font="sans" />
        {automationCurve && automationCurve.points.length > 0 && (
          <PixiLabel
            text={`${automationCurve.points.length} point${automationCurve.points.length !== 1 ? 's' : ''}`}
            size="xs"
            color="textMuted"
            font="mono"
            layout={{ marginTop: 4 }}
          />
        )}
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
