/**
 * GlModal — Full-screen modal overlay using Div/Txt.
 *
 * Renders a semi-transparent backdrop with a centered panel.
 * Uses layoutContainer natively for background/border — no manual Graphics.
 * Escape key and click-outside-to-close.
 *
 * Usage:
 *   <GlModal isOpen={open} onClose={close} title="New Song" width={600} height={500}>
 *     <Div className="flex-1 p-4">...content...</Div>
 *   </GlModal>
 */

import React, { useCallback, useEffect } from 'react';
import type { FederatedPointerEvent, FederatedWheelEvent, Graphics as GraphicsType } from 'pixi.js';
import { useApplication } from '@pixi/react';
import { usePixiTheme } from '../theme';
import { Div } from './Div';
import { Txt } from './Txt';

interface GlModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  height?: number;
  children?: React.ReactNode;
}

export const GlModal: React.FC<GlModalProps> = ({
  isOpen,
  onClose,
  title,
  width = 400,
  height = 300,
  children,
}) => {
  const theme = usePixiTheme();
  const { app } = useApplication();

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Screen dimensions — safe access
  let screenW = 1920, screenH = 1080;
  try { if (app?.screen) { screenW = app.screen.width ?? 1920; screenH = app.screen.height ?? 1080; } } catch { /* renderer not ready */ }

  const drawOverlay = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, screenW, screenH);
    g.fill({ color: theme.bg.color, alpha: 0.6 });
  }, [screenW, screenH]);

  const handleOverlayClick = useCallback((_e: FederatedPointerEvent) => {
    onClose();
  }, [onClose]);

  const handlePanelClick = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();
  }, []);

  const blockWheel = useCallback((e: FederatedWheelEvent) => {
    e.stopPropagation();
    (e.nativeEvent as WheelEvent | undefined)?.preventDefault?.();
    (e.nativeEvent as WheelEvent | undefined)?.stopImmediatePropagation?.();
  }, []);

  // Always mount structure — use renderable to hide. Returning null or using
  // {isOpen && ...} causes addChild → Yoga BindingError on open.
  return (
    <pixiContainer
      renderable={isOpen}
      eventMode={isOpen ? 'static' : 'none'}
      layout={{ position: 'absolute', width: '100%', height: '100%' }}
    >
      {/* Backdrop overlay */}
      <pixiGraphics
        draw={drawOverlay}
        eventMode="static"
        onPointerUp={handleOverlayClick}
        onWheel={blockWheel}
        layout={{ position: 'absolute', width: screenW, height: screenH }}
      />

      {/* Centered panel */}
      <Div
        className="flex-col"
        layout={{
          position: 'absolute',
          left: (screenW - width) / 2,
          top: (screenH - height) / 2,
          width,
          height,
          backgroundColor: theme.bgSecondary.color,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 8,
          overflow: 'hidden',
        }}
        eventMode="static"
        onPointerDown={handlePanelClick}
      >
        {/* Header */}
        {title && (
          <Div
            className="flex-row items-center px-4 py-3"
            layout={{
              width,
              height: 44,
              backgroundColor: theme.bgTertiary.color,
              borderBottomWidth: 1,
              borderColor: theme.border.color,
            }}
          >
            <Txt className="text-sm font-bold text-text-primary">{title}</Txt>
          </Div>
        )}

        {/* Content area */}
        <Div className="flex-1 flex-col" layout={{ width, overflow: 'hidden' }}>
          {children}
        </Div>
      </Div>
    </pixiContainer>
  );
};

/**
 * GlModalFooter — Footer bar for GlModal with action buttons.
 */
interface GlModalFooterProps {
  children?: React.ReactNode;
}

export const GlModalFooter: React.FC<GlModalFooterProps> = ({ children }) => {
  const theme = usePixiTheme();

  return (
    <Div
      className="flex-row items-center justify-end px-4 py-3 gap-2"
      layout={{
        height: 44,
        backgroundColor: theme.bgTertiary.color,
        borderTopWidth: 1,
        borderColor: theme.border.color,
      }}
    >
      {children}
    </Div>
  );
};
