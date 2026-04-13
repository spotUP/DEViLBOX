/**
 * PixiInstrumentVisualizer — All-in-one audio visualizer for the Pixi synth editor.
 * Supports 4 modes matching DOM: oscilloscope, spectrum, spectrogram, lissajous.
 * Renders into a Pixi Graphics object using the InstrumentAnalyser data.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Graphics as GraphicsType, Texture } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { PixiLabel } from '../../components';
import { getToneEngine } from '@engine/ToneEngine';
import { useVisualizationAnimation } from '@hooks/useVisualizationAnimation';

type VizMode = 'oscilloscope' | 'spectrum' | 'spectrogram' | 'lissajous';

const VIZ_MODES: VizMode[] = ['oscilloscope', 'spectrum', 'spectrogram', 'lissajous'];
const VIZ_LABELS: Record<VizMode, string> = {
  oscilloscope: 'SCOPE',
  spectrum: 'FFT',
  spectrogram: 'GRAM',
  lissajous: 'X/Y',
};

interface PixiInstrumentVisualizerProps {
  instrumentId: number;
  width?: number;
  height?: number;
}

// ─── Spectrogram colormap ────────────────────────────────────────────────────

const CMAP_SIZE = 256;
const cmap = new Uint8Array(CMAP_SIZE * 3);
(function buildCmap() {
  const stops: [number, number, number, number][] = [
    [0, 0, 0, 0],
    [0.15, 0, 20, 80],
    [0.3, 0, 100, 140],
    [0.45, 0, 180, 120],
    [0.6, 80, 220, 0],
    [0.75, 220, 220, 0],
    [0.88, 255, 80, 0],
    [1.0, 255, 255, 255],
  ];
  for (let i = 0; i < CMAP_SIZE; i++) {
    const t = i / (CMAP_SIZE - 1);
    let lo = 0;
    for (let s = 1; s < stops.length; s++) { if (t <= stops[s][0]) { lo = s - 1; break; } }
    const hi = lo + 1;
    const range = stops[hi][0] - stops[lo][0];
    const frac = range > 0 ? (t - stops[lo][0]) / range : 0;
    cmap[i * 3] = Math.round(stops[lo][1] + frac * (stops[hi][1] - stops[lo][1]));
    cmap[i * 3 + 1] = Math.round(stops[lo][2] + frac * (stops[hi][2] - stops[lo][2]));
    cmap[i * 3 + 2] = Math.round(stops[lo][3] + frac * (stops[hi][3] - stops[lo][3]));
  }
})();

// ─── Log frequency mapping cache ─────────────────────────────────────────────

const logBinCache = new Map<string, number[]>();
function getLogFreqMapping(fftBins: number, rows: number): number[] {
  const key = `${fftBins}-${rows}`;
  let m = logBinCache.get(key);
  if (!m) {
    m = new Array(rows);
    const logMin = Math.log10(1);
    const logMax = Math.log10(fftBins - 1);
    for (let y = 0; y < rows; y++) {
      const frac = y / (rows - 1);
      m[rows - 1 - y] = Math.min(Math.floor(Math.pow(10, logMin + frac * (logMax - logMin))), fftBins - 1);
    }
    logBinCache.set(key, m);
  }
  return m;
}

function getLogBinMapping(fftSize: number, barCount: number): number[] {
  const key = `bars-${fftSize}-${barCount}`;
  let m = logBinCache.get(key);
  if (!m) {
    m = new Array(barCount);
    const maxBin = fftSize / 2;
    const logMin = Math.log10(1);
    const logMax = Math.log10(maxBin);
    for (let i = 0; i < barCount; i++) {
      m[i] = Math.min(Math.floor(Math.pow(10, logMin + (logMax - logMin) * i / (barCount - 1))), maxBin - 1);
    }
    logBinCache.set(key, m);
  }
  return m;
}

// ─── Canvas-backed Pixi visualizer ───────────────────────────────────────────

/**
 * Uses an offscreen canvas → Pixi Texture approach for efficient pixel-level rendering.
 */
