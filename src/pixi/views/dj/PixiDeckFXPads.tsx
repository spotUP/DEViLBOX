/**
 * PixiDeckFXPads — Performance pads for one DJ deck (Pixi version).
 *
 * Two pages, toggled by header tabs:
 *   FX Pads (2×4): HPF sweep, LPF sweep, Filter reset, Echo out, Kill Lo/Mid/Hi, Brake
 *   Beat Jump (2×4): ◄◄16, ◄◄4, ◄◄1, ◄½ | ►½, ►►1, ►►4, ►►16
 */

import { useCallback, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import {
  filterSweep,
  filterReset,
  echoOut,
  quantizedEQKill,
  instantEQKill,
  getQuantizeMode,
  type EQBand,
} from '@/engine/dj/DJQuantizedFX';
import { beatJump } from '@/engine/dj/DJBeatJump';

// ─── Pad definitions ─────────────────────────────────────────────────────────

interface PadDef {
  id: string;
  label: string;
  sublabel?: string;
  color: number;
  activeColor: number;
  mode: 'momentary' | 'toggle' | 'instant';
}

const FX_PADS: PadDef[] = [
  { id: 'hpf-sweep', label: 'HPF', sublabel: '\u25B2', color: 0x8b5cf6, activeColor: 0x8b5cf6, mode: 'momentary' },
  { id: 'lpf-sweep', label: 'LPF', sublabel: '\u25BC', color: 0x3b82f6, activeColor: 0x3b82f6, mode: 'momentary' },
  { id: 'filter-reset', label: 'FLT', sublabel: 'RST', color: 0x6b7280, activeColor: 0x22c55e, mode: 'momentary' },
  { id: 'echo-out', label: 'ECHO', sublabel: 'OUT', color: 0xf59e0b, activeColor: 0xef4444, mode: 'toggle' },
  { id: 'kill-low', label: 'KILL', sublabel: 'LO', color: 0xf97316, activeColor: 0xef4444, mode: 'momentary' },
  { id: 'kill-mid', label: 'KILL', sublabel: 'MID', color: 0x6b7280, activeColor: 0xef4444, mode: 'momentary' },
  { id: 'kill-hi', label: 'KILL', sublabel: 'HI', color: 0x06b6d4, activeColor: 0xef4444, mode: 'momentary' },
  { id: 'brake', label: 'BRK', sublabel: '\u23CE', color: 0xf43f5e, activeColor: 0xf43f5e, mode: 'momentary' },
];

const JUMP_PADS: PadDef[] = [
  { id: 'jump-back-16', label: '\u25C4\u25C4', sublabel: '16', color: 0x6366f1, activeColor: 0x6366f1, mode: 'instant' },
  { id: 'jump-back-4', label: '\u25C4\u25C4', sublabel: '4', color: 0x3b82f6, activeColor: 0x3b82f6, mode: 'instant' },
  { id: 'jump-back-1', label: '\u25C4', sublabel: '1', color: 0x0ea5e9, activeColor: 0x0ea5e9, mode: 'instant' },
  { id: 'jump-back-half', label: '\u25C4', sublabel: '\u00BD', color: 0x14b8a6, activeColor: 0x14b8a6, mode: 'instant' },
  { id: 'jump-fwd-half', label: '\u25BA', sublabel: '\u00BD', color: 0x14b8a6, activeColor: 0x14b8a6, mode: 'instant' },
  { id: 'jump-fwd-1', label: '\u25BA', sublabel: '1', color: 0x0ea5e9, activeColor: 0x0ea5e9, mode: 'instant' },
  { id: 'jump-fwd-4', label: '\u25BA\u25BA', sublabel: '4', color: 0x3b82f6, activeColor: 0x3b82f6, mode: 'instant' },
  { id: 'jump-fwd-16', label: '\u25BA\u25BA', sublabel: '16', color: 0x6366f1, activeColor: 0x6366f1, mode: 'instant' },
];

const BAND_MAP: Record<string, EQBand> = {
  'kill-low': 'low',
  'kill-mid': 'mid',
  'kill-hi': 'high',
};

const BEAT_JUMPS: Record<string, number> = {
  'jump-back-16': -16, 'jump-back-4': -4, 'jump-back-1': -1, 'jump-back-half': -0.5,
  'jump-fwd-half': 0.5, 'jump-fwd-1': 1, 'jump-fwd-4': 4, 'jump-fwd-16': 16,
};

// ─── Constants ───────────────────────────────────────────────────────────────

const PAD_H = 40;
const PAD_GAP = 3;
const TAB_H = 18;

// ─── Component ───────────────────────────────────────────────────────────────

interface PixiDeckFXPadsProps {
  deckId: 'A' | 'B' | 'C';
}

export const PixiDeckFXPads: React.FC<PixiDeckFXPadsProps> = ({ deckId }) => {
  const [page, setPage] = useState<'fx' | 'jump'>('fx');
  const [activePads, setActivePads] = useState<Set<string>>(new Set());
  const cancelRefs = useRef<Map<string, () => void>>(new Map());
  const killLow = useDJStore(s => s.decks[deckId].eqLowKill);
  const killMid = useDJStore(s => s.decks[deckId].eqMidKill);
  const killHigh = useDJStore(s => s.decks[deckId].eqHighKill);

  const killState: Record<string, boolean> = {
    'kill-low': killLow,
    'kill-mid': killMid,
    'kill-hi': killHigh,
  };

  const cancelPad = useCallback((padId: string) => {
    const cancel = cancelRefs.current.get(padId);
    if (cancel) { cancel(); cancelRefs.current.delete(padId); }
    setActivePads(prev => { const n = new Set(prev); n.delete(padId); return n; });
  }, []);

  const activateFXPad = useCallback((padId: string) => {
    if (padId === 'echo-out' && cancelRefs.current.has(padId)) { cancelPad(padId); return; }
    cancelPad(padId);
    setActivePads(prev => new Set(prev).add(padId));

    let cancelFn: (() => void) | undefined;
    switch (padId) {
      case 'hpf-sweep':
        cancelFn = filterSweep(deckId, -0.85, 4, () => cancelPad(padId));
        break;
      case 'lpf-sweep':
        cancelFn = filterSweep(deckId, 0.85, 4, () => cancelPad(padId));
        break;
      case 'filter-reset':
        cancelFn = filterReset(deckId);
        setTimeout(() => cancelPad(padId), 150);
        break;
      case 'echo-out':
        cancelFn = echoOut(deckId, 8, () => cancelPad(padId));
        break;
      case 'kill-low':
      case 'kill-mid':
      case 'kill-hi': {
        const band = BAND_MAP[padId];
        useDJStore.getState().setDeckEQKill(deckId, band, true);
        if (getQuantizeMode() !== 'off') {
          cancelFn = quantizedEQKill(deckId, band, true);
        } else {
          instantEQKill(deckId, band, true);
        }
        break;
      }
      case 'brake': {
        try {
          const engine = getDJEngine();
          const deck = engine.getDeck(deckId);
          const state = useDJStore.getState().decks[deckId];
          const bpm = state.beatGrid?.bpm || state.detectedBPM || state.effectiveBPM || 120;
          const durationMs = (2 * 60 / bpm) * 1000;
          let rafId = 0;
          const startTime = performance.now();
          const animate = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            const rate = 1 - progress * progress;
            useDJStore.getState().setDeckPitch(deckId, 12 * Math.log2(Math.max(0.01, rate)));
            if (progress < 1) { rafId = requestAnimationFrame(animate); }
            else {
              deck.pause();
              useDJStore.getState().setDeckPlaying(deckId, false);
              useDJStore.getState().setDeckPitch(deckId, 0);
              cancelPad(padId);
            }
          };
          rafId = requestAnimationFrame(animate);
          cancelFn = () => { cancelAnimationFrame(rafId); useDJStore.getState().setDeckPitch(deckId, 0); };
        } catch { cancelPad(padId); }
        break;
      }
    }
    if (cancelFn) cancelRefs.current.set(padId, cancelFn);
  }, [deckId, cancelPad]);

  const handlePadDown = useCallback((pad: PadDef) => {
    if (pad.mode === 'instant') {
      const beats = BEAT_JUMPS[pad.id];
      if (beats !== undefined) beatJump(deckId, beats);
      setActivePads(prev => new Set(prev).add(pad.id));
      setTimeout(() => setActivePads(prev => { const n = new Set(prev); n.delete(pad.id); return n; }), 120);
    } else {
      activateFXPad(pad.id);
    }
  }, [deckId, activateFXPad]);

  const handlePadUp = useCallback((pad: PadDef) => {
    if (pad.mode === 'momentary') {
      if (pad.id === 'hpf-sweep' || pad.id === 'lpf-sweep') {
        cancelPad(pad.id);
        filterReset(deckId);
      } else if (pad.id === 'kill-low' || pad.id === 'kill-mid' || pad.id === 'kill-hi') {
        const band = BAND_MAP[pad.id];
        cancelPad(pad.id);
        useDJStore.getState().setDeckEQKill(deckId, band, false);
        if (getQuantizeMode() !== 'off') {
          quantizedEQKill(deckId, band, false);
        } else {
          instantEQKill(deckId, band, false);
        }
      }
    }
  }, [deckId, cancelPad]);

  const isActive = (padId: string) => {
    if (padId in killState) return killState[padId];
    return activePads.has(padId);
  };

  const pads = page === 'fx' ? FX_PADS : JUMP_PADS;

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 2, width: '100%' }}>
      {/* Page tabs */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 3 }}>
        <TabButton
          label="FX PADS"
          active={page === 'fx'}
          color={0x8b5cf6}
          onClick={() => setPage('fx')}
        />
        <TabButton
          label="BEAT JUMP"
          active={page === 'jump'}
          color={0x0ea5e9}
          onClick={() => setPage('jump')}
        />
      </pixiContainer>

      {/* Pad grid — 2 rows × 4 cols */}
      <pixiContainer layout={{ flexDirection: 'column', gap: PAD_GAP }}>
        <pixiContainer layout={{ flexDirection: 'row', gap: PAD_GAP }}>
          {pads.slice(0, 4).map(pad => (
            <FXPad
              key={pad.id}
              pad={pad}
              active={isActive(pad.id)}
              onDown={() => handlePadDown(pad)}
              onUp={() => handlePadUp(pad)}
            />
          ))}
        </pixiContainer>
        <pixiContainer layout={{ flexDirection: 'row', gap: PAD_GAP }}>
          {pads.slice(4, 8).map(pad => (
            <FXPad
              key={pad.id}
              pad={pad}
              active={isActive(pad.id)}
              onDown={() => handlePadDown(pad)}
              onUp={() => handlePadUp(pad)}
            />
          ))}
        </pixiContainer>
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Tab Button ──────────────────────────────────────────────────────────────

