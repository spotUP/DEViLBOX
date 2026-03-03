/**
 * PixiExposeOverlay — macOS Mission Control style view switcher.
 *
 * Triggered by EXPOSÉ button or Ctrl+↑.
 * Shows all available views as labeled cards in a grid.
 * Navigation: Arrow keys, Tab to cycle, Enter/click to select, Escape to dismiss.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { useUIStore } from '@stores/useUIStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';

// ─── View definitions ─────────────────────────────────────────────────────────

const EXPOSE_VIEWS = [
  { id: 'tracker',     label: 'Tracker',  icon: '♫', color: 0x60a5fa },
  { id: 'arrangement', label: 'Arrange',  icon: '≡', color: 0x34d399 },
  { id: 'pianoroll',   label: 'Piano',    icon: '♬', color: 0xc084fc },
  { id: 'dj',          label: 'DJ',       icon: '◎', color: 0xfb923c },
  { id: 'vj',          label: 'VJ',       icon: '◈', color: 0xf472b6 },
  { id: 'studio',      label: 'Studio',   icon: '⊞', color: 0xfbbf24 },
] as const;

const COLS = 3;
const ROWS = 2;
const CARD_GAP = 20;
const CARD_RADIUS = 12;
const ANIM_DURATION = 0; // instant for now

interface PixiExposeOverlayProps {
  width: number;
  height: number;
}

export const PixiExposeOverlay: React.FC<PixiExposeOverlayProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const viewExposeActive = useUIStore((s) => s.viewExposeActive);
  const selectedIdx = useUIStore((s) => s.viewExposeSelectedIdx);
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);

  // Card dimensions
  const cardW = useMemo(() => Math.min(280, (width - CARD_GAP * (COLS + 1)) / COLS), [width]);
  const cardH = useMemo(() => Math.min(180, (height - CARD_GAP * (ROWS + 1) - 60) / ROWS), [height]);
  const gridW = COLS * cardW + (COLS - 1) * CARD_GAP;
  const gridH = ROWS * cardH + (ROWS - 1) * CARD_GAP;
  const offsetX = (width - gridW) / 2;
  const offsetY = (height - gridH) / 2;

  // ─── Keyboard navigation (macOS Mission Control style) ─────────────────────

  useEffect(() => {
    if (!viewExposeActive) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const store = useUIStore.getState();
      const idx = store.viewExposeSelectedIdx;

      switch (e.key) {
        case 'Escape': {
          e.preventDefault();
          store.setViewExposeActive(false);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          const view = EXPOSE_VIEWS[idx];
          if (view) {
            handleSelectView(view.id);
          }
          break;
        }
        case 'Tab': {
          e.preventDefault();
          const next = e.shiftKey
            ? (idx - 1 + EXPOSE_VIEWS.length) % EXPOSE_VIEWS.length
            : (idx + 1) % EXPOSE_VIEWS.length;
          store.setViewExposeSelectedIdx(next);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const col = idx % COLS;
          if (col < COLS - 1 && idx + 1 < EXPOSE_VIEWS.length) {
            store.setViewExposeSelectedIdx(idx + 1);
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const colL = idx % COLS;
          if (colL > 0) {
            store.setViewExposeSelectedIdx(idx - 1);
          }
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const nextRow = idx + COLS;
          if (nextRow < EXPOSE_VIEWS.length) {
            store.setViewExposeSelectedIdx(nextRow);
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevRow = idx - COLS;
          if (prevRow >= 0) {
            store.setViewExposeSelectedIdx(prevRow);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewExposeActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Ctrl+↑ global trigger ─────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+↑ or Ctrl+↓ toggle (matches macOS Mission Control)
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp' && !e.altKey && !e.shiftKey) {
        const tag = document.activeElement?.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        const store = useUIStore.getState();
        if (store.activeView === 'studio') {
          // In studio mode, toggle workbench expose instead
          useWorkbenchStore.getState().toggleExpose();
        } else {
          store.toggleViewExpose();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ─── Select a view ─────────────────────────────────────────────────────────

  const handleSelectView = useCallback((id: string) => {
    setActiveView(id as any);
    useUIStore.getState().setViewExposeActive(false);
  }, [setActiveView]);

  // ─── Drawing ───────────────────────────────────────────────────────────────

  const drawOverlayBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: 0x000000, alpha: 0.75 });
  }, [width, height]);

  if (!viewExposeActive) return null;

  return (
    <pixiContainer
      eventMode="static"
      onPointerUp={() => useUIStore.getState().setViewExposeActive(false)}
      layout={{ position: 'absolute', width, height }}
    >
      {/* Dimmed background */}
      <pixiGraphics draw={drawOverlayBg} layout={{ position: 'absolute', width, height }} />

      {/* Title */}
      <pixiBitmapText
        text="Exposé"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 18, fill: 0xffffff }}
        tint={theme.text.color}
        layout={{ position: 'absolute', left: offsetX, top: offsetY - 40 }}
      />

      {/* View cards grid */}
      {EXPOSE_VIEWS.map((view, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = offsetX + col * (cardW + CARD_GAP);
        const y = offsetY + row * (cardH + CARD_GAP);
        const isActive = activeView === view.id;
        const isSelected = selectedIdx === i;

        return (
          <pixiContainer
            key={view.id}
            eventMode="static"
            cursor="pointer"
            onPointerUp={(e) => {
              e.stopPropagation();
              handleSelectView(view.id);
            }}
            onPointerEnter={() => useUIStore.getState().setViewExposeSelectedIdx(i)}
            layout={{ position: 'absolute', left: x, top: y, width: cardW, height: cardH }}
          >
            {/* Card background */}
            <pixiGraphics
              draw={(g) => {
                g.clear();
                // Card bg
                g.roundRect(0, 0, cardW, cardH, CARD_RADIUS);
                g.fill({ color: isActive ? theme.accent.color : theme.bgTertiary.color, alpha: isActive ? 0.25 : 0.85 });
                // Border
                g.roundRect(0, 0, cardW, cardH, CARD_RADIUS);
                g.stroke({
                  color: isSelected ? 0xffffff : (isActive ? theme.accent.color : theme.border.color),
                  width: isSelected ? 3 : 1,
                  alpha: isSelected ? 0.9 : (isActive ? 0.6 : 0.3),
                });
              }}
              layout={{ position: 'absolute', width: cardW, height: cardH }}
            />

            {/* Icon (large, centered) */}
            <pixiBitmapText
              text={view.icon}
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 36, fill: 0xffffff }}
              tint={view.color}
              layout={{ position: 'absolute', left: cardW / 2 - 14, top: cardH / 2 - 32 }}
            />

            {/* Label */}
            <pixiBitmapText
              text={view.label}
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 14, fill: 0xffffff }}
              tint={isActive ? theme.accent.color : theme.text.color}
              layout={{ position: 'absolute', left: cardW / 2 - view.label.length * 4, top: cardH / 2 + 14 }}
            />

            {/* "Active" indicator dot */}
            {isActive && (
              <pixiGraphics
                draw={(g) => {
                  g.clear();
                  g.circle(cardW / 2, cardH - 16, 4);
                  g.fill({ color: theme.accent.color });
                }}
                layout={{ position: 'absolute', width: cardW, height: cardH }}
              />
            )}
          </pixiContainer>
        );
      })}

      {/* Hint bar at bottom */}
      <pixiBitmapText
        text="←→↑↓ Navigate  ⏎ Select  ⇥ Cycle  Esc Dismiss"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: offsetX, top: offsetY + gridH + 16 }}
      />
    </pixiContainer>
  );
};
