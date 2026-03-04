/**
 * PixiDeckScratch — Native GL scratch pattern + fader LFO buttons.
 *
 * Layout:
 *   [Baby] [Trans] [Flare] [Hydro] [Crab] [Orbit] ... | LFO: [OFF] [¼] [⅛] [⅟₁₆] [⅟₃₂]
 */

import React, { useCallback, useRef, useState, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { usePixiTheme, usePixiThemeId, getDeckColors } from '@/pixi/theme';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { SCRATCH_PATTERNS } from '@/engine/dj/DJScratchEngine';

type FaderLFODivision = '1/4' | '1/8' | '1/16' | '1/32';

const LFO_LABELS: { division: FaderLFODivision; label: string }[] = [
  { division: '1/4', label: '1/4' },
  { division: '1/8', label: '1/8' },
  { division: '1/16', label: '1/16' },
  { division: '1/32', label: '1/32' },
];

// Show first 6 patterns inline; rest would need scrolling (matching DOM version's visible set)
const VISIBLE_PATTERNS = SCRATCH_PATTERNS.slice(0, 6);

const BTN_W = 36;
const BTN_H = 18;
const BTN_GAP = 2;
const LFO_BTN_W = 28;
const TAP_MS = 300;
const ROW_H = 22;

interface Props {
  deckId: 'A' | 'B' | 'C';
  width?: number;
  height?: number;
  layout?: Record<string, unknown>;
}

export const PixiDeckScratch: React.FC<Props> = ({ deckId, width = 280, height = 56, layout: layoutProp }) => {
  const theme = usePixiTheme();
  const themeId = usePixiThemeId();
  const activePatternName = useDJStore((s) => s.decks[deckId].activePatternName);
  const faderLFOActive = useDJStore((s) => s.decks[deckId].faderLFOActive);
  const faderLFODivision = useDJStore((s) => s.decks[deckId].faderLFODivision);

  const [waitingPattern, setWaitingPattern] = useState<string | null>(null);
  const pressTimeRef = useRef(0);

  const deckColors = useMemo(() => getDeckColors(themeId, theme.accent, theme.accentSecondary), [themeId, theme]);
  const deckColor = deckId === 'B' ? deckColors.deckB : deckId === 'C' ? deckColors.deckC : deckColors.deckA;

  const getDeck = useCallback(() => getDJEngine().getDeck(deckId), [deckId]);

  const handlePatternDown = useCallback((patternName: string) => {
    if (activePatternName !== null) return;
    pressTimeRef.current = performance.now();
    const store = useDJStore.getState();
    setWaitingPattern(patternName);
    let quantizeWaitMs = 0;
    try {
      getDeck().playPattern(patternName, (waitMs: number) => {
        quantizeWaitMs = waitMs;
        setTimeout(() => { setWaitingPattern(null); store.setDeckPattern(deckId, patternName); }, waitMs);
      });
    } catch { setWaitingPattern(null); return; }
    if (quantizeWaitMs === 0) { setWaitingPattern(null); store.setDeckPattern(deckId, patternName); }
  }, [deckId, activePatternName, getDeck]);

  const handlePatternUp = useCallback((_patternName: string) => {
    const held = performance.now() - pressTimeRef.current;
    if (held < TAP_MS) {
      try { getDeck().finishPatternCycle(); } catch { /* */ }
    } else {
      try { getDeck().stopPattern(); } catch { /* */ }
      useDJStore.getState().setDeckPattern(deckId, null);
      setWaitingPattern(null);
    }
  }, [deckId, getDeck]);

  const handleLFOClick = useCallback((division: FaderLFODivision | null) => {
    const store = useDJStore.getState();
    if (division === null || (faderLFOActive && faderLFODivision === division)) {
      try { getDeck().stopFaderLFO(); } catch { /* */ }
      store.setDeckFaderLFO(deckId, false);
      return;
    }
    try { getDeck().startFaderLFO(division); } catch { /* */ }
    store.setDeckFaderLFO(deckId, true, division);
  }, [deckId, faderLFOActive, faderLFODivision, getDeck]);

  // Draw a small button background
  const drawBtn = useCallback((g: GraphicsType, x: number, w: number, active: boolean, waiting: boolean, disabled: boolean) => {
    g.clear();
    const bgColor = active ? deckColor : waiting ? deckColor : theme.bgTertiary.color;
    const bgAlpha = active ? 0.4 : waiting ? 0.2 : disabled ? 0.05 : 0.1;
    const borderColor = active ? deckColor : waiting ? deckColor : theme.border.color;
    const borderAlpha = active ? 0.6 : waiting ? 0.3 : disabled ? 0.05 : 0.1;
    g.roundRect(x, 0, w, BTN_H, 3).fill({ color: bgColor, alpha: bgAlpha });
    g.roundRect(x, 0, w, BTN_H, 3).stroke({ color: borderColor, alpha: borderAlpha, width: 1 });
  }, [deckColor, theme]);

  return (
    <pixiContainer layout={layoutProp ?? { width, height, flexDirection: 'column', gap: 2, paddingTop: 2, paddingLeft: 2 }}>
      {/* Row 1: Pattern buttons */}
      <pixiContainer layout={{ flexDirection: 'row', gap: BTN_GAP, height: ROW_H, alignItems: 'center' }}>
        {VISIBLE_PATTERNS.map((pattern, _i) => {
          const isActive = activePatternName === pattern.name;
          const isWaiting = waitingPattern === pattern.name;
          const disabled = activePatternName !== null && !isActive;
          const textColor = isActive ? deckColor : isWaiting ? deckColor : disabled ? 0x666666 : 0x999999;
          const textAlpha = isActive ? 1 : isWaiting ? 0.8 : disabled ? 0.3 : 0.6;
          return (
            <pixiContainer
              key={pattern.name}
              layout={{ width: BTN_W, height: BTN_H }}
              eventMode={disabled ? 'none' : 'static'}
              cursor={disabled ? 'default' : 'pointer'}
              onPointerDown={() => handlePatternDown(pattern.name)}
              onPointerUp={() => handlePatternUp(pattern.name)}
              alpha={isWaiting ? 0.6 : 1}
            >
              <pixiGraphics draw={(g: GraphicsType) => drawBtn(g, 0, BTN_W, isActive, isWaiting, disabled)} />
              <pixiBitmapText
                text={isWaiting ? 'WAIT' : pattern.shortName}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                tint={textColor}
                alpha={textAlpha}
                layout={{ position: 'absolute', left: 2, top: 3 }}
              />
            </pixiContainer>
          );
        })}
      </pixiContainer>

      {/* Row 2: LFO controls */}
      <pixiContainer layout={{ flexDirection: 'row', gap: BTN_GAP, height: ROW_H, alignItems: 'center' }}>
        <pixiBitmapText
          text="LFO"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          alpha={0.5}
          layout={{ marginRight: 2 }}
        />
        {/* OFF button */}
        <pixiContainer
          layout={{ width: LFO_BTN_W, height: BTN_H }}
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => handleLFOClick(null)}
        >
          <pixiGraphics draw={(g: GraphicsType) => drawBtn(g, 0, LFO_BTN_W, !faderLFOActive, false, false)} />
          <pixiBitmapText
            text="OFF"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
            tint={!faderLFOActive ? deckColor : 0x999999}
            alpha={!faderLFOActive ? 1 : 0.5}
            layout={{ position: 'absolute', left: 3, top: 3 }}
          />
        </pixiContainer>
        {LFO_LABELS.map(({ division, label }) => {
          const isActive = faderLFOActive && faderLFODivision === division;
          return (
            <pixiContainer
              key={division}
              layout={{ width: LFO_BTN_W, height: BTN_H }}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => handleLFOClick(division)}
            >
              <pixiGraphics draw={(g: GraphicsType) => drawBtn(g, 0, LFO_BTN_W, isActive, false, false)} />
              <pixiBitmapText
                text={label}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                tint={isActive ? deckColor : 0x999999}
                alpha={isActive ? 1 : 0.5}
                layout={{ position: 'absolute', left: 2, top: 3 }}
              />
            </pixiContainer>
          );
        })}
      </pixiContainer>
    </pixiContainer>
  );
};
