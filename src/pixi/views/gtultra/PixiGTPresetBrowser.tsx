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
import { usePixiTheme } from '../../theme';

interface Props {
  width: number;
  height: number;
  variant?: 'list' | 'cards';
  onApplyPreset?: (preset: GTSIDPreset) => void;
}

export const PixiGTPresetBrowser: React.FC<Props> = ({ width, height, variant = 'list', onApplyPreset }) => {
  const theme = usePixiTheme();
  const containerRef = useRef<any>(null);
  const bgRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);
  const isCards = variant === 'cards';

  const [selectedCat, setSelectedCat] = useState(0);
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
    const presetH = isCards ? 60 : 14;

    // Background
    bg.rect(0, 0, width, height).fill({ color: theme.bg.color });
    bg.rect(0, 0, width, height).stroke({ color: theme.border.color, width: 1 });

    // Header
    labels.push({ x: pad, y: 4, text: 'PRESETS', color: theme.textSecondary.color, fontFamily: ff });
    labels.push({
      x: width - 100, y: 4,
      text: `Inst ${(currentInstrument + 1).toString(16).toUpperCase().padStart(2, '0')}`,
      color: theme.textMuted.color, fontFamily: ff,
    });

    let y = headerH;

    // Category tabs (horizontal)
    const catW = Math.floor((width - pad * 2) / categories.length);
    for (let i = 0; i < categories.length; i++) {
      const cx = pad + i * catW;
      const isSel = i === selectedCat;
      bg.rect(cx, y, catW - 1, catH).fill({ color: isSel ? theme.bgHover.color : theme.bgSecondary.color });
      labels.push({
        x: cx + 3, y: y + 2,
        text: categories[i].slice(0, 5).toUpperCase(),
        color: isSel ? theme.accent.color : theme.textMuted.color,
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
        bg.rect(pad, py, width - pad * 2, presetH - 1).fill({ color: theme.bgHover.color });
      }

      labels.push({
        x: pad + 4, y: py + 1,
        text: preset.name,
        color: isSel ? theme.accent.color : theme.text.color,
        fontFamily: ff,
      });

      // Show ADSR summary
      labels.push({
        x: width - 90, y: py + 1,
        text: `${preset.ad.toString(16).toUpperCase().padStart(2, '0')} ${preset.sr.toString(16).toUpperCase().padStart(2, '0')}`,
        color: theme.textMuted.color,
        fontFamily: ff,
      });
    }

    // Scrollbar
    if (presets.length > maxVisible) {
      const sbH = height - y - 4;
      const thumbH = Math.max(10, (maxVisible / presets.length) * sbH);
      const thumbY = y + (visStart / presets.length) * sbH;
      bg.rect(width - 4, y, 2, sbH).fill({ color: theme.bgSecondary.color });
      bg.rect(width - 4, thumbY, 2, thumbH).fill({ color: theme.textMuted.color });
    }

    mega.updateLabels(labels, 8);
  }, [width, height, selectedCat, selectedPreset, scroll, categories, catName, presets, currentInstrument, theme]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Reset preset selection when category changes
  useEffect(() => {
    setSelectedPreset(0);
    setScroll(0);
  }, [selectedCat]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedPreset((prev) => {
            const next = Math.max(0, prev - 1);
            setScroll((s) => Math.min(s, next));
            return next;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedPreset((prev) => {
            const next = Math.min(presets.length - 1, prev + 1);
            const maxVisible = Math.floor((height - 40) / 14);
            setScroll((s) => Math.max(s, next - maxVisible + 1));
            return next;
          });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setSelectedCat((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setSelectedCat((prev) => Math.min(categories.length - 1, prev + 1));
          break;
        case 'Enter': {
          const preset = presets[selectedPreset];
          if (preset && onApplyPreset) onApplyPreset(preset);
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [presets, selectedPreset, categories.length, height, onApplyPreset]);

  return (
    <pixiContainer ref={containerRef} layout={{ width, height }}>
      <pixiGraphics ref={bgRef} draw={() => {}} />
    </pixiContainer>
  );
};
