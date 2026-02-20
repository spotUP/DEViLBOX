/**
 * PixiTrackerView — Tracker view for WebGL mode.
 * Layout: FT2Toolbar (top) | Editor controls bar | Main area (pattern editor DOM overlay)
 *
 * The pattern editor grid stays as a DOM <canvas> overlay (OffscreenCanvas worker),
 * positioned within the PixiJS layout region.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiFT2Toolbar } from './tracker/PixiFT2Toolbar';

export const PixiTrackerView: React.FC = () => {
  const theme = usePixiTheme();

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* FT2 Toolbar + Menu bar */}
      <PixiFT2Toolbar />

      {/* Editor controls bar */}
      <PixiEditorControlsBar />

      {/* Main editor area — DOM overlay for pattern canvas */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          flexDirection: 'row',
        }}
      >
        <pixiContainer
          layout={{
            flex: 1,
            height: '100%',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <pixiBitmapText
            text="Pattern Editor Canvas"
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 14 }}
            tint={theme.textMuted.color}
          />
          <pixiBitmapText
            text="(DOM overlay — OffscreenCanvas worker)"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
            tint={theme.textMuted.color}
            layout={{ marginTop: 4 }}
          />
        </pixiContainer>
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Editor Controls Bar ────────────────────────────────────────────────────

const PixiEditorControlsBar: React.FC = () => {
  const theme = usePixiTheme();

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, 32);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, 31, 4000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme]);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: 32,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        gap: 8,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: 32 }} />

      <pixiBitmapText
        text="View: Tracker | Subsong | REC | Groove"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9 }}
        tint={theme.textMuted.color}
      />
    </pixiContainer>
  );
};
