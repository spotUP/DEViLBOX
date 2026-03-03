/**
 * PixiChannelHeaders — Native PixiJS channel header component.
 *
 * Replaces the DOM-based ChannelHeaderDOM (which floated above the WebGL canvas
 * and was invisible to the CRT post-processing shader). Renders entirely within
 * the GL scene graph so the CRT shader affects it, and naturally disappears when
 * the tracker view is unmounted.
 *
 * DOM portals are used only for popups (ChannelContextMenu, ChannelColorPicker)
 * which need to float above everything, and for the channel name editing input.
 */

import React, { useCallback, useMemo, useRef, useState, type RefCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { ChannelContextMenu } from '@/components/tracker/ChannelContextMenu';
import { ChannelColorPicker } from '@/components/tracker/ChannelColorPicker';
import { useUIStore } from '@stores';
import type { GeneratorType } from '@utils/patternGenerators';
import type { ChannelData } from '@typedefs/tracker';

// ─── Layout constants ────────────────────────────────────────────────────────
const HEADER_HEIGHT = 28;
const LINE_NUMBER_WIDTH = 40;
const BTN_W = 16;
const BTN_H = 14;
const BTN_GAP = 2;
const BTN_R = 3;

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

// ─── Popup state for context menu and color picker ───────────────────────────
interface PopupState {
  type: 'context' | 'color';
  channelIndex: number;
  position: { x: number; y: number };
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
  const [popup, setPopup] = useState<PopupState | null>(null);
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
      g.fill({ color: theme.warning.color, alpha: 0.25 });
      g.roundRect(0, 0, BTN_W, BTN_H, BTN_R);
      g.stroke({ color: theme.warning.color, alpha: 0.6, width: 1 });
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
    setPopup({ type: 'context', channelIndex: ch, position: { x: native.clientX, y: native.clientY } });
  }, []);

  const openColorPicker = useCallback((ch: number, e: FederatedPointerEvent) => {
    const native = e.nativeEvent as PointerEvent;
    setPopup({ type: 'color', channelIndex: ch, position: { x: native.clientX, y: native.clientY } });
  }, []);

  const closePopup = useCallback(() => setPopup(null), []);

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
            <pixiContainer
              eventMode="static"
              cursor="pointer"
              onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); onToggleCollapse(ch); }}
              layout={{ width: BTN_W, height: BTN_H, justifyContent: 'center', alignItems: 'center' }}
            >
              <pixiGraphics draw={drawCollapseBtn} layout={{ position: 'absolute', width: BTN_W, height: BTN_H }} />
              <pixiBitmapText
                text={'\u25B6'}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            </pixiContainer>
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
            <pixiContainer
              eventMode="static"
              cursor="pointer"
              onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); openContextMenu(ch, e); }}
              layout={{ width: BTN_W, height: BTN_H, justifyContent: 'center', alignItems: 'center' }}
            >
              <pixiGraphics draw={drawContextBtn} layout={{ position: 'absolute', width: BTN_W, height: BTN_H }} />
              <pixiBitmapText
                text={'\u2026'}
                style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            </pixiContainer>

            {/* Color picker button */}
            <pixiContainer
              eventMode="static"
              cursor="pointer"
              onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); openColorPicker(ch, e); }}
              layout={{ width: BTN_W, height: BTN_H, justifyContent: 'center', alignItems: 'center' }}
            >
              <pixiGraphics
                draw={(g: GraphicsType) => drawColorBtn(g, channel.color)}
                layout={{ position: 'absolute', width: BTN_W, height: BTN_H }}
              />
            </pixiContainer>

            {/* Mute button */}
            <pixiContainer
              eventMode="static"
              cursor="pointer"
              onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); onToggleMute(ch); }}
              layout={{ width: BTN_W, height: BTN_H, justifyContent: 'center', alignItems: 'center' }}
            >
              <pixiGraphics
                draw={(g: GraphicsType) => drawMuteBtn(g, channel.muted)}
                layout={{ position: 'absolute', width: BTN_W, height: BTN_H }}
              />
              <pixiBitmapText
                text="M"
                style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
                tint={channel.muted ? theme.error.color : theme.textMuted.color}
                layout={{}}
              />
            </pixiContainer>

            {/* Solo button */}
            <pixiContainer
              eventMode="static"
              cursor="pointer"
              onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); onToggleSolo(ch); }}
              layout={{ width: BTN_W, height: BTN_H, justifyContent: 'center', alignItems: 'center' }}
            >
              <pixiGraphics
                draw={(g: GraphicsType) => drawSoloBtn(g, channel.solo)}
                layout={{ position: 'absolute', width: BTN_W, height: BTN_H }}
              />
              <pixiBitmapText
                text="S"
                style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
                tint={channel.solo ? theme.warning.color : theme.textMuted.color}
                layout={{}}
              />
            </pixiContainer>

            {/* Collapse button */}
            <pixiContainer
              eventMode="static"
              cursor="pointer"
              onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); onToggleCollapse(ch); }}
              layout={{ width: BTN_W, height: BTN_H, justifyContent: 'center', alignItems: 'center' }}
            >
              <pixiGraphics draw={drawCollapseBtn} layout={{ position: 'absolute', width: BTN_W, height: BTN_H }} />
              <pixiBitmapText
                text={'\u25C0'}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            </pixiContainer>
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
        <pixiContainer
          key="add-channel"
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => onAddChannel()}
          layout={{
            position: 'absolute',
            left: lastOffset + 4,
            top: (HEADER_HEIGHT - BTN_H) / 2,
            width: 32,
            height: BTN_H,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <pixiGraphics draw={drawAddBtn} layout={{ position: 'absolute', width: 32, height: BTN_H }} />
          <pixiBitmapText
            text="+"
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />
        </pixiContainer>
      );
    }

    return headers;
  }, [
    numChannels, pattern.channels, channelWidths, channelOffsets, scrollLeft,
    theme, showChannelNames, channelSpeeds, songInitialSpeed, editingChannel,
    onToggleMute, onToggleSolo, onToggleCollapse, onAddChannel,
    openContextMenu, openColorPicker, startEditing,
    drawMuteBtn, drawSoloBtn, drawCollapseBtn, drawContextBtn, drawColorBtn, drawAddBtn,
  ]);

  // ── Popup portal (ChannelContextMenu) ──────────────────────────────────────
  const contextMenuChannel = popup?.type === 'context' ? popup.channelIndex : -1;
  const contextMenuOpen = popup?.type === 'context';
  const contextMenuPos = popup?.type === 'context' ? popup.position : { x: 0, y: 0 };
  const colorPickerChannel = popup?.type === 'color' ? popup.channelIndex : -1;
  const colorPickerOpen = popup?.type === 'color';
  const colorPickerPos = popup?.type === 'color' ? popup.position : { x: 0, y: 0 };

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

      {/* ─── DOM Portals for popups ──────────────────────────────────────── */}
      {contextMenuOpen && contextMenuChannel >= 0 && createPortal(
        <div
          style={{
            position: 'fixed',
            left: contextMenuPos.x,
            top: contextMenuPos.y,
            zIndex: 9999,
          }}
        >
          <ChannelContextMenu
            channelIndex={contextMenuChannel}
            channel={pattern.channels[contextMenuChannel]}
            patternId={pattern.id}
            patternLength={pattern.length}
            onFillPattern={(ch, g) => { onFillPattern(ch, g); closePopup(); }}
            onClearChannel={(ch) => { onClearChannel(ch); closePopup(); }}
            onCopyChannel={(ch) => { onCopyChannel(ch); closePopup(); }}
            onCutChannel={(ch) => { onCutChannel(ch); closePopup(); }}
            onPasteChannel={(ch) => { onPasteChannel(ch); closePopup(); }}
            onTranspose={(ch, s) => { onTranspose(ch, s); closePopup(); }}
            onHumanize={(ch) => { onHumanize(ch); closePopup(); }}
            onInterpolate={(ch) => { onInterpolate(ch); closePopup(); }}
            onAcidGenerator={() => {}}
            onRandomize={() => {}}
            onToggleCollapse={onToggleCollapse}
            onReverseVisual={onReverseVisual}
            onPolyrhythm={onPolyrhythm}
            onFibonacci={onFibonacci}
            onEuclidean={onEuclidean}
            onPingPong={onPingPong}
            onGlitch={onGlitch}
            onStrobe={onStrobe}
            onVisualEcho={onVisualEcho}
            onConverge={onConverge}
            onSpiral={onSpiral}
            onBounce={onBounce}
            onChaos={onChaos}
          />
        </div>,
        document.body,
      )}

      {colorPickerOpen && colorPickerChannel >= 0 && createPortal(
        <div
          style={{
            position: 'fixed',
            left: colorPickerPos.x,
            top: colorPickerPos.y,
            zIndex: 9999,
          }}
        >
          <ChannelColorPicker
            currentColor={pattern.channels[colorPickerChannel]?.color ?? null}
            onColorSelect={(color) => { onSetColor(colorPickerChannel, color); closePopup(); }}
          />
        </div>,
        document.body,
      )}

      {/* Channel name editing input — DOM portal */}
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
            left: channelOffsets[editingChannel] - scrollLeft + 40,
            top: 4,
            width: Math.max(60, channelWidths[editingChannel] - 120),
            height: 20,
            background: 'rgba(0,0,0,0.85)',
            border: '1px solid rgba(99,102,241,0.5)',
            borderRadius: 3,
            color: '#fff',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            fontWeight: 'bold',
            padding: '0 4px',
            textTransform: 'uppercase',
            outline: 'none',
            zIndex: 10000,
          }}
        />,
        document.body,
      )}
    </pixiContainer>
  );
};
