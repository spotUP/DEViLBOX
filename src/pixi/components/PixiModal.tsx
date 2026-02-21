/**
 * PixiModal — Full-screen semi-transparent overlay with centered content container.
 * Includes header/footer bars. Click-outside-to-close, Escape key.
 */

import { useCallback, useEffect } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { useApplication } from '@pixi/react';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

// ─── PixiModal ────────────────────────────────────────────────────────────────

interface PixiModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  height?: number;
  children?: React.ReactNode;
}

export const PixiModal: React.FC<PixiModalProps> = ({
  isOpen,
  onClose,
  title,
  width = 400,
  height = 300,
  children,
}) => {
  const theme = usePixiTheme();
  const { app } = useApplication();

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const screenW = app?.screen?.width ?? 1920;
  const screenH = app?.screen?.height ?? 1080;

  const drawOverlay = (g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, screenW, screenH);
    g.fill({ color: 0x000000, alpha: 0.6 });
  };

  const drawPanel = (g: GraphicsType) => {
    g.clear();
    // Panel background
    g.roundRect(0, 0, width, height, 8);
    g.fill({ color: theme.bgSecondary.color });
    g.roundRect(0, 0, width, height, 8);
    g.stroke({ color: theme.border.color, alpha: 0.6, width: 1 });
  };

  const drawHeader = (g: GraphicsType) => {
    g.clear();
    // Header background
    g.roundRect(0, 0, width, 36, 0);
    g.fill({ color: theme.bgTertiary.color });
    // Bottom border
    g.moveTo(0, 35);
    g.lineTo(width, 35);
    g.stroke({ color: theme.border.color, alpha: 0.4, width: 1 });
  };

  // Click overlay to close
  const handleOverlayClick = useCallback((_e: FederatedPointerEvent) => {
    onClose();
  }, [onClose]);

  // Prevent click propagation on the panel
  const handlePanelClick = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <pixiContainer layout={{ position: 'absolute', width: '100%', height: '100%' }}>
      {/* Overlay backdrop */}
      <pixiGraphics
        draw={drawOverlay}
        eventMode="static"
        onPointerUp={handleOverlayClick}
        layout={{ position: 'absolute', width: screenW, height: screenH }}
      />

      {/* Centered panel */}
      <pixiContainer
        eventMode="static"
        onPointerDown={handlePanelClick}
        layout={{
          position: 'absolute',
          left: (screenW - width) / 2,
          top: (screenH - height) / 2,
          width,
          height,
          flexDirection: 'column',
        }}
      >
        {/* Panel background */}
        <pixiGraphics
          draw={drawPanel}
          layout={{ position: 'absolute', width, height }}
        />

        {/* Header */}
        {title && (
          <pixiContainer
            layout={{
              width,
              height: 36,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 12,
            }}
          >
            <pixiGraphics
              draw={drawHeader}
              layout={{ position: 'absolute', width, height: 36 }}
            />
            <pixiBitmapText
              text={title}
              style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 13, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{}}
            />
          </pixiContainer>
        )}

        {/* Content area */}
        <pixiContainer
          layout={{
            flex: 1,
            width,
            padding: 12,
            flexDirection: 'column',
          }}
        >
          {children}
        </pixiContainer>
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── PixiModalHeader ──────────────────────────────────────────────────────────

interface PixiModalHeaderProps {
  title: string;
  width?: number;
  onClose?: () => void;
}

export const PixiModalHeader: React.FC<PixiModalHeaderProps> = ({
  title,
  width = 400,
  onClose,
}) => {
  const theme = usePixiTheme();

  return (
    <pixiContainer
      layout={{
        width,
        height: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      <pixiBitmapText
        text={title}
        style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 13, fill: 0xffffff }}
        tint={theme.text.color}
        layout={{}}
      />
      {onClose && (
        <pixiBitmapText
          text="X"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={theme.textMuted.color}
          eventMode="static"
          cursor="pointer"
          onPointerUp={onClose}
          layout={{}}
        />
      )}
    </pixiContainer>
  );
};

// ─── PixiModalFooter ──────────────────────────────────────────────────────────

interface PixiModalFooterProps {
  width?: number;
  children?: React.ReactNode;
}

export const PixiModalFooter: React.FC<PixiModalFooterProps> = ({
  width = 400,
  children,
}) => {
  const theme = usePixiTheme();

  const drawFooter = (g: GraphicsType) => {
    g.clear();
    g.moveTo(0, 0);
    g.lineTo(width, 0);
    g.stroke({ color: theme.border.color, alpha: 0.4, width: 1 });
    g.rect(0, 1, width, 43);
    g.fill({ color: theme.bgTertiary.color });
  };

  return (
    <pixiContainer
      layout={{
        width,
        height: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: 12,
        gap: 8,
      }}
    >
      <pixiGraphics
        draw={drawFooter}
        layout={{ position: 'absolute', width, height: 44 }}
      />
      {children}
    </pixiContainer>
  );
};
