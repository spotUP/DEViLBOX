/**
 * PixiMacroSlotsPanel — 8 quick-entry macro slots for storing/recalling cell data.
 * Compact horizontal bar showing slot contents with Write/Read actions.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { PixiButton } from '../../components';
import { useTrackerStore } from '@stores';

const PANEL_HEIGHT = 32;

interface PixiMacroSlotsPanelProps {
  width: number;
}

export const PixiMacroSlotsPanel: React.FC<PixiMacroSlotsPanelProps> = ({ width }) => {
  const theme = usePixiTheme();
  const macroSlots = useTrackerStore(s => s.macroSlots);
  const writeMacroSlot = useTrackerStore(s => s.writeMacroSlot);
  const readMacroSlot = useTrackerStore(s => s.readMacroSlot);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, PANEL_HEIGHT);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, 0, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [width, theme]);

  const formatHex = (v: number | null): string => {
    if (v === null || v === undefined || v === 0) return '..';
    return v.toString(16).padStart(2, '0').toUpperCase();
  };

  return (
    <pixiContainer layout={{ width, height: PANEL_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, gap: 2 }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height: PANEL_HEIGHT }} />

      <pixiBitmapText
        text="MACRO"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ marginRight: 4 }}
      />

      {macroSlots.map((slot, index) => {
        const isEmpty = slot.note === 0 && slot.instrument === 0 && slot.volume === 0 &&
          slot.effTyp === 0 && slot.eff === 0;

        const cellText = isEmpty ? `${index + 1}:----`
          : `${index + 1}:${formatHex(slot.instrument)}${formatHex(slot.volume)}`;

        return (
          <pixiContainer key={index} layout={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
            <pixiBitmapText
              text={cellText}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
              tint={isEmpty ? theme.textMuted.color : theme.accent.color}
              layout={{}}
            />
            <PixiButton label="W" variant="ghost" size="sm" onClick={() => writeMacroSlot(index)} />
            <PixiButton label="R" variant="ghost" size="sm" onClick={() => readMacroSlot(index)} />
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
};
