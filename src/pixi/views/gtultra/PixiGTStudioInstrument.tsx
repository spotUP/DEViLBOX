/**
 * PixiGTStudioInstrument — Visual SID Instrument Designer for Studio Mode.
 *
 * Provides a graphical ADSR envelope editor with draggable control points
 * and visual waveform selectors. Users can click/drag ADSR points and
 * click waveform buttons to toggle oscillator types.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { encodeAD, encodeSR, attackLabel, decayLabel, sustainLabel } from '@/lib/gtultra/GTVisualMapping';
import { usePixiTheme } from '../../theme';

// ── Colors (FT2 neutral dark theme) ──
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

const WAVEFORMS = [
  { name: 'TRI', bit: 0x10, icon: '△' },
  { name: 'SAW', bit: 0x20, icon: '⊿' },
  { name: 'PUL', bit: 0x40, icon: '⊓' },
  { name: 'NOI', bit: 0x80, icon: '⊕' },
];

type DragTarget = 'attack' | 'decay' | 'sustain' | 'release' | null;

interface Props {
  width: number;
  height: number;
}

export const PixiGTStudioInstrument: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  const containerRef = useRef<any>(null);
  const bgRef = useRef<GraphicsType>(null);
  const envRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);

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

  // Layout constants for hit testing
  const pad = 8;
  const envY = 28;
  const envH = Math.min(80, height * 0.3);
  const envW = width - pad * 2;
  const btnY = envY + envH + 36;
  const btnW = 48;
  const btnH = 20;

  // Init MegaText
  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  // ── Envelope geometry helpers ──
  const getEnvPoints = useCallback(() => {
    const aTbl = [0.002, 0.008, 0.016, 0.024, 0.038, 0.056, 0.068, 0.080, 0.100, 0.250, 0.500, 0.800, 1.0, 3.0, 5.0, 8.0];
    const dTbl = [0.006, 0.024, 0.048, 0.072, 0.114, 0.168, 0.204, 0.240, 0.300, 0.750, 1.5, 2.4, 3.0, 9.0, 15.0, 24.0];
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
  }, [attack, decay, sustain, release, envW, envH]);

  // ── Pointer handlers for ADSR dragging ──
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(containerRef.current);
    const mx = local.x;
    const my = local.y;

    // Check waveform buttons first
    for (let i = 0; i < WAVEFORMS.length; i++) {
      const bx = pad + i * (btnW + 6);
      if (mx >= bx && mx <= bx + btnW && my >= btnY && my <= btnY + btnH) {
        // Toggle this waveform bit
        const wf = WAVEFORMS[i];
        const newWave = (waveform ^ wf.bit) | (inst.firstwave & 0x01); // preserve gate bit
        engine?.setInstrumentFirstwave(currentInstrument, newWave);
        // Update local store immediately
        const newInst = { ...inst, firstwave: newWave };
        const data = [...useGTUltraStore.getState().instrumentData];
        data[currentInstrument] = newInst;
        useGTUltraStore.setState({ instrumentData: data });
        return;
      }
    }

    // Check ADSR control points (within 10px radius)
    const pts = getEnvPoints();
    const hitR = 10;
    const candidates: [DragTarget, number, number][] = [
      ['attack', pts.x1, pts.yTop],
      ['decay', pts.x2, pts.ySustain],
      ['sustain', pts.x3, pts.ySustain],
      ['release', pts.x4, pts.yBottom],
    ];

    for (const [target, px, py] of candidates) {
      const dist = Math.hypot(mx - px, my - py);
      if (dist < hitR) {
        setDragging(target);
        return;
      }
    }
  }, [engine, currentInstrument, inst, waveform, btnY, getEnvPoints]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!dragging || !engine) return;
    const local = e.getLocalPosition(containerRef.current);
    const mx = local.x;
    const my = local.y;

    // Map pointer position to parameter value (0-15), snapped
    const xFrac = Math.max(0, Math.min(1, (mx - pad) / envW));
    const yFrac = Math.max(0, Math.min(1, 1 - (my - envY) / envH));

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

    // Update store locally for instant visual feedback
    const data = [...useGTUltraStore.getState().instrumentData];
    data[currentInstrument] = { ...inst, ad: newAD, sr: newSR };
    useGTUltraStore.setState({ instrumentData: data });
  }, [dragging, engine, currentInstrument, inst, attack, decay, sustain, release, envW, envH]);

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
    bg.rect(0, 0, width, height).fill({ color: C_BG });
    bg.rect(0, 0, width, height).stroke({ color: C_BORDER, width: 1 });

    // Header
    const name = inst.name || `Instrument ${currentInstrument}`;
    labels.push({ x: pad, y: pad, text: `#${currentInstrument.toString(16).padStart(2, '0').toUpperCase()} ${name}`, color: C_HEADER, fontFamily: ff });

    // ── ADSR Envelope visualization ──
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

    // Control points (highlight dragging target)
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

    // ADSR value labels with timing
    labels.push({ x: pad, y: envY + envH + 4, text: `A:${attack} ${attackLabel(attack)}`, color: C_LABEL, fontFamily: ff });
    labels.push({ x: pad + 72, y: envY + envH + 4, text: `D:${decay} ${decayLabel(decay)}`, color: C_LABEL, fontFamily: ff });
    labels.push({ x: pad, y: envY + envH + 16, text: `S:${sustain} ${sustainLabel(sustain)}`, color: C_LABEL, fontFamily: ff });
    labels.push({ x: pad + 72, y: envY + envH + 16, text: `R:${release} ${decayLabel(release)}`, color: C_LABEL, fontFamily: ff });

    // ── Waveform buttons ──
    const waveY = envY + envH + 32;
    labels.push({ x: pad, y: waveY, text: 'Waveform:', color: C_LABEL, fontFamily: ff });

    for (let i = 0; i < WAVEFORMS.length; i++) {
      const wf = WAVEFORMS[i];
      const bx = pad + i * (btnW + 6);
      const isOn = (waveform & wf.bit) !== 0;
      bg.rect(bx, btnY, btnW, btnH).fill({ color: isOn ? 0x0a2a1a : 0x0d0d0d });
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
  }, [width, height, inst, currentInstrument, attack, decay, sustain, release, waveform, dragging, getEnvPoints, btnY, envW, envH]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      cursor={dragging ? 'grabbing' : 'pointer'}
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
