/**
 * PixiTrackHeaders — Track header panel for the arrangement view.
 * Shows track names with mute/solo indicators.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';

interface Track {
  id: string;
  name: string;
  muted: boolean;
  solo: boolean;
  color: number;
}

interface PixiTrackHeadersProps {
  tracks: Track[];
  trackHeight?: number;
  width?: number;
  scrollY?: number;
}

export const PixiTrackHeaders: React.FC<PixiTrackHeadersProps> = ({
  tracks,
  trackHeight = 40,
  width = 160,
  scrollY = 0,
}) => {
  const theme = usePixiTheme();

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, 9999);
    g.fill({ color: theme.bgSecondary.color, alpha: 0.5 });
    // Right border
    g.rect(width - 1, 0, 1, 9999);
    g.fill({ color: theme.border.color, alpha: 0.3 });
  }, [width, theme]);

  return (
    <pixiContainer layout={{ width, height: '100%', overflow: 'hidden' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height: '100%' }} />

      {tracks.map((track, i) => {
        const y = i * trackHeight - scrollY;
        return (
          <pixiContainer
            key={track.id}
            layout={{
              position: 'absolute',
              left: 0,
              top: y,
              width,
              height: trackHeight,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 8,
              paddingRight: 4,
              gap: 4,
            }}
          >
            {/* Color indicator */}
            <pixiGraphics
              draw={(g: GraphicsType) => {
                g.clear();
                g.roundRect(0, 0, 3, trackHeight - 8, 2);
                g.fill({ color: track.color, alpha: track.muted ? 0.3 : 1 });
              }}
              layout={{ width: 3, height: trackHeight - 8 }}
            />

            {/* Track name */}
            <pixiBitmapText
              text={track.name}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={track.muted ? theme.textMuted.color : theme.text.color}
              layout={{ flex: 1 }}
            />

            {/* Mute indicator */}
            {track.muted && (
              <pixiBitmapText
                text="M"
                style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
                tint={theme.error.color}
                layout={{}}
              />
            )}

            {/* Solo indicator */}
            {track.solo && (
              <pixiBitmapText
                text="S"
                style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
                tint={theme.warning.color}
                layout={{}}
              />
            )}

            {/* Bottom border */}
            <pixiGraphics
              draw={(g: GraphicsType) => {
                g.clear();
                g.rect(0, trackHeight - 1, width, 1);
                g.fill({ color: theme.border.color, alpha: 0.15 });
              }}
              layout={{ position: 'absolute', left: 0, top: trackHeight - 1, width, height: 1 }}
            />
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
};
