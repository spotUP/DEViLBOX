/**
 * MK2Display — 128×64 RGB565 software framebuffer for Maschine MK2 OLEDs.
 *
 * Two independent displays (screen 0 = left, screen 1 = right), each 128×64 px.
 * The MK2 OLEDs are monochrome — the display controller thresholds any colour to
 * white (on) or black (off), so you only need 0xFFFF / 0x0000 for most uses.
 *
 * Usage:
 *   const d = new MK2Display();
 *   d.clear().text(2, 2, 'TB303 1/4', MK2Display.WHITE).waveform(0, 10, 128, 54, samples);
 *   d.flush(getMaschineHIDBridge(), 1);
 */

import { getMaschineHIDBridge } from '@/midi/MaschineHIDBridge';

// ── Standard 5×7 bitmap font, ASCII 32–127 (5 bytes per char, column-major) ──
// Each byte is one column of pixels, bit 0 = top row, bit 6 = bottom row.
// Source: classic Adafruit GFX font5x7 / PCD8544 font
/* eslint-disable prettier/prettier */
const FONT5X7 = new Uint8Array([
  0x00,0x00,0x00,0x00,0x00, // 0x20 space
  0x00,0x00,0x5F,0x00,0x00, // 0x21 !
  0x00,0x07,0x00,0x07,0x00, // 0x22 "
  0x14,0x7F,0x14,0x7F,0x14, // 0x23 #
  0x24,0x2A,0x7F,0x2A,0x12, // 0x24 $
  0x23,0x13,0x08,0x64,0x62, // 0x25 %
  0x36,0x49,0x55,0x22,0x50, // 0x26 &
  0x00,0x05,0x03,0x00,0x00, // 0x27 '
  0x00,0x1C,0x22,0x41,0x00, // 0x28 (
  0x00,0x41,0x22,0x1C,0x00, // 0x29 )
  0x14,0x08,0x3E,0x08,0x14, // 0x2A *
  0x08,0x08,0x3E,0x08,0x08, // 0x2B +
  0x00,0x50,0x30,0x00,0x00, // 0x2C ,
  0x08,0x08,0x08,0x08,0x08, // 0x2D -
  0x00,0x60,0x60,0x00,0x00, // 0x2E .
  0x20,0x10,0x08,0x04,0x02, // 0x2F /
  0x3E,0x51,0x49,0x45,0x3E, // 0x30 0
  0x00,0x42,0x7F,0x40,0x00, // 0x31 1
  0x42,0x61,0x51,0x49,0x46, // 0x32 2
  0x21,0x41,0x45,0x4B,0x31, // 0x33 3
  0x18,0x14,0x12,0x7F,0x10, // 0x34 4
  0x27,0x45,0x45,0x45,0x39, // 0x35 5
  0x3C,0x4A,0x49,0x49,0x30, // 0x36 6
  0x01,0x71,0x09,0x05,0x03, // 0x37 7
  0x36,0x49,0x49,0x49,0x36, // 0x38 8
  0x06,0x49,0x49,0x29,0x1E, // 0x39 9
  0x00,0x36,0x36,0x00,0x00, // 0x3A :
  0x00,0x56,0x36,0x00,0x00, // 0x3B ;
  0x08,0x14,0x22,0x41,0x00, // 0x3C <
  0x14,0x14,0x14,0x14,0x14, // 0x3D =
  0x00,0x41,0x22,0x14,0x08, // 0x3E >
  0x02,0x01,0x51,0x09,0x06, // 0x3F ?
  0x32,0x49,0x79,0x41,0x3E, // 0x40 @
  0x7E,0x11,0x11,0x11,0x7E, // 0x41 A
  0x7F,0x49,0x49,0x49,0x36, // 0x42 B
  0x3E,0x41,0x41,0x41,0x22, // 0x43 C
  0x7F,0x41,0x41,0x22,0x1C, // 0x44 D
  0x7F,0x49,0x49,0x49,0x41, // 0x45 E
  0x7F,0x09,0x09,0x09,0x01, // 0x46 F
  0x3E,0x41,0x49,0x49,0x7A, // 0x47 G
  0x7F,0x08,0x08,0x08,0x7F, // 0x48 H
  0x00,0x41,0x7F,0x41,0x00, // 0x49 I
  0x20,0x40,0x41,0x3F,0x01, // 0x4A J
  0x7F,0x08,0x14,0x22,0x41, // 0x4B K
  0x7F,0x40,0x40,0x40,0x40, // 0x4C L
  0x7F,0x02,0x04,0x02,0x7F, // 0x4D M
  0x7F,0x04,0x08,0x10,0x7F, // 0x4E N
  0x3E,0x41,0x41,0x41,0x3E, // 0x4F O
  0x7F,0x09,0x09,0x09,0x06, // 0x50 P
  0x3E,0x41,0x51,0x21,0x5E, // 0x51 Q
  0x7F,0x09,0x19,0x29,0x46, // 0x52 R
  0x46,0x49,0x49,0x49,0x31, // 0x53 S
  0x01,0x01,0x7F,0x01,0x01, // 0x54 T
  0x3F,0x40,0x40,0x40,0x3F, // 0x55 U
  0x1F,0x20,0x40,0x20,0x1F, // 0x56 V
  0x3F,0x40,0x38,0x40,0x3F, // 0x57 W
  0x63,0x14,0x08,0x14,0x63, // 0x58 X
  0x07,0x08,0x70,0x08,0x07, // 0x59 Y
  0x61,0x51,0x49,0x45,0x43, // 0x5A Z
  0x00,0x7F,0x41,0x41,0x00, // 0x5B [
  0x02,0x04,0x08,0x10,0x20, // 0x5C backslash
  0x00,0x41,0x41,0x7F,0x00, // 0x5D ]
  0x04,0x02,0x01,0x02,0x04, // 0x5E ^
  0x40,0x40,0x40,0x40,0x40, // 0x5F _
  0x00,0x01,0x02,0x04,0x00, // 0x60 `
  0x20,0x54,0x54,0x54,0x78, // 0x61 a
  0x7F,0x48,0x44,0x44,0x38, // 0x62 b
  0x38,0x44,0x44,0x44,0x20, // 0x63 c
  0x38,0x44,0x44,0x48,0x7F, // 0x64 d
  0x38,0x54,0x54,0x54,0x18, // 0x65 e
  0x08,0x7E,0x09,0x01,0x02, // 0x66 f
  0x0C,0x52,0x52,0x52,0x3E, // 0x67 g
  0x7F,0x08,0x04,0x04,0x78, // 0x68 h
  0x00,0x44,0x7D,0x40,0x00, // 0x69 i
  0x20,0x40,0x44,0x3D,0x00, // 0x6A j
  0x7F,0x10,0x28,0x44,0x00, // 0x6B k
  0x00,0x41,0x7F,0x40,0x00, // 0x6C l
  0x7C,0x04,0x18,0x04,0x78, // 0x6D m
  0x7C,0x08,0x04,0x04,0x78, // 0x6E n
  0x38,0x44,0x44,0x44,0x38, // 0x6F o
  0x7C,0x14,0x14,0x14,0x08, // 0x70 p
  0x08,0x14,0x14,0x18,0x7C, // 0x71 q
  0x7C,0x08,0x04,0x04,0x08, // 0x72 r
  0x48,0x54,0x54,0x54,0x20, // 0x73 s
  0x04,0x3F,0x44,0x40,0x20, // 0x74 t
  0x3C,0x40,0x40,0x20,0x7C, // 0x75 u
  0x1C,0x20,0x40,0x20,0x1C, // 0x76 v
  0x3C,0x40,0x30,0x40,0x3C, // 0x77 w
  0x44,0x28,0x10,0x28,0x44, // 0x78 x
  0x0C,0x50,0x50,0x50,0x3C, // 0x79 y
  0x44,0x64,0x54,0x4C,0x44, // 0x7A z
  0x00,0x08,0x36,0x41,0x00, // 0x7B {
  0x00,0x00,0x7F,0x00,0x00, // 0x7C |
  0x00,0x41,0x36,0x08,0x00, // 0x7D }
  0x10,0x08,0x08,0x10,0x08, // 0x7E ~
  0x00,0x00,0x00,0x00,0x00, // 0x7F DEL
]);
/* eslint-enable prettier/prettier */

