/**
 * PixiUADEDebuggerPanel — GL (PixiJS) live Paula channel debugger.
 *
 * Displays 4 Paula channel strips updating at the rate UADEEngine fires channel
 * updates (~20 Hz). Each strip shows: note name derived from Amiga period, a
 * volume bar, a DMA indicator, the raw period value, and a matched instrument name.
 *
 * Follows the PixiUADELiveParams pattern: React state drives rendering, no RAF loop.
 * Read-only display — does not modify any engine or instrument state.
 * Safe to render when UADEEngine is not running; falls back gracefully.
 */

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { UADEEngine } from '../../../engine/uade/UADEEngine';
import type { UADEChannelData } from '../../../engine/uade/UADEEngine';
import { amigaPeriodToNote } from '../../../engine/uade/amigaPeriodToNote';
import type { InstrumentConfig } from '@/types/instrument';

// ── Channel strip dimensions ────────────────────────────────────────────────
const STRIP_W   = 72;
const STRIP_H   = 76;
const BAR_W     = STRIP_W - 8;
const BAR_H     = 5;
const DMA_R     = 3;

// Pixi hex colours
const COLOR_BG         = 0x000a14;
const COLOR_BORDER     = 0x112233;
const COLOR_DMA_ON     = 0x22dd88;
const COLOR_DMA_OFF    = 0x223344;
const COLOR_NOTE_ON    = 0x44aaff;
const COLOR_NOTE_OFF   = 0x224466;
const COLOR_BAR_HI     = 0x22cc66;
const COLOR_BAR_MID    = 0x44aaff;
const COLOR_BAR_LO     = 0x224466;
const COLOR_BAR_TRACK  = 0x112233;

const CHANNEL_LABELS = ['CH1', 'CH2', 'CH3', 'CH4'];

/** Find the closest instrument name by instrBase proximity to a samplePtr. */
function resolveInstrumentName(samplePtr: number, instruments: InstrumentConfig[]): string {
  if (samplePtr === 0) return '---';
  let best: InstrumentConfig | null = null;
  let bestDist = Infinity;
  for (const instr of instruments) {
    const base = instr.uadeChipRam?.instrBase;
    if (base == null) continue;
    const dist = Math.abs(samplePtr - base);
    if (dist < bestDist) {
      bestDist = dist;
      best = instr;
    }
  }
  if (best && bestDist < 65536) {
    const name = best.name ?? '';
    return name.length > 8 ? name.slice(0, 7) + '\u2026' : name || '---';
  }
  return '---';
}

// ── Per-channel strip sub-component ────────────────────────────────────────

interface StripProps {
  index: number;
  ch: UADEChannelData;
  instruments: InstrumentConfig[];
}

