/**
 * PixiGTInstrumentPanel — SID instrument editor panel (Pixi/GL).
 * Displays ADSR, table pointers, and settings for the current instrument.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';

const HEADER_H = 18;
const LINE_H = 14;
const FONT_SIZE = 10;

const C_BG     = 0x0d0d0d;
const C_HEADER = 0x1a1a1a;
const C_ACCENT = 0x888888;
const C_LABEL  = 0x666666;
const C_VALUE  = 0x60e060;
const C_PTR    = 0xffcc00;
const C_NAME   = 0xe0e0e0;
const C_SEP    = 0x222222;

interface Props { width: number; height: number }

export const PixiGTInstrumentPanel: React.FC<Props> = ({ width, height }) => {
  const gridRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);
  const containerRef = useRef<any>(null);

  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);

  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  const redraw = useCallback(() => {
    const g = gridRef.current;
    const mega = megaRef.current;
    if (!g || !mega) return;

    g.clear();
    g.rect(0, 0, width, height).fill({ color: C_BG });
    g.rect(0, 0, width, HEADER_H).fill({ color: C_HEADER });
    g.rect(0, height - 1, width, 1).fill({ color: C_SEP });

    const labels: GlyphLabel[] = [];
    const ff = PIXI_FONTS.MONO;
    const instr = instrumentData[currentInstrument];

    // Header
    const idx = currentInstrument.toString(16).toUpperCase().padStart(2, '0');
    labels.push({ x: 4, y: 3, text: `INSTRUMENT ${idx}`, color: C_ACCENT, fontFamily: ff });
    labels.push({ x: 120, y: 3, text: instr?.name || '', color: C_NAME, fontFamily: ff });

    let y = HEADER_H + 4;
    const addRow = (label: string, value: string, color = C_VALUE) => {
      labels.push({ x: 4, y, text: label, color: C_LABEL, fontFamily: ff });
      labels.push({ x: 90, y, text: value, color, fontFamily: ff });
      y += LINE_H;
    };

    const hex = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

    // ADSR
    labels.push({ x: 4, y, text: 'ENVELOPE', color: C_ACCENT, fontFamily: ff });
    y += LINE_H;

    const ad = instr?.ad ?? 0;
    const sr = instr?.sr ?? 0;
    addRow('Attack', ((ad >> 4) & 0xF).toString(16).toUpperCase());
    addRow('Decay', (ad & 0xF).toString(16).toUpperCase());
    addRow('Sustain', ((sr >> 4) & 0xF).toString(16).toUpperCase());
    addRow('Release', (sr & 0xF).toString(16).toUpperCase());

    // Table pointers
    y += 4;
    labels.push({ x: 4, y, text: 'TABLE PTRS', color: C_ACCENT, fontFamily: ff });
    y += LINE_H;
    addRow('Wave Tbl', hex(instr?.wavePtr ?? 0), C_PTR);
    addRow('Pulse Tbl', hex(instr?.pulsePtr ?? 0), C_PTR);
    addRow('Filter Tbl', hex(instr?.filterPtr ?? 0), C_PTR);
    addRow('Speed Tbl', hex(instr?.speedPtr ?? 0), C_PTR);

    // Settings
    y += 4;
    labels.push({ x: 4, y, text: 'SETTINGS', color: C_ACCENT, fontFamily: ff });
    y += LINE_H;
    addRow('VibDelay', hex(instr?.vibdelay ?? 0));
    addRow('GateTimer', hex(instr?.gatetimer ?? 0));
    addRow('1st Wave', hex(instr?.firstwave ?? 0));

    // ADSR bar visualization
    const barY = HEADER_H + 4;
    const barX = 160;
    const barW = width - barX - 8;
    if (barW > 20) {
      const atk = (ad >> 4) & 0xF;
      const dec = ad & 0xF;
      const sus = (sr >> 4) & 0xF;
      const rel = sr & 0xF;

      // Simple ADSR envelope visualization
      g.moveTo(barX, barY + 50);
      g.lineTo(barX + (atk / 15) * barW * 0.25, barY + 10);  // Attack
      g.lineTo(barX + barW * 0.25 + (dec / 15) * barW * 0.25, barY + 10 + (15 - sus) * 2.5); // Decay
      g.lineTo(barX + barW * 0.7, barY + 10 + (15 - sus) * 2.5); // Sustain
      g.lineTo(barX + barW * 0.7 + (rel / 15) * barW * 0.3, barY + 50); // Release
      g.stroke({ color: C_VALUE, width: 1, alpha: 0.6 });
    }

    mega.updateLabels(labels, FONT_SIZE);
  }, [width, height, currentInstrument, instrumentData]);

  useEffect(() => { redraw(); }, [redraw]);

  // Click to cycle instruments
  const handlePointerUp = useCallback(() => {
    const state = useGTUltraStore.getState();
    state.setCurrentInstrument((state.currentInstrument % 63) + 1);
  }, []);

  return (
    <pixiContainer ref={containerRef} eventMode="static" cursor="pointer" onPointerUp={handlePointerUp} layout={{ width, height }}>
      <pixiGraphics eventMode="none" ref={gridRef} draw={() => {}} />
    </pixiContainer>
  );
};
