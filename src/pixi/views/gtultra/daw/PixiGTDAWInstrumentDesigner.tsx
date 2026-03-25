/**
 * PixiGTDAWInstrumentDesigner — Visual SID instrument editor sidebar.
 *
 * Sections: Header | ADSR Envelope | Waveform Selector | Pulse Width |
 *           Filter | Table Mini-Previews | Gate/Vibrato
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import {
  encodeAD, encodeSR, attackLabel, decayLabel, sustainLabel,
  ATTACK_MS, DECAY_MS, WAVEFORMS,
} from '@/lib/gtultra/GTVisualMapping';
import {
  DAW_BG, DAW_PANEL_BG, DAW_PANEL_BORDER, DAW_SURFACE, DAW_SURFACE_HOVER,
  DAW_ACCENT, DAW_SUCCESS, DAW_TEXT, DAW_TEXT_SEC, DAW_TEXT_MUTED,
  DAW_CH_COLORS, DAW_RADIUS, DAW_PAD,
} from './dawTheme';

type DragTarget = 'attack' | 'decay' | 'sustain' | 'release' | null;

interface Props {
  width: number;
  height: number;
}

export const PixiGTDAWInstrumentDesigner: React.FC<Props> = ({ width, height }) => {
  const containerRef = useRef<any>(null);
  const bgRef = useRef<GraphicsType>(null);
  const envRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);

  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const tableData = useGTUltraStore((s) => s.tableData);
  const engine = useGTUltraStore((s) => s.engine);
  const dawSelectedChannel = useGTUltraStore((s) => s.dawSelectedChannel);

  const inst = instrumentData[currentInstrument] || instrumentData[0];
  const chColor = DAW_CH_COLORS[dawSelectedChannel % DAW_CH_COLORS.length];

  // Decode ADSR
  const attack = (inst.ad >> 4) & 0x0F;
  const decay = inst.ad & 0x0F;
  const sustain = (inst.sr >> 4) & 0x0F;
  const release = inst.sr & 0x0F;
  const waveform = inst.firstwave & 0xFE;

  // Layout constants
  const pad = DAW_PAD;
  const headerH = 36;
  const envY = headerH + 4;
  const envH = 120;
  const envW = width - pad * 2;
  const waveY = envY + envH + 40;
  const waveCardW = Math.floor((width - pad * 2 - 6) / 2);
  const waveCardH = 40;
  const filterY = waveY + waveCardH * 2 + 16 + 40; // after wave + ring/sync
  const tableY = filterY + 90;
  const gateY = tableY + 60;

  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  // ADSR envelope geometry (same math as PixiGTStudioInstrument)
  const getEnvPoints = useCallback(() => {
    const aTbl = ATTACK_MS.map(ms => ms / 1000);
    const dTbl = DECAY_MS.map(ms => ms / 1000);
    const aTime = aTbl[attack] || 0.1;
    const dTime = dTbl[decay] || 0.3;
    const sLevel = sustain / 15;
    const rTime = dTbl[release] || 0.3;
    const totalTime = aTime + dTime + rTime + 0.2;

    const timeToX = (t: number) => pad + (t / totalTime) * envW;
    const levelToY = (l: number) => envY + envH * (1 - l);

    return {
      x0: pad,
      x1: timeToX(aTime),
      x2: timeToX(aTime + dTime),
      x3: timeToX(aTime + dTime + 0.2),
      x4: timeToX(totalTime),
      yTop: envY + 2,
      ySustain: levelToY(sLevel),
      yBottom: envY + envH,
    };
  }, [attack, decay, sustain, release, envW, envH, envY]);

  // Pointer handlers for ADSR dragging
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(containerRef.current);
    const mx = local.x;
    const my = local.y;

    // Check prev/next instrument buttons
    if (my >= 4 && my <= 24) {
      if (mx >= pad && mx <= pad + 20) {
        useGTUltraStore.getState().setCurrentInstrument(currentInstrument - 1);
        return;
      }
      if (mx >= width - pad - 20 && mx <= width - pad) {
        useGTUltraStore.getState().setCurrentInstrument(currentInstrument + 1);
        return;
      }
    }

    // Check waveform cards
    for (let i = 0; i < WAVEFORMS.length; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const cx = pad + col * (waveCardW + 6);
      const cy = waveY + row * (waveCardH + 4);
      if (mx >= cx && mx <= cx + waveCardW && my >= cy && my <= cy + waveCardH) {
        const wf = WAVEFORMS[i];
        const newWave = (waveform ^ wf.bit) | (inst.firstwave & 0x01);
        engine?.setInstrumentFirstwave(currentInstrument, newWave);
        const data = [...useGTUltraStore.getState().instrumentData];
        data[currentInstrument] = { ...inst, firstwave: newWave };
        useGTUltraStore.setState({ instrumentData: data });
        return;
      }
    }

    // Check ADSR control points
    const pts = getEnvPoints();
    const hitR = 12;
    const candidates: [DragTarget, number, number][] = [
      ['attack', pts.x1, pts.yTop],
      ['decay', pts.x2, pts.ySustain],
      ['sustain', pts.x3, pts.ySustain],
      ['release', pts.x4, pts.yBottom],
    ];

    for (const [target, px, py] of candidates) {
      if (Math.hypot(mx - px, my - py) < hitR) {
        setDragging(target);
        return;
      }
    }
  }, [engine, currentInstrument, inst, waveform, getEnvPoints, waveCardW, waveY]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!dragging || !engine) return;
    const local = e.getLocalPosition(containerRef.current);
    const xFrac = Math.max(0, Math.min(1, (local.x - pad) / envW));
    const yFrac = Math.max(0, Math.min(1, 1 - (local.y - envY) / envH));

    let newAD = inst.ad;
    let newSR = inst.sr;
    let newVal: number;
    switch (dragging) {
      case 'attack':
        newVal = Math.round(xFrac * 15);
        newAD = encodeAD(newVal, decay);
        engine.setInstrumentAD(currentInstrument, newAD);
        break;
      case 'decay':
        newVal = Math.round(xFrac * 15);
        newAD = encodeAD(attack, newVal);
        engine.setInstrumentAD(currentInstrument, newAD);
        break;
      case 'sustain':
        newVal = Math.round(yFrac * 15);
        newSR = encodeSR(newVal, release);
        engine.setInstrumentSR(currentInstrument, newSR);
        break;
      case 'release':
        newVal = Math.round(xFrac * 15);
        newSR = encodeSR(sustain, newVal);
        engine.setInstrumentSR(currentInstrument, newSR);
        break;
    }

    const data = [...useGTUltraStore.getState().instrumentData];
    data[currentInstrument] = { ...inst, ad: newAD, sr: newSR };
    useGTUltraStore.setState({ instrumentData: data });
  }, [dragging, engine, currentInstrument, inst, attack, decay, sustain, release, envW, envH, envY]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
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

    // Background
    bg.rect(0, 0, width, height).fill({ color: DAW_PANEL_BG });
    bg.rect(0, 0, 1, height).fill({ color: DAW_PANEL_BORDER });

    // Header
    const instName = inst.name || `Instrument ${currentInstrument}`;
    const instHex = currentInstrument.toString(16).toUpperCase().padStart(2, '0');
    labels.push({ x: pad + 30, y: 10, text: `#${instHex}`, color: chColor, fontFamily: ff });
    labels.push({ x: pad + 60, y: 10, text: instName, color: DAW_TEXT, fontFamily: ff });

    // Prev/Next labels
    labels.push({ x: pad, y: 10, text: '<', color: DAW_TEXT_SEC, fontFamily: ff });
    labels.push({ x: width - pad - 10, y: 10, text: '>', color: DAW_TEXT_SEC, fontFamily: ff });

    // ── ADSR Section ──
    labels.push({ x: pad, y: envY - 14, text: 'ENVELOPE', color: DAW_TEXT_MUTED, fontFamily: ff });
    bg.roundRect(pad, envY, envW, envH, DAW_RADIUS).fill({ color: DAW_BG });
    bg.roundRect(pad, envY, envW, envH, DAW_RADIUS).stroke({ color: DAW_PANEL_BORDER, width: 1 });

    const pts = getEnvPoints();

    // Filled area
    env.moveTo(pts.x0, pts.yBottom);
    env.lineTo(pts.x1, pts.yTop);
    env.lineTo(pts.x2, pts.ySustain);
    env.lineTo(pts.x3, pts.ySustain);
    env.lineTo(pts.x4, pts.yBottom);
    env.closePath();
    env.fill({ color: chColor, alpha: 0.15 });

    // Line
    env.moveTo(pts.x0, pts.yBottom);
    env.lineTo(pts.x1, pts.yTop);
    env.lineTo(pts.x2, pts.ySustain);
    env.lineTo(pts.x3, pts.ySustain);
    env.lineTo(pts.x4, pts.yBottom);
    env.stroke({ color: chColor, width: 2 });

    // Control points
    const points: [number, number, DragTarget][] = [
      [pts.x1, pts.yTop, 'attack'],
      [pts.x2, pts.ySustain, 'decay'],
      [pts.x3, pts.ySustain, 'sustain'],
      [pts.x4, pts.yBottom, 'release'],
    ];
    for (const [px, py, target] of points) {
      const isDragging = dragging === target;
      env.circle(px, py, isDragging ? 6 : 4).fill({ color: isDragging ? 0xffcc00 : 0xffffff });
    }

    // ADSR labels
    const adsrY = envY + envH + 4;
    labels.push({ x: pad, y: adsrY, text: `A:${attack} ${attackLabel(attack)}`, color: DAW_TEXT_SEC, fontFamily: ff });
    labels.push({ x: pad + 80, y: adsrY, text: `D:${decay} ${decayLabel(decay)}`, color: DAW_TEXT_SEC, fontFamily: ff });
    labels.push({ x: pad, y: adsrY + 12, text: `S:${sustain} ${sustainLabel(sustain)}`, color: DAW_TEXT_SEC, fontFamily: ff });
    labels.push({ x: pad + 80, y: adsrY + 12, text: `R:${release} ${decayLabel(release)}`, color: DAW_TEXT_SEC, fontFamily: ff });

    // ── Waveform Section ──
    labels.push({ x: pad, y: waveY - 14, text: 'WAVEFORM', color: DAW_TEXT_MUTED, fontFamily: ff });

    for (let i = 0; i < WAVEFORMS.length; i++) {
      const wf = WAVEFORMS[i];
      const row = Math.floor(i / 2);
      const col = i % 2;
      const cx = pad + col * (waveCardW + 6);
      const cy = waveY + row * (waveCardH + 4);
      const isOn = (waveform & wf.bit) !== 0;

      bg.roundRect(cx, cy, waveCardW, waveCardH, DAW_RADIUS)
        .fill({ color: isOn ? DAW_SURFACE_HOVER : DAW_SURFACE });
      bg.roundRect(cx, cy, waveCardW, waveCardH, DAW_RADIUS)
        .stroke({ color: isOn ? DAW_SUCCESS : DAW_PANEL_BORDER, width: isOn ? 2 : 1 });

      // Mini waveform visualization
      const waveDrawW = waveCardW - 60;
      const waveDrawH = waveCardH - 12;
      const waveDrawX = cx + 48;
      const waveDrawY = cy + 6;

      if (isOn) {
        env.moveTo(waveDrawX, waveDrawY + waveDrawH / 2);
        if (wf.bit === 0x10) {
          // Triangle
          env.lineTo(waveDrawX + waveDrawW / 4, waveDrawY);
          env.lineTo(waveDrawX + waveDrawW * 3 / 4, waveDrawY + waveDrawH);
          env.lineTo(waveDrawX + waveDrawW, waveDrawY + waveDrawH / 2);
        } else if (wf.bit === 0x20) {
          // Sawtooth
          env.lineTo(waveDrawX + waveDrawW * 0.9, waveDrawY);
          env.lineTo(waveDrawX + waveDrawW * 0.9, waveDrawY + waveDrawH);
          env.lineTo(waveDrawX + waveDrawW, waveDrawY + waveDrawH / 2);
        } else if (wf.bit === 0x40) {
          // Pulse — use actual pulse width from table
          const pt = tableData['pulse'];
          let pwFrac = 0.5;
          if (pt && inst.pulsePtr > 0 && inst.pulsePtr < pt.left.length) {
            const hi = pt.left[inst.pulsePtr] || 0;
            const lo = pt.right[inst.pulsePtr] || 0;
            const pw12 = ((hi & 0x0F) << 8) | lo;
            pwFrac = Math.max(0.05, Math.min(0.95, pw12 / 4095));
          }
          const transX = waveDrawX + waveDrawW * pwFrac;
          env.lineTo(waveDrawX, waveDrawY);
          env.lineTo(transX, waveDrawY);
          env.lineTo(transX, waveDrawY + waveDrawH);
          env.lineTo(waveDrawX + waveDrawW, waveDrawY + waveDrawH);
        } else if (wf.bit === 0x80) {
          // Noise
          for (let j = 0; j < 10; j++) {
            const nx = waveDrawX + (j / 10) * waveDrawW;
            const ny = waveDrawY + ((Math.sin(j * 7.3) * 0.5 + 0.5) * waveDrawH);
            env.lineTo(nx, ny);
          }
          env.lineTo(waveDrawX + waveDrawW, waveDrawY + waveDrawH / 2);
        }
        env.stroke({ color: DAW_SUCCESS, width: 1.5 });
      }

      labels.push({
        x: cx + 6, y: cy + waveCardH / 2 - 4,
        text: wf.shortName,
        color: isOn ? DAW_SUCCESS : DAW_TEXT_MUTED,
        fontFamily: ff,
      });
    }

    // Ring Mod / Sync labels
    const modY = waveY + waveCardH * 2 + 12;
    const hasRing = (waveform & 0x04) !== 0;
    const hasSync = (waveform & 0x02) !== 0;
    labels.push({ x: pad, y: modY, text: `Ring:${hasRing ? 'ON' : 'off'}`, color: hasRing ? DAW_SUCCESS : DAW_TEXT_MUTED, fontFamily: ff });
    labels.push({ x: pad + 80, y: modY, text: `Sync:${hasSync ? 'ON' : 'off'}`, color: hasSync ? DAW_SUCCESS : DAW_TEXT_MUTED, fontFamily: ff });

    // ── Filter Section ──
    labels.push({ x: pad, y: filterY - 14, text: 'FILTER', color: DAW_TEXT_MUTED, fontFamily: ff });
    // Filter info from instrument's table pointer
    labels.push({ x: pad, y: filterY, text: `Table Ptr: ${inst.filterPtr.toString(16).toUpperCase().padStart(2, '0')}`, color: DAW_TEXT_SEC, fontFamily: ff });

    // ── Table Mini-Previews ──
    labels.push({ x: pad, y: tableY - 14, text: 'TABLES', color: DAW_TEXT_MUTED, fontFamily: ff });
    const tableNames = ['Wave', 'Pulse', 'Filter', 'Speed'];
    const tableKeys = ['wave', 'pulse', 'filter', 'speed'];
    const tableColors = [DAW_ACCENT, 0xf59e0b, 0xef4444, 0x10b981];
    const miniW = Math.floor((width - pad * 2 - 12) / 4);
    const miniH = 35;

    for (let t = 0; t < 4; t++) {
      const mx = pad + t * (miniW + 4);
      const td = tableData[tableKeys[t]];
      bg.roundRect(mx, tableY, miniW, miniH, 2).fill({ color: DAW_BG });
      bg.roundRect(mx, tableY, miniW, miniH, 2).stroke({ color: DAW_PANEL_BORDER, width: 1 });

      // Draw first 16 entries as bars
      if (td) {
        for (let i = 0; i < 16; i++) {
          const val = td.left[i] || 0;
          const barH = (val / 255) * (miniH - 4);
          const bx = mx + 2 + i * ((miniW - 4) / 16);
          env.rect(bx, tableY + miniH - 2 - barH, Math.max(1, (miniW - 4) / 16 - 1), barH)
            .fill({ color: tableColors[t], alpha: 0.6 });
        }
      }

      labels.push({ x: mx + 2, y: tableY + miniH + 2, text: tableNames[t], color: DAW_TEXT_MUTED, fontFamily: ff });
    }

    // ── Gate & Vibrato ──
    labels.push({ x: pad, y: gateY, text: `Gate:${inst.gatetimer.toString(16).toUpperCase().padStart(2, '0')}`, color: DAW_TEXT_SEC, fontFamily: ff });
    labels.push({ x: pad + 80, y: gateY, text: `Vib:${inst.vibdelay.toString(16).toUpperCase().padStart(2, '0')}`, color: DAW_TEXT_SEC, fontFamily: ff });

    mega.updateLabels(labels, 9);
  }, [width, height, inst, currentInstrument, attack, decay, sustain, release, waveform, dragging, getEnvPoints, chColor, tableData, waveCardW, waveY, filterY, tableY, gateY, envW, envH, envY]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      cursor={dragging ? 'grabbing' : 'default'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerUpOutside={handlePointerUp}
    >
      <pixiGraphics ref={bgRef} draw={() => {}} />
      <pixiGraphics ref={envRef} draw={() => {}} />
    </pixiContainer>
  );
};