// ── MK2Display ─────────────────────────────────────────────────────────────

export class MK2Display {
  static readonly W = 256;
  static readonly H = 64;

  /** 1bpp: pixel ON = 1 (white/lit), OFF = 0 (black).
   *  The display is monochrome — only brightness matters, not hue.
   *  Use ON (1) / OFF (0) for everything. The color constants are kept for
   *  API compatibility so callers don't need changes. */
  static readonly WHITE  = 1;  /* pixel on  = bright */
  static readonly BLACK  = 0;  /* pixel off = dark   */
  static readonly GRAY   = 1;
  static readonly CYAN   = 1;
  static readonly GREEN  = 1;
  static readonly ORANGE = 1;
  static readonly RED    = 1;

  /** 5×7 font: char width including gap = 6px, char height including gap = 8px */
  static readonly CHAR_W = 6;
  static readonly CHAR_H = 8;

  /** Internal framebuffer: 1 number per pixel (0 or 1) for easy drawing. */
  private fb = new Uint8Array(MK2Display.W * MK2Display.H);

  // ── Primitives ─────────────────────────────────────────────────────────

  clear(color = MK2Display.BLACK): this {
    this.fb.fill(color ? 1 : 0);
    return this;
  }

  pixel(x: number, y: number, color: number): this {
    if (x < 0 || x >= MK2Display.W || y < 0 || y >= MK2Display.H) return this;
    this.fb[y * MK2Display.W + x] = color ? 1 : 0;
    return this;
  }

