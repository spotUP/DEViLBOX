/**
 * GTDAWView — DOM/React version of the modern DAW-like GT Ultra editor.
 *
 * Same layout as the Pixi version but rendered with React HTML/CSS/Tailwind.
 * Shares all stores/hooks/engine — zero data duplication.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ GTToolbar (shared)                           36px │
 * ├─────────────────────┬────────────┬───────────────┤
 * │ Arrangement         │ Piano Roll │ Instrument    │
 * │ (220px)             │ (flex)     │ Designer      │
 * │                     │            │ (280px)       │
 * ├─────────────────────┴────────────┴───────────────┤
 * │ Bottom Panel (tabs: Mixer / Tables / Presets)    │
 * └──────────────────────────────────────────────────┘
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { GTToolbar } from '../GTToolbar';
import { DAW_CSS, DAW_CH_CSS } from './dawColors';
import {
  encodeAD, encodeSR, attackLabel, decayLabel, sustainLabel,
  WAVEFORMS,
} from '@/lib/gtultra/GTVisualMapping';
import { EnvelopeVisualization } from '@components/instruments/shared';
import { getPresetCategories, getPresetsByCategory, type GTSIDPreset } from '@/constants/gtultraPresets';
import { Oscilloscope } from '@/components/visualization/Oscilloscope';

const TOOLBAR_H = 36;
const BOTTOM_H = 220;
const SIDEBAR_W = 480;
const ARRANGEMENT_H = 180;

// ─── Root Layout ───

export const GTDAWView: React.FC = () => {
  const engine = useGTUltraStore((s) => s.engine);
  const dawSidebarOpen = useGTUltraStore((s) => s.dawSidebarOpen);
  const ready = !!engine;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: DAW_CSS.bg, color: DAW_CSS.text, fontFamily: '"JetBrains Mono", monospace' }}>
      {/* Toolbar — shared with Pro mode */}
      <div style={{ height: TOOLBAR_H, flexShrink: 0 }}>
        <GTToolbar />
      </div>

      {!ready ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DAW_CSS.textMuted }}>
          GoatTracker Ultra DAW — initializing...
        </div>
      ) : (
        <>
          {/* Center: Arrangement + Piano Roll + Sidebar */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            {/* Left: Arrangement + Piano Roll stacked */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ height: ARRANGEMENT_H, flexShrink: 0, borderBottom: `1px solid ${DAW_CSS.panelBorder}` }}>
                <DAWArrangement />
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <DAWPianoRoll />
              </div>
            </div>

            {/* Right: Instrument Designer */}
            {dawSidebarOpen && (
              <div style={{ width: SIDEBAR_W, flexShrink: 0, borderLeft: `1px solid ${DAW_CSS.panelBorder}`, overflowY: 'auto' }}>
                <DAWInstrumentDesigner />
              </div>
            )}
          </div>

          {/* Bottom panel */}
          <div style={{ height: BOTTOM_H, flexShrink: 0, borderTop: `1px solid ${DAW_CSS.panelBorder}` }}>
            <DAWBottomPanel />
          </div>
        </>
      )}
    </div>
  );
};

// ─── Arrangement Timeline ───