const TabButton: React.FC<{ label: string; active: boolean; color: number; onClick: () => void }> = ({
  label, active, color, onClick,
}) => {
  const theme = usePixiTheme();

  const draw = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, 60, TAB_H, 3);
    if (active) {
      g.fill({ color, alpha: 0.3 });
      g.roundRect(0, 0, 60, TAB_H, 3);
      g.stroke({ color, alpha: 0.5, width: 1 });
    } else {
      g.fill({ color: theme.bgTertiary.color });
      g.roundRect(0, 0, 60, TAB_H, 3);
      g.stroke({ color: theme.border.color, alpha: 0.4, width: 1 });
    }
  }, [active, color, theme]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerUp={onClick}
      layout={{ width: 60, height: TAB_H, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiGraphics draw={draw} layout={{ position: 'absolute', width: 60, height: TAB_H }} />
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
        tint={active ? color : theme.textMuted.color}
        eventMode="none"
        layout={{}}
      />
    </pixiContainer>
  );
};

// ─── FX Pad ──────────────────────────────────────────────────────────────────

interface FXPadProps {
  pad: PadDef;
  active: boolean;
  onDown: () => void;
  onUp: () => void;
}

const FXPad: React.FC<FXPadProps> = ({ pad, active, onDown, onUp }) => {
  const theme = usePixiTheme();
  const color = active ? pad.activeColor : pad.color;

  const draw = useCallback((g: GraphicsType) => {
    g.clear();
    const w = (g as any).layout?.computedLayout?.width ?? 80;
    g.roundRect(0, 0, w, PAD_H, 4);
    if (active) {
      g.fill({ color: pad.activeColor, alpha: 0.35 });
      g.roundRect(0, 0, w, PAD_H, 4);
      g.stroke({ color: pad.activeColor, alpha: 0.6, width: 1 });
    } else {
      g.fill({ color: theme.bgTertiary.color });
      g.roundRect(0, 0, w, PAD_H, 4);
      g.stroke({ color: theme.border.color, alpha: 0.4, width: 1 });
    }
  }, [active, pad.activeColor, theme]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerUpOutside={onUp}
      layout={{
        flex: 1,
        height: PAD_H,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
      }}
    >
      <pixiGraphics draw={draw} layout={{ position: 'absolute', width: '100%', height: PAD_H }} />
      <pixiBitmapText
        text={pad.label}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
        tint={active ? color : theme.textMuted.color}
        eventMode="none"
        layout={{}}
      />
      {pad.sublabel && (
        <pixiBitmapText
          text={pad.sublabel}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={active ? color : theme.textMuted.color}
          alpha={0.7}
          eventMode="none"
          layout={{}}
        />
      )}
    </pixiContainer>
  );
};
