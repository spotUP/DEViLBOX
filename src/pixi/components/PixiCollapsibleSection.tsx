/**
 * PixiCollapsibleSection — Generic collapsible container for Pixi views.
 * Shows a clickable header when collapsed, full content when expanded.
 */

import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

const COLLAPSED_H = 24;

interface PixiCollapsibleSectionProps {
  label: string;
  width: number;
  expandedHeight: number;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export const PixiCollapsibleSection: React.FC<PixiCollapsibleSectionProps> = ({
  label,
  width,
  expandedHeight,
  children,
  defaultCollapsed = false,
}) => {
  const theme = usePixiTheme();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const h = collapsed ? COLLAPSED_H : expandedHeight;

  const drawCollapsedBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, COLLAPSED_H).fill({ color: theme.bgTertiary.color });
    g.rect(0, COLLAPSED_H - 1, width, 1).fill({ color: theme.border.color });
  }, [width, theme]);

  return (
    <pixiContainer layout={{ width, height: h }}>
      {collapsed ? (
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => setCollapsed(false)}
          layout={{ width, height: COLLAPSED_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 6 }}
        >
          <pixiGraphics draw={drawCollapsedBg} layout={{ position: 'absolute', width, height: COLLAPSED_H }} />
          <pixiBitmapText
            eventMode="none"
            text={`\u25B6 ${label}`}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={theme.textMuted.color}
          />
        </pixiContainer>
      ) : (
        <>
          <pixiContainer
            eventMode="static"
            cursor="pointer"
            onPointerUp={() => setCollapsed(true)}
            layout={{ position: 'absolute', top: 0, right: 6, height: 16, alignItems: 'center' }}
          >
            <pixiBitmapText
              eventMode="none"
              text={'\u25BC'}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
              tint={theme.textMuted.color}
            />
          </pixiContainer>
          {children}
        </>
      )}
    </pixiContainer>
  );
};

export { COLLAPSED_H as PIXI_COLLAPSED_SECTION_H };
