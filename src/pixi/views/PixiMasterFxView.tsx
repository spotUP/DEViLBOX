// src/pixi/views/PixiMasterFxView.tsx
// Vertical signal-chain view of master effects — GL workbench window.

import React, { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useAudioStore } from '@stores/useAudioStore';
import type { EffectConfig, EffectCategory } from '@typedefs/instrument';
import { PixiLabel } from '../components/PixiLabel';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_W    = 240;
const CARD_H    = 56;
const CARD_R    = 6;
const LED_R     = 5;
const WET_BAR_H = 3;
const ARROW_H   = 18;

// ─── Category label + tint ───────────────────────────────────────────────────

function categoryLabel(cat: EffectCategory): string {
  switch (cat) {
    case 'neural':     return 'NEURAL';
    case 'wasm':       return 'WASM';
    case 'wam':        return 'WAM';
    case 'tonejs':
    default:           return 'TONE';
  }
}

function categoryBgColor(cat: EffectCategory): number {
  switch (cat) {
    case 'neural':     return 0x130820;
    case 'wasm':       return 0x071a1a;
    case 'wam':        return 0x111500;
    case 'tonejs':
    default:           return 0x0a0c18;
  }
}

// ─── Effect Card ─────────────────────────────────────────────────────────────

interface EffectCardProps {
  effect: EffectConfig;
  onToggle: (id: string, enabled: boolean) => void;
}

const EffectCard: React.FC<EffectCardProps> = ({ effect, onToggle }) => {
  const theme = usePixiTheme();
  const enabled = effect.enabled;
  const wetFrac = Math.max(0, Math.min(1, (effect.wet ?? 100) / 100));

  const drawCard = useCallback((g: GraphicsType) => {
    g.clear();
    const bgColor   = categoryBgColor(effect.category);
    const borderCol = enabled ? theme.accent.color : theme.border.color;
    const borderAlpha = enabled ? 0.7 : 0.35;
    // Background
    g.roundRect(0, 0, CARD_W, CARD_H, CARD_R);
    g.fill({ color: bgColor });
    // Border
    g.roundRect(0, 0, CARD_W, CARD_H, CARD_R);
    g.stroke({ color: borderCol, alpha: borderAlpha, width: 1 });
  }, [enabled, effect.category, theme.accent.color, theme.border.color]);

  const drawLed = useCallback((g: GraphicsType) => {
    g.clear();
    const ledColor = enabled ? theme.success.color : theme.bgTertiary.color;
    g.circle(LED_R, LED_R, LED_R);
    g.fill({ color: ledColor });
  }, [enabled, theme.success.color, theme.bgTertiary.color]);

  const drawWetBar = useCallback((g: GraphicsType) => {
    g.clear();
    const barW = CARD_W - 24;
    // Track
    g.rect(0, 0, barW, WET_BAR_H);
    g.fill({ color: theme.border.color, alpha: 0.3 });
    // Fill
    if (wetFrac > 0) {
      g.rect(0, 0, Math.round(barW * wetFrac), WET_BAR_H);
      g.fill({ color: theme.accent.color, alpha: enabled ? 0.85 : 0.3 });
    }
  }, [wetFrac, enabled, theme.accent.color, theme.border.color]);

  const handleLedUp = useCallback(() => {
    onToggle(effect.id, !enabled);
  }, [effect.id, enabled, onToggle]);

  const wetPct = Math.round(wetFrac * 100);

  return (
    <pixiContainer
      layout={{
        width: CARD_W,
        height: CARD_H,
        flexDirection: 'column',
        justifyContent: 'center',
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 8,
        paddingBottom: 6,
        gap: 4,
      }}
    >
      {/* Card background + border */}
      <pixiGraphics
        draw={drawCard}
        layout={{ position: 'absolute', width: CARD_W, height: CARD_H }}
      />

      {/* Top row: LED + name + wet% */}
      <pixiContainer
        layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: CARD_W - 20 }}
      >
        {/* LED toggle */}
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={handleLedUp}
          layout={{ width: LED_R * 2, height: LED_R * 2 }}
        >
          <pixiGraphics draw={drawLed} layout={{ width: LED_R * 2, height: LED_R * 2 }} />
        </pixiContainer>

        {/* Effect name */}
        <pixiBitmapText
          text={effect.type}
          style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 11, fill: 0xffffff }}
          tint={enabled ? 0xffffff : 0x666688}
          layout={{ flex: 1 }}
        />

        {/* Wet % */}
        <pixiBitmapText
          text={`${wetPct}%`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={enabled ? theme.accent.color : theme.textMuted.color}
        />
      </pixiContainer>

      {/* Bottom row: category badge + wet bar */}
      <pixiContainer
        layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: CARD_W - 20 }}
      >
        {/* Category label */}
        <pixiBitmapText
          text={categoryLabel(effect.category)}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ width: 44 }}
        />

        {/* Wet bar */}
        <pixiGraphics
          draw={drawWetBar}
          layout={{ flex: 1, height: WET_BAR_H }}
        />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Arrow connector ──────────────────────────────────────────────────────────