const DAWArrangement: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orderData = useGTUltraStore((s) => s.orderData);
  const patternData = useGTUltraStore((s) => s.patternData);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const playing = useGTUltraStore((s) => s.playing);
  const dawSelectedChannel = useGTUltraStore((s) => s.dawSelectedChannel);
  const dawSelectedPattern = useGTUltraStore((s) => s.dawSelectedPattern);
  const engine = useGTUltraStore((s) => s.engine);

  const channelCount = sidCount * 3;

  // Long-press state for touch context menu on arrangement blocks
  const arrangeLPRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [arrangeMenu, setArrangeMenu] = useState<{ x: number; y: number; ch: number; orderIdx: number; patNum: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = rect?.width || 800;
    const h = rect?.height || ARRANGEMENT_H;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = DAW_CSS.bg;
    ctx.fillRect(0, 0, w, h);

    const headerW = 50;
    const trackH = Math.max(20, Math.floor(h / channelCount));

    for (let ch = 0; ch < channelCount; ch++) {
      const y = ch * trackH;
      const color = DAW_CH_CSS[ch % DAW_CH_CSS.length];

      // Channel header
      ctx.fillStyle = DAW_CSS.panelBg;
      ctx.fillRect(0, y, headerW, trackH);
      ctx.fillStyle = color;
      ctx.fillRect(0, y, 3, trackH);
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = DAW_CSS.textSec;
      ctx.fillText(`CH${ch + 1}`, 8, y + trackH / 2 + 3);

      // Track separator
      ctx.fillStyle = DAW_CSS.panelBorder;
      ctx.fillRect(headerW, y + trackH - 1, w - headerW, 1);

      // Pattern blocks
      const od = orderData[ch];
      if (!od) continue;
      let blockX = headerW;

      for (let oi = 0; oi < od.length; oi++) {
        const patNum = od[oi];
        if (patNum === 0xFF) break;
        if (patNum >= 0xD0) continue;

        const pd = patternData.get(patNum);
        const blockW = Math.max(8, (pd ? pd.length : 32) * 2);
        const isSelected = ch === dawSelectedChannel && patNum === dawSelectedPattern;

        if (blockX + blockW > headerW && blockX < w) {
          ctx.fillStyle = color;
          ctx.globalAlpha = isSelected ? 0.5 : 0.2;
          ctx.beginPath();
          ctx.roundRect(blockX + 1, y + 2, blockW - 2, trackH - 4, 4);
          ctx.fill();
          ctx.globalAlpha = 1;

          ctx.strokeStyle = color;
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.globalAlpha = isSelected ? 1 : 0.6;
          ctx.beginPath();
          ctx.roundRect(blockX + 1, y + 2, blockW - 2, trackH - 4, 4);
          ctx.stroke();
          ctx.globalAlpha = 1;

          ctx.fillStyle = isSelected ? DAW_CSS.text : color;
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.fillText(patNum.toString(16).toUpperCase().padStart(2, '0'), blockX + 4, y + trackH / 2 + 3);
        }

        blockX += blockW;
      }
    }

    // Playhead
    if (playing) {
      const od0 = orderData[0];
      if (od0) {
        let phX = headerW;
        for (let oi = 0; oi < playbackPos.songPos && oi < od0.length; oi++) {
          const pn = od0[oi];
          if (pn === 0xFF) break;
          if (pn >= 0xD0) continue;
          const pd = patternData.get(pn);
          phX += Math.max(8, (pd ? pd.length : 32) * 2);
        }
        phX += playbackPos.row * 2;
        ctx.fillStyle = DAW_CSS.accentWarm;
        ctx.fillRect(phX, 0, 2, h);
      }
    }
  }, [orderData, patternData, channelCount, playing, playbackPos, dawSelectedChannel, dawSelectedPattern]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const headerW = 50;
    if (x < headerW) return;

    const trackH = Math.max(20, Math.floor(rect.height / (sidCount * 3)));
    const ch = Math.min(sidCount * 3 - 1, Math.floor(y / trackH));

    const od = orderData[ch];
    if (!od) return;
    let blockX = headerW;

    for (let oi = 0; oi < od.length; oi++) {
      const patNum = od[oi];
      if (patNum === 0xFF) break;
      if (patNum >= 0xD0) continue;
      const pd = patternData.get(patNum);
      const blockW = Math.max(8, (pd ? pd.length : 32) * 2);

      if (x >= blockX && x < blockX + blockW) {
        useGTUltraStore.getState().setDawSelectedChannel(ch);
        useGTUltraStore.getState().setDawSelectedPattern(patNum);
        return;
      }
      blockX += blockW;
    }
  }, [orderData, patternData, sidCount]);

  /** Hit-test: find block at pixel position */
  const hitTestBlock = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const headerW = 50;
    if (x < headerW) return null;
    const trackH = Math.max(20, Math.floor(rect.height / channelCount));
    const ch = Math.min(channelCount - 1, Math.max(0, Math.floor(y / trackH)));
    const od = orderData[ch];
    if (!od) return null;
    let blockX = headerW;
    for (let oi = 0; oi < od.length; oi++) {
      const patNum = od[oi];
      if (patNum === 0xFF) break;
      if (patNum >= 0xD0) continue;
      const pd = patternData.get(patNum);
      const blockW = Math.max(8, (pd ? pd.length : 32) * 2);
      if (x >= blockX && x < blockX + blockW) {
        return { ch, orderIdx: oi, patNum };
      }
      blockX += blockW;
    }
    return null;
  }, [channelCount, orderData, patternData]);

  // Arrangement touch: long press shows context menu
  const handleArrangeTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const lx = touch.clientX - rect.left;
      const ly = touch.clientY - rect.top;
      arrangeLPRef.current = setTimeout(() => {
        const hit = hitTestBlock(lx, ly);
        if (hit) {
          setArrangeMenu({ x: lx, y: ly, ...hit });
        }
        arrangeLPRef.current = null;
      }, 500);
    }
  }, [hitTestBlock]);

  const handleArrangeTouchMove = useCallback(() => {
    if (arrangeLPRef.current) { clearTimeout(arrangeLPRef.current); arrangeLPRef.current = null; }
  }, []);

  const handleArrangeTouchEnd = useCallback(() => {
    if (arrangeLPRef.current) { clearTimeout(arrangeLPRef.current); arrangeLPRef.current = null; }
  }, []);

  // Context menu actions
  const handleArrangeDuplicate = useCallback(() => {
    if (!arrangeMenu || !engine) { setArrangeMenu(null); return; }
    const od = orderData[arrangeMenu.ch];
    if (!od) { setArrangeMenu(null); return; }
    let endIdx = 0;
    for (let i = 0; i < od.length; i++) { if (od[i] === 0xFF) { endIdx = i; break; } }
    if (endIdx >= 254) { setArrangeMenu(null); return; }
    for (let i = endIdx; i > arrangeMenu.orderIdx + 1; i--) {
      engine.setOrderEntry(arrangeMenu.ch, i, od[i - 1]);
    }
    engine.setOrderEntry(arrangeMenu.ch, arrangeMenu.orderIdx + 1, arrangeMenu.patNum);
    engine.setOrderEntry(arrangeMenu.ch, endIdx + 1, 0xFF);
    useGTUltraStore.getState().refreshAllOrders();
    setArrangeMenu(null);
  }, [arrangeMenu, engine, orderData]);

  const handleArrangeClear = useCallback(() => {
    if (!arrangeMenu || !engine) { setArrangeMenu(null); return; }
    engine.setOrderEntry(arrangeMenu.ch, arrangeMenu.orderIdx, 0x00);
    useGTUltraStore.getState().refreshAllOrders();
    setArrangeMenu(null);
  }, [arrangeMenu, engine]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onTouchStart={handleArrangeTouchStart}
        onTouchMove={handleArrangeTouchMove}
        onTouchEnd={handleArrangeTouchEnd}
        style={{ width: '100%', height: '100%', cursor: 'pointer', touchAction: 'pan-x' }}
      />
      {/* Arrangement context menu (long press on touch) */}
      {arrangeMenu && (
        <div
          style={{
            position: 'absolute', left: arrangeMenu.x, top: arrangeMenu.y,
            background: DAW_CSS.panelBg, border: `1px solid ${DAW_CSS.panelBorder}`,
            borderRadius: 4, padding: 2, zIndex: 100, minWidth: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          {[
            { label: 'Duplicate', action: handleArrangeDuplicate },
            { label: 'Clear', action: handleArrangeClear },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              style={{
                display: 'block', width: '100%', padding: '6px 12px', fontSize: 10,
                fontFamily: 'inherit', background: 'none', border: 'none', color: DAW_CSS.text,
                cursor: 'pointer', textAlign: 'left', borderRadius: 2,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = DAW_CSS.surfaceHover; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setArrangeMenu(null)}
            style={{
              display: 'block', width: '100%', padding: '4px 12px', fontSize: 10,
              fontFamily: 'inherit', background: 'none', border: 'none', color: DAW_CSS.textMuted,
              cursor: 'pointer', textAlign: 'left', borderRadius: 2, borderTop: `1px solid ${DAW_CSS.panelBorder}`,
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Piano Roll ───

const BLACK_KEYS = [1, 3, 6, 8, 10];
const MIN_NOTE = 24;
const MAX_NOTE = 84;
const VISIBLE_NOTES = MAX_NOTE - MIN_NOTE;
const PIANO_W = 40;

const DAWPianoRoll: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const patternData = useGTUltraStore((s) => s.patternData);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const playing = useGTUltraStore((s) => s.playing);
  const dawSelectedChannel = useGTUltraStore((s) => s.dawSelectedChannel);
  const dawSelectedPattern = useGTUltraStore((s) => s.dawSelectedPattern);
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const dawZoomX = useGTUltraStore((s) => s.dawZoomX);
  const engine = useGTUltraStore((s) => s.engine);

  const pd = patternData.get(dawSelectedPattern);
  const maxRows = pd ? pd.length : 32;
  const chColor = DAW_CH_CSS[dawSelectedChannel % DAW_CH_CSS.length];

  // Touch gesture state for pinch-zoom and long press
  const touchStartDistRef = useRef(0);
  const touchStartZoomRef = useRef(dawZoomX);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [longPressMenu, setLongPressMenu] = useState<{ x: number; y: number; row: number; note: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = rect?.width || 800;
    const h = rect?.height || 400;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const gridW = w - PIANO_W;
    const velH = 40;
    const gridH = h - velH;
    const noteH = Math.max(2, gridH / VISIBLE_NOTES);
    const cellW = dawZoomX;

    // Background
    ctx.fillStyle = DAW_CSS.bg;
    ctx.fillRect(0, 0, w, h);

    // Piano keys + grid
    for (let n = MIN_NOTE; n < MAX_NOTE; n++) {
      const y = (MAX_NOTE - 1 - n) * noteH;
      const semitone = n % 12;
      const isBlack = BLACK_KEYS.includes(semitone);

      ctx.fillStyle = isBlack ? '#0a0a0a' : '#141414';
      ctx.fillRect(0, y, PIANO_W, noteH);

      ctx.fillStyle = isBlack ? '#161620' : '#1a1a24';
      ctx.fillRect(PIANO_W, y, gridW, noteH);

      if (semitone === 0) {
        ctx.fillStyle = DAW_CSS.textMuted;
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.fillText(`C${Math.floor(n / 12)}`, 2, y + noteH - 1);
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(PIANO_W, y, gridW, 1);
      }
    }

    // Beat grid lines
    for (let row = 0; row < maxRows; row++) {
      const x = PIANO_W + row * cellW;
      const isBeat = row % 4 === 0;
      ctx.fillStyle = isBeat ? '#2a2a3a' : '#1e1e28';
      ctx.globalAlpha = isBeat ? 0.6 : 0.3;
      ctx.fillRect(x, 0, 1, gridH);
      ctx.globalAlpha = 1;
    }

    // Velocity lane separator
    ctx.fillStyle = DAW_CSS.panelBorder;
    ctx.fillRect(PIANO_W, gridH, gridW, 1);

    // Notes
    if (pd) {
      const bpc = 4;
      for (let row = 0; row < maxRows; row++) {
        const off = row * bpc;
        if (off >= pd.data.length) break;
        const noteVal = pd.data[off];
        if (noteVal === 0 || noteVal >= 0xBD) continue;
        if (noteVal < 1 || noteVal > 96) continue;

        const midiNote = noteVal - 1 + 24;
        if (midiNote < MIN_NOTE || midiNote >= MAX_NOTE) continue;

        let noteLen = 1;
        for (let r2 = row + 1; r2 < maxRows; r2++) {
          if (r2 * bpc >= pd.data.length) break;
          if (pd.data[r2 * bpc] !== 0) break;
          noteLen++;
        }

        const x = PIANO_W + row * cellW;
        const nw = noteLen * cellW - 1;
        const y = (MAX_NOTE - 1 - midiNote) * noteH;

        ctx.fillStyle = chColor;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.roundRect(x, y + 1, Math.max(4, nw), noteH - 2, 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = chColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y + 1, Math.max(4, nw), noteH - 2, 2);
        ctx.stroke();

        // Velocity bar
        const vel = pd.data[off + 1];
        const barH = vel > 0 ? (vel / 63) * (velH - 4) : velH * 0.5;
        ctx.fillStyle = chColor;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(x, gridH + velH - barH - 2, Math.max(2, cellW - 2), barH);
        ctx.globalAlpha = 1;
      }
    }

    // Playhead
    if (playing) {
      ctx.fillStyle = DAW_CSS.accentWarm;
      ctx.fillRect(PIANO_W + playbackPos.row * cellW, 0, 2, h);
    }
  }, [pd, maxRows, dawSelectedChannel, playing, playbackPos, dawZoomX, chColor]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!engine || !pd) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < PIANO_W) return;

    const gridH = rect.height - 40;
    if (y > gridH) return;

    const noteH = Math.max(2, gridH / VISIBLE_NOTES);
    const row = Math.max(0, Math.min(maxRows - 1, Math.floor((x - PIANO_W) / dawZoomX)));
    const note = Math.max(MIN_NOTE, Math.min(MAX_NOTE - 1, MAX_NOTE - 1 - Math.floor(y / noteH)));
    const gtNote = note - 24 + 1;

    const bpc = 4;
    const existingNote = row * bpc < pd.data.length ? pd.data[row * bpc] : 0;

    if (e.button === 2 || (existingNote > 0 && existingNote < 0xBD)) {
      // Delete
      engine.setPatternCell(dawSelectedPattern, row, 0, 0);
      engine.setPatternCell(dawSelectedPattern, row, 1, 0);
    } else if (existingNote === 0 || existingNote >= 0xBD) {
      // Place note
      if (gtNote >= 1 && gtNote <= 95) {
        engine.setPatternCell(dawSelectedPattern, row, 0, gtNote);
        engine.setPatternCell(dawSelectedPattern, row, 1, currentInstrument);
        engine.jamNoteOn(dawSelectedChannel, gtNote, currentInstrument);
        setTimeout(() => engine.jamNoteOff(dawSelectedChannel), 200);
      }
    }
    useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
  }, [engine, pd, maxRows, dawZoomX, dawSelectedPattern, dawSelectedChannel, currentInstrument]);

  // ── Touch: pinch-zoom, long-press context menu ──

  const getTouchDistance = (touches: React.TouchList | TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      touchStartDistRef.current = getTouchDistance(e.touches);
      touchStartZoomRef.current = useGTUltraStore.getState().dawZoomX;
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      return;
    }
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const tx = touch.clientX - rect.left;
      const ty = touch.clientY - rect.top;
      longPressTimerRef.current = setTimeout(() => {
        const gridH = rect.height - 40;
        if (tx < PIANO_W || ty > gridH) return;
        const noteH = Math.max(2, gridH / VISIBLE_NOTES);
        const row = Math.max(0, Math.min(maxRows - 1, Math.floor((tx - PIANO_W) / dawZoomX)));
        const midiNote = Math.max(MIN_NOTE, Math.min(MAX_NOTE - 1, MAX_NOTE - 1 - Math.floor(ty / noteH)));
        if (pd) {
          const bpc = 4;
          const off = row * bpc;
          if (off < pd.data.length && pd.data[off] > 0 && pd.data[off] < 0xBD) {
            setLongPressMenu({ x: touch.clientX, y: touch.clientY, row, note: midiNote });
          }
        }
        longPressTimerRef.current = null;
      }, 500);
    }
  }, [maxRows, dawZoomX, pd]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    if (e.touches.length === 2) {
      const dist = getTouchDistance(e.touches);
      if (touchStartDistRef.current > 0) {
        const scale = dist / touchStartDistRef.current;
        const newZoom = Math.max(4, Math.min(64, Math.round(touchStartZoomRef.current * scale)));
        useGTUltraStore.getState().setDawZoom(newZoom, useGTUltraStore.getState().dawZoomY);
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    touchStartDistRef.current = 0;
  }, []);

  const handleLongPressDelete = useCallback(() => {
    if (!longPressMenu || !engine) return;
    engine.setPatternCell(dawSelectedPattern, longPressMenu.row, 0, 0);
    engine.setPatternCell(dawSelectedPattern, longPressMenu.row, 1, 0);
    useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
    setLongPressMenu(null);
  }, [longPressMenu, engine, dawSelectedPattern]);

  const handleLongPressDuplicate = useCallback(() => {
    if (!longPressMenu || !engine || !pd) return;
    const bpc = 4;
    const off = longPressMenu.row * bpc;
    if (off >= pd.data.length) { setLongPressMenu(null); return; }
    const noteVal = pd.data[off];
    const instVal = pd.data[off + 1];
    for (let r = longPressMenu.row + 1; r < maxRows; r++) {
      if (r * bpc >= pd.data.length) break;
      if (pd.data[r * bpc] === 0) {
        engine.setPatternCell(dawSelectedPattern, r, 0, noteVal);
        engine.setPatternCell(dawSelectedPattern, r, 1, instVal);
        break;
      }
    }
    useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
    setLongPressMenu(null);
  }, [longPressMenu, engine, pd, maxRows, dawSelectedPattern]);

  const handleLongPressChangeInst = useCallback(() => {
    if (!longPressMenu || !engine) return;
    engine.setPatternCell(dawSelectedPattern, longPressMenu.row, 1, currentInstrument);
    useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
    setLongPressMenu(null);
  }, [longPressMenu, engine, dawSelectedPattern, currentInstrument]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => { e.preventDefault(); handleClick(e); }}
        style={{ width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}
      />
      {/* Long-press context menu (touch) */}
      {longPressMenu && (
        <div
          style={{
            position: 'fixed', left: longPressMenu.x, top: longPressMenu.y,
            background: DAW_CSS.panelBg, border: `1px solid ${DAW_CSS.panelBorder}`,
            borderRadius: 4, padding: 2, zIndex: 200, minWidth: 120,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {[
            { label: 'Delete Note', action: handleLongPressDelete },
            { label: 'Duplicate', action: handleLongPressDuplicate },
            { label: `Set Inst #${currentInstrument.toString(16).toUpperCase().padStart(2, '0')}`, action: handleLongPressChangeInst },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              style={{
                display: 'block', width: '100%', padding: '6px 12px', fontSize: 11,
                fontFamily: 'inherit', background: 'none', border: 'none', color: DAW_CSS.text,
                cursor: 'pointer', textAlign: 'left', borderRadius: 2,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = DAW_CSS.surfaceHover; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setLongPressMenu(null)}
            style={{
              display: 'block', width: '100%', padding: '4px 12px', fontSize: 10,
              fontFamily: 'inherit', background: 'none', border: 'none', color: DAW_CSS.textMuted,
              cursor: 'pointer', textAlign: 'left', borderRadius: 2, borderTop: `1px solid ${DAW_CSS.panelBorder}`,
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Waveform Mini Canvas (for instrument designer buttons) ───

/** Read pulse width fraction from pulse table. Returns 0-1. */
function getPulseWidthFrac(pulsePtr: number, tableData: Record<string, { left: Uint8Array; right: Uint8Array }>): number {
  const pt = tableData['pulse'];
  if (!pt || pulsePtr === 0 || pulsePtr > pt.left.length) return 0.5;
  const hi = pt.left[pulsePtr] || 0;
  const lo = pt.right[pulsePtr] || 0;
  const pw = ((hi & 0x0F) << 8) | lo;
  return Math.max(0.05, Math.min(0.95, pw / 4095));
}

const WaveformMiniCanvas: React.FC<{ bit: number; isOn: boolean; pulseWidthFrac: number }> = ({ bit, isOn, pulseWidthFrac }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const color = isOn ? DAW_CSS.success : DAW_CSS.textMuted;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = isOn ? 1 : 0.4;
    ctx.beginPath();

    const mid = h / 2;
    if (bit === 0x10) {
      // Triangle
      ctx.moveTo(0, mid);
      ctx.lineTo(w * 0.25, 2);
      ctx.lineTo(w * 0.75, h - 2);
      ctx.lineTo(w, mid);
    } else if (bit === 0x20) {
      // Sawtooth
      ctx.moveTo(0, mid);
      ctx.lineTo(w * 0.9, 2);
      ctx.lineTo(w * 0.9, h - 2);
      ctx.lineTo(w, mid);
    } else if (bit === 0x40) {
      // Pulse — duty cycle from actual pulse width
      const transX = w * pulseWidthFrac;
      ctx.moveTo(0, h - 2);
      ctx.lineTo(0, 2);
      ctx.lineTo(transX, 2);
      ctx.lineTo(transX, h - 2);
      ctx.lineTo(w, h - 2);
    } else if (bit === 0x80) {
      // Noise — pseudo-random steps
      ctx.moveTo(0, mid);
      for (let i = 1; i <= 10; i++) {
        const nx = (i / 10) * w;
        const ny = 2 + ((Math.sin(i * 7.3) * 0.5 + 0.5) * (h - 4));
        ctx.lineTo(nx, ny);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [bit, isOn, pulseWidthFrac]);

  return <canvas ref={canvasRef} width={36} height={20} style={{ width: 36, height: 20, flexShrink: 0 }} />;
};

// ─── Instrument Designer Sidebar ───

const DAWInstrumentDesigner: React.FC = () => {
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const engine = useGTUltraStore((s) => s.engine);
  const dawSelectedChannel = useGTUltraStore((s) => s.dawSelectedChannel);
  const tableData = useGTUltraStore((s) => s.tableData);

  const inst = instrumentData[currentInstrument] || instrumentData[0];
  const chColor = DAW_CH_CSS[dawSelectedChannel % DAW_CH_CSS.length];

  const attack = (inst.ad >> 4) & 0x0F;
  const decay = inst.ad & 0x0F;
  const sustain = (inst.sr >> 4) & 0x0F;
  const release = inst.sr & 0x0F;
  const waveform = inst.firstwave & 0xFE;

  const setADSR = useCallback((a: number, d: number, s: number, r: number) => {
    if (!engine) return;
    engine.setInstrumentAD(currentInstrument, encodeAD(a, d));
    engine.setInstrumentSR(currentInstrument, encodeSR(s, r));
    const data = [...useGTUltraStore.getState().instrumentData];
    data[currentInstrument] = { ...inst, ad: encodeAD(a, d), sr: encodeSR(s, r) };
    useGTUltraStore.setState({ instrumentData: data });
  }, [engine, currentInstrument, inst]);

  const toggleWave = useCallback((bit: number) => {
    if (!engine) return;
    const newWave = (waveform ^ bit) | (inst.firstwave & 0x01);
    engine.setInstrumentFirstwave(currentInstrument, newWave);
    const data = [...useGTUltraStore.getState().instrumentData];
    data[currentInstrument] = { ...inst, firstwave: newWave };
    useGTUltraStore.setState({ instrumentData: data });
  }, [engine, currentInstrument, inst, waveform]);

  const prevInst = () => useGTUltraStore.getState().setCurrentInstrument(currentInstrument - 1);
  const nextInst = () => useGTUltraStore.getState().setCurrentInstrument(currentInstrument + 1);

  const instHex = currentInstrument.toString(16).toUpperCase().padStart(2, '0');
  const sliderStyle = { width: '100%', accentColor: chColor, cursor: 'pointer' };

  return (
    <div style={{ padding: 8, background: DAW_CSS.panelBg, height: '100%', fontSize: 10, lineHeight: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button onClick={prevInst} style={{ color: DAW_CSS.textSec, cursor: 'pointer', background: 'none', border: 'none', fontSize: 14 }}>&lt;</button>
        <span style={{ color: chColor, fontWeight: 'bold' }}>#{instHex}</span>
        <span style={{ color: DAW_CSS.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.name || 'Untitled'}</span>
        <button onClick={nextInst} style={{ color: DAW_CSS.textSec, cursor: 'pointer', background: 'none', border: 'none', fontSize: 14 }}>&gt;</button>
      </div>

      {/* ADSR */}
      <div style={{ color: DAW_CSS.textMuted, marginBottom: 4 }}>ENVELOPE</div>
      <EnvelopeVisualization
        mode="sid"
        attack={attack}
        decay={decay}
        sustain={sustain}
        release={release}
        width="auto"
        height={60}
        color={chColor}
        backgroundColor={DAW_CSS.bg}
        border={`1px solid ${DAW_CSS.panelBorder}`}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', marginTop: 4 }}>
        <label style={{ color: DAW_CSS.textSec }}>A:{attack} {attackLabel(attack)}
          <input type="range" min={0} max={15} value={attack} onChange={(e) => setADSR(+e.target.value, decay, sustain, release)} style={sliderStyle} />
        </label>
        <label style={{ color: DAW_CSS.textSec }}>D:{decay} {decayLabel(decay)}
          <input type="range" min={0} max={15} value={decay} onChange={(e) => setADSR(attack, +e.target.value, sustain, release)} style={sliderStyle} />
        </label>
        <label style={{ color: DAW_CSS.textSec }}>S:{sustain} {sustainLabel(sustain)}
          <input type="range" min={0} max={15} value={sustain} onChange={(e) => setADSR(attack, decay, +e.target.value, release)} style={sliderStyle} />
        </label>
        <label style={{ color: DAW_CSS.textSec }}>R:{release} {decayLabel(release)}
          <input type="range" min={0} max={15} value={release} onChange={(e) => setADSR(attack, decay, sustain, +e.target.value)} style={sliderStyle} />
        </label>
      </div>

      {/* Waveforms with mini-canvas visualizations */}
      <div style={{ color: DAW_CSS.textMuted, marginTop: 10, marginBottom: 4 }}>WAVEFORM</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
        {WAVEFORMS.map((wf) => {
          const isOn = (waveform & wf.bit) !== 0;
          const pulseWidthFrac = wf.bit === 0x40 ? getPulseWidthFrac(inst.pulsePtr, tableData) : 0.5;
          return (
            <button
              key={wf.bit}
              onClick={() => toggleWave(wf.bit)}
              style={{
                padding: '6px 8px',
                borderRadius: 4,
                border: `1px solid ${isOn ? DAW_CSS.success : DAW_CSS.panelBorder}`,
                background: isOn ? `${DAW_CSS.success}20` : DAW_CSS.surface,
                color: isOn ? DAW_CSS.success : DAW_CSS.textMuted,
                cursor: 'pointer',
                fontSize: 10,
                fontFamily: 'inherit',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <WaveformMiniCanvas bit={wf.bit} isOn={isOn} pulseWidthFrac={pulseWidthFrac} />
              <span>{wf.shortName}</span>
            </button>
          );
        })}
      </div>

      {/* Ring/Sync */}
      <div style={{ display: 'flex', gap: 12, marginTop: 6, color: DAW_CSS.textSec }}>
        <span>Ring: {(waveform & 0x04) ? <span style={{ color: DAW_CSS.success }}>ON</span> : 'off'}</span>
        <span>Sync: {(waveform & 0x02) ? <span style={{ color: DAW_CSS.success }}>ON</span> : 'off'}</span>
      </div>

      {/* Table pointers + Gate/Vibrato — single 4-column row */}
      <div style={{ color: DAW_CSS.textMuted, marginTop: 10, marginBottom: 4 }}>TABLES &amp; SETTINGS</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '2px 8px', color: DAW_CSS.textSec }}>
        <span>Wave: <span style={{ color: inst.wavePtr ? '#60e060' : DAW_CSS.textMuted }}>{inst.wavePtr.toString(16).toUpperCase().padStart(2, '0')}</span></span>
        <span>Pulse: <span style={{ color: inst.pulsePtr ? '#ff8866' : DAW_CSS.textMuted }}>{inst.pulsePtr.toString(16).toUpperCase().padStart(2, '0')}</span></span>
        <span>Gate: <span style={{ color: inst.gatetimer ? '#60e060' : DAW_CSS.textMuted }}>{inst.gatetimer.toString(16).toUpperCase().padStart(2, '0')}</span></span>
        <span>Vib: <span style={{ color: inst.vibdelay ? '#60e060' : DAW_CSS.textMuted }}>{inst.vibdelay.toString(16).toUpperCase().padStart(2, '0')}</span></span>
        <span>Filter: <span style={{ color: inst.filterPtr ? '#ffcc00' : DAW_CSS.textMuted }}>{inst.filterPtr.toString(16).toUpperCase().padStart(2, '0')}</span></span>
        <span>Speed: <span style={{ color: inst.speedPtr ? '#6699ff' : DAW_CSS.textMuted }}>{inst.speedPtr.toString(16).toUpperCase().padStart(2, '0')}</span></span>
        <span>1stWv: <span style={{ color: '#60e060' }}>{inst.firstwave.toString(16).toUpperCase().padStart(2, '0')}</span></span>
      </div>
    </div>
  );
};

// ─── Bottom Panel ───

type BottomTab = 'mixer' | 'tables' | 'monitor' | 'presets' | 'clips' | 'steps' | 'scope';
const BOTTOM_TABS: { id: BottomTab; label: string }[] = [
  { id: 'mixer', label: 'Mixer' },
  { id: 'steps', label: 'Steps' },
  { id: 'presets', label: 'Presets' },
  { id: 'tables', label: 'Tables' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'clips', label: 'Clips' },
  { id: 'scope', label: 'Scope' },
];

const DAWBottomPanel: React.FC = () => {
  const dawBottomPanel = useGTUltraStore((s) => s.dawBottomPanel);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: DAW_CSS.panelBg }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '4px 8px', borderBottom: `1px solid ${DAW_CSS.panelBorder}` }}>
        {BOTTOM_TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => useGTUltraStore.getState().setDawBottomPanel(id)}
            style={{
              padding: '3px 10px',
              fontSize: 10,
              fontFamily: 'inherit',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              background: dawBottomPanel === id ? `${DAW_CSS.accent}30` : 'transparent',
              color: dawBottomPanel === id ? DAW_CSS.accent : DAW_CSS.textMuted,
              fontWeight: dawBottomPanel === id ? 'bold' : 'normal',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {dawBottomPanel === 'mixer' && <DAWMixer />}
        {dawBottomPanel === 'steps' && <DAWStepSequencer />}
        {dawBottomPanel === 'presets' && <DAWPresetBrowser />}
        {dawBottomPanel === 'tables' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: DAW_CSS.textMuted }}>
            <span style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.5 }}>Table Editor</span>
          </div>
        )}
        {dawBottomPanel === 'monitor' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: DAW_CSS.textMuted }}>
            <span style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.5 }}>SID Monitor</span>
          </div>
        )}
        {dawBottomPanel === 'clips' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: DAW_CSS.textMuted }}>
            <span style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.5 }}>Clip Grid</span>
          </div>
        )}
        {dawBottomPanel === 'scope' && <Oscilloscope width="auto" height={180} />}
      </div>
    </div>
  );
};

// ─── Mixer ───

const DAWMixer: React.FC = () => {
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const channelCount = sidCount * 3;

  return (
    <div style={{ display: 'flex', gap: 4, padding: 8, height: '100%' }}>
      {Array.from({ length: channelCount }, (_, ch) => {
        const color = DAW_CH_CSS[ch % DAW_CH_CSS.length];
        return (
          <div key={ch} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', background: DAW_CSS.surface, borderRadius: 4, border: `1px solid ${DAW_CSS.panelBorder}` }}>
            <div style={{ width: '80%', height: 3, borderRadius: 2, background: color }} />
            <span style={{ fontSize: 10, color: DAW_CSS.text }}>CH {ch + 1}</span>
            <div style={{ flex: 1, width: 10, background: DAW_CSS.bg, borderRadius: 2, position: 'relative' }}>
              <div style={{ position: 'absolute', bottom: 0, width: '100%', height: '40%', background: color, borderRadius: 2, opacity: 0.6 }} />
            </div>
            <span style={{ fontSize: 9, color: DAW_CSS.textMuted }}>M S</span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Preset Browser ───

const DAWPresetBrowser: React.FC = () => {
  const [selectedCat, setSelectedCat] = useState(0);
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const engine = useGTUltraStore((s) => s.engine);

  const categories = getPresetCategories();
  const presets = categories[selectedCat] ? getPresetsByCategory(categories[selectedCat]) : [];

  const applyPreset = useCallback((preset: GTSIDPreset) => {
    if (!engine) return;
    engine.setInstrumentAD(currentInstrument, preset.ad);
    engine.setInstrumentSR(currentInstrument, preset.sr);
    engine.setInstrumentFirstwave(currentInstrument, preset.waveform);
    const data = [...useGTUltraStore.getState().instrumentData];
    data[currentInstrument] = { ...data[currentInstrument], ad: preset.ad, sr: preset.sr, firstwave: preset.waveform, name: preset.name };
    useGTUltraStore.setState({ instrumentData: data });
  }, [engine, currentInstrument]);

  return (
    <div style={{ padding: 8 }}>
      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {categories.map((cat, i) => (
          <button
            key={cat}
            onClick={() => setSelectedCat(i)}
            style={{
              padding: '3px 8px', fontSize: 9, fontFamily: 'inherit', borderRadius: 3, border: 'none', cursor: 'pointer',
              background: i === selectedCat ? `${DAW_CSS.accent}30` : DAW_CSS.surface,
              color: i === selectedCat ? DAW_CSS.accent : DAW_CSS.textMuted,
            }}
          >
            {cat.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
        {presets.map((preset, i) => (
          <button
            key={i}
            onClick={() => applyPreset(preset)}
            style={{
              padding: '8px 10px', textAlign: 'left', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${DAW_CSS.panelBorder}`, background: DAW_CSS.surface,
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.borderColor = DAW_CSS.accent; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.borderColor = DAW_CSS.panelBorder; }}
          >
            <div style={{ fontSize: 10, color: DAW_CSS.text, fontWeight: 'bold', marginBottom: 2 }}>{preset.name}</div>
            <div style={{ fontSize: 8, color: DAW_CSS.textMuted, marginBottom: 4 }}>{preset.description}</div>
            <div style={{ display: 'flex', gap: 4, fontSize: 8 }}>
              {WAVEFORMS.map(wf => (
                <span key={wf.bit} style={{ color: (preset.waveform & wf.bit) ? DAW_CSS.success : DAW_CSS.textMuted }}>{wf.shortName}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Step Sequencer (simple drum pattern grid) ───

const STEP_COUNT = 16;

const DAWStepSequencer: React.FC = () => {
  const patternData = useGTUltraStore((s) => s.patternData);
  const dawSelectedPattern = useGTUltraStore((s) => s.dawSelectedPattern);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const engine = useGTUltraStore((s) => s.engine);

  const pd = patternData.get(dawSelectedPattern);
  const channelCount = sidCount * 3;

  // Build step grid from pattern data: for each channel, check if row has a note
  const getStepActive = useCallback((_ch: number, step: number): boolean => {
    if (!pd) return false;
    // In GoatTracker, pattern data is per-pattern not per-channel — we use the same pattern for all
    // The step sequencer shows rows 0..15 of the selected pattern
    const bpc = 4; // bytes per cell
    const off = step * bpc;
    if (off >= pd.data.length) return false;
    // A note exists if noteVal > 0 and < 0xBD
    const noteVal = pd.data[off];
    return noteVal > 0 && noteVal < 0xBD;
  }, [pd]);

  const toggleStep = useCallback((_ch: number, step: number) => {
    if (!engine || !pd) return;
    const bpc = 4;
    const off = step * bpc;
    if (off >= pd.data.length) return;
    const noteVal = pd.data[off];
    const hasNote = noteVal > 0 && noteVal < 0xBD;

    if (hasNote) {
      // Clear
      engine.setPatternCell(dawSelectedPattern, step, 0, 0);
      engine.setPatternCell(dawSelectedPattern, step, 1, 0);
    } else {
      // Place note C-3 (middle C area) = GT note 25 using current instrument
      const defaultNote = 25; // C-3 in GT note numbering
      engine.setPatternCell(dawSelectedPattern, step, 0, defaultNote);
      engine.setPatternCell(dawSelectedPattern, step, 1, currentInstrument);
    }
    useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
  }, [engine, pd, dawSelectedPattern, currentInstrument]);

  return (
    <div style={{ padding: 8, overflowX: 'auto', height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${STEP_COUNT}, 1fr)`, gap: 2, fontSize: 9, fontFamily: '"JetBrains Mono", monospace' }}>
        {/* Header row with step numbers */}
        <div style={{ color: DAW_CSS.textMuted }} />
        {Array.from({ length: STEP_COUNT }, (_, s) => (
          <div key={s} style={{
            textAlign: 'center', color: s % 4 === 0 ? DAW_CSS.textSec : DAW_CSS.textMuted,
            fontWeight: s % 4 === 0 ? 'bold' : 'normal', padding: '2px 0',
          }}>
            {(s + 1).toString().padStart(2, '0')}
          </div>
        ))}

        {/* Channel rows */}
        {Array.from({ length: channelCount }, (_, ch) => {
          const color = DAW_CH_CSS[ch % DAW_CH_CSS.length];
          return (
            <React.Fragment key={ch}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: DAW_CSS.textSec }}>
                <div style={{ width: 3, height: 16, borderRadius: 1, background: color }} />
                CH{ch + 1}
              </div>
              {Array.from({ length: STEP_COUNT }, (_, step) => {
                const active = getStepActive(ch, step);
                const isBeat = step % 4 === 0;
                return (
                  <div
                    key={step}
                    onClick={() => toggleStep(ch, step)}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      maxHeight: 28,
                      borderRadius: 3,
                      cursor: 'pointer',
                      border: `1px solid ${active ? color : isBeat ? DAW_CSS.panelBorder : DAW_CSS.surface}`,
                      background: active ? `${color}` : isBeat ? DAW_CSS.surface : DAW_CSS.bg,
                      opacity: active ? 0.85 : 1,
                      transition: 'background 0.1s, border-color 0.1s',
                    }}
                  />
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
