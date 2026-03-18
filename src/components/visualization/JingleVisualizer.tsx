/**
 * JingleVisualizer — Canvas 2D version of the jingle animation for DOM-mode toolbar.
 *
 * Mirrors the drawJingleMode() function from PixiVisualizer:
 *   Left 57%  — 24 colour-coded spectrum bars + thin waveform strip
 *   Right 43% — "DEVILBOX" typed letter-by-letter, then "READY", with boot messages
 *
 * Renders using the JingleEngine analyser, not ToneEngine.
 */

import React, { useRef, useEffect } from 'react';
import { getJingleEngine } from '@engine/jingle/JingleEngine';

interface JingleVisualizerProps {
  height?: number;
}

interface AnimState {
  startTime: number;
  lastBeatTime: number;
  beatFlash: number;
  beatCount: number;
  typedChars: number;
  glitchFrames: number;  // #3 — frames remaining for glitch effect
}

// ── 3×5 pixel font (same chars as PixiVisualizer JINGLE_PIXEL_CHARS) ──────────
const PIXEL_FONT: Record<string, number[][]> = {
  D: [[1,1,0],[1,0,1],[1,0,1],[1,0,1],[1,1,0]],
  E: [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,1,1]],
  V: [[1,0,1],[1,0,1],[1,0,1],[1,0,1],[0,1,0]],
  I: [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
  L: [[1,0,0],[1,0,0],[1,0,0],[1,0,0],[1,1,1]],
  B: [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,1,0]],
  O: [[0,1,0],[1,0,1],[1,0,1],[1,0,1],[0,1,0]],
  X: [[1,0,1],[1,0,1],[0,1,0],[1,0,1],[1,0,1]],
  R: [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
  A: [[0,1,0],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  Y: [[1,0,1],[1,0,1],[0,1,0],[0,1,0],[0,1,0]],
  ' ': [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
};

function drawPixelChar(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  px: number,
  color: string,
  alpha: number,
) {
  const bitmap = PIXEL_FONT[char];
  if (!bitmap) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let row = 0; row < bitmap.length; row++) {
    const cols = bitmap[row]!;
    for (let col = 0; col < cols.length; col++) {
      if (cols[col]) ctx.fillRect(x + col * px, y + row * px, px - 0, px - 0);
    }
  }
  ctx.globalAlpha = 1;
}

function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
  color: string,
  alpha: number,
) {
  const charW = 3 * px + px;
  for (let i = 0; i < text.length; i++) {
    drawPixelChar(ctx, text[i]!, x + i * charW, y, px, color, alpha);
  }
}

