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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { usePixiDropdownStore } from '../../stores/usePixiDropdownStore';
import { getLucideTexture, preloadLucideIcons } from '../../utils/lucideToTexture';
import {
  ICON_VOLUME_2, ICON_VOLUME_X, ICON_HEADPHONES,
  ICON_CHEVRON_LEFT, ICON_CHEVRON_RIGHT, ICON_ELLIPSIS_V, ICON_PALETTE,
} from '../../utils/lucideIcons';
import { useUIStore, useInstrumentStore } from '@stores';
import { useLiveModeStore } from '@stores/useLiveModeStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useFormatStore } from '@stores/useFormatStore';
import { useAutomationStore } from '@stores/useAutomationStore';
import { useCursorStore } from '@stores/useCursorStore';
import { getParamsForFormat, groupParams, type AutomationFormat } from '@/engine/automation/AutomationParams';
import { MASTER_FX_PRESETS } from '@constants/fxPresets';
import { getNKSParametersForSynth } from '@/midi/performance/synthParameterMaps';
import type { SynthType } from '@typedefs/instrument';
import { GENERATORS, type GeneratorType } from '@utils/patternGenerators';
import type { ChannelData } from '@typedefs/tracker';
import type { ContextMenuItem } from '../../input/PixiContextMenu';
import { PixiPureTextInput } from '../../input/PixiPureTextInput';

// ─── Layout constants ────────────────────────────────────────────────────────
const HEADER_ROW_HEIGHT = 28;
const COLUMN_LABELS_HEIGHT = 20;
const HEADER_HEIGHT = HEADER_ROW_HEIGHT + COLUMN_LABELS_HEIGHT; // 48 total — matches DOM (28 + 20)
const LINE_NUMBER_WIDTH = 40;
const BTN_W = 18;
const BTN_H = 16;
const BTN_GAP = 2;
const BTN_R = 3;
const CHAR_WIDTH = 10; // must match PixiPatternEditor CHAR_WIDTH