export const PixiInstrumentVisualizer: React.FC<PixiInstrumentVisualizerProps> = ({
  instrumentId,
  width = 300,
  height = 60,
}) => {
  const theme = usePixiTheme();
  const [mode, setMode] = useState<VizMode>('oscilloscope');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const spriteRef = useRef<{ texture: Texture } | null>(null);

  // Spectrogram scroll buffer
  const spectrogramDataRef = useRef<ImageData | null>(null);

  // Initialize offscreen canvas
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      canvasRef.current = canvas;
      ctxRef.current = ctx;
      spectrogramDataRef.current = ctx.getImageData(0, 0, width, height);
    }

    return () => {
      if (textureRef.current) {
        textureRef.current.destroy(true);
        textureRef.current = null;
      }
    };
  }, [width, height]);

  // Reset spectrogram on mode switch
  useEffect(() => {
    if (mode === 'spectrogram' && ctxRef.current) {
      ctxRef.current.fillStyle = '#000000';
      ctxRef.current.fillRect(0, 0, width, height);
      spectrogramDataRef.current = ctxRef.current.getImageData(0, 0, width, height);
    }
  }, [mode, width, height]);

  const onFrame = useCallback((): boolean => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return false;

    const engine = getToneEngine();
    const analyser = engine.getInstrumentAnalyser(instrumentId);
    const hasAudio = analyser?.hasActivity() ?? false;

    switch (mode) {
      case 'oscilloscope':
        renderOscilloscope(ctx, width, height, analyser, hasAudio);
        break;
      case 'spectrum':
        renderSpectrum(ctx, width, height, analyser, hasAudio);
        break;
      case 'spectrogram':
        renderSpectrogram(ctx, width, height, analyser, hasAudio, spectrogramDataRef);
        break;
      case 'lissajous':
        renderLissajous(ctx, width, height, analyser, hasAudio);
        break;
    }

    // Update Pixi texture from canvas
    if (textureRef.current) {
      textureRef.current.source.update();
    } else if (spriteRef.current) {
      // Lazy create texture on first frame when sprite is mounted
      const { Texture } = require('pixi.js');
      const tex = Texture.from(canvas);
      textureRef.current = tex;
      spriteRef.current.texture = tex;
    }

    return hasAudio;
  }, [instrumentId, mode, width, height]);

  useVisualizationAnimation({ onFrame, enabled: true, fps: 30 });

  return (
    <pixiContainer layout={{ width: '100%', flexDirection: 'column', gap: 4 }}>
      {/* Mode selector row */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <PixiLabel text="VIZ" size="xs" weight="bold" color="textMuted" />
        {VIZ_MODES.map(m => (
          <pixiContainer
            key={m}
            eventMode="static"
            cursor="pointer"
            onPointerUp={() => setMode(m)}
            layout={{ height: 18, paddingLeft: 6, paddingRight: 6, justifyContent: 'center', alignItems: 'center' }}
          >
            <pixiGraphics
              draw={(g: GraphicsType) => {
                g.clear();
                g.roundRect(0, 0, 40, 16, 3);
                if (mode === m) {
                  g.fill({ color: theme.accent.color, alpha: 0.2 });
                  g.roundRect(0, 0, 40, 16, 3);
                  g.stroke({ color: theme.accent.color, alpha: 0.5, width: 1 });
                } else {
                  g.fill({ color: theme.bgTertiary.color });
                }
              }}
              layout={{ position: 'absolute', width: 40, height: 16 }}
            />
            <pixiBitmapText
              text={VIZ_LABELS[m]}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
              tint={mode === m ? theme.accent.color : theme.textMuted.color}
              layout={{}}
            />
          </pixiContainer>
        ))}
      </pixiContainer>

      {/* Visualizer canvas sprite */}
      <pixiContainer layout={{ width, height, overflow: 'hidden' }}>
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            g.roundRect(0, 0, width, height, 4);
            g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
          }}
          layout={{ position: 'absolute', width, height }}
        />
        <pixiSprite
          ref={(ref: { texture: Texture } | null) => {
            if (ref && canvasRef.current && !textureRef.current) {
              const { Texture } = require('pixi.js');
              const tex = Texture.from(canvasRef.current);
              textureRef.current = tex;
              ref.texture = tex;
            }
            spriteRef.current = ref;
          }}
          layout={{ width, height }}
        />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Render functions ────────────────────────────────────────────────────────

// Canvas2D visualizer colors — intentional decorative palette (not theme tokens)
const VIS_BG = '#0a0a0a';
const VIS_GRID = 'rgba(255,255,255,0.06)';
const VIS_WAVE = '#34d399';       // emerald-400
const VIS_SPECTRUM_LO = '#f97316'; // orange-500
const VIS_SPECTRUM_HI = '#34d399'; // emerald-400

