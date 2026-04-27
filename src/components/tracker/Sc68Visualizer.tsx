/**
 * FormatVisualizer — Canvas-based audio visualizer for formats with no pattern data.
 *
 * Used for SC68/SNDH (Atari ST), SID (C64), and any other format that outputs
 * raw audio without structured tracker pattern data.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTransportStore } from '@/stores/useTransportStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { getToneEngine } from '@engine/ToneEngine';

type VizMode = 'waveform' | 'spectrum' | 'vectorscope' | 'bars';
const VIZ_MODES: VizMode[] = ['waveform', 'spectrum', 'vectorscope', 'bars'];
const VIZ_LABELS: Record<VizMode, string> = {
  waveform: 'WAVEFORM',
  spectrum: 'SPECTRUM',
  vectorscope: 'VECTORSCOPE',
  bars: 'FREQUENCY BARS',
};

const YM_GREEN = '#00cc55';
const YM_CYAN = '#44ddcc';
const YM_AMBER = '#ddaa33';
const YM_BG = '#0a0e12';
const YM_GRID = '#1a2030';

/** Labels shown in the header chip/format badge per editorMode. */
const FORMAT_LABELS: Record<string, { chip: string; format: string }> = {
  sc68:        { chip: 'YM2149',  format: 'SC68'    },
  c64sid:      { chip: 'SID',     format: 'C64'     },
  pxtone:      { chip: 'PxTone',  format: 'PXTCOP'  },
  organya:     { chip: 'OrgAnya', format: 'ORG'     },
  sunvox:      { chip: 'SunVox',  format: 'SUNVOX'  },
  zxtune:      { chip: 'AY-3',    format: 'ZXTune'  },
  pretracker:  { chip: 'Paula',   format: 'PRE'     },
  artofnoise:  { chip: 'Paula',   format: 'AON'     },
};