const PixiChannelStrip: FC<StripProps> = ({ index, ch, instruments }) => {
  const noteInfo   = ch.period > 0 ? amigaPeriodToNote(ch.period) : null;
  const volPct     = ch.volume / 64;
  const instrName  = resolveInstrumentName(ch.samplePtr, instruments);
  const noteColor  = ch.dma ? COLOR_NOTE_ON : COLOR_NOTE_OFF;
  const noteText   = noteInfo ? noteInfo.name : (ch.period > 0 ? `P${ch.period}` : '---');
  const periodText = ch.period > 0 ? String(ch.period) : '----';
  const volText    = `${ch.volume}/64`;

  const barColor = ch.volume > 48 ? COLOR_BAR_HI
                 : ch.volume > 24 ? COLOR_BAR_MID
                 : COLOR_BAR_LO;

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    // Background
    g.rect(0, 0, STRIP_W, STRIP_H);
    g.fill({ color: COLOR_BG });
    // Border
    g.rect(0, 0, STRIP_W, 1);
    g.fill({ color: COLOR_BORDER });
    g.rect(0, 0, 1, STRIP_H);
    g.fill({ color: COLOR_BORDER });
    g.rect(STRIP_W - 1, 0, 1, STRIP_H);
    g.fill({ color: COLOR_BORDER });
    g.rect(0, STRIP_H - 1, STRIP_W, 1);
    g.fill({ color: COLOR_BORDER });
  }, []);

  const drawBar = useCallback((g: GraphicsType) => {
    g.clear();
    // Track
    g.rect(0, 0, BAR_W, BAR_H);
    g.fill({ color: COLOR_BAR_TRACK });
    // Fill
    const fillW = Math.round(BAR_W * volPct);
    if (fillW > 0) {
      g.rect(0, 0, fillW, BAR_H);
      g.fill({ color: barColor });
    }
  }, [volPct, barColor]);

  const drawDma = useCallback((g: GraphicsType) => {
    g.clear();
    g.circle(DMA_R, DMA_R, DMA_R);
    g.fill({ color: ch.dma ? COLOR_DMA_ON : COLOR_DMA_OFF });
  }, [ch.dma]);

  return (
    <pixiContainer
      layout={{
        width: STRIP_W,
        height: STRIP_H,
        flexDirection: 'column',
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 4,
        paddingBottom: 4,
        gap: 2,
      }}
    >
      {/* Background + border */}
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: STRIP_W, height: STRIP_H }} />

      {/* Header row: channel label + DMA dot */}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: BAR_W, height: 10 }}>
        <pixiBitmapText
          text={CHANNEL_LABELS[index]}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
          tint={0x336688}
          layout={{}}
        />
        <pixiGraphics draw={drawDma} layout={{ width: DMA_R * 2, height: DMA_R * 2 }} />
      </pixiContainer>

      {/* Note name */}
      <pixiBitmapText
        text={noteText}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
        tint={noteColor}
        layout={{ marginBottom: 1 }}
      />

      {/* Volume bar */}
      <pixiGraphics draw={drawBar} layout={{ width: BAR_W, height: BAR_H }} />

      {/* Period + volume numbers */}
      <pixiContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', width: BAR_W, height: 8 }}>
        <pixiBitmapText
          text={periodText}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 7, fill: 0xffffff }}
          tint={0x224466}
          layout={{}}
        />
        <pixiBitmapText
          text={volText}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 7, fill: 0xffffff }}
          tint={0x224466}
          layout={{}}
        />
      </pixiContainer>

      {/* Instrument name */}
      <pixiBitmapText
        text={instrName}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 7, fill: 0xffffff }}
        tint={0x334455}
        layout={{}}
      />
    </pixiContainer>
  );
};

// ── Main panel ──────────────────────────────────────────────────────────────

const PANEL_W = STRIP_W * 4 + 3 * 2 + 16; // 4 strips + 3 gaps + padding

interface PixiUADEDebuggerPanelProps {
  instruments: InstrumentConfig[];
}

export const PixiUADEDebuggerPanel: FC<PixiUADEDebuggerPanelProps> = ({ instruments }) => {
  const [channels, setChannels] = useState<UADEChannelData[] | null>(null);
  const instrumentsRef = useRef(instruments);
  useEffect(() => { instrumentsRef.current = instruments; }, [instruments]);

  useEffect(() => {
    if (!UADEEngine.hasInstance()) return;
    let engine: UADEEngine;
    try {
      engine = UADEEngine.getInstance();
    } catch {
      return;
    }
    const unsub = engine.onChannelData((ch) => {
      setChannels([...ch]);
    });
    return unsub;
  }, []);

  const LABEL_Y_PAD = 18;

  const drawPanelBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, PANEL_W, STRIP_H + LABEL_Y_PAD);
    g.fill({ color: 0x000e1a });
    g.rect(0, 0, PANEL_W, 1);
    g.fill({ color: 0x112233, alpha: 0.6 });
  }, []);

  if (!channels) {
    return (
      <pixiContainer
        layout={{
          width: PANEL_W,
          flexDirection: 'column',
          paddingTop: 6,
          paddingLeft: 8,
          paddingBottom: 6,
        }}
      >
        <pixiBitmapText
          text="Paula debugger — waiting for playback..."
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
          tint={0x112233}
          layout={{}}
        />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer
      layout={{
        width: PANEL_W,
        flexDirection: 'column',
        paddingTop: 6,
        paddingLeft: 8,
        paddingRight: 8,
        paddingBottom: 6,
        gap: 4,
      }}
    >
      <pixiGraphics draw={drawPanelBg} layout={{ position: 'absolute', width: PANEL_W, height: STRIP_H + LABEL_Y_PAD }} />

      {/* Header label */}
      <pixiBitmapText
        text="PAULA DEBUGGER"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
        tint={0x336688}
        layout={{ marginBottom: 2 }}
      />

      {/* 4 channel strips */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 2 }}>
        {channels.slice(0, 4).map((ch, idx) => (
          <PixiChannelStrip
            key={idx}
            index={idx}
            ch={ch}
            instruments={instrumentsRef.current}
          />
        ))}
      </pixiContainer>
    </pixiContainer>
  );
};