function renderOscilloscope(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  analyser: ReturnType<ReturnType<typeof getToneEngine>['getInstrumentAnalyser']>,
  hasAudio: boolean,
) {
  ctx.fillStyle = VIS_BG;
  ctx.fillRect(0, 0, w, h);

  // Center line
  ctx.strokeStyle = VIS_GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  if (!analyser || !hasAudio) return;

  const waveform = analyser.getWaveform();
  ctx.strokeStyle = VIS_WAVE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const sliceW = w / waveform.length;
  for (let i = 0; i < waveform.length; i++) {
    const y = ((waveform[i] + 1) / 2) * h;
    if (i === 0) ctx.moveTo(i * sliceW, y); else ctx.lineTo(i * sliceW, y);
  }
  ctx.stroke();

  // Glow
  ctx.shadowColor = VIS_WAVE;
  ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function renderSpectrum(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  analyser: ReturnType<ReturnType<typeof getToneEngine>['getInstrumentAnalyser']>,
  hasAudio: boolean,
) {
  ctx.fillStyle = VIS_BG;
  ctx.fillRect(0, 0, w, h);

  if (!analyser || !hasAudio) return;

  const fft = analyser.getFFT();
  const barCount = 48;
  const binMapping = getLogBinMapping(fft.length * 2, barCount);
  const gap = 2;
  const barW = (w - (barCount - 1) * gap) / barCount;

  // Gradient
  const grad = ctx.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, VIS_SPECTRUM_LO);
  grad.addColorStop(0.5, VIS_SPECTRUM_HI);
  grad.addColorStop(1, VIS_SPECTRUM_HI);
  ctx.fillStyle = grad;

  for (let i = 0; i < barCount; i++) {
    const db = fft[binMapping[i]] ?? -100;
    const norm = Math.max(0, (db + 100) / 100);
    const barH = norm * h;
    if (barH > 0) {
      const x = i * (barW + gap);
      ctx.beginPath();
      ctx.roundRect(x, h - barH, barW, barH, [Math.min(barW / 2, 2), Math.min(barW / 2, 2), 0, 0]);
      ctx.fill();
    }
  }
}

function renderSpectrogram(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  analyser: ReturnType<ReturnType<typeof getToneEngine>['getInstrumentAnalyser']>,
  hasAudio: boolean,
  imgDataRef: React.MutableRefObject<ImageData | null>,
) {
  if (!hasAudio || !analyser) {
    // Still draw current buffer
    if (imgDataRef.current) ctx.putImageData(imgDataRef.current, 0, 0);
    return;
  }

  const imgData = imgDataRef.current;
  if (!imgData) return;

  const fft = analyser.getFFT();
  const freqMap = getLogFreqMapping(fft.length, h);
  const pixels = imgData.data;

  // Shift left by 1 pixel
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < (w - 1); x++) {
      const dst = row + x * 4;
      const src = row + (x + 1) * 4;
      pixels[dst] = pixels[src];
      pixels[dst + 1] = pixels[src + 1];
      pixels[dst + 2] = pixels[src + 2];
      pixels[dst + 3] = pixels[src + 3];
    }
  }

  // Write new column
  const xCol = w - 1;
  for (let y = 0; y < h; y++) {
    const bin = freqMap[y];
    const db = fft[bin] ?? -100;
    const norm = Math.max(0, Math.min(1, (db + 100) / 85));
    const intensity = norm * norm;
    const ci = Math.min(CMAP_SIZE - 1, Math.floor(intensity * (CMAP_SIZE - 1)));
    const off = (y * w + xCol) * 4;
    pixels[off] = cmap[ci * 3];
    pixels[off + 1] = cmap[ci * 3 + 1];
    pixels[off + 2] = cmap[ci * 3 + 2];
    pixels[off + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
}

function renderLissajous(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  analyser: ReturnType<ReturnType<typeof getToneEngine>['getInstrumentAnalyser']>,
  hasAudio: boolean,
) {
  // Phosphor fade
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(0, 0, w, h);

  // Crosshair
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
  ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
  ctx.stroke();

  if (!analyser || !hasAudio) return;

  const waveform = analyser.getWaveform();
  if (waveform.length < 4) return;

  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(w, h) * 0.42;

  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  for (let i = 0; i < waveform.length - 1; i++) {
    const x = cx + waveform[i] * scale;
    const y = cy + waveform[i + 1] * scale;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.shadowColor = '#4ade80';
  ctx.shadowBlur = 6;
  ctx.globalAlpha = 0.4;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}
