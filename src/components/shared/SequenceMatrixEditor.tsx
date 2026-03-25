/**
 * SequenceMatrixEditor — Shared collapsible canvas-based matrix editor.
 *
 * Used by GT Ultra (orders), Hively (positions), and Klystrack (sequence).
 * Provides the shared chrome (collapse header, canvas setup, scroll, theming)
 * while delegating rendering and input to format-specific callbacks.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// ─── Shared constants matching the main tracker editor ──────────────────────

export const MATRIX_CHAR_W = 10;
export const MATRIX_ROW_H = 20;
export const MATRIX_HEADER_H = 24;
export const MATRIX_FONT = '14px "JetBrains Mono", "Fira Code", monospace';
export const MATRIX_HEIGHT = 200;
export const MATRIX_COLLAPSED_HEIGHT = 28;

/** Read a CSS variable from :root, with fallback */
export function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Standard theme colors for matrix editors, read from CSS variables */
export function readMatrixTheme() {
  return {
    bgEven:      cssVar('--color-tracker-row-even', '#1a1a2e'),
    bgOdd:       cssVar('--color-tracker-row-odd', '#1e1e34'),
    bgHighlight: cssVar('--color-tracker-row-highlight', '#222244'),
    bgCurrent:   cssVar('--color-tracker-row-current', '#2a2a50'),
    textMuted:   cssVar('--color-text-muted', '#555'),
    accent:      cssVar('--color-accent', '#ff6666'),
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MatrixRenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  theme: ReturnType<typeof readMatrixTheme>;
  visibleRows: number;
  scrollOffset: number;
}

export interface SequenceMatrixEditorProps {
  /** Section label shown in the collapse header (e.g., "ORDERS", "POSITIONS", "SEQUENCE") */
  label: string;
  width: number;
  height: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Total number of rows in the data */
  totalRows: number;
  /** Currently active row (for auto-scroll) */
  activeRow: number;
  /** Render the canvas content. Called on every redraw. */
  onRender: (rc: MatrixRenderContext) => void;
  /** Handle mouse click. Receives coordinates relative to the canvas data area (below header). */
  onClick?: (x: number, y: number, rc: MatrixRenderContext) => void;
  /** Handle double click */
  onDoubleClick?: () => void;
  /** Handle keyboard input. Return true if handled. */
  onKeyDown?: (e: React.KeyboardEvent, rc: MatrixRenderContext) => boolean;
  /** Handle scroll wheel. Return true if handled. */
  onWheel?: (delta: number) => void;
  /** Extra dependencies to trigger re-render (spread into the useEffect dep array) */
  renderDeps?: readonly unknown[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export const SequenceMatrixEditor: React.FC<SequenceMatrixEditorProps> = ({
  label, width, height, collapsed, onToggleCollapse,
  totalRows, activeRow,
  onRender, onClick, onDoubleClick, onKeyDown, onWheel,
  renderDeps = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  const canvasH = height - MATRIX_COLLAPSED_HEIGHT;
  const visibleRows = Math.floor((canvasH - MATRIX_HEADER_H) / MATRIX_ROW_H);

  // Auto-scroll to keep active row visible
  useEffect(() => {
    if (activeRow < scrollOffset) {
      setScrollOffset(activeRow);
    } else if (activeRow >= scrollOffset + visibleRows) {
      setScrollOffset(activeRow - visibleRows + 1);
    }
  }, [activeRow, scrollOffset, visibleRows]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = canvasH * dpr;
    ctx.scale(dpr, dpr);

    const theme = readMatrixTheme();
    const rc: MatrixRenderContext = { ctx, width, height: canvasH, theme, visibleRows, scrollOffset };

    // Clear
    ctx.fillStyle = theme.bgEven;
    ctx.fillRect(0, 0, width, canvasH);
    ctx.font = MATRIX_FONT;
    ctx.textBaseline = 'middle';

    onRender(rc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, canvasH, scrollOffset, visibleRows, onRender, ...renderDeps]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (onWheel) {
      onWheel(e.deltaY > 0 ? 3 : -3);
      return;
    }
    const delta = e.deltaY > 0 ? 3 : -3;
    setScrollOffset(s => Math.max(0, Math.min(totalRows - visibleRows, s + delta)));
  }, [totalRows, visibleRows, onWheel]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onClick) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y < MATRIX_HEADER_H) return;
    const theme = readMatrixTheme();
    const rc: MatrixRenderContext = { ctx: canvasRef.current!.getContext('2d')!, width, height: canvasH, theme, visibleRows, scrollOffset };
    onClick(x, y - MATRIX_HEADER_H, rc);
    canvasRef.current?.focus();
  }, [onClick, width, canvasH, visibleRows, scrollOffset]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!onKeyDown) return;
    const theme = readMatrixTheme();
    const rc: MatrixRenderContext = { ctx: canvasRef.current!.getContext('2d')!, width, height: canvasH, theme, visibleRows, scrollOffset };
    const handled = onKeyDown(e, rc);
    if (handled) e.preventDefault();
  }, [onKeyDown, width, canvasH, visibleRows, scrollOffset]);

  // ── Collapsed state ─────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <div
        style={{
          width,
          height: MATRIX_COLLAPSED_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 8px',
          background: 'var(--color-bg-secondary)',
          cursor: 'pointer',
          borderBottom: '1px solid var(--color-border)',
        }}
        onClick={onToggleCollapse}
      >
        <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
        <span style={{
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontSize: 12,
          fontWeight: 700,
          color: '#fff',
        }}>
          {label}
        </span>
      </div>
    );
  }

  // ── Expanded state ──────────────────────────────────────────────────────

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-tracker-row-even)',
      }}
    >
      {/* Collapse header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 8px',
          height: MATRIX_COLLAPSED_HEIGHT,
          flexShrink: 0,
          background: 'var(--color-bg-secondary)',
          cursor: 'pointer',
          borderBottom: '1px solid var(--color-border)',
        }}
        onClick={onToggleCollapse}
      >
        <ChevronDown size={14} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
        <span style={{
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontSize: 12,
          fontWeight: 700,
          color: '#fff',
        }}>
          {label}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width, height: canvasH, outline: 'none', cursor: 'pointer' }}
        tabIndex={0}
        onClick={handleClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
      />
    </div>
  );
};
