/**
 * PixiInstrumentPanel — GL-native instrument list with action bar.
 * Feature parity with the DOM InstrumentList (FT2 variant):
 *   - Top action bar: ADD, PRESET, SAMPLE, EDIT, CHIP (with fontaudio icons)
 *   - Per-row: number, synth-type icon, name, type badge, hover-reveal clone/delete
 *   - Footer with instrument count
 *   - Double-click to open editor, scroll-to-selected
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedWheelEvent, FederatedPointerEvent } from 'pixi.js';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useUIStore } from '@stores/useUIStore';
import { getSynthInfo } from '@constants/synthCategories';
import { BASS_PRESETS } from '@constants/factoryPresets';
import { PIXI_FONTS } from '../../fonts';
import { FAD_ICONS } from '../../fontaudioIcons';
import { usePixiTheme } from '../../theme';
import { PixiButton } from '../../components/PixiButton';

interface PixiInstrumentPanelProps {
  width: number;
  height: number;
}

/** Map Tailwind color classes → Pixi hex colors */
const TAILWIND_HEX: Record<string, number> = {
  'text-accent-primary': 0x00ff88,
  'text-blue-300':   0x93c5fd, 'text-blue-400':   0x60a5fa, 'text-blue-500':   0x3b82f6,
  'text-purple-300': 0xd8b4fe, 'text-purple-400': 0xc084fc, 'text-purple-500': 0xa855f7,
  'text-indigo-400': 0x818cf8, 'text-indigo-500': 0x6366f1,
  'text-violet-400': 0xa78bfa, 'text-violet-500': 0x8b5cf6, 'text-violet-600': 0x7c3aed,
  'text-fuchsia-400': 0xe879f9, 'text-fuchsia-500': 0xd946ef,
  'text-pink-300':   0xf9a8d4, 'text-pink-400':   0xf472b6, 'text-pink-500':   0xec4899,
  'text-rose-400':   0xfb7185, 'text-rose-500':   0xf43f5e,
  'text-red-300':    0xfca5a5, 'text-red-400':    0xf87171, 'text-red-500':    0xef4444, 'text-red-600': 0xdc2626,
  'text-orange-300': 0xfdba74, 'text-orange-400': 0xfb923c, 'text-orange-500': 0xf97316, 'text-orange-600': 0xea580c,
  'text-amber-300':  0xfcd34d, 'text-amber-400':  0xfbbf24, 'text-amber-500':  0xf59e0b, 'text-amber-600': 0xd97706,
  'text-yellow-300': 0xfde047, 'text-yellow-400': 0xfacc15, 'text-yellow-500': 0xeab308,
  'text-lime-400':   0xa3e635, 'text-lime-500':   0x84cc16,
  'text-green-300':  0x86efac, 'text-green-400':  0x4ade80, 'text-green-500':  0x22c55e,
  'text-emerald-400': 0x34d399, 'text-emerald-500': 0x10b981,
  'text-teal-300':   0x5eead4, 'text-teal-400':   0x2dd4bf, 'text-teal-500':   0x14b8a6,
  'text-cyan-300':   0x67e8f9, 'text-cyan-400':   0x22d3ee, 'text-cyan-500':   0x06b6d4,
  'text-sky-400':    0x38bdf8, 'text-sky-500':    0x0ea5e9,
  'text-gray-300':   0xd1d5db, 'text-gray-400':   0x9ca3af, 'text-gray-500':   0x6b7280,
  'text-slate-300':  0xcbd5e1, 'text-slate-400':  0x94a3b8,
  'text-stone-300':  0xd6d3d1, 'text-stone-400':  0xa8a29e,
  'text-white':      0xffffff,
  // Design system token aliases
  'text-text-primary': 0xf2f0f0, 'text-text-secondary': 0xa8a0a0, 'text-text-muted': 0x686060,
  'text-accent-highlight': 0x22d3ee,
};

