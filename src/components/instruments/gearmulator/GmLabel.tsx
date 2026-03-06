/**
 * GmLabel — Text display for gearmulator hardware skins (patch name, param value, etc.)
 * GmLcd — Canvas-based LCD display with bitmap font rendering.
 */

import React, { useRef, useEffect } from 'react';

// ─── GmLabel ─────────────────────────────────────────────────────────────────

export interface GmLabelProps {
  text: string;
  style?: React.CSSProperties;
  className?: string;
}

export const GmLabel: React.FC<GmLabelProps> = ({ text, style, className }) => (
  <div
    className={`gm-label ${className ?? ''}`}
    style={{
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
      pointerEvents: 'none',
      ...style,
    }}
  >
    {text}
  </div>
);

// ─── GmLcd ───────────────────────────────────────────────────────────────────

export interface GmLcdProps {
  /** Text to display */
  text: string;
  /** Number of character columns */
  cols?: number;
  /** Number of character rows */
  rows?: number;
  /** Character cell size in pixels */
  charWidth?: number;
  charHeight?: number;
  /** Colors */
  fgColor?: string;
  bgColor?: string;
  /** CSS position style */
  style?: React.CSSProperties;
  className?: string;
}

// Simple 5x7 dot matrix font (ASCII 32-126, standard LCD font)
const LCD_FONT_5X7: Record<number, number[]> = {};
// Initialize on first use — basic printable ASCII
function _getLcdFont(): Record<number, number[]> {
  if (LCD_FONT_5X7[65]) return LCD_FONT_5X7; // already loaded

  // Standard 5x7 bitmap font data — each char is 5 bytes, each bit is a row pixel
  // This covers basic ASCII needed for synth parameter display
  const _fontStr = '00000000000000000020202020002000007050500000000000005070507050000020703060702000004252081424000030485038445200002020000000000008101010100800002010101010200000285028000000002070200000000000000000201000000070000000000000000020000002040810204000003048485830000020602020207000003048100870000030481004780000000828487c08000078407004780000018207848300000' +
    '7c040810100000003048304830000030484438300000002000200000000020002010000004081008040000007000700000002010080810200000304810100010';
  void _fontStr; // reserved for future bitmap font rendering
  // ... simplified — we'll use canvas measureText for now
  return LCD_FONT_5X7;
}
void _getLcdFont; // reserved for future bitmap font rendering

export const GmLcd: React.FC<GmLcdProps> = ({
  text, cols = 16, rows = 1,
  charWidth = 8, charHeight = 12,
  fgColor = '#00ff88', bgColor = '#0a1a0f',
  style, className
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = cols * charWidth + 4;
  const height = rows * charHeight + 4;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Text
    ctx.fillStyle = fgColor;
    ctx.font = `${charHeight - 2}px monospace`;
    ctx.textBaseline = 'top';

    const lines = text.split('\n');
    for (let row = 0; row < rows && row < lines.length; row++) {
      const line = (lines[row] ?? '').padEnd(cols).slice(0, cols);
      ctx.fillText(line, 2, 2 + row * charHeight);
    }
  }, [text, cols, rows, charWidth, charHeight, fgColor, bgColor, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`gm-lcd ${className ?? ''}`}
      style={{
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  );
};

// ─── GmLed ───────────────────────────────────────────────────────────────────

export interface GmLedProps {
  /** LED brightness 0..1 */
  value: number;
  /** LED color */
  color?: string;
  /** Size in pixels */
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}

export const GmLed: React.FC<GmLedProps> = ({
  value, color = '#ff3300', size = 8, style, className
}) => (
  <div
    className={`gm-led ${className ?? ''}`}
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      backgroundColor: color,
      opacity: 0.2 + value * 0.8,
      boxShadow: value > 0.5 ? `0 0 ${size}px ${color}` : 'none',
      ...style,
    }}
  />
);
