import { getMaschineHIDBridge } from '@/midi/MaschineHIDBridge';
import { FONT5X7 } from '@/midi/performance/MK2Display';

/**
 * MK3Display — 480×272 RGB565 color framebuffer for Maschine MK3 screens.
 */
export class MK3Display {
  static readonly W = 480;
  static readonly H = 272;
  static readonly BYTES = MK3Display.W * MK3Display.H * 2;
  static readonly CHAR_W = 6;
  static readonly CHAR_H = 10;

  static rgb(r: number, g: number, b: number): number {
    return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
  }

  static readonly BLACK = MK3Display.rgb(0, 0, 0);
  static readonly WHITE = MK3Display.rgb(255, 255, 255);
  static readonly RED = MK3Display.rgb(255, 0, 0);
  static readonly GREEN = MK3Display.rgb(0, 255, 0);
  static readonly BLUE = MK3Display.rgb(0, 64, 255);
  static readonly CYAN = MK3Display.rgb(0, 200, 200);
  static readonly YELLOW = MK3Display.rgb(255, 220, 0);
  static readonly ORANGE = MK3Display.rgb(255, 140, 0);
  static readonly PURPLE = MK3Display.rgb(180, 0, 255);
  static readonly GRAY = MK3Display.rgb(80, 80, 80);
  static readonly LGRAY = MK3Display.rgb(160, 160, 160);
  static readonly NI_ORANGE = MK3Display.rgb(255, 100, 0);
  static readonly NI_ACCENT = MK3Display.rgb(180, 120, 255);

  private fb: Uint16Array;

  constructor() {
    this.fb = new Uint16Array(MK3Display.W * MK3Display.H);
  }

  clear(color = MK3Display.BLACK): this {
    this.fb.fill(color);
    return this;
  }

  pixel(x: number, y: number, color: number): this {
    if (x >= 0 && x < MK3Display.W && y >= 0 && y < MK3Display.H) {
      this.fb[y * MK3Display.W + x] = color;
    }
    return this;
  }

  fillRect(x: number, y: number, w: number, h: number, color: number): this {
    const x1 = Math.max(0, x);
    const y1 = Math.max(0, y);
    const x2 = Math.min(MK3Display.W, x + w);
    const y2 = Math.min(MK3Display.H, y + h);
    if (x1 >= x2 || y1 >= y2) return this;
    for (let cy = y1; cy < y2; cy++) {
      this.fb.fill(color, cy * MK3Display.W + x1, cy * MK3Display.W + x2);
    }
    return this;
  }

  rect(x: number, y: number, w: number, h: number, color: number): this {
    this.hline(x, y, w, color);
    this.hline(x, y + h - 1, w, color);
    this.vline(x, y, h, color);
    this.vline(x + w - 1, y, h, color);
    return this;
  }

  hline(x: number, y: number, w: number, color: number): this {
    return this.fillRect(x, y, w, 1, color);
  }

  vline(x: number, y: number, h: number, color: number): this {
    return this.fillRect(x, y, 1, h, color);
  }

  line(x0: number, y0: number, x1: number, y1: number, color: number): this {
    let dx = Math.abs(x1 - x0);
    let sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0);
    let sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      this.pixel(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = err * 2;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }

  gradientFillRect(x: number, y: number, w: number, h: number, topColor: number, bottomColor: number): this {
    if (h <= 0) return this;
    const tr = ((topColor >> 11) & 0x1f) * 255 / 31;
    const tg = ((topColor >> 5) & 0x3f) * 255 / 63;
    const tb = (topColor & 0x1f) * 255 / 31;
    const br = ((bottomColor >> 11) & 0x1f) * 255 / 31;
    const bg = ((bottomColor >> 5) & 0x3f) * 255 / 63;
    const bb = (bottomColor & 0x1f) * 255 / 31;
    for (let row = 0; row < h; row++) {
      const t = h === 1 ? 0 : row / (h - 1);
      const color = MK3Display.rgb(
        Math.round(tr + (br - tr) * t),
        Math.round(tg + (bg - tg) * t),
        Math.round(tb + (bb - tb) * t),
      );
      this.hline(x, y + row, w, color);
    }
    return this;
  }