/** Map Lucide icon names (from synthCategories) → fontaudio icon characters */
const LUCIDE_TO_FAD: Record<string, string> = {
  Zap:           FAD_ICONS['thunderbolt'] ?? '',
  AudioLines:    FAD_ICONS['waveform'] ?? '',
  Music2:        FAD_ICONS['keyboard'] ?? '',
  Layers:        FAD_ICONS['modularplug'] ?? '',
  Radio:         FAD_ICONS['speaker'] ?? '',
  Activity:      FAD_ICONS['modsine'] ?? '',
  Guitar:        FAD_ICONS['waveform'] ?? '',
  LayoutGrid:    FAD_ICONS['drumpad'] ?? '',
  Piano:         FAD_ICONS['keyboard'] ?? '',
  Gamepad2:      FAD_ICONS['cpu'] ?? '',
  Gamepad:       FAD_ICONS['cpu'] ?? '',
  Waves:         FAD_ICONS['modsine'] ?? '',
  Music4:        FAD_ICONS['keyboard'] ?? '',
  Mic:           FAD_ICONS['microphone'] ?? '',
  BarChart3:     FAD_ICONS['waveform'] ?? '',
  Cable:         FAD_ICONS['modularplug'] ?? '',
  Cpu:           FAD_ICONS['cpu'] ?? '',
  Disc:          FAD_ICONS['diskio'] ?? '',
  Drum:          FAD_ICONS['drumpad'] ?? '',
  Headphones:    FAD_ICONS['headphones'] ?? '',
  Speaker:       FAD_ICONS['speaker'] ?? '',
  Volume2:       FAD_ICONS['speaker'] ?? '',
  Waveform:      FAD_ICONS['waveform'] ?? '',
  Wind:          FAD_ICONS['modsine'] ?? '',
  Plug:          FAD_ICONS['modularplug'] ?? '',
  Star:          FAD_ICONS['preset-a'] ?? '',
  Save:          FAD_ICONS['save'] ?? '',
  Plus:          FAD_ICONS['preset-a'] ?? '',
  Monitor:       FAD_ICONS['speaker'] ?? '',
  Code2:         FAD_ICONS['cpu'] ?? '',
  Hexagon:       FAD_ICONS['cpu'] ?? '',
  Joystick:      FAD_ICONS['cpu'] ?? '',
  Globe:         FAD_ICONS['speaker'] ?? '',
  Sparkles:      FAD_ICONS['modsine'] ?? '',
  Hash:          FAD_ICONS['cpu'] ?? '',
  Megaphone:     FAD_ICONS['speaker'] ?? '',
  Phone:         FAD_ICONS['speaker'] ?? '',
  FileAudio:     FAD_ICONS['diskio'] ?? '',
  Sun:           FAD_ICONS['modsine'] ?? '',
  Tv:            FAD_ICONS['speaker'] ?? '',
  Play:          FAD_ICONS['play'] ?? '',
  Bomb:          FAD_ICONS['thunderbolt'] ?? '',
  Circle:        FAD_ICONS['modsine'] ?? '',
  Glasses:       FAD_ICONS['headphones'] ?? '',
  MessageSquare: FAD_ICONS['speaker'] ?? '',
  Smartphone:    FAD_ICONS['speaker'] ?? '',
  SquareStack:   FAD_ICONS['modularplug'] ?? '',
  Music:         FAD_ICONS['keyboard'] ?? '',
};

const DEFAULT_ICON_CHAR = FAD_ICONS['keyboard'] ?? '';

const ITEM_H = 30;
const ACTION_BAR_H = 46;
const FOOTER_H = 24;
const BUFFER = 3;