interface ArrowProps {
  borderColor: number;
}

const ArrowConnector: React.FC<ArrowProps> = ({ borderColor }) => {
  const drawArrow = useCallback((g: GraphicsType) => {
    g.clear();
    const cx = CARD_W / 2;
    // Vertical line
    g.rect(cx - 1, 0, 2, ARROW_H - 6);
    g.fill({ color: borderColor, alpha: 0.4 });
    // Arrowhead (small triangle pointing down)
    g.moveTo(cx - 4, ARROW_H - 8);
    g.lineTo(cx + 4, ARROW_H - 8);
    g.lineTo(cx,     ARROW_H - 2);
    g.closePath();
    g.fill({ color: borderColor, alpha: 0.4 });
  }, [borderColor]);

  return (
    <pixiGraphics
      draw={drawArrow}
      layout={{ width: CARD_W, height: ARROW_H }}
    />
  );
};

// ─── Main View ────────────────────────────────────────────────────────────────

export const PixiMasterFxView: React.FC = () => {
  const theme = usePixiTheme();

  const masterEffects      = useAudioStore((s) => s.masterEffects);
  const updateMasterEffect = useAudioStore((s) => s.updateMasterEffect);

  const handleToggle = useCallback((id: string, enabled: boolean) => {
    updateMasterEffect(id, { enabled });
  }, [updateMasterEffect]);

  const isEmpty = masterEffects.length === 0;

  return (
    <pixiContainer
      layout={{
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 12,
        paddingLeft: 16,
        paddingRight: 16,
        gap: 0,
        width: '100%',
      }}
    >
      {/* Header */}
      <pixiContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          width: CARD_W,
          marginBottom: 10,
        }}
      >
        <PixiLabel text="SIGNAL CHAIN" size="xs" color="textMuted" layout={{ flex: 1 }} />
        <pixiBitmapText
          text={`${masterEffects.length}`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={theme.textMuted.color}
        />
      </pixiContainer>

      {/* INPUT label */}
      <pixiBitmapText
        text="INPUT"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={isEmpty ? theme.textMuted.color : theme.accent.color}
        layout={{ marginBottom: isEmpty ? 0 : 6 }}
      />

      {/* Empty state */}
      {isEmpty && (
        <pixiBitmapText
          text="No master effects"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ marginTop: 24 }}
        />
      )}

      {/* Effect cards with arrow connectors */}
      {!isEmpty && (
        <pixiContainer
          layout={{ flexDirection: 'column', alignItems: 'center', gap: 0 }}
        >
          {masterEffects.map((effect, idx) => (
            <pixiContainer key={effect.id} layout={{ flexDirection: 'column', alignItems: 'center' }}>
              {idx > 0 && <ArrowConnector borderColor={theme.border.color} />}
              <EffectCard effect={effect} onToggle={handleToggle} />
            </pixiContainer>
          ))}
        </pixiContainer>
      )}

      {/* OUTPUT label */}
      {!isEmpty && (
        <>
          <ArrowConnector borderColor={theme.border.color} />
          <pixiBitmapText
            text="OUTPUT"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={theme.accent.color}
          />
        </>
      )}
    </pixiContainer>
  );
};
