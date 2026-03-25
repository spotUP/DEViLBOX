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
import { PixiGTPresetBrowser } from '../PixiGTPresetBrowser';
import { PixiGTStudioTables } from '../PixiGTStudioTables';
import { PixiGTSIDMonitor } from '../PixiGTSIDMonitor';
import { PixiGTOrderList } from '../PixiGTOrderList';
import { PixiGTOscilloscope } from '../PixiGTOscilloscope';

const TAB_H = 28;

type BottomPanel = GTUltraState['dawBottomPanel'];

const TABS: { id: BottomPanel; label: string }[] = [
  { id: 'mixer', label: 'MIXER' },
  { id: 'tables', label: 'TABLES' },
  { id: 'monitor', label: 'MONITOR' },
  { id: 'presets', label: 'PRESETS' },
  { id: 'clips', label: 'CLIPS' },
  { id: 'scope', label: 'SCOPE' },
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
          <PixiGTPresetBrowser width={width} height={contentH} variant="cards" />
        )}
        {dawBottomPanel === 'tables' && (
          <PixiGTStudioTables width={width} height={contentH} />
        )}
        {dawBottomPanel === 'monitor' && (
          <PixiGTSIDMonitor width={width} height={contentH} />
        )}
        {dawBottomPanel === 'clips' && (
          <PixiGTOrderList width={width} height={contentH} />
        )}
        {dawBottomPanel === 'scope' && (
          <PixiGTOscilloscope width={width} height={contentH} />
        )}
      </pixiContainer>
    </pixiContainer>
  );
};