export const PixiInstrumentPanel: React.FC<PixiInstrumentPanelProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const instruments = useInstrumentStore((s) => s.instruments);
  const currentId   = useInstrumentStore((s) => s.currentInstrumentId);
  const select      = useInstrumentStore((s) => s.setCurrentInstrument);
  const createInstrument = useInstrumentStore((s) => s.createInstrument);
  const deleteInstrument = useInstrumentStore((s) => s.deleteInstrument);
  const cloneInstrument  = useInstrumentStore((s) => s.cloneInstrument);
  const useHexNumbers    = useUIStore((s) => s.useHexNumbers);

  const [scrollY, setScrollY] = useState(0);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const lastClickRef = useRef<{ id: number; time: number }>({ id: -1, time: 0 });

  const sorted = useMemo(
    () => [...instruments].sort((a, b) => a.id - b.id),
    [instruments],
  );

  const listH = height - ACTION_BAR_H - FOOTER_H;
  const totalHeight = sorted.length * ITEM_H;
  const maxScroll = Math.max(0, totalHeight - listH);

  // Scroll to selected instrument when it changes
  useEffect(() => {
    const idx = sorted.findIndex((inst) => inst.id === currentId);
    if (idx < 0) return;
    const itemTop = idx * ITEM_H;
    const itemBot = itemTop + ITEM_H;
    setScrollY((prev) => {
      if (itemTop < prev) return itemTop;
      if (itemBot > prev + listH) return itemBot - listH;
      return prev;
    });
  }, [currentId, sorted, listH]);

  // Virtual scrolling
  const startIdx = Math.max(0, Math.floor(scrollY / ITEM_H) - BUFFER);
  const endIdx = Math.min(sorted.length, Math.ceil((scrollY + listH) / ITEM_H) + BUFFER);
  const visibleItems = useMemo(() => sorted.slice(startIdx, endIdx), [sorted, startIdx, endIdx]);

  const handleWheel = useCallback((e: FederatedWheelEvent) => {
    e.stopPropagation();
    setScrollY(prev => Math.max(0, Math.min(maxScroll, prev + e.deltaY)));
  }, [maxScroll]);

  const handleItemClick = useCallback((id: number) => {
    const now = Date.now();
    if (lastClickRef.current.id === id && now - lastClickRef.current.time < 300) {
      useUIStore.getState().openModal('instruments');
      lastClickRef.current = { id: -1, time: 0 };
    } else {
      select(id);
      lastClickRef.current = { id, time: now };
    }
  }, [select]);

  // ─── Action bar handlers ────────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
    createInstrument(BASS_PRESETS[0]);
  }, [createInstrument]);

  const handlePreset = useCallback(() => {
    useUIStore.getState().openModal('instruments');
  }, []);

  const handleSamplePack = useCallback(() => {
    useUIStore.getState().setShowSamplePackModal(true);
  }, []);

  const handleEdit = useCallback(() => {
    useUIStore.getState().openModal('instruments');
  }, []);

  const handleChip = useCallback(() => {
    useUIStore.getState().openModal('furnacePresets');
  }, []);

  const handleClone = useCallback((id: number) => {
    cloneInstrument(id);
  }, [cloneInstrument]);

  const handleDelete = useCallback((id: number) => {
    if (instruments.length > 1) deleteInstrument(id);
  }, [deleteInstrument, instruments.length]);

  // ─── Scrollbar geometry ─────────────────────────────────────────────────────

  const trackHeight = listH - 4;
  const thumbHeight = maxScroll > 0 ? Math.max(20, (listH / totalHeight) * trackHeight) : 0;
  const thumbY = maxScroll > 0 ? 2 + (scrollY / maxScroll) * (trackHeight - thumbHeight) : 2;

  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef(0);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!isDraggingRef.current || maxScroll <= 0) return;
    const newThumbY = e.globalY - dragOffsetRef.current;
    const ratio = Math.max(0, Math.min(1, (newThumbY - 2) / (trackHeight - thumbHeight)));
    setScrollY(ratio * maxScroll);
  }, [maxScroll, trackHeight, thumbHeight]);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleScrollbarDown = useCallback((e: FederatedPointerEvent) => {
    if (maxScroll <= 0) return;
    e.stopPropagation();
    isDraggingRef.current = true;
    dragOffsetRef.current = e.globalY - thumbY;
  }, [maxScroll, thumbY]);

  const drawScrollbarTrack = useCallback((g: GraphicsType) => {
    g.clear();
    if (maxScroll <= 0) return;
    g.roundRect(0, 2, 6, trackHeight, 3);
    g.fill({ color: theme.bgActive.color, alpha: 0.3 });
  }, [trackHeight, maxScroll, theme]);

  const drawScrollbarThumb = useCallback((g: GraphicsType) => {
    g.clear();
    if (maxScroll <= 0) return;
    g.roundRect(0, 0, 6, thumbHeight, 3);
    g.fill({ color: theme.textMuted.color, alpha: 0.5 });
  }, [thumbHeight, maxScroll, theme]);

  // ─── Draw helpers ───────────────────────────────────────────────────────────

  // Width budget: 8px pad + 24px num + 18px icon + 8px gap + name(flex) + badge(56) + actions(44) + 10px scrollbar
  const nameMaxW = width - 8 - 24 - 18 - 8 - 56 - 44 - 10;

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      {/* ═══ Action Bar ═══ */}
      <layoutContainer layout={{ width, height: ACTION_BAR_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 3, paddingRight: 3, gap: 2, flexShrink: 0, backgroundColor: theme.bgTertiary.color, borderBottomWidth: 1, borderColor: theme.border.color }}>
        <PixiButton label="ADD"    icon="preset-a"    iconPosition="top" variant="ghost" size="sm" onClick={handleAdd}        width={40} height={40} />
        <PixiButton label="PRESET" icon="open"        iconPosition="top" variant="ghost" size="sm" onClick={handlePreset}     width={50} height={40} />
        <PixiButton label="SAMPLE" icon="diskio"      iconPosition="top" variant="ghost" size="sm" onClick={handleSamplePack} width={50} height={40} color="green" />
        <PixiButton label="EDIT"   icon="pen"         iconPosition="top" variant="ghost" size="sm" onClick={handleEdit}       width={40} height={40} />
        <PixiButton label="CHIP"   icon="cpu"         iconPosition="top" variant="ghost" size="sm" onClick={handleChip}       width={40} height={40} />
      </layoutContainer>

      {/* ═══ Instrument List ═══ */}
      <layoutContainer
        eventMode="static"
        onWheel={handleWheel}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerUpOutside={handlePointerUp}
        layout={{ width, height: listH, overflow: 'hidden', flexShrink: 1, backgroundColor: theme.bg.color }}
      >

        {visibleItems.map((inst, i) => {
          const actualIdx = startIdx + i;
          const y = actualIdx * ITEM_H - scrollY;
          const isSelected = inst.id === currentId;
          const isHovered = inst.id === hoveredId;
          const isEven = actualIdx % 2 === 0;
          const synthInfo = getSynthInfo(inst.synthType);
          const iconColor = TAILWIND_HEX[synthInfo?.color ?? ''] ?? 0x888888;
          const iconChar = LUCIDE_TO_FAD[synthInfo?.icon ?? ''] || DEFAULT_ICON_CHAR;
          const displayNum = useHexNumbers
            ? (actualIdx + 1).toString(16).toUpperCase().padStart(2, '0')
            : (actualIdx + 1).toString(10).padStart(2, '0');
          const badge = inst.metadata?.displayType || synthInfo?.shortName || inst.synthType;
          const showActions = isSelected || isHovered;
          const rowW = width - 10;

          return (
            <pixiContainer
              key={inst.id}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => handleItemClick(inst.id)}
              onPointerEnter={() => setHoveredId(inst.id)}
              onPointerLeave={() => setHoveredId((prev) => (prev === inst.id ? null : prev))}
              layout={{
                position: 'absolute',
                left: 0,
                top: y,
                width: rowW,
                height: ITEM_H,
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: 8,
              }}
            >
              {/* Row background */}
              <pixiGraphics
                draw={(g) => {
                  g.clear();
                  g.rect(0, 0, rowW, ITEM_H);
                  if (isSelected) {
                    g.fill({ color: theme.accent.color, alpha: 0.2 });
                    // Left accent bar
                    g.rect(0, 0, 2, ITEM_H);
                    g.fill({ color: theme.accent.color });
                  } else if (isHovered) {
                    g.fill({ color: theme.bgActive.color, alpha: 0.5 });
                  } else {
                    g.fill({ color: isEven ? theme.bg.color : theme.bgSecondary.color, alpha: isEven ? 0 : 0.5 });
                  }
                }}
                layout={{ position: 'absolute', width: rowW, height: ITEM_H }}
              />

              {/* Number */}
              <pixiBitmapText
                text={displayNum}
                style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 15, fill: 0xffffff }}
                tint={isSelected ? theme.accent.color : theme.textMuted.color}
                layout={{ width: 24, flexShrink: 0 }}
              />

              {/* Synth type icon (fontaudio) */}
              <pixiBitmapText
                text={iconChar}
                style={{ fontFamily: PIXI_FONTS.ICONS, fontSize: 16, fill: 0xffffff }}
                tint={isSelected ? 0xffffff : iconColor}
                layout={{ width: 18, flexShrink: 0, marginRight: 8 }}
              />

              {/* Name */}
              <pixiBitmapText
                text={inst.name || `Instrument ${inst.id}`}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 15, fill: 0xffffff }}
                tint={isSelected ? 0xffffff : theme.text.color}
                layout={{ flex: 1, overflow: 'hidden', maxWidth: Math.max(40, nameMaxW) }}
              />

              {/* Loop indicator */}
              {inst.sample?.loop && (
                <pixiBitmapText
                  text={FAD_ICONS[inst.sample.loopType === 'pingpong' ? 'repeat' : 'repeat-one'] ?? ''}
                  style={{ fontFamily: PIXI_FONTS.ICONS, fontSize: 12, fill: 0xffffff }}
                  tint={inst.sample.loopType === 'pingpong' ? 0x60a5fa : 0x4ade80}
                  layout={{ flexShrink: 0, marginRight: 2 }}
                />
              )}

              {/* Type badge */}
              <pixiContainer layout={{ flexShrink: 0, marginLeft: 2, marginRight: 2 }}>
                <pixiGraphics
                  draw={(g) => {
                    g.clear();
                    const bw = Math.min(56, badge.length * 6 + 10);
                    g.roundRect(0, 0, bw, 17, 3);
                    g.fill({ color: isSelected ? theme.bgActive.color : theme.bgTertiary.color, alpha: 0.8 });
                  }}
                  layout={{ position: 'absolute', width: 56, height: 17 }}
                />
                <pixiBitmapText
                  text={badge.length > 8 ? badge.slice(0, 7) + '…' : badge}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
                  tint={isSelected ? theme.accent.color : theme.textMuted.color}
                  layout={{ marginLeft: 4, marginTop: 2 }}
                />
              </pixiContainer>

              {/* Action buttons — visible on hover and selected */}
              {showActions && (
                <pixiContainer layout={{ flexDirection: 'row', gap: 1, flexShrink: 0, marginLeft: 2 }}>
                  <PixiButton label="" icon="copy" variant="ghost" size="sm" onClick={() => handleClone(inst.id)} width={20} />
                  {instruments.length > 1 && (
                    <PixiButton label="" icon="close" variant="ghost" size="sm" color="red" onClick={() => handleDelete(inst.id)} width={20} />
                  )}
                </pixiContainer>
              )}
            </pixiContainer>
          );
        })}

        {/* Scrollbar */}
        {maxScroll > 0 && (
          <pixiContainer layout={{ position: 'absolute', left: width - 8, top: 0, width: 6, height: listH }}>
            <pixiGraphics draw={drawScrollbarTrack} layout={{ position: 'absolute', width: 6, height: listH }} />
            <pixiGraphics
              draw={drawScrollbarThumb}
              eventMode="static"
              cursor="pointer"
              onPointerDown={handleScrollbarDown}
              layout={{ position: 'absolute', top: thumbY, width: 6, height: thumbHeight }}
            />
          </pixiContainer>
        )}
      </layoutContainer>

      {/* ═══ Footer ═══ */}
      <layoutContainer layout={{ width, height: FOOTER_H, flexShrink: 0, alignItems: 'center', paddingLeft: 8, backgroundColor: theme.bgTertiary.color, borderTopWidth: 1, borderColor: theme.border.color }}>
        <pixiBitmapText
          text={`${instruments.length} instrument${instruments.length !== 1 ? 's' : ''}`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ marginTop: 4 }}
        />
      </layoutContainer>
    </pixiContainer>
  );
};