  hline(x: number, y: number, w: number, color: number): this {
    const x1 = Math.max(0, x);
    const x2 = Math.min(MK2Display.W - 1, x + w - 1);
    if (y < 0 || y >= MK2Display.H || x1 > x2) return this;
    this.fb.fill(color ? 1 : 0, y * MK2Display.W + x1, y * MK2Display.W + x2 + 1);
    return this;
  }

  vline(x: number, y: number, h: number, color: number): this {
    if (x < 0 || x >= MK2Display.W) return this;
    const y1 = Math.max(0, y);
    const y2 = Math.min(MK2Display.H - 1, y + h - 1);
    for (let row = y1; row <= y2; row++) this.fb[row * MK2Display.W + x] = color;
    return this;
  }

  /** Bresenham line between two points. */
  line(x0: number, y0: number, x1: number, y1: number, color: number): this {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      this.pixel(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  fillRect(x: number, y: number, w: number, h: number, color: number): this {
    for (let row = 0; row < h; row++) this.hline(x, y + row, w, color);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, color: number): this {
    this.hline(x, y, w, color);
    this.hline(x, y + h - 1, w, color);
    this.vline(x, y, h, color);
    this.vline(x + w - 1, y, h, color);
    return this;
  }

  // ── Text ───────────────────────────────────────────────────────────────

  /** Draw a single character. Returns x position after the character. */
  char(x: number, y: number, ch: string, fg: number, bg?: number, scale = 1): number {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 127) return x + MK2Display.CHAR_W * scale;
    const base = (code - 32) * 5;
    const cw = 5 * scale;
    const ch_ = 7 * scale;
    for (let col = 0; col < 5; col++) {
      const colData = FONT5X7[base + col];
      for (let row = 0; row < 7; row++) {
        const on = (colData >> row) & 1;
        const color = on ? fg : (bg ?? MK2Display.BLACK);
        if (scale === 1) {
          this.pixel(x + col, y + row, color);
        } else {
          this.fillRect(x + col * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    // gap column
    if (bg !== undefined) this.fillRect(x + cw, y, scale, ch_, bg);
    return x + (cw + scale);
  }

  /** Draw a string. Clips at the right edge. Returns x after last char. */
  text(x: number, y: number, str: string, fg: number, bg?: number, scale = 1): this {
    let cx = x;
    for (const ch of str) {
      if (cx + MK2Display.CHAR_W * scale > MK2Display.W) break;
      cx = this.char(cx, y, ch, fg, bg, scale);
    }
    return this;
  }

  /** Draw text right-aligned within [x, x+w). */
  textRight(x: number, y: number, w: number, str: string, fg: number, bg?: number, scale = 1): this {
    const textW = str.length * MK2Display.CHAR_W * scale;
    const startX = x + w - textW;
    return this.text(startX, y, str, fg, bg, scale);
  }

  // ── Waveform ───────────────────────────────────────────────────────────

  /**
   * Draw a PCM waveform (min-max envelope style, suitable for sample editing).
   * samples: Float32Array, values nominally in [-1, 1].
   * Draws into the rectangle [x, y, w, h].
   */
  waveform(
    samples: Float32Array,
    x = 0, y = 0,
    w = MK2Display.W, h = MK2Display.H,
    color = MK2Display.WHITE,
    bgColor = MK2Display.BLACK,
  ): this {
    if (samples.length === 0 || w <= 0 || h <= 0) return this;

    // Clear background
    this.fillRect(x, y, w, h, bgColor);

    // Draw centre line
    const mid = y + Math.floor(h / 2);
    this.hline(x, mid, w, MK2Display.BLACK); /* centre line — keep dark, waveform draws over it */

    const stride = samples.length / w;
    for (let px = 0; px < w; px++) {
      const start = Math.floor(px * stride);
      const end   = Math.min(Math.floor((px + 1) * stride), samples.length);
      let sMin = 0, sMax = 0;
      for (let i = start; i < end; i++) {
        const s = samples[i];
        if (s < sMin) sMin = s;
        if (s > sMax) sMax = s;
      }
      const top = mid - Math.floor(sMax * (h / 2));
      const bot = mid - Math.floor(sMin * (h / 2));
      const yt  = Math.max(y, Math.min(y + h - 1, top));
      const yb  = Math.max(y, Math.min(y + h - 1, bot));
      this.vline(x + px, yt, yb - yt + 1, color);
    }
    return this;
  }

  /**
   * Draw a simple horizontal bar (useful for parameter values 0–1).
   * Fills [x, x + Math.round(value*w)) in fg, rest in bg.
   */
  bar(x: number, y: number, w: number, h: number, value: number,
      fg = MK2Display.WHITE, bg = MK2Display.BLACK): this {
    const filled = Math.round(Math.max(0, Math.min(1, value)) * w);
    this.fillRect(x, y, filled, h, fg);
    if (filled < w) this.fillRect(x + filled, y, w - filled, h, bg);
    return this;
  }

  // ── Output ─────────────────────────────────────────────────────────────

  /**
   * Pack the 1bpp framebuffer into 1024 bytes and send to one of the two MK2 OLED displays.
   * Each byte holds 8 pixels: bit 7 = leftmost pixel (x % 8 == 0), bit 0 = rightmost.
   */
  flush(screen: 0 | 1): void {
    getMaschineHIDBridge().drawDisplay(screen, this.pack());
  }

  /**
   * Pack the per-pixel framebuffer into row-major 1bpp bytes.
   * Layout: W/8 bytes per row × H rows = (256/8)*64 = 2048 bytes.
   * Within each byte, bit 7 = leftmost pixel (MSB first), matching the
   * row-major convention NIHIA uses for MK3 RGB565 — same row order, different depth.
   */
  pack(): Uint8Array {
    const bytesPerRow = MK2Display.W >> 3; // 32 bytes per row for 256px wide
    const out = new Uint8Array(bytesPerRow * MK2Display.H);
    for (let y = 0; y < MK2Display.H; y++) {
      for (let x = 0; x < MK2Display.W; x++) {
        if (this.fb[y * MK2Display.W + x]) {
          out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
    }
    return out;
  }

  /** Return a copy of the unpacked framebuffer (1 byte per pixel, 0 or 1). */
  getBuffer(): Uint8Array {
    return new Uint8Array(this.fb);
  }
}
