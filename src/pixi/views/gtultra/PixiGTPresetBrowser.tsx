/**
 * PixiGTPresetBrowser — SID instrument preset selector for Studio Mode.
 *
 * Shows preset categories and individual presets from gtultraPresets.ts.
 * Selecting a preset applies it to the current instrument via the engine.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { getPresetCategories, getPresetsByCategory, type GTSIDPreset } from '@/constants/gtultraPresets';
import { useGTUltraStore } from '@/stores/useGTUltraStore';

const C_BG       = 0x16213e;
const C_BORDER   = 0x333366;
const C_LABEL    = 0x888899;
const C_HEADER   = 0xe94560;
const C_CAT_BG   = 0x1a1a3a;
const C_CAT_SEL  = 0x2a3a5a;
const C_PRESET   = 0xccccdd;
const C_PRESET_SEL = 0x66aaff;
const C_HOVER    = 0x222244;

interface Props {
  width: number;
  height: number;
  onApplyPreset?: (preset: GTSIDPreset) => void;
}

export const PixiGTPresetBrowser: React.FC<Props> = ({ width, height, onApplyPreset }) => {
  const containerRef = useRef<any>(null);
  const bgRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);

  const [selectedCat, _setSelectedCat] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [scroll, setScroll] = useState(0);

  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);

  const categories = getPresetCategories();
  const catName = categories[selectedCat];
  const presets = catName ? getPresetsByCategory(catName) : [];

  // Init MegaText
  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  const redraw = useCallback(() => {
    const bg = bgRef.current;
    const mega = megaRef.current;
    if (!bg || !mega) return;

    bg.clear();
    const labels: GlyphLabel[] = [];
    const ff = PIXI_FONTS.MONO;
    const pad = 6;
    const headerH = 22;
    const catH = 16;
    const presetH = 14;

    // Background
    bg.rect(0, 0, width, height).fill({ color: C_BG });
    bg.rect(0, 0, width, height).stroke({ color: C_BORDER, width: 1 });

    // Header
    labels.push({ x: pad, y: 4, text: 'PRESETS', color: C_HEADER, fontFamily: ff });
    labels.push({
      x: width - 100, y: 4,
      text: `Inst ${(currentInstrument + 1).toString(16).toUpperCase().padStart(2, '0')}`,
      color: C_LABEL, fontFamily: ff,
    });

    let y = headerH;

    // Category tabs (horizontal)
    const catW = Math.floor((width - pad * 2) / categories.length);
    for (let i = 0; i < categories.length; i++) {
      const cx = pad + i * catW;
      const isSel = i === selectedCat;
      bg.rect(cx, y, catW - 1, catH).fill({ color: isSel ? C_CAT_SEL : C_CAT_BG });
      labels.push({
        x: cx + 3, y: y + 2,
        text: categories[i].slice(0, 5).toUpperCase(),
        color: isSel ? C_PRESET_SEL : C_LABEL,
        fontFamily: ff,
      });
    }

    y += catH + 4;

    // Preset list
    const maxVisible = Math.floor((height - y - 4) / presetH);
    const visStart = Math.max(0, Math.min(scroll, presets.length - maxVisible));

    for (let vi = 0; vi < maxVisible && visStart + vi < presets.length; vi++) {
      const pi = visStart + vi;
      const preset = presets[pi];
      const py = y + vi * presetH;
      const isSel = pi === selectedPreset;

      if (isSel) {
        bg.rect(pad, py, width - pad * 2, presetH - 1).fill({ color: C_HOVER });
      }

      labels.push({
        x: pad + 4, y: py + 1,
        text: preset.name,
        color: isSel ? C_PRESET_SEL : C_PRESET,
        fontFamily: ff,
      });

      // Show ADSR summary
      labels.push({
        x: width - 90, y: py + 1,
        text: `${preset.ad.toString(16).toUpperCase().padStart(2, '0')} ${preset.sr.toString(16).toUpperCase().padStart(2, '0')}`,
        color: C_LABEL,
        fontFamily: ff,
      });
    }

    // Scrollbar
    if (presets.length > maxVisible) {
      const sbH = height - y - 4;
      const thumbH = Math.max(10, (maxVisible / presets.length) * sbH);
      const thumbY = y + (visStart / presets.length) * sbH;
      bg.rect(width - 4, y, 2, sbH).fill({ color: C_CAT_BG });
      bg.rect(width - 4, thumbY, 2, thumbH).fill({ color: C_LABEL });
    }

    mega.updateLabels(labels, 8);
  }, [width, height, selectedCat, selectedPreset, scroll, categories, catName, presets, currentInstrument]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Reset preset selection when category changes
  useEffect(() => {
    setSelectedPreset(0);
    setScroll(0);
  }, [selectedCat]);

  // Keyboard navigation (TODO: wire up event listener)
  useEffect(() => {
    return () => {};
  }, [presets, selectedPreset, categories.length, onApplyPreset]);

  return (
    <pixiContainer ref={containerRef} layout={{ width, height }}>
      <pixiGraphics ref={bgRef} draw={() => {}} />
    </pixiContainer>
  );
};