export const JingleVisualizer: React.FC<JingleVisualizerProps> = ({ height = 100 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | undefined>(undefined);
  const animRef   = useRef<AnimState>({
    startTime:   performance.now(),
    lastBeatTime: 0,
    beatFlash:   0,
    beatCount:   0,
    typedChars:  0,
    glitchFrames: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset animation state on mount
    animRef.current = {
      startTime:   performance.now(),
      lastBeatTime: 0,
      beatFlash:   0,
      beatCount:   0,
      typedChars:  0,
      glitchFrames: 0,
    };

    // Resize canvas to match physical pixels
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.parentElement?.clientWidth ?? 300;
      canvas.width  = w * dpr;
      canvas.height = height * dpr;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const ACCENT   = '#c8a84b'; // yellow accent
    const MUTED    = '#555566'; // muted text
    const BG       = '#0a0a0b';

    const LINE1 = 'DEVILBOX';
    const LINE2 = 'READY';
    const TOTAL_L1 = 8;
    const TOTAL_L2 = 5;
    const BAR_COUNT = 24;
    const BAR_PANEL_RATIO = 0.57;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      const analyser = getJingleEngine().getAnalyser();
      if (!analyser) return;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;

      // Frequency + time-domain data
      const freqBuf = new Uint8Array(analyser.frequencyBinCount);
      const waveBuf = new Uint8Array(analyser.fftSize);
      analyser.getByteFrequencyData(freqBuf);
      analyser.getByteTimeDomainData(waveBuf);

      // RMS for beat detection
      let rms = 0;
      for (let i = 0; i < waveBuf.length; i++) {
        const s = ((waveBuf[i]! - 128)) / 128;
        rms += s * s;
      }
      rms = Math.sqrt(rms / waveBuf.length);

      const now   = performance.now();
      const anim  = animRef.current;

      if (rms > 0.25 && now - anim.lastBeatTime > 180) {
        anim.lastBeatTime = now;
        anim.beatFlash = 1.0;
        anim.beatCount++;
        anim.glitchFrames = 4; // #3 — trigger glitch on beat
      }
      anim.beatFlash = Math.max(0, anim.beatFlash - 0.05);
      if (anim.glitchFrames > 0) anim.glitchFrames--;

      // Typed chars
      const elapsed     = now - anim.startTime;
      const typingStart = 400;
      const charMs      = 80;
      const line2Gap    = 300;
      if (elapsed > typingStart) {
        const rawChars = Math.floor((elapsed - typingStart) / charMs);
        if (rawChars <= TOTAL_L1) {
          anim.typedChars = rawChars;
        } else {
          const l2 = Math.floor((elapsed - typingStart - TOTAL_L1 * charMs - line2Gap) / charMs);
          anim.typedChars = TOTAL_L1 + Math.max(0, Math.min(TOTAL_L2, l2));
        }
      }

      // ── Background ─────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      // Beat flash
      if (anim.beatFlash > 0) {
        ctx.globalAlpha = anim.beatFlash * 0.1;
        ctx.fillStyle = ACCENT;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }

      // ── Left panel: spectrum bars ───────────────────────────────────────────
      const barPanelW = Math.floor(w * BAR_PANEL_RATIO);
      const padX = 3;
      const padY = 3;
      const barAreaH = h - padY - 8;
      const barW = (barPanelW - padX * 2) / BAR_COUNT;
      const step = Math.floor(freqBuf.length / BAR_COUNT);

      const glitching = anim.glitchFrames > 0;

      // #3 — RGB chromatic split pass (drawn behind bars with 'screen' blend)
      if (glitching) {
        const splitOffset = 3 + Math.floor(Math.random() * 4);
        ctx.globalCompositeOperation = 'screen';
        for (let pass = 0; pass < 3; pass++) {
          const xShift = pass === 0 ? -splitOffset : pass === 2 ? splitOffset : 0;
          ctx.globalAlpha = 0.35;
          for (let i = 0; i < BAR_COUNT; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) sum += freqBuf[i * step + j] ?? 0;
            const norm = (sum / step) / 255;
            const barH = norm * barAreaH;
            if (barH > 0.5) {
              const x = padX + i * barW + xShift;
              const y = padY + barAreaH - barH;
              ctx.fillStyle = pass === 0 ? '#ff2020' : pass === 1 ? '#20ff20' : '#2020ff';
              ctx.fillRect(x, y, Math.max(1, barW - 1), barH);
            }
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      // Normal bar draw (on top of RGB split)
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += freqBuf[i * step + j] ?? 0;
        const norm = (sum / step) / 255;
        const barH = norm * barAreaH;
        if (barH > 0.5) {
          // #3 — on glitch frames, randomly offset some bar groups by a few px
          const barGroupOffset = glitching && (i % 5 === 0) ? (Math.random() - 0.5) * 12 : 0;
          const x = padX + i * barW + barGroupOffset;
          const y = padY + barAreaH - barH;
          if      (i < 3)  ctx.fillStyle = '#ff3333';
          else if (i < 8)  ctx.fillStyle = '#ff8833';
          else if (i < 16) ctx.fillStyle = ACCENT;
          else             ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.6 + norm * 0.4;
          ctx.fillRect(x, y, Math.max(1, barW - 1), barH);
        }
      }
      ctx.globalAlpha = 1;

      // #3 — glitch scan lines: 2 bright horizontal slices displaced sideways
      if (glitching) {
        for (let s = 0; s < 2; s++) {
          const sliceY = padY + Math.random() * barAreaH;
          const sliceH = 1 + Math.random() * 3;
          const sliceX = (Math.random() - 0.5) * 16;
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = ACCENT;
          ctx.fillRect(sliceX, sliceY, barPanelW, sliceH);
        }
        ctx.globalAlpha = 1;
      }

      // Waveform strip at bottom of bar panel
      const waveY  = h - 6;
      const wSamples = barPanelW - padX * 2;
      const wStep  = waveBuf.length / wSamples;
      ctx.beginPath();
      ctx.moveTo(padX, waveY + (((waveBuf[0] ?? 128) - 128) / 128) * 3);
      for (let i = 1; i < wSamples; i++) {
        const val = (((waveBuf[Math.floor(i * wStep)] ?? 128) - 128) / 128) * 3;
        ctx.lineTo(padX + i, waveY + val);
      }
      ctx.strokeStyle = ACCENT;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // ── Right panel: typed text ─────────────────────────────────────────────
      const textX = barPanelW + 3;
      const px    = 2; // pixel size (2×2 per dot)
      const charW = 3 * px + px; // 8px per char

      // Band energies for per-letter brightness
      const bandEnergy = (lo: number, hi: number): number => {
        let s = 0;
        for (let i = lo; i <= hi; i++) s += freqBuf[i] ?? 0;
        return (s / (hi - lo + 1)) / 255;
      };
      const bandMap = [
        bandEnergy(0, 2),
        bandEnergy(3, 5),
        bandEnergy(6, 8),
        bandEnergy(9, 11),
        bandEnergy(12, 14),
        bandEnergy(15, 17),
        bandEnergy(18, 20),
        bandEnergy(21, 23),
      ];

      const line1Typed = Math.min(anim.typedChars, TOTAL_L1);
      const line2Typed = Math.max(0, anim.typedChars - TOTAL_L1);

      // Line 1: DEVILBOX
      for (let i = 0; i < line1Typed; i++) {
        const energy = bandMap[i] ?? 0;
        const lit    = energy > 0.3;
        const color  = lit ? '#e8d060' : MUTED;
        const alpha  = lit ? 0.9 + energy * 0.1 : 0.4;
        drawPixelChar(ctx, LINE1[i]!, textX + i * charW, 4, px, color, alpha);
      }
      // Cursor after DEVILBOX while still typing
      if (line1Typed < TOTAL_L1 && line1Typed > 0 && Math.floor(elapsed / 400) % 2 === 0) {
        ctx.fillStyle = ACCENT;
        ctx.fillRect(textX + line1Typed * charW, 4, 1, 5 * px);
      }

      // Line 2: READY
      const line2Y = 4 + 5 * px + 3;
      for (let i = 0; i < line2Typed; i++) {
        drawPixelChar(ctx, LINE2[i]!, textX + i * charW, line2Y, px, ACCENT, 0.85);
      }
      if (line2Typed > 0 && line2Typed < TOTAL_L2 && Math.floor(elapsed / 400) % 2 === 0) {
        ctx.fillStyle = ACCENT;
        ctx.fillRect(textX + line2Typed * charW, line2Y, 1, 5 * px);
      }

      // Boot messages
      const bootMsgs  = ['AUDIO OK', 'WASM OK', 'TRACK RDY'];
      const bootBeats = [2, 5, 9];
      const msgY0     = line2Y + 5 * px + 4;
      for (let m = 0; m < bootMsgs.length; m++) {
        if (anim.beatCount >= (bootBeats[m] ?? 99)) {
          drawPixelText(ctx, bootMsgs[m]!, textX, msgY0 + m * 9, 1, MUTED, 0.55);
        }
      }
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height }}
    />
  );
};
