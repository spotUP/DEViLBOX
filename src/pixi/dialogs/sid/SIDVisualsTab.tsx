/**
 * SIDVisualsTab — Piano roll visualization + C64 memory map for SID playback.
 *
 * Shows notes played by each SID voice on a scrolling piano roll, or a C64
 * memory map showing SID program layout. Voice colors match SIDScopeTab.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';

/* ── Colours ── */
const C_BG       = 0x0a0a1a;
const C_OCTAVE   = 0x222244;
const C_BORDER   = 0x333366;
const C_V1       = 0x00ff88;
const C_V2       = 0x6699ff;
const C_V3       = 0xff6644;
const C_LABEL    = 0x888899;
const C_MEM_BG   = 0x111122;
const C_BASIC    = 0x4488cc;
const C_KERNAL   = 0xcc6644;
const C_IO       = 0x88aa44;
const C_SID      = 0xff4488;
const C_LOAD     = 0x44ddcc;
const VOICE_COLORS = [C_V1, C_V2, C_V3];

/* ── Constants ── */
const TOOLBAR_H  = 28;
const STATUS_H   = 20;
const PAL_CLOCK  = 985248;
const NOTE_RANGE = 96; // C0..B7
const HISTORY_LEN = 200;

interface SIDVisualsTabProps {
  width: number;
  height: number;
}

interface VoiceFrame {
  note: number; // MIDI note 0-95, -1 = off
  gate: boolean;
}

type ViewMode = 'pianoroll' | 'memmap';

/** Convert SID frequency register to MIDI note number */
function sidFreqToNote(freq: number): number {
  if (freq <= 0) return -1;
  const hz = (freq * PAL_CLOCK) / 16777216;
  const note = 12 * Math.log2(hz / 440) + 69;
  return Math.round(Math.max(0, Math.min(NOTE_RANGE - 1, note)));
}

