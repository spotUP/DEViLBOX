/**
 * PixiGTInstrumentDesigner — Unified SID instrument editor.
 *
 * Supports two modes:
 * - compact=true (studio): Simplified layout with ADSR + waveform buttons + table pointers
 * - compact=false (DAW): Full layout with prev/next, larger ADSR, card waveforms,
 *   filter section, table mini-previews, gate/vibrato
 *
 * Shares ALL logic: envelope math, ADSR drag handlers, waveform toggles, engine calls.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import {
  encodeAD, encodeSR, attackLabel, decayLabel, sustainLabel,
  ATTACK_MS, DECAY_MS, WAVEFORMS, decodeFilter, filterModeName,
} from '@/lib/gtultra/GTVisualMapping';
import { usePixiTheme } from '../../theme';
import {
  DAW_BG, DAW_PANEL_BG, DAW_PANEL_BORDER, DAW_SURFACE, DAW_SURFACE_HOVER,
  DAW_ACCENT, DAW_SUCCESS, DAW_TEXT, DAW_TEXT_SEC, DAW_TEXT_MUTED,
  DAW_CH_COLORS, DAW_RADIUS, DAW_PAD,
} from './daw/dawTheme';

// ── Studio-mode colors ──
const C_BG       = 0x0d0d0d;
const C_BORDER   = 0x222222;
const C_LABEL    = 0x666666;
const C_HEADER   = 0x888888;
const C_ENV_LINE = 0x2a9d8f;
const C_ENV_FILL = 0x2a9d8f;
const C_POINT    = 0xffffff;
const C_POINT_HOVER = 0xffcc00;
const C_WAVE_ON  = 0x00ff88;
const C_WAVE_OFF = 0x333333;

// Studio-mode waveform button layout
const STUDIO_BTN_W = 48;
const STUDIO_BTN_H = 20;

type DragTarget = 'attack' | 'decay' | 'sustain' | 'release' | null;

interface Props {
  width: number;
  height: number;
  compact?: boolean;
}

export const PixiGTInstrumentDesigner: React.FC<Props> = ({ width, height, compact = false }) => {
  const theme = usePixiTheme();
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
  const sidRegisters = useGTUltraStore((s) => s.sidRegisters);

  const inst = instrumentData[currentInstrument] || instrumentData[0];
  const chColor = DAW_CH_COLORS[dawSelectedChannel % DAW_CH_COLORS.length];

  // Decode ADSR from ad/sr bytes
  const attack = (inst.ad >> 4) & 0x0F;
  const decay = inst.ad & 0x0F;
  const sustain = (inst.sr >> 4) & 0x0F;
  const release = inst.sr & 0x0F;
  const waveform = inst.firstwave & 0xFE; // mask off gate bit

  // ── Layout constants (mode-dependent) ──
  const pad = compact ? 8 : DAW_PAD;
  const headerH = compact ? 28 : 36;
  const envY = compact ? headerH : headerH + 4;
  const envH = compact ? Math.min(80, height * 0.3) : 120;
  const envW = width - pad * 2;

  // Studio-specific layout
  const studioBtnY = envY + envH + 36;

  // DAW-specific layout
  const waveCardW = compact ? 0 : Math.floor((width - pad * 2 - 6) / 2);
  const waveCardH = 40;
  const dawWaveY = envY + envH + 40;
  const dawFilterY = dawWaveY + waveCardH * 2 + 16 + 40;
  const dawFilterSectionH = 100;
  const dawTableY = dawFilterY + dawFilterSectionH + 14;
  const dawGateY = dawTableY + 60;
  const dawVibratoY = dawGateY + 40;

  // Init MegaText
  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  // ── Envelope geometry (shared) ──
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
  }, [attack, decay, sustain, release, envW, envH, envY, pad]);

  // ── Waveform toggle (shared) ──
  const toggleWaveform = useCallback((bit: number) => {
    const newWave = (waveform ^ bit) | (inst.firstwave & 0x01); // preserve gate bit
    engine?.setInstrumentFirstwave(currentInstrument, newWave);
    const data = [...useGTUltraStore.getState().instrumentData];
    data[currentInstrument] = { ...inst, firstwave: newWave };
    useGTUltraStore.setState({ instrumentData: data });
  }, [engine, currentInstrument, inst, waveform]);

  // ── Pointer handlers ──
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(containerRef.current);
    const mx = local.x;
    const my = local.y;

    if (compact) {
      // Studio: check waveform buttons
      for (let i = 0; i < WAVEFORMS.length; i++) {
        const bx = pad + i * (STUDIO_BTN_W + 6);
        if (mx >= bx && mx <= bx + STUDIO_BTN_W && my >= studioBtnY && my <= studioBtnY + STUDIO_BTN_H) {
          toggleWaveform(WAVEFORMS[i].bit);
          return;
        }
      }
    } else {
      // DAW: check prev/next instrument buttons
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

      // DAW: check waveform cards (2x2 grid)
      for (let i = 0; i < WAVEFORMS.length; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const cx = pad + col * (waveCardW + 6);
        const cy = dawWaveY + row * (waveCardH + 4);
        if (mx >= cx && mx <= cx + waveCardW && my >= cy && my <= cy + waveCardH) {
          toggleWaveform(WAVEFORMS[i].bit);
          return;
        }
      }
    }

    // Check ADSR control points (both modes)
    const pts = getEnvPoints();
    const hitR = compact ? 10 : 12;
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
  }, [compact, pad, studioBtnY, width, waveCardW, dawWaveY, waveCardH, currentInstrument, toggleWaveform, getEnvPoints]);

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
  }, [dragging, engine, currentInstrument, inst, attack, decay, sustain, release, envW, envH, envY, pad]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // ── Drawing ──
  const redraw = useCallback(() => {
    const bg = bgRef.current;
    const env = envRef.current;
    const mega = megaRef.current;
    if (!bg || !env || !mega) return;

    bg.clear();
    env.clear();

    const labels: GlyphLabel[] = [];
    const ff = PIXI_FONTS.MONO;

    if (compact) {
      // ────────────────────────────────────────────
      // STUDIO MODE
      // ────────────────────────────────────────────

      // Background
      bg.rect(0, 0, width, height).fill({ color: C_BG });
      bg.rect(0, 0, width, height).stroke({ color: C_BORDER, width: 1 });

      // Header
      const name = inst.name || `Instrument ${currentInstrument}`;
      labels.push({ x: pad, y: pad, text: `#${currentInstrument.toString(16).padStart(2, '0').toUpperCase()} ${name}`, color: C_HEADER, fontFamily: ff });

      // ADSR envelope area
      bg.rect(pad, envY, envW, envH).fill({ color: theme.bg.color });
      bg.rect(pad, envY, envW, envH).stroke({ color: C_BORDER, width: 1 });

      const pts = getEnvPoints();

      // Filled area
      env.moveTo(pts.x0, pts.yBottom);
      env.lineTo(pts.x1, pts.yTop);
      env.lineTo(pts.x2, pts.ySustain);
      env.lineTo(pts.x3, pts.ySustain);
      env.lineTo(pts.x4, pts.yBottom);
      env.closePath();
      env.fill({ color: C_ENV_FILL, alpha: 0.15 });

      // Line
      env.moveTo(pts.x0, pts.yBottom);
      env.lineTo(pts.x1, pts.yTop);
      env.lineTo(pts.x2, pts.ySustain);
      env.lineTo(pts.x3, pts.ySustain);
      env.lineTo(pts.x4, pts.yBottom);
      env.stroke({ color: C_ENV_LINE, width: 2 });

      // Control points
      const points: [number, number, DragTarget][] = [
        [pts.x1, pts.yTop, 'attack'],
        [pts.x2, pts.ySustain, 'decay'],
        [pts.x3, pts.ySustain, 'sustain'],
        [pts.x4, pts.yBottom, 'release'],
      ];
      for (const [px, py, target] of points) {
        const color = dragging === target ? C_POINT_HOVER : C_POINT;
        env.circle(px, py, dragging === target ? 5 : 3).fill({ color });
      }

      // ADSR value labels
      labels.push({ x: pad, y: envY + envH + 4, text: `A:${attack} ${attackLabel(attack)}`, color: C_LABEL, fontFamily: ff });
      labels.push({ x: pad + 72, y: envY + envH + 4, text: `D:${decay} ${decayLabel(decay)}`, color: C_LABEL, fontFamily: ff });
      labels.push({ x: pad, y: envY + envH + 16, text: `S:${sustain} ${sustainLabel(sustain)}`, color: C_LABEL, fontFamily: ff });
      labels.push({ x: pad + 72, y: envY + envH + 16, text: `R:${release} ${decayLabel(release)}`, color: C_LABEL, fontFamily: ff });

      // Waveform buttons
      const waveY = envY + envH + 32;
      labels.push({ x: pad, y: waveY, text: 'Waveform:', color: C_LABEL, fontFamily: ff });

      for (let i = 0; i < WAVEFORMS.length; i++) {
        const wf = WAVEFORMS[i];
        const bx = pad + i * (STUDIO_BTN_W + 6);
        const isOn = (waveform & wf.bit) !== 0;
        bg.rect(bx, studioBtnY, STUDIO_BTN_W, STUDIO_BTN_H).fill({ color: isOn ? 0x0a2a1a : 0x0d0d0d });
        bg.rect(bx, studioBtnY, STUDIO_BTN_W, STUDIO_BTN_H).stroke({ color: isOn ? C_WAVE_ON : C_WAVE_OFF, width: 1 });
        labels.push({
          x: bx + 4, y: studioBtnY + 4,
          text: `${wf.icon} ${wf.shortName}`,
          color: isOn ? C_WAVE_ON : C_WAVE_OFF,
          fontFamily: ff,
        });
      }

      // Table pointers
      const tblY = studioBtnY + STUDIO_BTN_H + 12;
      labels.push({ x: pad, y: tblY, text: 'Tables:', color: C_LABEL, fontFamily: ff });
      const tblNames = ['Wave', 'Pulse', 'Filter', 'Speed'];
      const tblPtrs = [inst.wavePtr, inst.pulsePtr, inst.filterPtr, inst.speedPtr];
      for (let i = 0; i < 4; i++) {
        const ty = tblY + 14 + i * 14;
        const val = tblPtrs[i].toString(16).toUpperCase().padStart(2, '0');
        labels.push({ x: pad + 4, y: ty, text: `${tblNames[i]}:`, color: C_LABEL, fontFamily: ff });
        labels.push({ x: pad + 60, y: ty, text: val, color: tblPtrs[i] ? 0x60e060 : C_WAVE_OFF, fontFamily: ff });
      }

    } else {
      // ────────────────────────────────────────────
      // DAW MODE
      // ────────────────────────────────────────────

      // Background
      bg.rect(0, 0, width, height).fill({ color: DAW_PANEL_BG });
      bg.rect(0, 0, 1, height).fill({ color: DAW_PANEL_BORDER });

      // Header with prev/next
      const instName = inst.name || `Instrument ${currentInstrument}`;
      const instHex = currentInstrument.toString(16).toUpperCase().padStart(2, '0');
      labels.push({ x: pad + 30, y: 10, text: `#${instHex}`, color: chColor, fontFamily: ff });
      labels.push({ x: pad + 60, y: 10, text: instName, color: DAW_TEXT, fontFamily: ff });
      labels.push({ x: pad, y: 10, text: '<', color: DAW_TEXT_SEC, fontFamily: ff });
      labels.push({ x: width - pad - 10, y: 10, text: '>', color: DAW_TEXT_SEC, fontFamily: ff });

      // ADSR Section
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

      // Waveform Section (card grid)
      labels.push({ x: pad, y: dawWaveY - 14, text: 'WAVEFORM', color: DAW_TEXT_MUTED, fontFamily: ff });

      for (let i = 0; i < WAVEFORMS.length; i++) {
        const wf = WAVEFORMS[i];
        const row = Math.floor(i / 2);
        const col = i % 2;
        const cx = pad + col * (waveCardW + 6);
        const cy = dawWaveY + row * (waveCardH + 4);
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
            env.lineTo(waveDrawX + waveDrawW / 4, waveDrawY);
            env.lineTo(waveDrawX + waveDrawW * 3 / 4, waveDrawY + waveDrawH);
            env.lineTo(waveDrawX + waveDrawW, waveDrawY + waveDrawH / 2);
          } else if (wf.bit === 0x20) {
            env.lineTo(waveDrawX + waveDrawW * 0.9, waveDrawY);
            env.lineTo(waveDrawX + waveDrawW * 0.9, waveDrawY + waveDrawH);
            env.lineTo(waveDrawX + waveDrawW, waveDrawY + waveDrawH / 2);
          } else if (wf.bit === 0x40) {
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
      const modY = dawWaveY + waveCardH * 2 + 12;
      const hasRing = (waveform & 0x04) !== 0;
      const hasSync = (waveform & 0x02) !== 0;
      labels.push({ x: pad, y: modY, text: `Ring:${hasRing ? 'ON' : 'off'}`, color: hasRing ? DAW_SUCCESS : DAW_TEXT_MUTED, fontFamily: ff });
      labels.push({ x: pad + 80, y: modY, text: `Sync:${hasSync ? 'ON' : 'off'}`, color: hasSync ? DAW_SUCCESS : DAW_TEXT_MUTED, fontFamily: ff });

      // Filter Section — read live SID registers
      labels.push({ x: pad, y: dawFilterY - 14, text: 'FILTER', color: DAW_TEXT_MUTED, fontFamily: ff });

      const sidRegs = sidRegisters[0] || new Uint8Array(25);
      const filterInfo = decodeFilter(sidRegs, 0x15);
      const filterPtrHex = inst.filterPtr.toString(16).toUpperCase().padStart(2, '0');

      // Filter pointer label
      labels.push({ x: pad, y: dawFilterY, text: `Ptr: ${filterPtrHex}`, color: inst.filterPtr ? DAW_SUCCESS : DAW_TEXT_MUTED, fontFamily: ff });
      labels.push({ x: pad + 70, y: dawFilterY, text: inst.filterPtr ? 'Active' : 'Off', color: inst.filterPtr ? DAW_SUCCESS : DAW_TEXT_MUTED, fontFamily: ff });

      // Cutoff bar
      const barW = width - pad * 2 - 80;
      const barH = 12;
      const cutoffY = dawFilterY + 16;
      const cutoffFrac = filterInfo.cutoff / 2047;
      labels.push({ x: pad, y: cutoffY, text: 'CUT', color: DAW_TEXT_MUTED, fontFamily: ff });
      bg.roundRect(pad + 30, cutoffY, barW, barH, 2).fill({ color: DAW_BG });
      bg.roundRect(pad + 30, cutoffY, barW, barH, 2).stroke({ color: DAW_PANEL_BORDER, width: 1 });
      if (inst.filterPtr > 0) {
        env.roundRect(pad + 30, cutoffY, barW * cutoffFrac, barH, 2).fill({ color: 0xef4444, alpha: 0.7 });
      }
      labels.push({ x: pad + 34 + barW, y: cutoffY, text: filterInfo.cutoff.toString(), color: DAW_TEXT_SEC, fontFamily: ff });

      // Resonance bar
      const resY = cutoffY + 18;
      const resFrac = filterInfo.resonance / 15;
      labels.push({ x: pad, y: resY, text: 'RES', color: DAW_TEXT_MUTED, fontFamily: ff });
      bg.roundRect(pad + 30, resY, barW, barH, 2).fill({ color: DAW_BG });
      bg.roundRect(pad + 30, resY, barW, barH, 2).stroke({ color: DAW_PANEL_BORDER, width: 1 });
      if (inst.filterPtr > 0) {
        env.roundRect(pad + 30, resY, barW * resFrac, barH, 2).fill({ color: 0xf59e0b, alpha: 0.7 });
      }
      labels.push({ x: pad + 34 + barW, y: resY, text: filterInfo.resonance.toString(), color: DAW_TEXT_SEC, fontFamily: ff });

      // Filter mode labels: LP / BP / HP
      const modeY = resY + 20;
      const modeName = filterModeName(filterInfo);
      const modeLabels: [string, boolean][] = [['LP', filterInfo.lowPass], ['BP', filterInfo.bandPass], ['HP', filterInfo.highPass]];
      for (let mi = 0; mi < modeLabels.length; mi++) {
        const [mLabel, mActive] = modeLabels[mi];
        const mx = pad + mi * 36;
        bg.roundRect(mx, modeY, 30, 14, 2).fill({ color: mActive ? DAW_SURFACE_HOVER : DAW_SURFACE });
        bg.roundRect(mx, modeY, 30, 14, 2).stroke({ color: mActive ? 0xef4444 : DAW_PANEL_BORDER, width: 1 });
        labels.push({ x: mx + 6, y: modeY + 2, text: mLabel, color: mActive ? 0xef4444 : DAW_TEXT_MUTED, fontFamily: ff });
      }
      labels.push({ x: pad + 120, y: modeY + 2, text: modeName, color: DAW_TEXT_SEC, fontFamily: ff });

      // Voice routing: V1/V2/V3
      const voiceY = modeY;
      const voices: [string, boolean][] = [['V1', filterInfo.filterVoice1], ['V2', filterInfo.filterVoice2], ['V3', filterInfo.filterVoice3]];
      for (let vi = 0; vi < voices.length; vi++) {
        const [vLabel, vActive] = voices[vi];
        const vx = width - pad - (3 - vi) * 30;
        bg.roundRect(vx, voiceY, 26, 14, 2).fill({ color: vActive ? DAW_SURFACE_HOVER : DAW_SURFACE });
        bg.roundRect(vx, voiceY, 26, 14, 2).stroke({ color: vActive ? chColor : DAW_PANEL_BORDER, width: 1 });
        labels.push({ x: vx + 4, y: voiceY + 2, text: vLabel, color: vActive ? chColor : DAW_TEXT_MUTED, fontFamily: ff });
      }

      // Table Mini-Previews
      labels.push({ x: pad, y: dawTableY - 14, text: 'TABLES', color: DAW_TEXT_MUTED, fontFamily: ff });
      const tableNames = ['Wave', 'Pulse', 'Filter', 'Speed'];
      const tableKeys = ['wave', 'pulse', 'filter', 'speed'];
      const tableColors = [DAW_ACCENT, 0xf59e0b, 0xef4444, 0x10b981];
      const miniW = Math.floor((width - pad * 2 - 12) / 4);
      const miniH = 35;

      for (let t = 0; t < 4; t++) {
        const tmx = pad + t * (miniW + 4);
        const td = tableData[tableKeys[t]];
        bg.roundRect(tmx, dawTableY, miniW, miniH, 2).fill({ color: DAW_BG });
        bg.roundRect(tmx, dawTableY, miniW, miniH, 2).stroke({ color: DAW_PANEL_BORDER, width: 1 });

        if (td) {
          for (let i = 0; i < 16; i++) {
            const val = td.left[i] || 0;
            const barH = (val / 255) * (miniH - 4);
            const bx = tmx + 2 + i * ((miniW - 4) / 16);
            env.rect(bx, dawTableY + miniH - 2 - barH, Math.max(1, (miniW - 4) / 16 - 1), barH)
              .fill({ color: tableColors[t], alpha: 0.6 });
          }
        }

        labels.push({ x: tmx + 2, y: dawTableY + miniH + 2, text: tableNames[t], color: DAW_TEXT_MUTED, fontFamily: ff });
      }

      // Gate Timing Section
      labels.push({ x: pad, y: dawGateY - 14, text: 'GATE', color: DAW_TEXT_MUTED, fontFamily: ff });
      labels.push({ x: pad, y: dawGateY, text: `Timer: ${inst.gatetimer.toString(16).toUpperCase().padStart(2, '0')}`, color: DAW_TEXT_SEC, fontFamily: ff });

      if (inst.gatetimer > 0) {
        // Draw gate pattern visualization — repeating on/off bars
        const gateVizX = pad;
        const gateVizY = dawGateY + 14;
        const gateVizW = width - pad * 2;
        const stepCount = 16;
        const stepW = gateVizW / stepCount;
        const stepH = 10;
        const onSteps = Math.max(1, inst.gatetimer);
        // Gate pattern: on for `onSteps` frames, off for 1, repeating
        const cycleLen = onSteps + 1;

        bg.roundRect(gateVizX, gateVizY, gateVizW, stepH, 2).fill({ color: DAW_BG });

        for (let si = 0; si < stepCount; si++) {
          const posInCycle = si % cycleLen;
          const isOn = posInCycle < onSteps;
          const sx = gateVizX + si * stepW;
          env.rect(sx + 1, gateVizY + 1, stepW - 2, stepH - 2)
            .fill({ color: isOn ? chColor : DAW_BG, alpha: isOn ? 0.7 : 0.2 });
        }
      }

      // Vibrato Section
      const vibLabelY = dawVibratoY - 14;
      labels.push({ x: pad, y: vibLabelY, text: 'VIBRATO', color: DAW_TEXT_MUTED, fontFamily: ff });
      labels.push({ x: pad, y: dawVibratoY, text: `Delay: ${inst.vibdelay.toString(16).toUpperCase().padStart(2, '0')}`, color: DAW_TEXT_SEC, fontFamily: ff });

      if (inst.vibdelay > 0) {
        // Draw vibrato visualization: flat line then sine wave
        const vibVizX = pad;
        const vibVizY = dawVibratoY + 14;
        const vibVizW = width - pad * 2;
        const vibVizH = 16;
        const midY = vibVizY + vibVizH / 2;
        const totalFrames = 64;
        const delayFrames = Math.min(inst.vibdelay, totalFrames - 8);

        bg.roundRect(vibVizX, vibVizY, vibVizW, vibVizH, 2).fill({ color: DAW_BG });

        // Flat delay portion
        const delayEndX = vibVizX + (delayFrames / totalFrames) * vibVizW;
        env.moveTo(vibVizX + 2, midY);
        env.lineTo(delayEndX, midY);
        env.stroke({ color: DAW_TEXT_MUTED, width: 1 });

        // Delay marker
        env.moveTo(delayEndX, vibVizY + 2).lineTo(delayEndX, vibVizY + vibVizH - 2);
        env.stroke({ color: chColor, width: 1, alpha: 0.5 });

        // Sine wave portion after delay
        const sineStartX = delayEndX;
        const sineW = vibVizX + vibVizW - sineStartX;
        if (sineW > 4) {
          env.moveTo(sineStartX, midY);
          const steps = Math.max(8, Math.floor(sineW / 2));
          for (let si = 1; si <= steps; si++) {
            const frac = si / steps;
            const sx = sineStartX + frac * sineW;
            const sy = midY + Math.sin(frac * Math.PI * 4) * (vibVizH / 2 - 2);
            env.lineTo(sx, sy);
          }
          env.stroke({ color: chColor, width: 1.5 });
        }
      }
    }

    mega.updateLabels(labels, compact ? 10 : 9);
  }, [
    compact, width, height, inst, currentInstrument, attack, decay, sustain, release,
    waveform, dragging, getEnvPoints, chColor, tableData,
    // Studio-specific deps
    theme, pad, envY, envH, envW, studioBtnY,
    // DAW-specific deps
    waveCardW, dawWaveY, waveCardH, dawFilterY, dawTableY, dawGateY, dawVibratoY, dawFilterSectionH,
    sidRegisters,
  ]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      cursor={dragging ? 'grabbing' : (compact ? 'pointer' : 'default')}
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
