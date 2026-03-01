/**
 * PixiTrackHeaders — Track header panel for the arrangement view.
 * Shows track names with mute/solo indicators.
 */

import { useCallback, useRef } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
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
  onToggleMute?: (trackId: string) => void;
  onToggleSolo?: (trackId: string) => void;
  /** Called on double-click of the track name area */
  onRenameTrack?: (trackId: string) => void;
  /** Called on click of the color swatch */
  onCycleColor?: (trackId: string) => void;
  /** Called when the user drags the bottom edge of a track to resize it */
  onResizeTrack?: (trackId: string, newHeight: number) => void;
}

export const PixiTrackHeaders: React.FC<PixiTrackHeadersProps> = ({
  tracks,
  trackHeight = 40,
  width = 160,
  scrollY = 0,
  onToggleMute,
  onToggleSolo,
  onRenameTrack,
  onCycleColor,
  onResizeTrack,
}) => {
  const theme = usePixiTheme();
  // Double-click detection for rename
  const lastClickRef = useRef<{ time: number; trackId: string }>({ time: 0, trackId: '' });

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
            eventMode="static"
            onPointerDown={(e: FederatedPointerEvent) => {
              if (e.button !== 0) return;
              const now = Date.now();
              if (now - lastClickRef.current.time < 300 && lastClickRef.current.trackId === track.id) {
                onRenameTrack?.(track.id);
                lastClickRef.current = { time: 0, trackId: '' };
              } else {
                lastClickRef.current = { time: now, trackId: track.id };
              }
            }}
            layout={{
              position: 'absolute',
              left: 0,
              top: y,
              width,
              height: trackHeight,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 4,
              paddingRight: 4,
              gap: 4,
            }}
          >
            {/* Color swatch — click to cycle color */}
            <pixiContainer
              eventMode="static"
              cursor="pointer"
              onPointerDown={(e: FederatedPointerEvent) => {
                e.stopPropagation();
                if (e.button === 0) onCycleColor?.(track.id);
              }}
              layout={{ width: 8, height: trackHeight - 8 }}
            >
              <pixiGraphics
                draw={(g: GraphicsType) => {
                  g.clear();
                  g.roundRect(0, 0, 8, trackHeight - 8, 2);
                  g.fill({ color: track.color, alpha: track.muted ? 0.3 : 1 });
                }}
                layout={{ width: 8, height: trackHeight - 8 }}
              />
            </pixiContainer>

            {/* Track name */}
            <pixiBitmapText
              text={track.name}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={track.muted ? theme.textMuted.color : theme.text.color}
              layout={{ flex: 1 }}
            />

            {/* Mute button */}
            <pixiContainer
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => onToggleMute?.(track.id)}
              layout={{ width: 16, height: 16, justifyContent: 'center', alignItems: 'center' }}
            >
              <pixiGraphics
                draw={(g: GraphicsType) => {
                  g.clear();
                  g.roundRect(0, 0, 16, 16, 3);
                  if (track.muted) {
                    g.fill({ color: theme.error.color, alpha: 0.25 });
                    g.roundRect(0, 0, 16, 16, 3);
                    g.stroke({ color: theme.error.color, alpha: 0.6, width: 1 });
                  } else {
                    g.fill({ color: theme.bgTertiary.color, alpha: 0.5 });
                    g.roundRect(0, 0, 16, 16, 3);
                    g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
                  }
                }}
                layout={{ position: 'absolute', width: 16, height: 16 }}
              />
              <pixiBitmapText
                text="M"
                style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
                tint={track.muted ? theme.error.color : theme.textMuted.color}
                layout={{}}
              />
            </pixiContainer>

            {/* Solo button */}
            <pixiContainer
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => onToggleSolo?.(track.id)}
              layout={{ width: 16, height: 16, justifyContent: 'center', alignItems: 'center' }}
            >
              <pixiGraphics
                draw={(g: GraphicsType) => {
                  g.clear();
                  g.roundRect(0, 0, 16, 16, 3);
                  if (track.solo) {
                    g.fill({ color: theme.warning.color, alpha: 0.25 });
                    g.roundRect(0, 0, 16, 16, 3);
                    g.stroke({ color: theme.warning.color, alpha: 0.6, width: 1 });
                  } else {
                    g.fill({ color: theme.bgTertiary.color, alpha: 0.5 });
                    g.roundRect(0, 0, 16, 16, 3);
                    g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
                  }
                }}
                layout={{ position: 'absolute', width: 16, height: 16 }}
              />
              <pixiBitmapText
                text="S"
                style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
                tint={track.solo ? theme.warning.color : theme.textMuted.color}
                layout={{}}
              />
            </pixiContainer>

            {/* Bottom border */}
            <pixiGraphics
              draw={(g: GraphicsType) => {
                g.clear();
                g.rect(0, trackHeight - 1, width, 1);
                g.fill({ color: theme.border.color, alpha: 0.15 });
              }}
              layout={{ position: 'absolute', left: 0, top: trackHeight - 1, width, height: 1 }}
            />

            {/* Resize handle — drag bottom edge to resize track height */}
            <pixiContainer
              eventMode="static"
              cursor="ns-resize"
              layout={{ position: 'absolute', left: 0, top: trackHeight - 4, width, height: 8 }}
              onPointerDown={(e: FederatedPointerEvent) => {
                e.stopPropagation();
                const startY = e.clientY;
                const startH = trackHeight;
                const onMove = (me: PointerEvent) => {
                  const newH = Math.max(30, Math.min(120, startH + (me.clientY - startY)));
                  onResizeTrack?.(track.id, newH);
                };
                const onUp = () => {
                  document.removeEventListener('pointermove', onMove);
                  document.removeEventListener('pointerup', onUp);
                };
                document.addEventListener('pointermove', onMove);
                document.addEventListener('pointerup', onUp);
              }}
            >
              <pixiGraphics
                draw={(g: GraphicsType) => {
                  g.clear();
                  g.rect(0, 2, width, 2);
                  g.fill({ color: 0xffffff, alpha: 0.1 });
                }}
                layout={{ position: 'absolute', width, height: 8 }}
              />
            </pixiContainer>
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
};
