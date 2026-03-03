/**
 * PixiGTSIDMonitor — Real-time SID register monitor for GoatTracker Ultra.
 *
 * Displays all 25+4 SID registers in real-time, color-coded by function:
 * - Voice registers (freq, PW, control, ADSR) × 3 voices
 * - Filter registers (cutoff, resonance/routing, mode/volume)
 * - Per-channel waveform visualization
 *
 * Reads SID register dump from WASM engine via gt_get_sid_registers().
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';

const FONT_SIZE = 10;
const LINE_H = 13;
const HEADER_H = 16;

// SID register colors by function
const C_FREQ    = 0x6699ff;  // Frequency
const C_PW      = 0xff8866;  // Pulse width
const C_CTRL    = 0xffcc00;  // Control (waveform/gate/sync/ring)
const C_ADSR    = 0x60e060;  // ADSR
const C_FILTER  = 0xe94560;  // Filter
const C_VOL     = 0xffffff;  // Volume
const C_LABEL   = 0x888899;
const C_DIM     = 0x444466;
const C_BG      = 0x1a1a2e;
const C_HEADER  = 0x0f3460;

// SID register layout (offset → name, color)
const VOICE_REGS = [
  { off: 0, name: 'Freq Lo', color: C_FREQ },
  { off: 1, name: 'Freq Hi', color: C_FREQ },
  { off: 2, name: 'PW Lo',   color: C_PW },
  { off: 3, name: 'PW Hi',   color: C_PW },
  { off: 4, name: 'Control', color: C_CTRL },
  { off: 5, name: 'Atk/Dec', color: C_ADSR },
  { off: 6, name: 'Sus/Rel', color: C_ADSR },
];

const GLOBAL_REGS = [
  { off: 0x15, name: 'FC Lo',     color: C_FILTER },
  { off: 0x16, name: 'FC Hi',     color: C_FILTER },
  { off: 0x17, name: 'Res/Filt',  color: C_FILTER },
  { off: 0x18, name: 'Mode/Vol',  color: C_VOL },
];

interface Props {
  width: number;
  height: number;
  /** SID chip index (0 or 1) */
  sidIndex?: number;
}

export const PixiGTSIDMonitor: React.FC<Props> = ({ width, height, sidIndex = 0 }) => {
  const gridRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);
  const containerRef = useRef<any>(null);
  const registersRef = useRef(new Uint8Array(29)); // 25 main + 4 extras
  const animRef = useRef(0);

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

    const regs = registersRef.current;
    const labels: GlyphLabel[] = [];
    const ff = PIXI_FONTS.MONO;

    g.clear();
    g.rect(0, 0, width, height).fill({ color: C_BG });
    g.rect(0, 0, width, HEADER_H).fill({ color: C_HEADER });

    const sidLabel = sidIndex === 0 ? 'SID #1' : 'SID #2';
    labels.push({ x: 4, y: 2, text: `${sidLabel} REGISTERS`, color: C_FILTER, fontFamily: ff });

    let y = HEADER_H + 2;

    // Voice registers (3 voices)
    for (let voice = 0; voice < 3; voice++) {
      const baseOff = voice * 7;
      labels.push({ x: 4, y, text: `Voice ${voice + 1}`, color: C_LABEL, fontFamily: ff });
      y += LINE_H;

      for (const reg of VOICE_REGS) {
        const addr = baseOff + reg.off;
        const val = regs[addr];
        const hex = val.toString(16).toUpperCase().padStart(2, '0');
        const addrHex = `$D4${addr.toString(16).toUpperCase().padStart(2, '0')}`;

        labels.push({ x: 8, y, text: reg.name, color: C_DIM, fontFamily: ff });
        labels.push({ x: 80, y, text: addrHex, color: C_DIM, fontFamily: ff });
        labels.push({ x: 120, y, text: hex, color: val > 0 ? reg.color : C_DIM, fontFamily: ff });

        // Visual bar for frequency/PW
        if (reg.off <= 1 && val > 0) {
          const barW = (val / 255) * (width - 150);
          g.rect(145, y + 2, barW, LINE_H - 4).fill({ color: reg.color, alpha: 0.2 });
        }

        y += LINE_H;
      }

      // Waveform indicator
      const ctrl = regs[baseOff + 4];
      const wave = [];
      if (ctrl & 0x10) wave.push('▲');  // Triangle
      if (ctrl & 0x20) wave.push('┊');  // Sawtooth
      if (ctrl & 0x40) wave.push('█');  // Pulse
      if (ctrl & 0x80) wave.push('~');  // Noise
      const gate = ctrl & 0x01 ? '●' : '○';
      labels.push({ x: 145, y - VOICE_REGS.length * LINE_H + LINE_H * 4, text: `${gate} ${wave.join(' ')}`, color: C_CTRL, fontFamily: ff });

      y += 2;
    }

    // Global registers
    labels.push({ x: 4, y, text: 'Filter / Vol', color: C_LABEL, fontFamily: ff });
    y += LINE_H;

    for (const reg of GLOBAL_REGS) {
      const val = regs[reg.off];
      const hex = val.toString(16).toUpperCase().padStart(2, '0');
      const addrHex = `$D4${reg.off.toString(16).toUpperCase().padStart(2, '0')}`;

      labels.push({ x: 8, y, text: reg.name, color: C_DIM, fontFamily: ff });
      labels.push({ x: 80, y, text: addrHex, color: C_DIM, fontFamily: ff });
      labels.push({ x: 120, y, text: hex, color: val > 0 ? reg.color : C_DIM, fontFamily: ff });
      y += LINE_H;
    }

    mega.updateLabels(labels, FONT_SIZE);
  }, [width, height, sidIndex]);

  // Animation loop: poll SID registers from engine and update display
  useEffect(() => {
    let frameCount = 0;
    const tick = () => {
      // Every ~6 frames (~100ms at 60fps), request fresh SID register data
      if (frameCount++ % 6 === 0) {
        const engine = useGTUltraStore.getState().engine;
        engine?.requestSidRegisters(sidIndex);
      }
      // Read registers from store
      const storeRegs = useGTUltraStore.getState().sidRegisters[sidIndex];
      if (storeRegs) {
        registersRef.current.set(storeRegs.subarray(0, Math.min(25, storeRegs.length)));
      }
      redraw();
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [redraw, sidIndex]);

  return (
    <pixiContainer ref={containerRef} layout={{ width, height }}>
      <pixiGraphics ref={gridRef} />
    </pixiContainer>
  );
};