export const Sc68Visualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const peaksRef = useRef<Float32Array>(new Float32Array(128));
  const [mode, setMode] = useState<VizMode>('waveform');
  const isPlaying = useTransportStore(s => s.isPlaying);
  const songName = useTrackerStore(s => s.patterns[s.currentPatternIndex]?.name ?? '');
  const editorMode = useFormatStore(s => s.editorMode);

  const cycleMode = useCallback(() => {
    setMode(m => VIZ_MODES[(VIZ_MODES.indexOf(m) + 1) % VIZ_MODES.length]);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!isPlaying) {
      // Static background when stopped
      const { width: w, height: h } = canvas;
      ctx.fillStyle = YM_BG;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#445566';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AUDIO PLAYER \u2014 PRESS PLAY', w / 2, h / 2);
      return;
    }

    try { getToneEngine().enableAnalysers(); } catch { /* not ready */ }

    const peaks = peaksRef.current;

    const draw = () => {
      const { width: w, height: h } = canvas;
      ctx.fillStyle = YM_BG;
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = YM_GRID;
      ctx.lineWidth = 1;
      for (let x = 40; x < w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 30; y < h; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      try {
        const engine = getToneEngine();
        if (mode === 'waveform') {
          const waveform = engine.getWaveform();
          if (waveform && waveform.length > 0) {
            const midY = h / 2;
            const amp = h * 0.4;
            // Center line
            ctx.strokeStyle = '#253040';
            ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke();
            // Glow
            ctx.strokeStyle = YM_GREEN + '40';
            ctx.lineWidth = 4;
            ctx.beginPath();
            for (let x = 0; x < w; x++) {
              const idx = Math.floor(x * waveform.length / w);
              const y = midY - waveform[idx] * amp;
              if (x === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
            }
            ctx.stroke();
            // Main line
            ctx.strokeStyle = YM_GREEN;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let x = 0; x < w; x++) {
              const idx = Math.floor(x * waveform.length / w);
              const y = midY - waveform[idx] * amp;
              if (x === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
            }
            ctx.stroke();
          }
        } else if (mode === 'spectrum') {
          const fft = engine.getFFT();
          if (fft && fft.length > 0) {
            const barCount = Math.min(128, fft.length);
            const barW = w / barCount;
            for (let i = 0; i < barCount; i++) {
              const val = (fft[i] + 140) / 140; // normalize from dB
              const barH = Math.max(0, val * h * 0.9);
              // Peak hold
              if (barH > peaks[i]) peaks[i] = barH;
              else peaks[i] = Math.max(0, peaks[i] - 1.5);
              // Bar
              ctx.fillStyle = YM_CYAN;
              ctx.fillRect(i * barW, h - barH, barW - 1, barH);
              // Peak marker
              ctx.fillStyle = YM_AMBER;
              ctx.fillRect(i * barW, h - peaks[i], barW - 1, 2);
            }
          }
        } else if (mode === 'vectorscope') {
          const waveform = engine.getWaveform();
          if (waveform && waveform.length > 1) {
            const cx = w / 2, cy = h / 2;
            const radius = Math.min(w, h) * 0.4;
            // Circle guide
            ctx.strokeStyle = '#253040';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
            // Lissajous
            ctx.strokeStyle = YM_GREEN + '80';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const half = Math.floor(waveform.length / 2);
            for (let i = 0; i < half; i++) {
              const x = cx + waveform[i] * radius;
              const y = cy - waveform[i + half] * radius;
              if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
            }
            ctx.stroke();
          }
        } else if (mode === 'bars') {
          const fft = engine.getFFT();
          if (fft && fft.length > 0) {
            const barCount = 32;
            const barW = (w - 64) / barCount;
            const gap = 4;
            for (let i = 0; i < barCount; i++) {
              const fftIdx = Math.floor(i * fft.length / barCount);
              const val = (fft[fftIdx] + 140) / 140;
              const barH = Math.max(0, val * h * 0.85);
              const x = 32 + i * barW;
              // Gradient fill
              const grad = ctx.createLinearGradient(x, h, x, h - barH);
              grad.addColorStop(0, YM_GREEN);
              grad.addColorStop(0.6, YM_CYAN);
              grad.addColorStop(1, YM_AMBER);
              ctx.fillStyle = grad;
              ctx.fillRect(x, h - barH, barW - gap, barH);
            }
          }
        }
      } catch { /* engine not ready */ }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, mode]);

  // Resize canvas to fill container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = Math.floor(width);
        canvas.height = Math.floor(height);
      }
    });
    observer.observe(canvas.parentElement!);
    return () => observer.disconnect();
  }, []);

  // Parse title/composer from song name (format: "Title — Composer [FORMAT]")
  const formatInfo = FORMAT_LABELS[editorMode ?? ''] ?? { chip: 'AUDIO', format: 'PLAYER' };
  const parts = songName.split(' \u2014 ');
  const title = parts[0] || songName || 'Loading...';
  const composerAndFormat = parts[1] || '';
  const composer = composerAndFormat.replace(/\s*\[.*\]$/, '');

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0e12] select-none" style={{ minHeight: '120px' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[#1a2030] shrink-0">
        <span className="text-xs font-bold" style={{ color: YM_GREEN }}>{formatInfo.chip}</span>
        <span className="text-xs text-text-secondary truncate">{title}</span>
        {composer && <span className="text-xs truncate" style={{ color: YM_AMBER }}>{composer}</span>}
        <div className="flex-1" />
        <span className="text-xs" style={{ color: YM_CYAN }}>{formatInfo.format}</span>
        <button
          onClick={cycleMode}
          className="text-xs px-2 py-0.5 text-text-secondary hover:text-text-primary transition-colors"
        >
          {VIZ_LABELS[mode]}
        </button>
      </div>
      {/* Canvas */}
      <div className="flex-1 min-h-0 relative cursor-pointer" onClick={cycleMode}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>
    </div>
  );
};
