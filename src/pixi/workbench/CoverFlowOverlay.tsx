/**
 * CoverFlowOverlay — Full-screen CSS 3D carousel for workbench view selection.
 *
 * Shows all 6 views as tilted cards in a perspective row.
 * Navigate with ←→ arrow keys, mouse/touch drag (vinyl-scratch velocity),
 * or click any card. Press Enter or click the active card to open that view.
 *
 * Rendered into its own React DOM root (singleton pattern) so it can be
 * launched imperatively from inside the Pixi reconciler tree.
 *
 * Usage:
 *   openCoverFlow()   — mounts and shows the overlay
 *   closeCoverFlow()  — hides and unmounts
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { springCameraTo, fitWindow } from './WorkbenchExpose';
import { playCoverSelect } from './workbenchSounds';

// ─── View definitions ─────────────────────────────────────────────────────────

const FLOW_VIEWS = [
  { id: 'tracker',     label: 'Tracker',          sub: 'Pattern Sequencer', color: '#4a9eff', dark: '#1a4a8a' },
  { id: 'pianoroll',   label: 'Piano Roll',        sub: 'Note Editor',       color: '#9b59b6', dark: '#5c2a7a' },
  { id: 'arrangement', label: 'Arrangement',       sub: 'Timeline View',     color: '#27ae60', dark: '#165c32' },
  { id: 'dj',          label: 'DJ',                sub: 'Mixer & Decks',     color: '#e74c3c', dark: '#8a2018' },
  { id: 'vj',          label: 'VJ',                sub: 'Visual Output',     color: '#f39c12', dark: '#8a5008' },
  { id: 'instrument',  label: 'Instrument Editor', sub: 'Synth & Sampler',   color: '#1abc9c', dark: '#0e6658' },
] as const;

// ─── Card geometry ─────────────────────────────────────────────────────────────

const CARD_W   = 200;
const CARD_H   = 280;
const CARD_GAP = 260; // center-to-center spacing (non-active)

function cardTransform(offset: number): React.CSSProperties {
  const abs  = Math.abs(offset);
  if (abs > 3.6) return { display: 'none' };
  const sign    = offset < 0 ? -1 : 1;
  const transX  = sign * Math.min(abs, 3) * CARD_GAP;
  const rotY    = sign * Math.min(abs * 42, 56);
  const scale   = Math.max(0.38, 1 - abs * 0.20);
  const opacity = Math.max(0.06, 1 - abs * 0.33);
  return {
    position:    'absolute',
    left:        '50%',
    top:         '50%',
    width:       CARD_W,
    height:      CARD_H,
    marginLeft:  -CARD_W / 2,
    marginTop:   -CARD_H / 2,
    transform:   `translateX(${transX}px) rotateY(${rotY}deg) scale(${scale})`,
    opacity,
    zIndex:      Math.round(20 - abs * 4),
    transition:  'transform 0.40s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.40s ease',
    cursor:      'pointer',
    userSelect:  'none',
  };
}

// ─── Card component ────────────────────────────────────────────────────────────

interface CardProps {
  view: typeof FLOW_VIEWS[number];
  offset:   number;
  isActive: boolean;
  onClick:  () => void;
}

const FlowCard: React.FC<CardProps> = ({ view, offset, isActive, onClick }) => (
  <div style={cardTransform(offset)} onClick={onClick}>
    <div style={{
      width:        '100%',
      height:       '100%',
      borderRadius: 12,
      background:   `linear-gradient(155deg, ${view.color}1a 0%, #0c0c18 60%)`,
      border:       `1px solid ${isActive ? view.color + '88' : '#ffffff14'}`,
      boxShadow:    isActive
        ? `0 0 36px ${view.color}44, 0 0 72px ${view.color}1a`
        : '0 8px 28px rgba(0,0,0,0.55)',
      display:      'flex',
      flexDirection: 'column',
      overflow:     'hidden',
      transition:   'border-color 0.3s, box-shadow 0.3s',
    }}>
      {/* Coloured header band */}
      <div style={{
        height:     84,
        background: `linear-gradient(135deg, ${view.color}, ${view.dark})`,
        display:    'flex',
        alignItems: 'flex-end',
        padding:    '10px 14px',
      }}>
        <span style={{
          color:          '#ffffffcc',
          fontSize:       10,
          fontFamily:     'monospace',
          letterSpacing:  '0.12em',
          textTransform:  'uppercase',
        }}>
          {view.sub}
        </span>
      </div>

      {/* Body */}
      <div style={{
        flex:          1,
        padding:       '18px 14px',
        display:       'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}>
        <div style={{
          color:         '#ffffff',
          fontSize:      17,
          fontWeight:    700,
          fontFamily:    'monospace',
          letterSpacing: '-0.02em',
          marginBottom:  6,
        }}>
          {view.label}
        </div>
        {isActive && (
          <div style={{
            color:         view.color,
            fontSize:      10,
            fontFamily:    'monospace',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            Enter to open ↵
          </div>
        )}
      </div>
    </div>

    {/* Mirror reflection */}
    <div style={{
      position:              'absolute',
      top:                   CARD_H + 3,
      left:                  0,
      width:                 '100%',
      height:                CARD_H * 0.32,
      background:            `linear-gradient(${view.color}14, transparent)`,
      borderRadius:          '0 0 12px 12px',
      transform:             'scaleY(-1)',
      opacity:               0.28,
      maskImage:             'linear-gradient(to bottom, black, transparent)',
      WebkitMaskImage:       'linear-gradient(to bottom, black, transparent)',
      pointerEvents:         'none',
    }} />
  </div>
);

// ─── Overlay component ────────────────────────────────────────────────────────

interface OverlayProps {
  onClose: () => void;
}

const CoverFlowOverlayInner: React.FC<OverlayProps> = ({ onClose }) => {
  const showWindow = useWorkbenchStore((s) => s.showWindow);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dragOffset,  setDragOffset]  = useState(0);
  const dragging = useRef<{ startX: number; lastX: number; lastVX: number } | null>(null);

  const handleSelect = useCallback((id: string) => {
    playCoverSelect();
    showWindow(id);
    // Spring camera to the newly-opened window
    const win = useWorkbenchStore.getState().windows[id];
    if (win) springCameraTo(fitWindow(win, window.innerWidth, window.innerHeight));
    onClose();
  }, [showWindow, onClose]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setSelectedIdx((i) => Math.max(0, i - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setSelectedIdx((i) => Math.min(FLOW_VIEWS.length - 1, i + 1)); }
      if (e.key === 'Enter')      { handleSelect(FLOW_VIEWS[selectedIdx].id); }
      if (e.key === 'Escape')     { onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIdx, handleSelect, onClose]);

  // Pointer drag — vinyl-scratch velocity
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = { startX: e.clientX, lastX: e.clientX, lastVX: 0 };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current.lastVX = e.clientX - dragging.current.lastX;
    dragging.current.lastX  = e.clientX;
    setDragOffset((e.clientX - dragging.current.startX) / -CARD_GAP);
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    const { startX, lastX, lastVX } = dragging.current;
    dragging.current = null;

    // Total drag offset + velocity boost
    const dragCards = (startX - lastX)     / CARD_GAP;
    const velBoost  = (-lastVX / CARD_GAP) * 1.6;
    const delta     = Math.round(dragCards + velBoost);

    setDragOffset(0);
    if (delta !== 0) {
      setSelectedIdx((i) => Math.max(0, Math.min(FLOW_VIEWS.length - 1, i + delta)));
    }
  }, []);

  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         10000,
        background:     'rgba(6, 6, 20, 0.88)',
        backdropFilter: 'blur(14px)',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      {/* Header label */}
      <div style={{
        color:          '#ffffff55',
        fontFamily:     'monospace',
        fontSize:       11,
        letterSpacing:  '0.28em',
        textTransform:  'uppercase',
        marginBottom:   48,
        userSelect:     'none',
      }}>
        Open View
      </div>

      {/* 3D carousel stage */}
      <div
        style={{
          position:          'relative',
          width:             '100%',
          height:            CARD_H + 120,
          perspective:       900,
          perspectiveOrigin: '50% 42%',
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {FLOW_VIEWS.map((view, i) => (
          <FlowCard
            key={view.id}
            view={view}
            offset={(i - selectedIdx) + dragOffset}
            isActive={i === selectedIdx && dragOffset === 0}
            onClick={() => {
              if (i === selectedIdx) {
                handleSelect(view.id);
              } else {
                setSelectedIdx(i);
                setDragOffset(0);
              }
            }}
          />
        ))}
      </div>

      {/* Footer hint */}
      <div style={{
        marginTop:     48,
        color:         '#ffffff2a',
        fontFamily:    'monospace',
        fontSize:      10,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        userSelect:    'none',
      }}>
        ← → navigate &nbsp;·&nbsp; drag to scratch &nbsp;·&nbsp; enter / click to open &nbsp;·&nbsp; esc close
      </div>
    </div>
  );
};

// ─── Singleton DOM launcher ───────────────────────────────────────────────────
// Lets the overlay be opened from inside the Pixi reconciler tree.

let _div:  HTMLDivElement | null = null;
let _root: Root | null           = null;

function ensureRoot(): { div: HTMLDivElement; root: Root } {
  if (!_div) {
    _div = document.createElement('div');
    document.body.appendChild(_div);
    _root = createRoot(_div);
  }
  return { div: _div, root: _root! };
}

export function openCoverFlow(): void {
  const { root } = ensureRoot();
  root.render(
    React.createElement(CoverFlowOverlayInner, { onClose: closeCoverFlow }),
  );
}

export function closeCoverFlow(): void {
  _root?.render(null);
}
