/**
 * PixiGTDAWBottomPanel — Switchable bottom panel container.
 *
 * Tab bar at top + content area that renders the selected panel.
 */

import React, { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { useGTUltraStore, type GTUltraState } from '@/stores/useGTUltraStore';
import {
  DAW_PANEL_BG, DAW_PANEL_BORDER, DAW_ACCENT, DAW_TEXT_MUTED,
} from './dawTheme';
import { PixiGTDAWMixer } from './PixiGTDAWMixer';
import { PixiGTDAWPresetBrowser } from './PixiGTDAWPresetBrowser';

const TAB_H = 28;

type BottomPanel = GTUltraState['dawBottomPanel'];

const TABS: { id: BottomPanel; label: string }[] = [
  { id: 'mixer', label: 'MIXER' },
  { id: 'tables', label: 'TABLES' },
  { id: 'monitor', label: 'MONITOR' },
  { id: 'presets', label: 'PRESETS' },
  { id: 'clips', label: 'CLIPS' },
];

interface Props {
  width: number;
  height: number;
}

export const PixiGTDAWBottomPanel: React.FC<Props> = ({ width, height }) => {
  const dawBottomPanel = useGTUltraStore((s) => s.dawBottomPanel);

  const handleTab = useCallback((panel: BottomPanel) => {
    useGTUltraStore.getState().setDawBottomPanel(panel);
  }, []);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: DAW_PANEL_BG });
    g.rect(0, 0, width, 1).fill({ color: DAW_PANEL_BORDER });
  }, [width, height]);

  const contentH = height - TAB_H;

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />

      {/* Tab bar */}
      <pixiContainer layout={{ width, height: TAB_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, gap: 4 }}>
        {TABS.map(({ id, label }) => (
          <pixiContainer key={id} eventMode="static" cursor="pointer" onPointerUp={() => handleTab(id)}>
            <pixiBitmapText
              eventMode="none"
              text={label}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
              tint={dawBottomPanel === id ? DAW_ACCENT : DAW_TEXT_MUTED}
            />
          </pixiContainer>
        ))}
      </pixiContainer>

      {/* Content */}
      <pixiContainer layout={{ width, height: contentH }}>
        {dawBottomPanel === 'mixer' && (
          <PixiGTDAWMixer width={width} height={contentH} />
        )}
        {dawBottomPanel === 'presets' && (
          <PixiGTDAWPresetBrowser width={width} height={contentH} />
        )}
        {dawBottomPanel === 'tables' && (
          <pixiBitmapText
            text="Table editor — coming soon"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={DAW_TEXT_MUTED}
            x={16} y={16}
          />
        )}
        {dawBottomPanel === 'monitor' && (
          <pixiBitmapText
            text="SID Monitor — coming soon"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={DAW_TEXT_MUTED}
            x={16} y={16}
          />
        )}
        {dawBottomPanel === 'clips' && (
          <pixiBitmapText
            text="Clip Grid — coming soon"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={DAW_TEXT_MUTED}
            x={16} y={16}
          />
        )}
      </pixiContainer>
    </pixiContainer>
  );
};
