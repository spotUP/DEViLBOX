/**
 * PixiInstrumentPanel — GL-native instrument list with action bar.
 * Feature parity with the DOM InstrumentList (FT2 variant):
 *   - Top action bar: ADD, PRESET, SAMPLE, EDIT, CHIP
 *   - Per-row: number, colored dot, name, type badge, clone/delete on selected
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedWheelEvent, FederatedPointerEvent } from 'pixi.js';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useUIStore } from '@stores/useUIStore';
import { getSynthInfo } from '@constants/synthCategories';
import { BASS_PRESETS } from '@constants/factoryPresets';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { PixiButton } from '../../components/PixiButton';

interface PixiInstrumentPanelProps {
  width: number;
  height: number;
}

/** Map Tailwind color classes used in synthCategories → Pixi hex colors */
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
};

const ITEM_H = 28;
const ACTION_BAR_H = 38;
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
  const lastClickRef = useRef<{ id: number; time: number }>({ id: -1, time: 0 });

  const sorted = useMemo(
    () => [...instruments].sort((a, b) => a.id - b.id),
    [instruments],
  );

  const listH = height - ACTION_BAR_H;
  const totalHeight = sorted.length * ITEM_H;
  const maxScroll = Math.max(0, totalHeight - listH);

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
      // Double-click: open instrument editor modal
      useUIStore.getState().openModal('instruments');
      lastClickRef.current = { id: -1, time: 0 };
    } else {
      select(id);
      lastClickRef.current = { id, time: now };
    }
  }, [select]);

  // ─── Action bar handlers ────────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
    const startingPreset = BASS_PRESETS[0];
    createInstrument(startingPreset);
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
    g.fill({ color: theme.textMuted.color, alpha: 0.4 });
  }, [thumbHeight, maxScroll, theme]);

  // ─── Draw helpers ───────────────────────────────────────────────────────────

  const drawActionBarBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, ACTION_BAR_H);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, ACTION_BAR_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [width, theme]);

  const drawListBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, listH);
    g.fill({ color: theme.bg.color });
  }, [width, listH, theme]);

  // Width budget: 8px pad + 24px num + 4px gap + 8px dot + 4px gap + name(flex) + badge + actions(64px) + 12px scrollbar
  const nameMaxW = width - 8 - 24 - 4 - 8 - 4 - 60 - 64 - 12;

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      {/* ═══ Action Bar ═══ */}
      <pixiContainer layout={{ width, height: ACTION_BAR_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 4, gap: 2, flexShrink: 0 }}>
        <pixiGraphics draw={drawActionBarBg} layout={{ position: 'absolute', width, height: ACTION_BAR_H }} />
        <PixiButton label="ADD"    variant="ghost" size="sm" onClick={handleAdd}        width={36} />
        <PixiButton label="PRESET" variant="ghost" size="sm" onClick={handlePreset}     width={48} />
        <PixiButton label="SAMPLE" variant="ghost" size="sm" onClick={handleSamplePack} width={50} color="green" />
        <PixiButton label="EDIT"   variant="ghost" size="sm" onClick={handleEdit}       width={36} />
        <PixiButton label="CHIP"   variant="ghost" size="sm" onClick={handleChip}       width={36} />
      </pixiContainer>

      {/* ═══ Instrument List ═══ */}
      <pixiContainer
        eventMode="static"
        onWheel={handleWheel}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerUpOutside={handlePointerUp}
        layout={{ width, height: listH, overflow: 'hidden', flexShrink: 1 }}
      >
        <pixiGraphics draw={drawListBg} layout={{ position: 'absolute', width, height: listH }} />

        {visibleItems.map((inst, i) => {
          const actualIdx = startIdx + i;
          const y = actualIdx * ITEM_H - scrollY;
          const isSelected = inst.id === currentId;
          const isEven = actualIdx % 2 === 0;
          const synthInfo = getSynthInfo(inst.synthType);
          const dotColor = TAILWIND_HEX[synthInfo?.color ?? ''] ?? 0x888888;
          const displayNum = useHexNumbers
            ? (actualIdx + 1).toString(16).toUpperCase().padStart(2, '0')
            : (actualIdx + 1).toString(10).padStart(2, '0');
          const badge = inst.metadata?.displayType || synthInfo?.shortName || inst.synthType;

          return (
            <pixiContainer
              key={inst.id}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => handleItemClick(inst.id)}
              layout={{
                position: 'absolute',
                left: 0,
                top: y,
                width: width - 10,
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
                  g.rect(0, 0, width - 10, ITEM_H);
                  if (isSelected) {
                    g.fill({ color: theme.accent.color, alpha: 0.15 });
                  } else {
                    g.fill({ color: isEven ? theme.bg.color : theme.bgSecondary.color });
                  }
                }}
                layout={{ position: 'absolute', width: width - 10, height: ITEM_H }}
              />

              {/* Number */}
              <pixiBitmapText
                text={displayNum}
                style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
                tint={isSelected ? theme.accent.color : theme.textMuted.color}
                layout={{ width: 24, flexShrink: 0 }}
              />

              {/* Colored dot */}
              <pixiGraphics
                draw={(g) => {
                  g.clear();
                  g.circle(4, 4, 4);
                  g.fill({ color: isSelected ? theme.bgTertiary.color : dotColor });
                }}
                layout={{ width: 8, height: 8, flexShrink: 0, marginRight: 4 }}
              />

              {/* Name */}
              <pixiBitmapText
                text={inst.name || `Instrument ${inst.id}`}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                tint={isSelected ? 0xffffff : theme.text.color}
                layout={{ flex: 1, overflow: 'hidden', maxWidth: Math.max(40, nameMaxW) }}
              />

              {/* Type badge */}
              <pixiContainer layout={{ flexShrink: 0, marginLeft: 2, marginRight: 2 }}>
                <pixiGraphics
                  draw={(g) => {
                    g.clear();
                    const bw = Math.min(52, badge.length * 6 + 8);
                    g.roundRect(0, 0, bw, 16, 3);
                    g.fill({ color: isSelected ? theme.bgActive.color : theme.bgTertiary.color, alpha: 0.8 });
                  }}
                  layout={{ position: 'absolute', width: 52, height: 16 }}
                />
                <pixiBitmapText
                  text={badge.length > 8 ? badge.slice(0, 7) + '…' : badge}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                  tint={isSelected ? theme.accent.color : theme.textMuted.color}
                  layout={{ marginLeft: 4, marginTop: 2 }}
                />
              </pixiContainer>

              {/* Action buttons (clone / delete) — visible on selected row */}
              {isSelected && (
                <pixiContainer layout={{ flexDirection: 'row', gap: 2, flexShrink: 0, marginLeft: 2 }}>
                  {/* Clone */}
                  <PixiButton label="⊕" variant="ghost" size="sm" onClick={() => handleClone(inst.id)} width={20} />
                  {/* Delete */}
                  {instruments.length > 1 && (
                    <PixiButton label="✕" variant="ghost" size="sm" color="red" onClick={() => handleDelete(inst.id)} width={20} />
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
      </pixiContainer>
    </pixiContainer>
  );
};
