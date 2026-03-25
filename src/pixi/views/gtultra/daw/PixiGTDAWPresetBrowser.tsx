/**
 * PixiGTDAWPresetBrowser — Card-based preset browser for DAW mode.
 *
 * Reuses preset data from gtultraPresets.ts (single source of truth).
 * Renders as a grid of cards with mini ADSR curves and waveform indicators.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { getPresetCategories, getPresetsByCategory, type GTSIDPreset } from '@/constants/gtultraPresets';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { ATTACK_MS, DECAY_MS } from '@/lib/gtultra/GTVisualMapping';
import {
  DAW_BG, DAW_PANEL_BORDER, DAW_SURFACE, DAW_SURFACE_HOVER,
  DAW_ACCENT, DAW_SUCCESS, DAW_TEXT, DAW_TEXT_SEC, DAW_TEXT_MUTED,
  DAW_RADIUS, DAW_PAD,
} from './dawTheme';

interface Props {
  width: number;
  height: number;
}

export const PixiGTDAWPresetBrowser: React.FC<Props> = ({ width, height }) => {
  const containerRef = useRef<any>(null);
  const bgRef = useRef<GraphicsType>(null);
  const cardsRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);

  const [selectedCat, setSelectedCat] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [scroll, setScroll] = useState(0);

  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const engine = useGTUltraStore((s) => s.engine);

  const categories = getPresetCategories();
  const catName = categories[selectedCat];
  const presets = catName ? getPresetsByCategory(catName) : [];

  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  const applyPreset = useCallback((preset: GTSIDPreset) => {
    if (!engine) return;
    engine.setInstrumentAD(currentInstrument, preset.ad);
    engine.setInstrumentSR(currentInstrument, preset.sr);
    engine.setInstrumentFirstwave(currentInstrument, preset.waveform);
    // Update store
    const data = [...useGTUltraStore.getState().instrumentData];
    data[currentInstrument] = {
      ...data[currentInstrument],
      ad: preset.ad,
      sr: preset.sr,
      firstwave: preset.waveform,
      name: preset.name,
    };
    useGTUltraStore.setState({ instrumentData: data });
  }, [engine, currentInstrument]);

  const redraw = useCallback(() => {
    const bg = bgRef.current;
    const cards = cardsRef.current;
    const mega = megaRef.current;
    if (!bg || !cards || !mega) return;

    bg.clear();
    cards.clear();

    const labels: GlyphLabel[] = [];
    const ff = PIXI_FONTS.MONO;
    const pad = DAW_PAD;
    const catH = 22;
    const cardW = Math.min(200, Math.floor((width - pad * 3) / 3));
    const cardH = 60;
    const cols = Math.max(1, Math.floor((width - pad) / (cardW + pad)));

    bg.rect(0, 0, width, height).fill({ color: DAW_BG });

    // Category tabs
    const catW = Math.floor((width - pad * 2) / categories.length);
    for (let i = 0; i < categories.length; i++) {
      const cx = pad + i * catW;
      const isSel = i === selectedCat;
      bg.roundRect(cx, 4, catW - 2, catH - 4, 2)
        .fill({ color: isSel ? DAW_SURFACE_HOVER : DAW_SURFACE });
      labels.push({
        x: cx + 4, y: 8,
        text: categories[i].slice(0, 6).toUpperCase(),
        color: isSel ? DAW_ACCENT : DAW_TEXT_MUTED,
        fontFamily: ff,
      });
    }

    // Preset cards
    let cardIdx = 0;
    for (let i = 0; i < presets.length; i++) {
      const preset = presets[i];
      const col = cardIdx % cols;
      const row = Math.floor(cardIdx / cols);
      const cx = pad + col * (cardW + pad);
      const cy = catH + 8 + row * (cardH + 6) - scroll;

      if (cy + cardH < catH || cy > height) { cardIdx++; continue; }

      const isSel = i === selectedPreset;

      cards.roundRect(cx, cy, cardW, cardH, DAW_RADIUS)
        .fill({ color: isSel ? DAW_SURFACE_HOVER : DAW_SURFACE });
      cards.roundRect(cx, cy, cardW, cardH, DAW_RADIUS)
        .stroke({ color: isSel ? DAW_ACCENT : DAW_PANEL_BORDER, width: isSel ? 2 : 1 });

      // Preset name
      labels.push({
        x: cx + 6, y: cy + 4,
        text: preset.name,
        color: isSel ? DAW_TEXT : DAW_TEXT_SEC,
        fontFamily: ff,
      });

      // Description
      labels.push({
        x: cx + 6, y: cy + 16,
        text: preset.description.slice(0, 30),
        color: DAW_TEXT_MUTED,
        fontFamily: ff,
      });

      // Mini ADSR curve (40x20px)
      const adsrX = cx + cardW - 50;
      const adsrY = cy + 4;
      const adsrW = 44;
      const adsrH = 20;

      const a = (preset.ad >> 4) & 0x0F;
      const d = preset.ad & 0x0F;
      const s = (preset.sr >> 4) & 0x0F;
      const r = preset.sr & 0x0F;

      const aT = ATTACK_MS[a] / 1000;
      const dT = DECAY_MS[d] / 1000;
      const sL = s / 15;
      const rT = DECAY_MS[r] / 1000;
      const total = aT + dT + rT + 0.2;
      const tx = (t: number) => adsrX + (t / total) * adsrW;
      const ly = (l: number) => adsrY + adsrH * (1 - l);

      cards.moveTo(adsrX, adsrY + adsrH);
      cards.lineTo(tx(aT), adsrY);
      cards.lineTo(tx(aT + dT), ly(sL));
      cards.lineTo(tx(aT + dT + 0.2), ly(sL));
      cards.lineTo(tx(total), adsrY + adsrH);
      cards.stroke({ color: DAW_ACCENT, width: 1 });

      // Waveform indicators
      const wvY = cy + cardH - 14;
      const waveforms = [
        { bit: 0x10, name: 'T' },
        { bit: 0x20, name: 'S' },
        { bit: 0x40, name: 'P' },
        { bit: 0x80, name: 'N' },
      ];
      for (let w = 0; w < waveforms.length; w++) {
        const isOn = (preset.waveform & waveforms[w].bit) !== 0;
        labels.push({
          x: cx + 6 + w * 14, y: wvY,
          text: waveforms[w].name,
          color: isOn ? DAW_SUCCESS : DAW_TEXT_MUTED,
          fontFamily: ff,
        });
      }

      cardIdx++;
    }

    mega.updateLabels(labels, 8);
  }, [width, height, selectedCat, selectedPreset, scroll, categories, presets]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    setSelectedPreset(0);
    setScroll(0);
  }, [selectedCat]);

  // Click handler
  const handlePointerDown = useCallback((e: any) => {
    const local = e.getLocalPosition(containerRef.current);
    const pad = DAW_PAD;
    const catH = 22;
    const catW = Math.floor((width - pad * 2) / categories.length);

    // Category tabs
    if (local.y < catH + 4) {
      const idx = Math.floor((local.x - pad) / catW);
      if (idx >= 0 && idx < categories.length) {
        setSelectedCat(idx);
      }
      return;
    }

    // Preset cards
    const cardW = Math.min(200, Math.floor((width - pad * 3) / 3));
    const cardH = 60;
    const cols = Math.max(1, Math.floor((width - pad) / (cardW + pad)));

    for (let i = 0; i < presets.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = pad + col * (cardW + pad);
      const cy = catH + 8 + row * (cardH + 6) - scroll;

      if (local.x >= cx && local.x <= cx + cardW && local.y >= cy && local.y <= cy + cardH) {
        setSelectedPreset(i);
        applyPreset(presets[i]);
        return;
      }
    }
  }, [width, categories, presets, scroll, applyPreset]);

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      onPointerDown={handlePointerDown}
    >
      <pixiGraphics ref={bgRef} draw={() => {}} />
      <pixiGraphics ref={cardsRef} draw={() => {}} />
    </pixiContainer>
  );
};