// Pre-allocated layout objects to avoid GC pressure and Yoga recalculation
const LAYOUT_BTN = { width: BTN_W, height: BTN_H, justifyContent: 'center' as const, alignItems: 'center' as const };
const LAYOUT_BTN_BG = { position: 'absolute' as const, width: BTN_W, height: BTN_H };
const LAYOUT_EMPTY = {};
const LAYOUT_ADD_BTN_BG = { position: 'absolute' as const, width: 32, height: BTN_H };
const LAYOUT_GEN_BADGE_ROW = { height: 12, flexDirection: 'row' as const, alignItems: 'center' as const, paddingLeft: 2, paddingRight: 2 };
const LAYOUT_NAME_ROW = { height: 18, flexDirection: 'row' as const, alignItems: 'center' as const, paddingLeft: 2, paddingRight: 2 };
const LAYOUT_BTNS_ROW = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: BTN_GAP, marginLeft: 'auto' as const };

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
      onClick={(e: FederatedPointerEvent) => { e.stopPropagation(); onPress(e); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      layout={LAYOUT_BTN}
    >
      <pixiGraphics draw={hovered ? drawHoverBg : drawBg} eventMode="none" layout={LAYOUT_BTN_BG} />
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
      onClick={() => onPress()}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      layout={{
        position: 'absolute',
        left,
        top: (HEADER_ROW_HEIGHT - BTN_H) / 2,
        width: 32,
        height: BTN_H,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <pixiGraphics draw={hovered ? drawHoverBg : drawBg} eventMode="none" layout={LAYOUT_ADD_BTN_BG} />
      <pixiBitmapText
        text="+"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={hovered ? hoverTextColor : textColor}
        eventMode="none"
        layout={LAYOUT_EMPTY}
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


const PixiChannelHeadersInner: React.FC<PixiChannelHeadersProps> = ({
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
  // Active channel index for the bottom-border highlight on the focused header
  const activeChannelIndex = useCursorStore(s => s.cursor.channelIndex);
  const [editingChannel, setEditingChannel] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  // Mask removed — using overflow: hidden on the container instead
  // For double-click detection on channel name
  const lastClickRef = useRef<{ time: number; ch: number }>({ time: 0, ch: -1 });

  // Instrument type lookup for channel badges (SC, TB303, etc.)
  const instruments = useInstrumentStore(s => s.instruments);

  const numChannels = pattern.channels.length;

  // ── Lucide icon textures (preloaded for async rendering) ────────────────
  const ICON_SIZE = 14; // DOM uses size={12} but Pixi textures need slightly larger for visual match
  const [iconsReady, setIconsReady] = useState(false);
  useEffect(() => {
    setIconsReady(false); // Reset so stale textures aren't used during preload
    preloadLucideIcons([
      { name: 'volume-2', iconNode: ICON_VOLUME_2, size: ICON_SIZE, color: theme.textMuted.color },
      { name: 'volume-x', iconNode: ICON_VOLUME_X, size: ICON_SIZE, color: theme.error.color },
      { name: 'headphones', iconNode: ICON_HEADPHONES, size: ICON_SIZE, color: theme.textMuted.color },
      { name: 'headphones-active', iconNode: ICON_HEADPHONES, size: ICON_SIZE, color: theme.accent.color },
      { name: 'chevron-left', iconNode: ICON_CHEVRON_LEFT, size: ICON_SIZE, color: theme.textMuted.color },
      { name: 'chevron-right', iconNode: ICON_CHEVRON_RIGHT, size: ICON_SIZE, color: theme.textMuted.color },
      { name: 'ellipsis-v', iconNode: ICON_ELLIPSIS_V, size: ICON_SIZE, color: theme.textMuted.color },
      { name: 'palette', iconNode: ICON_PALETTE, size: ICON_SIZE, color: theme.textMuted.color },
    ]).then(() => setIconsReady(true));
  }, [theme]);

  // Memoized texture getters (cache-backed, safe to call per-render after preload)
  const iconTextures = useMemo(() => {
    if (!iconsReady) return null;
    return {
      volumeOn: getLucideTexture('volume-2', ICON_VOLUME_2, ICON_SIZE, theme.textMuted.color),
      volumeOff: getLucideTexture('volume-x', ICON_VOLUME_X, ICON_SIZE, theme.error.color),
      headphones: getLucideTexture('headphones', ICON_HEADPHONES, ICON_SIZE, theme.textMuted.color),
      headphonesActive: getLucideTexture('headphones-active', ICON_HEADPHONES, ICON_SIZE, theme.accent.color),
      chevronLeft: getLucideTexture('chevron-left', ICON_CHEVRON_LEFT, ICON_SIZE, theme.textMuted.color),
      chevronRight: getLucideTexture('chevron-right', ICON_CHEVRON_RIGHT, ICON_SIZE, theme.textMuted.color),
      ellipsisV: getLucideTexture('ellipsis-v', ICON_ELLIPSIS_V, ICON_SIZE, theme.textMuted.color),
    };
  }, [iconsReady, theme]);

  // ── Background drawing ─────────────────────────────────────────────────────
  const drawBackground = useCallback((g: GraphicsType) => {
    g.clear();
    // Full background — fully opaque so pattern data doesn't bleed through
    g.rect(0, 0, width, HEADER_HEIGHT);
    g.fill({ color: theme.bgTertiary.color, alpha: 1 });
    // Row 1 bottom border (between channel names and column labels)
    g.rect(0, HEADER_ROW_HEIGHT - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });
    // Row 2 bottom border
    g.rect(0, HEADER_HEIGHT - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.3 });
    // ROW column background — use bgTertiary (same as header), not theme.bg (may be red)
    g.rect(0, 0, LINE_NUMBER_WIDTH, HEADER_HEIGHT);
    g.fill({ color: theme.bgTertiary.color, alpha: 1 });
    // ROW column right border
    g.rect(LINE_NUMBER_WIDTH - 1, 0, 1, HEADER_HEIGHT);
    g.fill({ color: theme.border.color, alpha: 0.3 });
  }, [width, theme]);

  // ── Channel background + separators ────────────────────────────────────────
  const drawChannelBackgrounds = useCallback((g: GraphicsType) => {
    g.clear();
    for (let ch = 0; ch < numChannels; ch++) {
      const colX = channelOffsets[ch] - LINE_NUMBER_WIDTH;
      const chW = channelWidths[ch];
      const channel = pattern.channels[ch];

      // Color tint
      if (channel.color) {
        const colorNum = parseInt(channel.color.replace('#', ''), 16);
        g.rect(colX, 0, chW, HEADER_ROW_HEIGHT);
        g.fill({ color: colorNum, alpha: 0.08 });
        // Left color indicator
        g.rect(colX, 0, 2, HEADER_ROW_HEIGHT);
        g.fill({ color: colorNum, alpha: 0.5 });
      }

      // Solo highlight
      if (channel.solo) {
        g.rect(colX, 0, chW, HEADER_ROW_HEIGHT);
        g.fill({ color: theme.accent.color, alpha: 0.1 });
      }

      // Active channel bottom border (3px in channel color, fall back to accent)
      if (ch === activeChannelIndex) {
        const accentNum = channel.color
          ? parseInt(channel.color.replace('#', ''), 16)
          : theme.accent.color;
        g.rect(colX, HEADER_ROW_HEIGHT - 3, chW, 3);
        g.fill({ color: accentNum, alpha: 1 });
      }

      // Right separator (full height)
      g.rect(colX + chW - 1, 0, 1, HEADER_HEIGHT);
      g.fill({ color: theme.border.color, alpha: 0.3 });
    }
  }, [numChannels, channelOffsets, channelWidths, pattern.channels, theme, activeChannelIndex]);

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
        // FX Presets
        { label: 'FX Presets', submenu: (() => {
          if (!channel.instrumentId) return [{ label: '(no instrument)', disabled: true }];
          return MASTER_FX_PRESETS.map(preset => ({
            label: preset.name,
            action: () => {
              const effects = preset.effects.map((fx: any, i: number) => ({ ...fx, id: `fx-${Date.now()}-${i}` }));
              useInstrumentStore.getState().updateInstrument(channel.instrumentId!, { effects });
            },
          }));
        })()},
        { label: '', separator: true },
        { label: channel.muted ? 'Unmute' : 'Mute', action: () => toggleChannelMute(ch) },
        { label: channel.solo ? 'Unsolo' : 'Solo', action: () => toggleChannelSolo(ch) },
        { label: '', separator: true },
        { label: 'Max Voices', submenu: (() => {
          const currentMax = channel.channelMeta?.maxVoices || 0;
          const options = [0, 1, 2, 4, 8, 16];
          return options.map(n => ({
            label: n === 0 ? `Unlimited${currentMax === 0 ? ' ✓' : ''}` : `${n}${currentMax === n ? ' ✓' : ''}`,
            action: () => {
              const { setChannelMeta } = useTrackerStore.getState();
              setChannelMeta(ch, { maxVoices: n });
              import('@engine/ToneEngine').then(({ getToneEngine }) => {
                getToneEngine().setChannelMaxVoices(ch, n);
              });
            },
          }));
        })()},
        { label: 'Delete Channel', action: () => removeChannel(ch), disabled: patterns[0]?.channels.length <= 1 },
        // Automation submenu (NKS synth params + register params)
        ...(() => {
          const { setActiveParameter, setShowLane, getShowLane, getCurvesForPattern, removeCurve } = useAutomationStore.getState();
          const showLane = getShowLane(ch);

          // NKS synth params for this channel's instrument
          const chInst = channel.instrumentId != null ? instruments[channel.instrumentId] : null;
          const nksItems: ContextMenuItem[] = [];
          if (chInst) {
            const nksParams = getNKSParametersForSynth(chInst.synthType as SynthType);
            const automatable = nksParams.filter((p: any) => p.isAutomatable).slice(0, 8);
            for (const p of automatable) {
              nksItems.push({
                label: p.name,
                action: () => {
                  setActiveParameter(ch, p.id);
                  setShowLane(ch, true);
                  if (!useUIStore.getState().showAutomationLanes) useUIStore.getState().toggleAutomationLanes();
                },
              });
            }
          }

          // Register params (SID/Paula/Furnace)
          const { editorMode, furnaceNative } = useFormatStore.getState();
          const fmt: AutomationFormat | null =
            editorMode === 'goattracker' ? 'gtultra' :
            editorMode === 'furnace' ? 'furnace' :
            editorMode === 'hively' ? 'hively' :
            editorMode === 'klystrack' ? 'klystrack' :
            editorMode === 'sc68' ? 'sc68' :
            editorMode === 'classic' ? 'uade' : null;

          const registerItems: ContextMenuItem[] = [];
          if (fmt) {
            const config = fmt === 'furnace' && furnaceNative
              ? { chipIds: furnaceNative.chipIds, channelCount: furnaceNative.subsongs[furnaceNative.activeSubsong]?.channels.length ?? 4 }
              : undefined;
            const params = getParamsForFormat(fmt, config);
            const groups = groupParams(params);
            for (const group of groups) {
              registerItems.push({
                label: group.label,
                submenu: group.params.map(p => ({
                  label: p.label,
                  action: () => {
                    setActiveParameter(ch, p.id);
                    setShowLane(ch, true);
                    if (!useUIStore.getState().showAutomationLanes) useUIStore.getState().toggleAutomationLanes();
                  },
                })),
              });
            }
          }

          // Get curves for clear action
          const pat = patterns[useTrackerStore.getState().currentPatternIndex];
          const curves = pat ? getCurvesForPattern(pat.id, ch) : [];
          const hasCurves = curves.length > 0;

          const submenu: ContextMenuItem[] = [
            ...nksItems,
            ...(nksItems.length > 0 && registerItems.length > 0 ? [{ label: '', separator: true }] : []),
            ...(registerItems.length > 0 ? [{ label: 'Register Params', submenu: registerItems }] : []),
            { label: '', separator: true },
            { label: showLane ? 'Hide Lane' : 'Show Lane', action: () => {
              setShowLane(ch, !showLane);
              if (!showLane && !useUIStore.getState().showAutomationLanes) useUIStore.getState().toggleAutomationLanes();
            }},
            { label: 'Clear All Automation', action: () => { curves.forEach(c => removeCurve(c.id)); }, disabled: !hasCurves },
          ];

          if (submenu.length === 0) return [];
          return [
            { label: '', separator: true },
            { label: 'Automation', submenu },
          ];
        })(),
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

      // Check if this channel's instrument is SuperCollider
      const chInstr = channel.instrumentId != null ? instruments[channel.instrumentId] : null;
      const isSC = chInstr?.synthType === 'SuperCollider';

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
              height: HEADER_ROW_HEIGHT,
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
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
              tint={chColor}
              layout={LAYOUT_EMPTY}
            />
            {/* Expand button */}
            <HoverableHeaderBtn drawBg={drawCollapseBtn} drawHoverBg={drawHoverBtn} onPress={() => onToggleCollapse(ch)}>
              {iconTextures?.chevronRight ? (
                <pixiSprite texture={iconTextures.chevronRight} width={ICON_SIZE} height={ICON_SIZE} eventMode="none" layout={LAYOUT_EMPTY} />
              ) : null}
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
            height: HEADER_ROW_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 8,
            paddingRight: 8,
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
          <pixiContainer layout={{ width: textAreaW, height: HEADER_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
            <pixiBitmapText
              text={chNum}
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
              tint={chColor}
              alpha={0.8}
              layout={LAYOUT_EMPTY}
            />
            {hasSpeed && (
              <pixiContainer layout={LAYOUT_GEN_BADGE_ROW}>
                <pixiGraphics
                  draw={(g: GraphicsType) => {
                    g.clear();
                    g.roundRect(0, 0, 28, 12, 2);
                    g.fill({ color: theme.warning.color, alpha: 0.15 });
                    g.roundRect(0, 0, 28, 12, 2);
                    g.stroke({ color: theme.warning.color, alpha: 0.35, width: 1 });
                  }}
                  layout={{ position: 'absolute', width: 28, height: 12 }}
                />
                <pixiBitmapText
                  text={`S:${channelSpeeds![ch]}`}
                  style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
                  tint={theme.warning.color}
                  layout={LAYOUT_EMPTY}
                />
              </pixiContainer>
            )}
            {isSC && (
              <pixiContainer layout={LAYOUT_GEN_BADGE_ROW}>
                <pixiGraphics
                  draw={(g: GraphicsType) => {
                    g.clear();
                    g.roundRect(0, 0, 20, 12, 2);
                    g.fill({ color: theme.success.color, alpha: 0.2 });
                    g.roundRect(0, 0, 20, 12, 2);
                    g.stroke({ color: theme.success.color, alpha: 0.5, width: 1 });
                  }}
                  layout={{ position: 'absolute', width: 20, height: 12 }}
                />
                <pixiBitmapText
                  text="SC"
                  style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 7, fill: 0xffffff }}
                  tint={theme.success.color}
                  layout={LAYOUT_EMPTY}
                />
              </pixiContainer>
            )}
            {showChannelNames && editingChannel === ch && (
              <PixiPureTextInput
                autoFocus
                value={editValue}
                onChange={(v) => setEditValue(v.toUpperCase())}
                onSubmit={(v) => { onUpdateName(ch, v.toUpperCase()); setEditingChannel(null); }}
                onCancel={() => setEditingChannel(null)}
                onBlur={(v) => { onUpdateName(ch, v.toUpperCase()); setEditingChannel(null); }}
                width={Math.max(50, chW - 120)}
                height={18}
                fontSize={10}
                layout={LAYOUT_NAME_ROW}
              />
            )}
            {showChannelNames && editingChannel !== ch && (
              <pixiBitmapText
                text={(channel.name || `CH${ch + 1}`).toUpperCase()}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
                tint={channel.name ? theme.text.color : theme.textMuted.color}
                alpha={channel.name ? 0.8 : 0.4}
                layout={LAYOUT_EMPTY}
              />
            )}
          </pixiContainer>

          {/* Button area */}
          <pixiContainer layout={LAYOUT_BTNS_ROW}>
            {/* Context menu button (three dots) */}
            <HoverableHeaderBtn drawBg={drawContextBtn} drawHoverBg={drawHoverBtn} onPress={(e) => openContextMenu(ch, e)}>
              {iconTextures?.ellipsisV ? (
                <pixiSprite texture={iconTextures.ellipsisV} width={ICON_SIZE} height={ICON_SIZE} eventMode="none" layout={LAYOUT_EMPTY} />
              ) : null}
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
              {iconTextures ? (
                <pixiSprite
                  texture={channel.muted ? iconTextures.volumeOff : iconTextures.volumeOn}
                  width={ICON_SIZE} height={ICON_SIZE} eventMode="none" layout={LAYOUT_EMPTY}
                />
              ) : null}
            </HoverableHeaderBtn>

            {/* Solo button — headphones icon matching DOM Headphones */}
            <HoverableHeaderBtn drawBg={(g: GraphicsType) => drawSoloBtn(g, channel.solo)} drawHoverBg={drawHoverBtn} onPress={() => onToggleSolo(ch)}>
              {iconTextures ? (
                <pixiSprite
                  texture={channel.solo ? iconTextures.headphonesActive : iconTextures.headphones}
                  width={ICON_SIZE} height={ICON_SIZE} eventMode="none" layout={LAYOUT_EMPTY}
                />
              ) : null}
            </HoverableHeaderBtn>

            {/* Collapse button — chevron-left matching DOM ChevronLeft */}
            <HoverableHeaderBtn drawBg={drawCollapseBtn} drawHoverBg={drawHoverBtn} onPress={() => onToggleCollapse(ch)}>
              {iconTextures?.chevronLeft ? (
                <pixiSprite texture={iconTextures.chevronLeft} width={ICON_SIZE} height={ICON_SIZE} eventMode="none" layout={LAYOUT_EMPTY} />
              ) : null}
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
    numChannels, pattern.channels, channelWidths, channelOffsets,
    theme, showChannelNames, channelSpeeds, songInitialSpeed, editingChannel, editValue,
    instruments,
    onToggleMute, onToggleSolo, onToggleCollapse, onAddChannel, onUpdateName,
    openContextMenu, openColorPicker, startEditing,
    drawMuteBtn, drawSoloBtn, drawCollapseBtn, drawContextBtn, drawColorBtn, drawAddBtn, drawHoverBtn,
    iconTextures,
  ]);

  // ── Column labels row (row 2) — "Note Ins Vol Eff" per channel ────────────
  const columnLabels = useMemo(() => {
    const labels: React.ReactNode[] = [];
    const noteWidth = CHAR_WIDTH * 3 + 4;
    for (let ch = 0; ch < numChannels; ch++) {
      const channel = pattern.channels[ch];
      if (channel.collapsed) continue;
      const colX = channelOffsets[ch] - LINE_NUMBER_WIDTH;
      const colLabels = [
        { text: 'Note', x: colX + 8 },
        { text: 'Ins', x: colX + 8 + noteWidth + 4 },
        { text: 'Vol', x: colX + 8 + noteWidth + 4 + CHAR_WIDTH * 2 + 4 },
        { text: 'Eff', x: colX + 8 + noteWidth + CHAR_WIDTH * 4 + 12 },
      ];
      for (const lbl of colLabels) {
        labels.push(
          <pixiBitmapText
            key={`col-${ch}-${lbl.text}`}
            text={lbl.text}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={theme.textMuted.color}
            alpha={0.55}
            layout={{ position: 'absolute', left: lbl.x, top: HEADER_ROW_HEIGHT + (COLUMN_LABELS_HEIGHT - 9) / 2 }}
          />
        );
      }
    }
    return labels;
  }, [numChannels, channelOffsets, pattern.channels, theme]);


  return (
    <layoutContainer eventMode="static" layout={{ width, height: HEADER_HEIGHT, flexShrink: 0 }}>
      {/* Background layer */}
      <pixiGraphics draw={drawBackground} layout={{ position: 'absolute', width, height: HEADER_HEIGHT }} />

      {/* ROW label (vertically centered in row 1) */}
      <pixiBitmapText
        text="ROW"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: 8, top: (HEADER_ROW_HEIGHT - 9) / 2 }}
      />

      {/* Scrollable channel area — clipped via overflow hidden */}
      <pixiContainer
        eventMode="static"
        layout={{ position: 'absolute', left: LINE_NUMBER_WIDTH, top: 0, width: width - LINE_NUMBER_WIDTH, height: HEADER_HEIGHT, overflow: 'hidden' }}
      >
        <pixiContainer
          eventMode="static"
          x={-scrollLeft}
          layout={{ position: 'absolute', top: 0, height: HEADER_HEIGHT }}
        >
          {/* Channel backgrounds (row 1 only) */}
          <pixiGraphics draw={drawChannelBackgrounds} layout={{ position: 'absolute', width: totalChannelsWidth, height: HEADER_HEIGHT }} />
          {/* Per-channel headers (row 1) */}
          {channelHeaders}
          {/* Column labels (row 2) */}
          {columnLabels}
        </pixiContainer>
      </pixiContainer>

    </layoutContainer>
  );
};

export const PixiChannelHeaders = React.memo(PixiChannelHeadersInner);
