/**
 * PixiDJView — DJ view for WebGL mode.
 * Layout: Top bar | [Deck A | Mixer | Deck B] (flex row)
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiDJDeck } from './dj/PixiDJDeck';
import { PixiDJMixer } from './dj/PixiDJMixer';

export const PixiDJView: React.FC = () => {
  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Top control bar */}
      <PixiDJTopBar />

      {/* Main deck area: Deck A | Mixer | Deck B */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          flexDirection: 'row',
        }}
      >
        <PixiDJDeck deckId="A" />
        <PixiDJMixer />
        <PixiDJDeck deckId="B" />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Top Bar ────────────────────────────────────────────────────────────────

const PixiDJTopBar: React.FC = () => {
  const theme = usePixiTheme();

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, 40);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, 39, 4000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme]);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: 40,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 12,
        paddingRight: 12,
        gap: 12,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: 40 }} />

      <pixiBitmapText
        text="DEViLBOX DJ"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={{}}
      />

      <pixiContainer layout={{ flex: 1 }} />

      <pixiBitmapText
        text="Browser | FX | Controller"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{}}
      />
    </pixiContainer>
  );
};
