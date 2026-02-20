/**
 * PixiInstrumentEditor — Instrument editor for WebGL mode.
 * Uses the generic PixiSynthPanel renderer with per-synth layout configs.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiLabel } from '../components';
import { PixiSynthPanel } from './instruments/PixiSynthPanel';
import { getSynthLayout } from './instruments/layouts';

interface PixiInstrumentEditorProps {
  synthType: string;
  config: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
  instrumentName?: string;
}

export const PixiInstrumentEditor: React.FC<PixiInstrumentEditorProps> = ({
  synthType,
  config,
  onChange,
  instrumentName,
}) => {
  const theme = usePixiTheme();

  const layout = getSynthLayout(synthType);

  const drawHeaderBg = useCallback((g: GraphicsType) => {
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
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
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
        <pixiGraphics draw={drawHeaderBg} layout={{ position: 'absolute', width: '100%', height: 40 }} />

        <PixiLabel text="INSTRUMENT EDITOR" size="sm" weight="bold" color="accent" />

        {instrumentName && (
          <PixiLabel text={instrumentName} size="sm" color="textSecondary" />
        )}

        <pixiContainer layout={{ flex: 1 }} />

        <PixiLabel text={synthType} size="xs" color="textMuted" />
      </pixiContainer>

      {/* Content area */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {layout ? (
          <PixiSynthPanel
            layout={layout}
            config={config}
            onChange={onChange}
          />
        ) : (
          <pixiContainer
            layout={{
              flex: 1,
              width: '100%',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <pixiBitmapText
              text={`No PixiJS layout for "${synthType}"`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12 }}
              tint={theme.textMuted.color}
            />
            <pixiBitmapText
              text="Add layout config to src/pixi/views/instruments/layouts/"
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
              tint={theme.textMuted.color}
              layout={{ marginTop: 4 }}
            />
          </pixiContainer>
        )}
      </pixiContainer>
    </pixiContainer>
  );
};
