/**
 * PixiRoot — Root layout container for the WebGL UI.
 * Uses @pixi/layout (Yoga flexbox) for the main app structure:
 *   NavBar (36px) | MainArea (flex:1) | StatusBar (24px)
 */

import { useCallback } from 'react';
import { useApplication } from '@pixi/react';
import { usePixiTheme } from './theme';
import { useSettingsStore } from '@stores/useSettingsStore';
import { PIXI_FONTS } from './fonts';

/** Props for PixiRoot */
interface PixiRootProps {
  onSwitchToDom?: () => void;
}

export const PixiRoot: React.FC<PixiRootProps> = ({ onSwitchToDom }) => {
  const { app } = useApplication();
  const theme = usePixiTheme();

  const handleSwitchMode = useCallback(() => {
    useSettingsStore.getState().setRenderMode('dom');
    onSwitchToDom?.();
  }, [onSwitchToDom]);

  // For now, render a minimal placeholder layout with the app shell structure.
  // Phase 3 will fill in NavBar, MainArea, StatusBar as PixiJS components.
  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* NavBar placeholder */}
      <pixiContainer
        layout={{
          width: '100%',
          height: 36,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 12,
          paddingRight: 12,
        }}
      >
        <pixiGraphics
          draw={(g) => {
            g.clear();
            g.rect(0, 0, 9999, 36);
            g.fill({ color: theme.bgSecondary.color, alpha: theme.bgSecondary.alpha });
            // Bottom border
            g.rect(0, 35, 9999, 1);
            g.fill({ color: theme.border.color, alpha: theme.border.alpha });
          }}
          layout={{ position: 'absolute', width: '100%', height: 36 }}
        />
        <pixiBitmapText
          text="DEViLBOX — WebGL Mode"
          style={{
            fontFamily: PIXI_FONTS.MONO,
            fontSize: 13,
            tint: theme.text.color,
          }}
          layout={{ marginLeft: 8 }}
        />
      </pixiContainer>

      {/* Main area placeholder */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <pixiBitmapText
          text="WebGL UI — Phase 1 Foundation"
          style={{
            fontFamily: PIXI_FONTS.SANS,
            fontSize: 18,
            tint: theme.textMuted.color,
          }}
        />
      </pixiContainer>

      {/* StatusBar placeholder */}
      <pixiContainer
        layout={{
          width: '100%',
          height: 24,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
        }}
      >
        <pixiGraphics
          draw={(g) => {
            g.clear();
            // Top border
            g.rect(0, 0, 9999, 1);
            g.fill({ color: theme.border.color, alpha: theme.border.alpha });
            // Background
            g.rect(0, 1, 9999, 23);
            g.fill({ color: theme.bgSecondary.color, alpha: theme.bgSecondary.alpha });
          }}
          layout={{ position: 'absolute', width: '100%', height: 24 }}
        />
        <pixiBitmapText
          text="Status: Ready | Press DOM/WebGL toggle in Settings to switch"
          style={{
            fontFamily: PIXI_FONTS.MONO,
            fontSize: 11,
            tint: theme.textMuted.color,
          }}
          layout={{ marginLeft: 4 }}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
