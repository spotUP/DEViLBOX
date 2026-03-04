/**
 * PixiChannelHeaders — Native PixiJS channel header component.
 *
 * Replaces the DOM-based ChannelHeaderDOM (which floated above the WebGL canvas
 * and was invisible to the CRT post-processing shader). Renders entirely within
 * the GL scene graph so the CRT shader affects it, and naturally disappears when
 * the tracker view is unmounted.
 *
 * Context menu and color picker use the GL PixiDropdownStore system.
 * A DOM portal is used only for the channel name editing input (keyboard/IME).
 */

import React, { useCallback, useMemo, useRef, useState, type RefCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { FAD_ICONS } from '../../fontaudioIcons';
import { usePixiDropdownStore } from '../../stores/usePixiDropdownStore';
import { useUIStore } from '@stores';
import { useLiveModeStore } from '@stores/useLiveModeStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { GENERATORS, type GeneratorType } from '@utils/patternGenerators';
import type { ChannelData } from '@typedefs/tracker';
import type { ContextMenuItem } from '../../input/PixiContextMenu';

// ─── Layout constants ────────────────────────────────────────────────────────
const HEADER_HEIGHT = 28;
const LINE_NUMBER_WIDTH = 40;
const BTN_W = 16;
const BTN_H = 14;
const BTN_GAP = 2;
const BTN_R = 3;

// ─── Hoverable button sub-component ─────────────────────────────────────────
const HoverableHeaderBtn: React.FC<{
  drawBg: (g: GraphicsType) => void;
  drawHoverBg: (g: GraphicsType) => void;
  onPress: (e: FederatedPointerEvent) => void;
  children: React.ReactNode;
}> = React.memo(({ drawBg, drawHoverBg, onPress, children }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); onPress(e); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      layout={{ width: BTN_W, height: BTN_H, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiGraphics draw={hovered ? drawHoverBg : drawBg} layout={{ position: 'absolute', width: BTN_W, height: BTN_H }} />
      {children}
    </pixiContainer>
  );
});

const AddChannelBtn: React.FC<{
  left: number;
  drawBg: (g: GraphicsType) => void;
  drawHoverBg: (g: GraphicsType) => void;
  textColor: number;
  hoverTextColor: number;
  onPress: () => void;
}> = React.memo(({ left, drawBg, drawHoverBg, textColor, hoverTextColor, onPress }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerUp={() => onPress()}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      layout={{
        position: 'absolute',
        left,
        top: (HEADER_HEIGHT - BTN_H) / 2,
        width: 32,
        height: BTN_H,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <pixiGraphics draw={hovered ? drawHoverBg : drawBg} layout={{ position: 'absolute', width: 32, height: BTN_H }} />
      <pixiBitmapText
        text="+"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={hovered ? hoverTextColor : textColor}
        layout={{}}
      />
    </pixiContainer>
  );
});

type TrackerPattern = {
  id: string;
  length: number;
  channels: ChannelData[];
};

interface PixiChannelHeadersProps {
  pattern: TrackerPattern;
  channelWidths: number[];
  channelOffsets: number[];
  totalChannelsWidth: number;
  scrollLeft: number;
  width: number;
  channelSpeeds?: number[];
  songInitialSpeed?: number;
  onToggleMute: (ch: number) => void;
  onToggleSolo: (ch: number) => void;
  onToggleCollapse: (ch: number) => void;
  onSetColor: (ch: number, color: string | null) => void;
  onUpdateName: (ch: number, name: string) => void;
  onAddChannel: () => void;
  onFillPattern: (ch: number, g: GeneratorType) => void;
  onClearChannel: (ch: number) => void;
  onCopyChannel: (ch: number) => void;
  onCutChannel: (ch: number) => void;
  onPasteChannel: (ch: number) => void;
  onTranspose: (ch: number, s: number) => void;
  onHumanize: (ch: number) => void;
  onInterpolate: (ch: number) => void;
  onReverseVisual: (ch: number) => void;
  onPolyrhythm: (ch: number) => void;
  onFibonacci: (ch: number) => void;
  onEuclidean: (ch: number) => void;
  onPingPong: (ch: number) => void;
  onGlitch: (ch: number) => void;
  onStrobe: (ch: number) => void;
  onVisualEcho: (ch: number) => void;
  onConverge: (ch: number) => void;
  onSpiral: (ch: number) => void;
  onBounce: (ch: number) => void;
  onChaos: (ch: number) => void;
}


export const PixiChannelHeaders: React.FC<PixiChannelHeadersProps> = ({
  pattern,
  channelWidths,
  channelOffsets,
  totalChannelsWidth,
  scrollLeft,
  width,
  channelSpeeds,
  songInitialSpeed,
  onToggleMute,
  onToggleSolo,
  onToggleCollapse,
  onSetColor,
  onUpdateName,
  onAddChannel,
  onFillPattern,
  onClearChannel,
  onCopyChannel,
  onCutChannel,
  onPasteChannel,
  onTranspose,
  onHumanize,
  onInterpolate,
  onReverseVisual,
  onPolyrhythm,
  onFibonacci,
  onEuclidean,
  onPingPong,
  onGlitch,
  onStrobe,
  onVisualEcho,
  onConverge,
  onSpiral,
  onBounce,
  onChaos,
}) => {
  const theme = usePixiTheme();
  const showChannelNames = useUIStore(s => s.showChannelNames);
  const [editingChannel, setEditingChannel] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [clipMask, setClipMask] = useState<GraphicsType | null>(null);
  const clipMaskRef: RefCallback<GraphicsType> = useCallback((g) => {
    if (g && g !== clipMask) setClipMask(g);
  }, [clipMask]);
  // For double-click detection on channel name
  const lastClickRef = useRef<{ time: number; ch: number }>({ time: 0, ch: -1 });

  const numChannels = pattern.channels.length;

  // ── Clip mask for scrollable area ──────────────────────────────────────────
  const drawClipMask = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width - LINE_NUMBER_WIDTH, HEADER_HEIGHT);
    g.fill({ color: 0xffffff });
  }, [width]);

  // ── Background drawing ─────────────────────────────────────────────────────
  const drawBackground = useCallback((g: GraphicsType) => {
    g.clear();
    // Full background — fully opaque so pattern data doesn't bleed through
    g.rect(0, 0, width, HEADER_HEIGHT);
    g.fill({ color: theme.bgTertiary.color, alpha: 1 });
    // Bottom border
    g.rect(0, HEADER_HEIGHT - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.3 });
    // ROW column background
    g.rect(0, 0, LINE_NUMBER_WIDTH, HEADER_HEIGHT);
    g.fill({ color: theme.bg.color, alpha: 1 });
    // ROW column right border
    g.rect(LINE_NUMBER_WIDTH - 1, 0, 1, HEADER_HEIGHT);
    g.fill({ color: theme.border.color, alpha: 0.3 });
  }, [width, theme]);

  // ── Channel background + separators ────────────────────────────────────────
  const drawChannelBackgrounds = useCallback((g: GraphicsType) => {
    g.clear();
    for (let ch = 0; ch < numChannels; ch++) {
      const colX = channelOffsets[ch] - scrollLeft - LINE_NUMBER_WIDTH;
      const chW = channelWidths[ch];
      const channel = pattern.channels[ch];

      // Color tint
      if (channel.color) {
        const colorNum = parseInt(channel.color.replace('#', ''), 16);
        g.rect(colX, 0, chW, HEADER_HEIGHT);
        g.fill({ color: colorNum, alpha: 0.08 });
        // Left color indicator
        g.rect(colX, 0, 2, HEADER_HEIGHT);
        g.fill({ color: colorNum, alpha: 0.5 });
      }

      // Solo highlight
      if (channel.solo) {
        g.rect(colX, 0, chW, HEADER_HEIGHT);
        g.fill({ color: theme.accent.color, alpha: 0.1 });
      }

      // Right separator
      g.rect(colX + chW - 1, 0, 1, HEADER_HEIGHT);
      g.fill({ color: theme.border.color, alpha: 0.3 });
    }
  }, [numChannels, channelOffsets, channelWidths, scrollLeft, pattern.channels, theme]);

  // ── Button draw helpers ────────────────────────────────────────────────────
  const drawMuteBtn = useCallback((g: GraphicsType, muted: boolean) => {
    g.clear();
    g.roundRect(0, 0, BTN_W, BTN_H, BTN_R);
    if (muted) {
      g.fill({ color: theme.error.color, alpha: 0.25 });
      g.roundRect(0, 0, BTN_W, BTN_H, BTN_R);
      g.stroke({ color: theme.error.color, alpha: 0.6, width: 1 });
    } else {
      g.fill({ color: theme.bgSecondary.color, alpha: 0.5 });
      g.roundRect(0, 0, BTN_W, BTN_H, BTN_R);
      g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
    }
  }, [theme]);

  const drawSoloBtn = useCallback((g: GraphicsType, solo: boolean) => {
    g.clear();
    g.roundRect(0, 0, BTN_W, BTN_H, BTN_R);
    if (solo) {
      g.fill({ color: theme.accent.color, alpha: 0.2 });
      g.roundRect(0, 0, BTN_W, BTN_H, BTN_R);
      g.stroke({ color: theme.accent.color, alpha: 0.6, width: 1 });
    } else {
      g.fill({ color: theme.bgSecondary.color, alpha: 0.5 });
      g.roundRect(0, 0, BTN_W, BTN_H, BTN_R);
      g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
    }
  }, [theme]);

  const drawCollapseBtn = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, BTN_W, BTN_H, BTN_R);
    g.fill({ color: theme.bgSecondary.color, alpha: 0.3 });
  }, [theme]);

  const drawContextBtn = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, BTN_W, BTN_H, BTN_R);
    g.fill({ color: theme.bgSecondary.color, alpha: 0.3 });
  }, [theme]);

  const drawHoverBtn = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, BTN_W, BTN_H, BTN_R);
    g.fill({ color: theme.bgHover.color, alpha: 0.5 });
  }, [theme]);

  const drawColorBtn = useCallback((g: GraphicsType, color: string | null) => {
    g.clear();
    g.roundRect(0, 0, BTN_W, BTN_H, BTN_R);
    if (color) {
      g.fill({ color: parseInt(color.replace('#', ''), 16), alpha: 0.7 });
    } else {
      g.fill({ color: theme.bgSecondary.color, alpha: 0.3 });
      // Draw a small palette indicator
      g.roundRect(3, 3, BTN_W - 6, BTN_H - 6, 2);
      g.fill({ color: theme.textMuted.color, alpha: 0.4 });
    }
  }, [theme]);

  const drawAddBtn = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, 32, BTN_H, BTN_R);
    g.fill({ color: theme.bgSecondary.color, alpha: 0.3 });
    g.roundRect(0, 0, 32, BTN_H, BTN_R);
    g.stroke({ color: theme.border.color, alpha: 0.2, width: 1 });
  }, [theme]);

  // ── Channel name editing ───────────────────────────────────────────────────
  const startEditing = useCallback((ch: number) => {
    setEditingChannel(ch);
    setEditValue(pattern.channels[ch]?.name || '');
  }, [pattern.channels]);

  const finishEditing = useCallback(() => {
    if (editingChannel !== null) {
      onUpdateName(editingChannel, editValue);
      setEditingChannel(null);
    }
  }, [editingChannel, editValue, onUpdateName]);

  // ── Popup handlers ─────────────────────────────────────────────────────────
  const openContextMenu = useCallback((ch: number, e: FederatedPointerEvent) => {
    const native = e.nativeEvent as PointerEvent;
    const channel = pattern.channels[ch];
    const { isLiveMode, queueChannelAction } = useLiveModeStore.getState();
    const { removeChannel, patterns, toggleChannelMute, toggleChannelSolo, toggleChannelCollapse } = useTrackerStore.getState();

    let items: ContextMenuItem[];

    if (isLiveMode) {
      items = [
        { label: 'Trigger', submenu: [
          { label: '4/4 Kicks', action: () => { queueChannelAction(ch, { type: 'trigger', pattern: 'kicks' }); onFillPattern(ch, '4on4'); } },
          { label: 'Build', action: () => { queueChannelAction(ch, { type: 'trigger', pattern: 'build' }); onFillPattern(ch, 'build'); } },
          { label: 'Drop', action: () => { queueChannelAction(ch, { type: 'trigger', pattern: 'drop' }); onFillPattern(ch, '16ths'); } },
          { label: 'Breakdown', action: () => { queueChannelAction(ch, { type: 'trigger', pattern: 'breakdown' }); onFillPattern(ch, 'breakdown'); } },
        ]},
        { label: 'Stutter', action: () => queueChannelAction(ch, { type: 'stutter' }) },
        { label: 'Roll', submenu: [
          { label: '1/4 Note', action: () => queueChannelAction(ch, { type: 'roll', division: '1/4' }) },
          { label: '1/8 Note', action: () => queueChannelAction(ch, { type: 'roll', division: '1/8' }) },
          { label: '1/16 Note', action: () => queueChannelAction(ch, { type: 'roll', division: '1/16' }) },
        ]},
        { label: '', separator: true },
        { label: channel.muted ? 'Unmute' : 'Mute', action: () => toggleChannelMute(ch) },
        { label: channel.solo ? 'Unsolo' : 'Solo', action: () => toggleChannelSolo(ch) },
        { label: 'Kill', action: () => { queueChannelAction(ch, { type: 'kill' }); toggleChannelMute(ch); } },
      ];
    } else {
      items = [
        { label: channel.collapsed ? 'Expand Channel' : 'Collapse Channel', action: () => {
          if (onToggleCollapse) onToggleCollapse(ch);
          else toggleChannelCollapse(ch);
        }},
        { label: '', separator: true },
        { label: 'Copy Track', action: () => onCopyChannel(ch) },
        { label: 'Cut Track', action: () => onCutChannel(ch) },
        { label: 'Paste Track', action: () => onPasteChannel(ch) },
        { label: 'Clear Channel', action: () => onClearChannel(ch) },
        { label: '', separator: true },
        { label: 'Fill', submenu: [
          { label: GENERATORS['4on4'].name, action: () => onFillPattern(ch, '4on4') },
          { label: GENERATORS.offbeat.name, action: () => onFillPattern(ch, 'offbeat') },
          { label: GENERATORS.backbeat.name, action: () => onFillPattern(ch, 'backbeat') },
          { label: GENERATORS.hiHats.name, action: () => onFillPattern(ch, 'hiHats') },
          { label: '', separator: true },
          { label: GENERATORS['8ths'].name, action: () => onFillPattern(ch, '8ths') },
          { label: GENERATORS['16ths'].name, action: () => onFillPattern(ch, '16ths') },
          { label: GENERATORS.random.name, action: () => onFillPattern(ch, 'random') },
          { label: '', separator: true },
          { label: GENERATORS.syncopated.name, action: () => onFillPattern(ch, 'syncopated') },
          { label: GENERATORS.walking.name, action: () => onFillPattern(ch, 'walking') },
          { label: '', separator: true },
          { label: GENERATORS.build.name, action: () => onFillPattern(ch, 'build') },
          { label: GENERATORS.breakdown.name, action: () => onFillPattern(ch, 'breakdown') },
        ]},
        { label: '', separator: true },
        { label: 'Transpose', submenu: [
          { label: '+12 (Octave Up)', action: () => onTranspose(ch, 12) },
          { label: '+7 (Fifth)', action: () => onTranspose(ch, 7) },
          { label: '+1 (Semitone)', action: () => onTranspose(ch, 1) },
          { label: '', separator: true },
          { label: '-1 (Semitone)', action: () => onTranspose(ch, -1) },
          { label: '-7 (Fifth)', action: () => onTranspose(ch, -7) },
          { label: '-12 (Octave Down)', action: () => onTranspose(ch, -12) },
        ]},
        { label: 'Humanize', action: () => onHumanize(ch) },
        { label: 'Interpolate', action: () => onInterpolate(ch) },
        { label: '', separator: true },
        { label: 'B/D Animations', submenu: [
          { label: 'Reverse Visual', action: () => onReverseVisual(ch) },
          { label: '', separator: true },
          { label: 'Polyrhythm', action: () => onPolyrhythm(ch) },
          { label: 'Fibonacci', action: () => onFibonacci(ch) },
          { label: 'Euclidean', action: () => onEuclidean(ch) },
          { label: '', separator: true },
          { label: 'Ping-Pong', action: () => onPingPong(ch) },
          { label: 'Glitch', action: () => onGlitch(ch) },
          { label: 'Strobe', action: () => onStrobe(ch) },
          { label: 'Visual Echo', action: () => onVisualEcho(ch) },
          { label: '', separator: true },
          { label: 'Converge', action: () => onConverge(ch) },
          { label: 'Spiral', action: () => onSpiral(ch) },
          { label: 'Bounce', action: () => onBounce(ch) },
          { label: 'Chaos', action: () => onChaos(ch) },
        ]},
        { label: '', separator: true },
        { label: channel.muted ? 'Unmute' : 'Mute', action: () => toggleChannelMute(ch) },
        { label: channel.solo ? 'Unsolo' : 'Solo', action: () => toggleChannelSolo(ch) },
        { label: '', separator: true },
        { label: 'Delete Channel', action: () => removeChannel(ch), disabled: patterns[0]?.channels.length <= 1 },
      ];
    }

    const menuId = `ch-ctx-${ch}`;
    usePixiDropdownStore.getState().openDropdown({
      kind: 'contextMenu',
      id: menuId,
      x: Math.min(native.clientX, (window.innerWidth || 1920) - 200),
      y: Math.min(native.clientY, (window.innerHeight || 1080) - 400),
      items,
      onClose: () => usePixiDropdownStore.getState().closeDropdown(menuId),
    });
  }, [
    pattern.channels,
    onToggleCollapse, onCopyChannel, onCutChannel, onPasteChannel, onClearChannel,
    onFillPattern, onTranspose, onHumanize, onInterpolate,
    onReverseVisual, onPolyrhythm, onFibonacci, onEuclidean,
    onPingPong, onGlitch, onStrobe, onVisualEcho,
    onConverge, onSpiral, onBounce, onChaos,
  ]);

  const openColorPicker = useCallback((ch: number, e: FederatedPointerEvent) => {
    const native = e.nativeEvent as PointerEvent;
    usePixiDropdownStore.getState().openDropdown({
      kind: 'colorPicker',
      id: `ch-color-${ch}`,
      x: native.clientX,
      y: native.clientY,
      currentColor: pattern.channels[ch]?.color ?? null,
      onColorSelect: (color) => { onSetColor(ch, color); },
      onClose: () => usePixiDropdownStore.getState().closeDropdown(`ch-color-${ch}`),
    });
  }, [pattern.channels, onSetColor]);


  // ── Per-channel header rendering ───────────────────────────────────────────
  const channelHeaders = useMemo(() => {
    const headers: React.ReactNode[] = [];

    for (let ch = 0; ch < numChannels; ch++) {
      const channel = pattern.channels[ch];
      const chW = channelWidths[ch];
      const colX = channelOffsets[ch] - LINE_NUMBER_WIDTH;
      const isCollapsed = channel.collapsed;
      const chNum = (ch + 1).toString().padStart(2, '0');
      const chColor = channel.color ? parseInt(channel.color.replace('#', ''), 16) : theme.accent.color;
      const mutedAlpha = channel.muted ? 0.5 : 1.0;

      const hasSpeed = channelSpeeds && channelSpeeds[ch] !== undefined && channelSpeeds[ch] !== songInitialSpeed;

      if (isCollapsed) {
        // Collapsed: channel number + expand button
        headers.push(
          <pixiContainer
            key={channel.id}
            layout={{
              position: 'absolute',
              left: colX,
              top: 0,
              width: chW,
              height: HEADER_HEIGHT,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 4,
              paddingRight: 4,
            }}
            alpha={mutedAlpha}
          >
            <pixiBitmapText
              text={chNum}
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
              tint={chColor}
              layout={{}}
            />
            {/* Expand button */}
            <HoverableHeaderBtn drawBg={drawCollapseBtn} drawHoverBg={drawHoverBtn} onPress={() => onToggleCollapse(ch)}>
              <pixiBitmapText
                text={FAD_ICONS['caret-right']}
                style={{ fontFamily: PIXI_FONTS.ICONS, fontSize: 10, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            </HoverableHeaderBtn>
          </pixiContainer>
        );
        continue;
      }

      // ── Expanded channel header ──────────────────────────────────────────
      // Button area width: context(16) + color(16) + M(16) + S(16) + collapse(16) + gaps
      const buttonAreaW = BTN_W * 5 + BTN_GAP * 4 + 4;
      const textAreaW = chW - buttonAreaW - 8;

      headers.push(
        <pixiContainer
          key={channel.id}
          layout={{
            position: 'absolute',
            left: colX,
            top: 0,
            width: chW,
            height: HEADER_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 6,
            paddingRight: 4,
          }}
          alpha={mutedAlpha}
          eventMode="static"
          onPointerDown={(e: FederatedPointerEvent) => {
            const native = e.nativeEvent as PointerEvent;
            // Right-click → context menu
            if (native.button === 2) {
              openContextMenu(ch, e);
              return;
            }
            // Double-click → edit channel name
            if (native.button === 0 && showChannelNames) {
              const now = Date.now();
              if (now - lastClickRef.current.time < 300 && lastClickRef.current.ch === ch) {
                startEditing(ch);
                lastClickRef.current = { time: 0, ch: -1 };
              } else {
                lastClickRef.current = { time: now, ch };
              }
            }
          }}
        >
          {/* Text area: channel number + speed badge + name */}
          <pixiContainer layout={{ width: textAreaW, height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
            <pixiBitmapText
              text={chNum}
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
              tint={chColor}
              alpha={0.8}
              layout={{}}
            />
            {hasSpeed && (
              <pixiContainer layout={{ height: 12, flexDirection: 'row', alignItems: 'center', paddingLeft: 2, paddingRight: 2 }}>
                <pixiGraphics
                  draw={(g: GraphicsType) => {
                    g.clear();
                    g.roundRect(0, 0, 28, 12, 2);
                    g.fill({ color: 0xfbbf24, alpha: 0.15 });
                    g.roundRect(0, 0, 28, 12, 2);
                    g.stroke({ color: 0xfbbf24, alpha: 0.35, width: 1 });
                  }}
                  layout={{ position: 'absolute', width: 28, height: 12 }}
                />
                <pixiBitmapText
                  text={`S:${channelSpeeds![ch]}`}
                  style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
                  tint={0xfbbf24}
                  layout={{}}
                />
              </pixiContainer>
            )}
            {showChannelNames && editingChannel === ch && (
              <pixiContainer layout={{ height: 18, flexDirection: 'row', alignItems: 'center', paddingLeft: 2, paddingRight: 2 }}>
                <pixiGraphics
                  draw={(g: GraphicsType) => {
                    g.clear();
                    g.roundRect(0, 0, Math.max(50, chW - 120), 18, 3);
                    g.fill({ color: 0x000000, alpha: 0.85 });
                    g.roundRect(0, 0, Math.max(50, chW - 120), 18, 3);
                    g.stroke({ color: 0x6366f1, alpha: 0.6, width: 1 });
                  }}
                  layout={{ position: 'absolute', width: Math.max(50, chW - 120), height: 18 }}
                />
                <pixiBitmapText
                  text={(editValue || '').toUpperCase() || ' '}
                  style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
                  tint={0xffffff}
                  alpha={0.9}
                  layout={{}}
                />
              </pixiContainer>
            )}
            {showChannelNames && editingChannel !== ch && (
              <pixiBitmapText
                text={(channel.name || `CH${ch + 1}`).toUpperCase()}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
                tint={channel.name ? theme.text.color : theme.textMuted.color}
                alpha={channel.name ? 0.8 : 0.4}
                layout={{}}
              />
            )}
          </pixiContainer>

          {/* Button area */}
          <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: BTN_GAP, marginLeft: 'auto' }}>
            {/* Context menu button (three dots) */}
            <HoverableHeaderBtn drawBg={drawContextBtn} drawHoverBg={drawHoverBtn} onPress={(e) => openContextMenu(ch, e)}>
              <pixiBitmapText
                text={'\u2026'}
                style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            </HoverableHeaderBtn>

            {/* Color picker button */}
            <HoverableHeaderBtn
              drawBg={(g: GraphicsType) => drawColorBtn(g, channel.color)}
              drawHoverBg={(g: GraphicsType) => {
                drawColorBtn(g, channel.color);
                g.roundRect(0, 0, BTN_W, BTN_H, BTN_R);
                g.stroke({ color: theme.text.color, alpha: 0.3, width: 1 });
              }}
              onPress={(e) => openColorPicker(ch, e)}
            >
              {null}
            </HoverableHeaderBtn>

            {/* Mute button — speaker/mute icon matching DOM VolumeX/Volume2 */}
            <HoverableHeaderBtn drawBg={(g: GraphicsType) => drawMuteBtn(g, channel.muted)} drawHoverBg={drawHoverBtn} onPress={() => onToggleMute(ch)}>
              <pixiBitmapText
                text={channel.muted ? FAD_ICONS['mute'] : FAD_ICONS['speaker']}
                style={{ fontFamily: PIXI_FONTS.ICONS, fontSize: 10, fill: 0xffffff }}
                tint={channel.muted ? theme.error.color : theme.textMuted.color}
                layout={{}}
              />
            </HoverableHeaderBtn>

            {/* Solo button — headphones icon matching DOM Headphones */}
            <HoverableHeaderBtn drawBg={(g: GraphicsType) => drawSoloBtn(g, channel.solo)} drawHoverBg={drawHoverBtn} onPress={() => onToggleSolo(ch)}>
              <pixiBitmapText
                text={FAD_ICONS['headphones']}
                style={{ fontFamily: PIXI_FONTS.ICONS, fontSize: 10, fill: 0xffffff }}
                tint={channel.solo ? theme.accent.color : theme.textMuted.color}
                layout={{}}
              />
            </HoverableHeaderBtn>

            {/* Collapse button — caret-left matching DOM ChevronLeft */}
            <HoverableHeaderBtn drawBg={drawCollapseBtn} drawHoverBg={drawHoverBtn} onPress={() => onToggleCollapse(ch)}>
              <pixiBitmapText
                text={FAD_ICONS['caret-left']}
                style={{ fontFamily: PIXI_FONTS.ICONS, fontSize: 10, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            </HoverableHeaderBtn>
          </pixiContainer>
        </pixiContainer>
      );
    }

    // Add channel button (after last channel)
    if (numChannels < 16) {
      const lastOffset = numChannels > 0
        ? channelOffsets[numChannels - 1] + channelWidths[numChannels - 1] - LINE_NUMBER_WIDTH
        : 0;
      headers.push(
        <AddChannelBtn
          key="add-channel"
          left={lastOffset + 4}
          drawBg={drawAddBtn}
          drawHoverBg={(g: GraphicsType) => {
            g.clear();
            g.roundRect(0, 0, 32, BTN_H, BTN_R);
            g.fill({ color: theme.bgHover.color, alpha: 0.5 });
            g.roundRect(0, 0, 32, BTN_H, BTN_R);
            g.stroke({ color: theme.accent.color, alpha: 0.3, width: 1 });
          }}
          textColor={theme.textMuted.color}
          hoverTextColor={theme.accent.color}
          onPress={onAddChannel}
        />
      );
    }

    return headers;
  }, [
    numChannels, pattern.channels, channelWidths, channelOffsets, scrollLeft,
    theme, showChannelNames, channelSpeeds, songInitialSpeed, editingChannel, editValue,
    onToggleMute, onToggleSolo, onToggleCollapse, onAddChannel,
    openContextMenu, openColorPicker, startEditing,
    drawMuteBtn, drawSoloBtn, drawCollapseBtn, drawContextBtn, drawColorBtn, drawAddBtn, drawHoverBtn,
  ]);


  return (
    <pixiContainer layout={{ width, height: HEADER_HEIGHT }}>
      {/* Background layer */}
      <pixiGraphics draw={drawBackground} layout={{ position: 'absolute', width, height: HEADER_HEIGHT }} />

      {/* ROW label */}
      <pixiBitmapText
        text="ROW"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: 8, top: (HEADER_HEIGHT - 9) / 2 }}
      />

      {/* Scrollable channel area — masked to viewport */}
      <pixiContainer
        layout={{ position: 'absolute', left: LINE_NUMBER_WIDTH, top: 0, width: width - LINE_NUMBER_WIDTH, height: HEADER_HEIGHT }}
      >
        <pixiGraphics ref={clipMaskRef} draw={drawClipMask} renderable={false} layout={{ position: 'absolute', width: width - LINE_NUMBER_WIDTH, height: HEADER_HEIGHT }} />
        <pixiContainer
          x={-scrollLeft + LINE_NUMBER_WIDTH}
          layout={{ position: 'absolute', top: 0, height: HEADER_HEIGHT }}
          mask={clipMask}
        >
          {/* Channel backgrounds */}
          <pixiGraphics draw={drawChannelBackgrounds} layout={{ position: 'absolute', width: totalChannelsWidth, height: HEADER_HEIGHT }} />
          {/* Per-channel headers */}
          {channelHeaders}
        </pixiContainer>
      </pixiContainer>

      {/* Hidden DOM input for keyboard/IME capture during channel name editing */}
      {editingChannel !== null && createPortal(
        <input
          autoFocus
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={finishEditing}
          onKeyDown={(e) => { if (e.key === 'Enter') finishEditing(); if (e.key === 'Escape') setEditingChannel(null); }}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />,
        document.body,
      )}
    </pixiContainer>
  );
};
