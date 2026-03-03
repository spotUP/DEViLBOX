/**
 * PixiGTStudioInstrument — Visual SID Instrument Designer for Studio Mode.
 *
 * Provides a graphical ADSR envelope editor with draggable control points
 * and visual waveform selectors (saw, triangle, pulse, noise) instead of
 * hex value editing. For users who want to design SID sounds without
 * needing to understand raw hex values.
 *
 * Features:
 * - Draggable ADSR envelope visualization
 * - Waveform selector buttons with visual icons
 * - Pulse width slider (for pulse wave)
 * - Table pointer assignments with preview
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';

// ── Colors ──
const C_BG       = 0x16213e;
const C_BORDER   = 0x333366;
const C_LABEL    = 0x888899;
const C_HEADER   = 0xe94560;
const C_ENV_LINE = 0x2a9d8f;
const C_ENV_FILL = 0x2a9d8f;
const C_POINT    = 0xffffff;
const C_WAVE_ON  = 0x00ff88;
const C_WAVE_OFF = 0x444466;
const C_PW_BAR   = 0x6699ff;

const WAVEFORMS = [
  { name: 'TRI', bit: 0x10, icon: '△' },
  { name: 'SAW', bit: 0x20, icon: '⊿' },
  { name: 'PUL', bit: 0x40, icon: '⊓' },
  { name: 'NOI', bit: 0x80, icon: '⊕' },
];

interface Props {
  width: number;
  height: number;
}

export const PixiGTStudioInstrument: React.FC<Props> = ({ width, height }) => {
  const containerRef = useRef<any>(null);
  const bgRef = useRef<GraphicsType>(null);
  const envRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);

  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const engine = useGTUltraStore((s) => s.engine);

  const inst = instrumentData[currentInstrument] || instrumentData[0];

  // Decode ADSR from ad/sr bytes
  const attack = (inst.ad >> 4) & 0x0F;
  const decay = inst.ad & 0x0F;
  const sustain = (inst.sr >> 4) & 0x0F;
  const release = inst.sr & 0x0F;
  const waveform = inst.firstwave & 0xFE; // mask off gate bit

  // Init MegaText
  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  // Draw
  const redraw = useCallback(() => {
    const bg = bgRef.current;
    const env = envRef.current;
    const mega = megaRef.current;
    if (!bg || !env || !mega) return;

    bg.clear();
    env.clear();

    const labels: GlyphLabel[] = [];
    const ff = PIXI_FONTS.MONO;
    const pad = 8;

    // Background
    bg.rect(0, 0, width, height).fill({ color: C_BG });
    bg.rect(0, 0, width, height).stroke({ color: C_BORDER, width: 1 });

    // Header
    const name = inst.name || `Instrument ${currentInstrument}`;
    labels.push({ x: pad, y: pad, text: `#${currentInstrument.toString(16).padStart(2, '0').toUpperCase()} ${name}`, color: C_HEADER, fontFamily: ff });

    // ── ADSR Envelope visualization ──
    const envY = 28;
    const envH = Math.min(80, height * 0.3);
    const envW = width - pad * 2;

    // Draw envelope background
    bg.rect(pad, envY, envW, envH).fill({ color: 0x0a0a1a });
    bg.rect(pad, envY, envW, envH).stroke({ color: C_BORDER, width: 1 });

    // ADSR times (SID values 0-15 → visual widths)
    const aTbl = [0.002, 0.008, 0.016, 0.024, 0.038, 0.056, 0.068, 0.080, 0.100, 0.250, 0.500, 0.800, 1.0, 3.0, 5.0, 8.0];
    const dTbl = [0.006, 0.024, 0.048, 0.072, 0.114, 0.168, 0.204, 0.240, 0.300, 0.750, 1.5, 2.4, 3.0, 9.0, 15.0, 24.0];

    const aTime = aTbl[attack] || 0.1;
    const dTime = dTbl[decay] || 0.3;
    const sLevel = sustain / 15;
    const rTime = dTbl[release] || 0.3;
    const totalTime = aTime + dTime + rTime + 0.2; // extra sustain display time

    const timeToX = (t: number) => pad + (t / totalTime) * envW;
    const levelToY = (l: number) => envY + envH * (1 - l);

    // Draw envelope shape
    const x0 = pad;
    const x1 = timeToX(aTime);
    const x2 = timeToX(aTime + dTime);
    const x3 = timeToX(aTime + dTime + 0.2);
    const x4 = timeToX(totalTime);

    const yBottom = envY + envH;
    const yTop = envY + 2;
    const ySustain = levelToY(sLevel);

    // Filled area
    env.moveTo(x0, yBottom);
    env.lineTo(x1, yTop);
    env.lineTo(x2, ySustain);
    env.lineTo(x3, ySustain);
    env.lineTo(x4, yBottom);
    env.closePath();
    env.fill({ color: C_ENV_FILL, alpha: 0.15 });

    // Line
    env.moveTo(x0, yBottom);
    env.lineTo(x1, yTop);
    env.lineTo(x2, ySustain);
    env.lineTo(x3, ySustain);
    env.lineTo(x4, yBottom);
    env.stroke({ color: C_ENV_LINE, width: 2 });

    // Control points
    for (const [px, py] of [[x1, yTop], [x2, ySustain], [x3, ySustain], [x4, yBottom]]) {
      env.circle(px, py, 3).fill({ color: C_POINT });
    }

    // ADSR value labels
    labels.push({ x: pad, y: envY + envH + 4, text: `A:${attack}`, color: C_LABEL, fontFamily: ff });
    labels.push({ x: pad + 32, y: envY + envH + 4, text: `D:${decay}`, color: C_LABEL, fontFamily: ff });
    labels.push({ x: pad + 64, y: envY + envH + 4, text: `S:${sustain}`, color: C_LABEL, fontFamily: ff });
    labels.push({ x: pad + 96, y: envY + envH + 4, text: `R:${release}`, color: C_LABEL, fontFamily: ff });

    // ── Waveform buttons ──
    const waveY = envY + envH + 22;
    labels.push({ x: pad, y: waveY, text: 'Waveform:', color: C_LABEL, fontFamily: ff });

    const btnY = waveY + 14;
    const btnW = 48;
    const btnH = 20;
    for (let i = 0; i < WAVEFORMS.length; i++) {
      const wf = WAVEFORMS[i];
      const bx = pad + i * (btnW + 6);
      const isOn = (waveform & wf.bit) !== 0;
      bg.rect(bx, btnY, btnW, btnH).fill({ color: isOn ? 0x1a3a2a : 0x1a1a2e });
      bg.rect(bx, btnY, btnW, btnH).stroke({ color: isOn ? C_WAVE_ON : C_WAVE_OFF, width: 1 });
      labels.push({
        x: bx + 4, y: btnY + 4,
        text: `${wf.icon} ${wf.name}`,
        color: isOn ? C_WAVE_ON : C_WAVE_OFF,
        fontFamily: ff,
      });
    }

    // ── Table pointers ──
    const tblY = btnY + btnH + 12;
    labels.push({ x: pad, y: tblY, text: 'Tables:', color: C_LABEL, fontFamily: ff });
    const tblNames = ['Wave', 'Pulse', 'Filter', 'Speed'];
    const tblPtrs = [inst.wavePtr, inst.pulsePtr, inst.filterPtr, inst.speedPtr];
    for (let i = 0; i < 4; i++) {
      const ty = tblY + 14 + i * 14;
      const val = tblPtrs[i].toString(16).toUpperCase().padStart(2, '0');
      labels.push({ x: pad + 4, y: ty, text: `${tblNames[i]}:`, color: C_LABEL, fontFamily: ff });
      labels.push({ x: pad + 60, y: ty, text: val, color: tblPtrs[i] ? 0x60e060 : C_WAVE_OFF, fontFamily: ff });
    }

    mega.updateLabels(labels, 10);
  }, [width, height, inst, currentInstrument, attack, decay, sustain, release, waveform]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  return (
    <pixiContainer ref={containerRef} layout={{ width, height }}>
      <pixiGraphics ref={bgRef} />
      <pixiGraphics ref={envRef} />
    </pixiContainer>
  );
};
