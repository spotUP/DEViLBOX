/**
 * PixiModal — Full-screen semi-transparent overlay with centered content container.
 * Matches DOM Modal/ModalHeader/ModalFooter styling 1:1.
 * Uses layoutContainer native bg/border — no manual Graphics.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { useApplication } from '@pixi/react';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiIcon } from './PixiIcon';

// ─── PixiModal ────────────────────────────────────────────────────────────────

interface PixiModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  height?: number;
  /** Backdrop opacity 0-1 (default 0.6 = DOM bg-black/60) */
  overlayAlpha?: number;
  /** Outer border width (default 1 = DOM border) */
  borderWidth?: number;
  /** Outer border radius (default 8 = DOM rounded-lg) */
  borderRadius?: number;
  /** Override panel background color */
  bgColor?: number;
  /** Override panel border color */
  borderColor?: number;
  children?: React.ReactNode;
}

export const PixiModal: React.FC<PixiModalProps> = ({
  isOpen,
  onClose,
  title,
  width = 400,
  height = 300,
  overlayAlpha = 0.6,
  borderWidth: bw = 1,
  borderRadius: br = 8,
  bgColor,
  borderColor: bc,
  children,
}) => {
  const theme = usePixiTheme();
  const { app } = useApplication();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // app.screen getter throws if renderer isn't ready — safe access with fallback
  let screenW = 1920, screenH = 1080;
  try {
    if (app?.screen) {
      screenW = app.screen.width ?? 1920;
      screenH = app.screen.height ?? 1080;
    }
  } catch { /* renderer not initialized yet — use fallback dimensions */ }

  const panelBg = bgColor ?? theme.bg.color;
  const panelBorder = bc ?? theme.border.color;

  const drawOverlay = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, screenW, screenH);
    g.fill({ color: 0x000000, alpha: overlayAlpha });
  }, [screenW, screenH, overlayAlpha]);

  const handleOverlayClick = useCallback((_e: FederatedPointerEvent) => {
    onClose();
  }, [onClose]);

  const handlePanelClick = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;

  return (
    <pixiContainer layout={{ position: 'absolute', width: '100%', height: '100%' }}>
      <pixiGraphics
        draw={drawOverlay}
        eventMode="static"
        onPointerUp={handleOverlayClick}
        layout={{ position: 'absolute', width: screenW, height: screenH }}
      />

      {/* Centered panel — matches DOM: bg-dark-bg, border, rounded-lg, shadow-xl */}
      <layoutContainer
        eventMode="static"
        onPointerDown={handlePanelClick}
        layout={{
          position: 'absolute',
          left: Math.round((screenW - width) / 2),
          top: Math.round((screenH - height) / 2),
          width,
          height,
          flexDirection: 'column',
          backgroundColor: panelBg,
          borderWidth: bw,
          borderColor: panelBorder,
          borderRadius: br,
          overflow: 'hidden',
        }}
      >
        {/* Built-in header (when title prop is used) — matches DOM ModalHeader */}
        {title && (
          <PixiModalHeader title={title} onClose={onClose} />
        )}

        {/* Content — NO padding, each modal controls its own layout */}
        <layoutContainer layout={{ flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </layoutContainer>
      </layoutContainer>
    </pixiContainer>
  );
};

// ─── PixiModalHeader ──────────────────────────────────────────────────────────
// Matches DOM ModalHeader: px-4 py-3, bg-dark-bgSecondary, border-b, icon + title + subtitle

interface PixiModalHeaderProps {
  title: string;
  subtitle?: string;
  /** Override bg color */
  bgColor?: number;
  width?: number;
  onClose?: () => void;
}

export const PixiModalHeader: React.FC<PixiModalHeaderProps> = ({
  title,
  subtitle,
  bgColor,
  onClose,
}) => {
  const theme = usePixiTheme();
  const [closeHovered, setCloseHovered] = useState(false);

  return (
    <layoutContainer
      layout={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 12,
        paddingBottom: 12,
        backgroundColor: bgColor ?? theme.bgSecondary.color,
        borderBottomWidth: 1,
        borderColor: theme.border.color,
      }}
    >
      <layoutContainer layout={{ flexDirection: 'column', gap: 2, flex: 1 }}>
        <pixiBitmapText
          text={title}
          style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 16, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{}}
        />
        {subtitle && (
          <pixiBitmapText
            text={subtitle}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
            tint={theme.textSecondary.color}
            layout={{}}
          />
        )}
      </layoutContainer>
      {onClose && (
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPointerOver={() => setCloseHovered(true)}
          onPointerOut={() => setCloseHovered(false)}
          onPointerUp={onClose}
          layout={{
            width: 28,
            height: 28,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 6,
            ...(closeHovered ? { backgroundColor: theme.bgHover.color } : {}),
          }}
        >
          <PixiIcon name="close" size={16} color={closeHovered ? theme.text.color : theme.textMuted.color} layout={{}} />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

// ─── PixiModalFooter ──────────────────────────────────────────────────────────
// Matches DOM ModalFooter: px-4 py-3, bg-dark-bgSecondary, border-t, flex alignment

interface PixiModalFooterProps {
  width?: number;
  align?: 'left' | 'center' | 'right' | 'between';
  /** Override bg color */
  bgColor?: number;
  children?: React.ReactNode;
}

export const PixiModalFooter: React.FC<PixiModalFooterProps> = ({
  align = 'right',
  bgColor,
  children,
}) => {
  const theme = usePixiTheme();

  const justifyContent = align === 'between' ? 'space-between'
    : align === 'center' ? 'center'
    : align === 'left' ? 'flex-start'
    : 'flex-end';

  return (
    <layoutContainer
      layout={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent,
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 12,
        paddingBottom: 12,
        gap: 8,
        backgroundColor: bgColor ?? theme.bgSecondary.color,
        borderTopWidth: 1,
        borderColor: theme.border.color,
      }}
    >
      {children}
    </layoutContainer>
  );
};
