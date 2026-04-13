/**
 * PixiExposeOverlay — macOS Mission Control style view switcher with thumbnails.
 *
 * Triggered by EXPOSÉ button or Ctrl+↑.
 * Shows all available views as thumbnail cards in a grid.
 * Navigation: Arrow keys, Tab to cycle, Enter/click to select, Escape to dismiss.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import type { Graphics as GraphicsType, Texture } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { useUIStore } from '@stores/useUIStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';

// ─── View definitions ─────────────────────────────────────────────────────────

type ExposeView = { id: string; label: string; icon: string; color: number };

function buildExposeViews(theme: ReturnType<typeof usePixiTheme>): ExposeView[] {
  return [
    { id: 'tracker',     label: 'Tracker',  icon: '♫', color: theme.accentHighlight.color },
    { id: 'mixer',       label: 'Mixer',    icon: '☰', color: theme.accentSecondary.color },
    { id: 'dj',          label: 'DJ',       icon: '◎', color: theme.warning.color },
    { id: 'vj',          label: 'VJ',       icon: '◈', color: theme.error.color },
    { id: 'studio',      label: 'Studio',   icon: '⊞', color: theme.warning.color },
    { id: 'split',       label: 'Split',    icon: '⊟', color: theme.textMuted.color },
  ];
}

const COLS = 4;
const ROWS = 2;
const CARD_GAP = 24;
const CARD_RADIUS = 10;
const LABEL_H = 28; // space reserved for label below thumbnail
const THUMB_PAD = 4; // padding inside card around thumbnail

interface PixiExposeOverlayProps {
  width: number;
  height: number;
  thumbnails?: Record<string, Texture>;
}

export const PixiExposeOverlay: React.FC<PixiExposeOverlayProps> = ({ width, height, thumbnails }) => {
  const theme = usePixiTheme();
  const EXPOSE_VIEWS = useMemo(() => buildExposeViews(theme), [theme]);
  const viewExposeActive = useUIStore((s) => s.viewExposeActive);
  const selectedIdx = useUIStore((s) => s.viewExposeSelectedIdx);
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);

  // Card dimensions — larger to accommodate thumbnails
  const cardW = useMemo(() => Math.min(380, (width - CARD_GAP * (COLS + 1)) / COLS), [width]);
  const cardH = useMemo(() => Math.min(260, (height - CARD_GAP * (ROWS + 1) - 80) / ROWS), [height]);
  const thumbW = cardW - THUMB_PAD * 2;
  const thumbH = cardH - LABEL_H - THUMB_PAD * 2;
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp' && !e.altKey && !e.shiftKey) {
        const tag = document.activeElement?.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        const store = useUIStore.getState();
        if (store.activeView === 'studio') {
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
    g.fill({ color: theme.bg.color, alpha: 0.78 });
  }, [width, height]);

  if (!viewExposeActive) return (
    <pixiContainer visible={false} layout={{ width: 0, height: 0 }} />
  );

  return (
    <pixiContainer
      eventMode="static"
      onClick={() => useUIStore.getState().setViewExposeActive(false)}
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
        const rawTex = thumbnails?.[view.id];
        const tex = rawTex && !rawTex.destroyed && rawTex.source ? rawTex : null;

        // Scale thumbnail to fit within the card's thumbnail area
        let spriteW = thumbW;
        let spriteH = thumbH;
        let spriteX = THUMB_PAD;
        let spriteY = THUMB_PAD;
        if (tex) {
          const aspect = tex.width / tex.height;
          const fitAspect = thumbW / thumbH;
          if (aspect > fitAspect) {
            spriteW = thumbW;
            spriteH = thumbW / aspect;
            spriteY = THUMB_PAD + (thumbH - spriteH) / 2;
          } else {
            spriteH = thumbH;
            spriteW = thumbH * aspect;
            spriteX = THUMB_PAD + (thumbW - spriteW) / 2;
          }
        }

        return (
          <pixiContainer
            key={view.id}
            eventMode="static"
            cursor="pointer"
            onPointerUp={(e: import('pixi.js').FederatedPointerEvent) => {
              e.stopPropagation();
              handleSelectView(view.id);
            }}
            onClick={(e: import('pixi.js').FederatedPointerEvent) => {
              e.stopPropagation();
              handleSelectView(view.id);
            }}
            onPointerEnter={() => useUIStore.getState().setViewExposeSelectedIdx(i)}
            layout={{ position: 'absolute', left: x, top: y, width: cardW, height: cardH }}
          >
            {/* Card background + border */}
            <pixiGraphics
              draw={(g) => {
                g.clear();
                g.roundRect(0, 0, cardW, cardH, CARD_RADIUS);
                g.fill({ color: theme.bgSecondary.color, alpha: 0.92 });
                g.roundRect(0, 0, cardW, cardH, CARD_RADIUS);
                g.stroke({
                  color: isSelected ? 0xffffff : (isActive ? theme.accent.color : theme.border.color),
                  width: isSelected ? 3 : 1,
                  alpha: isSelected ? 0.95 : (isActive ? 0.7 : 0.25),
                });
              }}
              layout={{ position: 'absolute', width: cardW, height: cardH }}
            />

            {/* Thumbnail or fallback icon */}
            {tex ? (
              <pixiSprite
                texture={tex}
                x={spriteX}
                y={spriteY}
                width={spriteW}
                height={spriteH}
                alpha={isActive ? 1 : 0.7}
              />
            ) : (
              /* Fallback: large icon when no thumbnail is available */
              <pixiContainer layout={{ position: 'absolute', width: cardW, height: thumbH, justifyContent: 'center', alignItems: 'center' }}>
                <pixiBitmapText
                  text={view.icon}
                  style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 36, fill: 0xffffff }}
                  tint={view.color}
                  alpha={0.5}
                  layout={{}}
                />
              </pixiContainer>
            )}

            {/* Label bar at bottom */}
            <pixiGraphics
              draw={(g) => {
                g.clear();
                // Subtle gradient bar at bottom
                g.roundRect(0, cardH - LABEL_H, cardW, LABEL_H, 0);
                g.fill({ color: theme.bg.color, alpha: 0.4 });
              }}
              layout={{ position: 'absolute', width: cardW, height: cardH }}
            />

            {/* View label */}
            <pixiBitmapText
              text={view.label}
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 15, fill: 0xffffff }}
              tint={isActive ? theme.accent.color : theme.text.color}
              layout={{
                position: 'absolute',
                left: cardW / 2 - view.label.length * 3.5,
                top: cardH - LABEL_H + 7,
              }}
            />

            {/* Active dot — upper-left corner */}
            {isActive && (
              <pixiGraphics
                draw={(g) => {
                  g.clear();
                  g.circle(0, 0, 3);
                  g.fill({ color: theme.accent.color });
                }}
                x={8}
                y={8}
              />
            )}
          </pixiContainer>
        );
      })}

      {/* Hint bar at bottom */}
      <pixiBitmapText
        text="←→↑↓ Navigate  ⏎ Select  ⇥ Cycle  Esc Dismiss"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: offsetX, top: offsetY + gridH + 16 }}
      />
    </pixiContainer>
  );
};