  char(x: number, y: number, ch: string, color: number, scale = 1): number {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 127) return x + MK3Display.CHAR_W * scale;
    const base = (code - 32) * 5;
    for (let col = 0; col < 5; col++) {
      const colData = FONT5X7[base + col];
      for (let row = 0; row < 7; row++) {
        if (((colData >> row) & 1) === 0) continue;
        this.fillRect(x + col * scale, y + row * scale, scale, scale, color);
      }
    }
    return x + (5 * scale) + scale;
  }

  text(x: number, y: number, str: string, color: number, scale = 1): this {
    let cx = x;
    for (const ch of str) {
      if (cx + MK3Display.CHAR_W * scale > MK3Display.W) break;
      cx = this.char(cx, y, ch, color, scale);
    }
    return this;
  }

  title(x: number, y: number, str: string, color = MK3Display.WHITE): this {
    return this.text(x, y, str, color, 2);
  }

  bar(x: number, y: number, w: number, h: number, value: number, color: number, bgColor = MK3Display.BLACK): this {
    const clamped = Math.max(0, Math.min(1, value));
    this.fillRect(x, y, w, h, bgColor);
    const filled = Math.round(clamped * w);
    if (filled > 0) this.fillRect(x, y, filled, h, color);
    this.rect(x, y, w, h, MK3Display.LGRAY);
    return this;
  }

  waveform(x: number, y: number, w: number, h: number, samples: number[], color = MK3Display.GREEN): this {
    if (samples.length === 0 || w <= 0 || h <= 0) return this;
    const mid = y + Math.floor(h / 2);
    this.hline(x, mid, w, MK3Display.GRAY);
    const stride = samples.length / w;
    for (let px = 0; px < w; px++) {
      const start = Math.floor(px * stride);
      const end = Math.max(start + 1, Math.min(samples.length, Math.floor((px + 1) * stride)));
      let sMin = 1;
      let sMax = -1;
      for (let i = start; i < end; i++) {
        const s = samples[i] ?? 0;
        if (s < sMin) sMin = s;
        if (s > sMax) sMax = s;
      }
      const top = mid - Math.round(sMax * (h / 2 - 1));
      const bottom = mid - Math.round(sMin * (h / 2 - 1));
      this.vline(x + px, Math.max(y, top), Math.max(1, bottom - top + 1), color);
    }
    return this;
  }

  thumbnail(x: number, y: number, w: number, h: number, rgba: Uint8ClampedArray | Uint8Array, srcW: number, srcH: number): this {
    if (srcW <= 0 || srcH <= 0) return this;
    for (let dy = 0; dy < h; dy++) {
      const sy = Math.min(srcH - 1, Math.floor((dy / h) * srcH));
      for (let dx = 0; dx < w; dx++) {
        const sx = Math.min(srcW - 1, Math.floor((dx / w) * srcW));
        const off = (sy * srcW + sx) * 4;
        this.pixel(x + dx, y + dy, MK3Display.rgb(rgba[off] ?? 0, rgba[off + 1] ?? 0, rgba[off + 2] ?? 0));
      }
    }
    return this;
  }

  pack(): Uint8Array {
    const out = new Uint8Array(MK3Display.BYTES);
    for (let i = 0; i < this.fb.length; i++) {
      const value = this.fb[i];
      out[i * 2] = value >> 8;
      out[i * 2 + 1] = value & 0xff;
    }
    return out;
  }

  getBuffer(): Uint16Array {
    return new Uint16Array(this.fb);
  }

  flush(screen: 0 | 1): void {
    getMaschineHIDBridge().drawDisplayMK3(screen, this.pack());
  }
}