/** Note name from MIDI number */
function noteName(n: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[n % 12]}${Math.floor(n / 12)}`;
}

export const SIDVisualsTab: React.FC<SIDVisualsTabProps> = ({ width, height }) => {
  const containerRef = useRef<ContainerType>(null);
  const bgRef    = useRef<GraphicsType>(null);
  const waveRef  = useRef<GraphicsType>(null);
  const megaRef  = useRef<MegaText | null>(null);
  const animRef  = useRef(0);
  const modeRef  = useRef<ViewMode>('pianoroll');
  const [, setTick] = useState(0); // force re-render on mode change

  // Rolling history buffer: [frame][voice]
  const historyRef = useRef<VoiceFrame[][]>([]);

  /* ── MegaText lifecycle ── */
  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  /* ── Static background ── */
  const drawBg = useCallback(() => {
    const bg = bgRef.current;
    if (!bg) return;
    bg.clear();

    const mode = modeRef.current;
    bg.rect(0, 0, width, height).fill({ color: C_BG });

    if (mode === 'pianoroll') {
      const scopeY = TOOLBAR_H;
      const scopeH = height - TOOLBAR_H - STATUS_H;
      bg.rect(0, scopeY, width, scopeH).stroke({ color: C_BORDER, width: 1 });

      // Octave boundary lines
      const noteH = scopeH / NOTE_RANGE;
      for (let oct = 0; oct <= 8; oct++) {
        const y = scopeY + scopeH - oct * 12 * noteH;
        bg.moveTo(0, y).lineTo(width, y).stroke({ color: C_OCTAVE, width: 1 });
      }
    } else {
      // Memory map background
      bg.rect(0, TOOLBAR_H, width, height - TOOLBAR_H).fill({ color: C_MEM_BG });
    }
  }, [width, height]);

  useEffect(() => { drawBg(); }, [drawBg]);

  /* ── Draw memory map (static) ── */
  const drawMemMap = useCallback((g: GraphicsType, mega: MegaText) => {
    g.clear();
    const labels: GlyphLabel[] = [];
    const mapY = TOOLBAR_H + 40;
    const mapH = 32;
    const mapX = 16;
    const mapW = width - 32;
    const scale = mapW / 65536;

    // Toolbar
    labels.push({ x: 4, y: 7, text: '[Piano Roll]', color: C_LABEL, fontFamily: PIXI_FONTS.MONO });
    labels.push({ x: 110, y: 7, text: '[Memory Map]', color: 0xffffff, fontFamily: PIXI_FONTS.MONO });

    labels.push({ x: mapX, y: mapY - 18, text: 'C64 Memory Map (64KB)', color: C_LABEL, fontFamily: PIXI_FONTS.MONO });

    // Full 64K bar
    g.rect(mapX, mapY, mapW, mapH).fill({ color: 0x1a1a2a }).stroke({ color: C_BORDER, width: 1 });

    // BASIC ROM: $A000-$BFFF
    const basicX = mapX + 0xA000 * scale;
    const basicW = 0x2000 * scale;
    g.rect(basicX, mapY, basicW, mapH).fill({ color: C_BASIC, alpha: 0.6 });
    labels.push({ x: basicX + 2, y: mapY + mapH + 4, text: 'BASIC', color: C_BASIC, fontFamily: PIXI_FONTS.MONO });

    // I/O: $D000-$DFFF
    const ioX = mapX + 0xD000 * scale;
    const ioW = 0x1000 * scale;
    g.rect(ioX, mapY, ioW, mapH).fill({ color: C_IO, alpha: 0.6 });
    labels.push({ x: ioX + 2, y: mapY + mapH + 4, text: 'I/O', color: C_IO, fontFamily: PIXI_FONTS.MONO });

    // SID regs: $D400-$D7FF (highlighted)
    const sidX = mapX + 0xD400 * scale;
    const sidW = 0x0400 * scale;
    g.rect(sidX, mapY - 4, Math.max(sidW, 4), mapH + 8).fill({ color: C_SID, alpha: 0.8 });
    labels.push({ x: sidX - 10, y: mapY + mapH + 18, text: 'SID $D400', color: C_SID, fontFamily: PIXI_FONTS.MONO });

    // KERNAL: $E000-$FFFF
    const kernX = mapX + 0xE000 * scale;
    const kernW = 0x2000 * scale;
    g.rect(kernX, mapY, kernW, mapH).fill({ color: C_KERNAL, alpha: 0.6 });
    labels.push({ x: kernX + 2, y: mapY + mapH + 4, text: 'KERNAL', color: C_KERNAL, fontFamily: PIXI_FONTS.MONO });

    // Try to get SID metadata for load/init/play addresses
    try {
      const { getTrackerReplayer } = require('@engine/TrackerReplayer');
      const engine = getTrackerReplayer()?.getC64SIDEngine?.();
      const meta = engine?.getMetadata?.();
      if (meta) {
        const infoY = mapY + mapH + 44;
        labels.push({ x: mapX, y: infoY, text: `Load:  $${(meta.loadAddress ?? 0).toString(16).toUpperCase().padStart(4, '0')}`, color: C_LOAD, fontFamily: PIXI_FONTS.MONO });
        labels.push({ x: mapX, y: infoY + 16, text: `Init:  $${(meta.initAddress ?? 0).toString(16).toUpperCase().padStart(4, '0')}`, color: C_LABEL, fontFamily: PIXI_FONTS.MONO });
        labels.push({ x: mapX, y: infoY + 32, text: `Play:  $${(meta.playAddress ?? 0).toString(16).toUpperCase().padStart(4, '0')}`, color: C_LABEL, fontFamily: PIXI_FONTS.MONO });

        if (meta.dataLength) {
          labels.push({ x: mapX, y: infoY + 48, text: `Data:  ${meta.dataLength} bytes`, color: C_LABEL, fontFamily: PIXI_FONTS.MONO });
        }

        // Show load region on map
        if (meta.loadAddress) {
          const loadX = mapX + meta.loadAddress * scale;
          const loadW = Math.max((meta.dataLength ?? 0x1000) * scale, 3);
          g.rect(loadX, mapY, loadW, mapH).fill({ color: C_LOAD, alpha: 0.4 });
        }
      }
    } catch { /* engine not ready */ }

    // Address labels along bottom
    const addrY = mapY + mapH + 36;
    for (let addr = 0; addr <= 0xFFFF; addr += 0x4000) {
      const x = mapX + addr * scale;
      labels.push({ x, y: addrY, text: `$${addr.toString(16).toUpperCase().padStart(4, '0')}`, color: C_LABEL, fontFamily: PIXI_FONTS.MONO });
    }

    mega.updateLabels(labels, 10);
  }, [width]);

  /* ── Piano roll animation loop ── */
  const drawFrame = useCallback(() => {
    const wave = waveRef.current;
    const mega = megaRef.current;
    if (!wave || !mega) return;

    const mode = modeRef.current;

    if (mode === 'memmap') {
      drawMemMap(wave, mega);
      return;
    }

    wave.clear();

    const scopeY = TOOLBAR_H;
    const scopeH = height - TOOLBAR_H - STATUS_H;
    const noteH  = scopeH / NOTE_RANGE;
    const history = historyRef.current;

    // Poll voice state
    const frame: VoiceFrame[] = [];
    let hasEngine = false;
    try {
      const { getTrackerReplayer } = require('@engine/TrackerReplayer');
      const engine = getTrackerReplayer()?.getC64SIDEngine?.();
      if (engine) {
        hasEngine = true;
        for (let v = 0; v < 3; v++) {
          const st = engine.getVoiceState(v);
          if (st && st.gate) {
            frame.push({ note: sidFreqToNote(st.frequency), gate: true });
          } else {
            frame.push({ note: -1, gate: false });
          }
        }
      }
    } catch { /* engine not loaded */ }

    if (!hasEngine) {
      frame.push({ note: -1, gate: false }, { note: -1, gate: false }, { note: -1, gate: false });
    }

    // Push to history, trim
    history.push(frame);
    while (history.length > HISTORY_LEN) history.shift();

    const labels: GlyphLabel[] = [];

    // Toolbar
    labels.push({ x: 4, y: 7, text: '[Piano Roll]', color: 0xffffff, fontFamily: PIXI_FONTS.MONO });
    labels.push({ x: 110, y: 7, text: '[Memory Map]', color: C_LABEL, fontFamily: PIXI_FONTS.MONO });

    const anyActive = hasEngine && history.some((f) => f.some((v) => v.gate));

    if (!anyActive) {
      labels.push({
        x: width / 2 - 48, y: scopeY + scopeH / 2 - 5,
        text: 'NO SIGNAL', color: C_LABEL, fontFamily: PIXI_FONTS.MONO,
      });
      mega.updateLabels(labels, 10);
      return;
    }

    // Draw note bars — scrolling right to left
    const barW = Math.max(1, width / HISTORY_LEN);

    for (let v = 0; v < 3; v++) {
      const color = VOICE_COLORS[v];

      for (let i = 0; i < history.length; i++) {
        const vf = history[i][v];
        if (!vf || !vf.gate || vf.note < 0) continue;

        const x = width - (history.length - i) * barW;
        const y = scopeY + scopeH - (vf.note + 1) * noteH;

        // Extend bar through consecutive same-note frames
        let len = 1;
        while (i + len < history.length) {
          const next = history[i + len][v];
          if (!next || !next.gate || next.note !== vf.note) break;
          len++;
        }

        wave.rect(x, y, barW * len, Math.max(noteH, 2))
          .fill({ color, alpha: 0.7 });

        i += len - 1; // skip merged frames
      }
    }

    // Octave labels on right edge
    for (let oct = 1; oct <= 7; oct++) {
      const y = scopeY + scopeH - oct * 12 * noteH;
      labels.push({ x: width - 24, y: y - 5, text: `C${oct}`, color: C_LABEL, fontFamily: PIXI_FONTS.MONO });
    }

    // Status — current notes
    const statusY = height - STATUS_H + 4;
    const parts: string[] = [];
    const last = history[history.length - 1];
    for (let v = 0; v < 3; v++) {
      const vf = last?.[v];
      if (vf && vf.gate && vf.note >= 0) {
        parts.push(`V${v + 1}:${noteName(vf.note)}`);
      } else {
        parts.push(`V${v + 1}:---`);
      }
    }
    labels.push({ x: 4, y: statusY, text: parts.join('  '), color: C_LABEL, fontFamily: PIXI_FONTS.MONO });

    mega.updateLabels(labels, 10);
  }, [width, height, drawMemMap]);

  useEffect(() => {
    const tick = () => {
      drawFrame();
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawFrame]);

  /* ── Interaction: toggle view mode ── */
  const handlePointerDown = useCallback((e: any) => {
    const local = e.data?.getLocalPosition?.(containerRef.current) ?? e;
    const lx = local.x ?? 0;
    const ly = local.y ?? 0;

    if (ly > TOOLBAR_H) return;

    if (lx < 105) {
      // Piano Roll button
      if (modeRef.current !== 'pianoroll') {
        modeRef.current = 'pianoroll';
        drawBg();
        setTick((t) => t + 1);
      }
    } else if (lx < 220) {
      // Memory Map button
      if (modeRef.current !== 'memmap') {
        modeRef.current = 'memmap';
        drawBg();
        setTick((t) => t + 1);
      }
    }
  }, [drawBg]);

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      onPointerDown={handlePointerDown}
    >
      <pixiGraphics ref={bgRef} draw={() => {}} layout={{ position: 'absolute', width, height }} />
      <pixiGraphics ref={waveRef} draw={() => {}} layout={{ position: 'absolute', width, height }} />
    </pixiContainer>
  );
};
