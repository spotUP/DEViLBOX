/**
 * SIDVisualsTab — Piano roll + memory map visualization for SID playback.
 * Canvas-based piano roll shows 3 SID voice frequencies over time.
 * Memory map view shows C64 64KB address space layout.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Music, Cpu } from 'lucide-react';

interface SIDVisualsTabProps {
  className?: string;
}

const VOICE_COLORS = ['#22c55e', '#3b82f6', '#ef4444']; // green, blue, red
const VOICE_COLORS_DIM = ['rgba(34,197,94,0.3)', 'rgba(59,130,246,0.3)', 'rgba(239,68,68,0.3)'];
const BUFFER_FRAMES = 200;
const NOTE_MIN = 24;  // C1
const NOTE_MAX = 96;  // C7
const NOTE_RANGE = NOTE_MAX - NOTE_MIN;

/** Convert SID frequency register to MIDI note number */
function sidFreqToNote(freq: number): number {
  if (freq <= 0) return -1;
  const hz = (freq * 985248) / 16777216;
  if (hz < 1) return -1;
  return 12 * Math.log2(hz / 440) + 69;
}

type ViewMode = 'pianoroll' | 'memmap';

// C64 memory regions for the memory map
const MEMORY_REGIONS = [
  { start: 0x0000, end: 0x03FF, label: 'Zero Page + Stack', color: '#6366f1' },
  { start: 0x0400, end: 0x07FF, label: 'Screen RAM', color: '#8b5cf6' },
  { start: 0x0800, end: 0x9FFF, label: 'BASIC Program Area', color: '#22c55e' },
  { start: 0xA000, end: 0xBFFF, label: 'BASIC ROM', color: '#f59e0b' },
  { start: 0xC000, end: 0xCFFF, label: 'Upper RAM', color: '#06b6d4' },
  { start: 0xD000, end: 0xD3FF, label: 'VIC-II', color: '#ec4899' },
  { start: 0xD400, end: 0xD7FF, label: 'SID Registers', color: '#ef4444' },
  { start: 0xD800, end: 0xDBFF, label: 'Color RAM', color: '#a855f7' },
  { start: 0xDC00, end: 0xDCFF, label: 'CIA 1', color: '#f97316' },
  { start: 0xDD00, end: 0xDDFF, label: 'CIA 2', color: '#f97316' },
  { start: 0xDE00, end: 0xDFFF, label: 'I/O Area', color: '#78716c' },
  { start: 0xE000, end: 0xFFFF, label: 'KERNAL ROM', color: '#eab308' },
];

export const SIDVisualsTab: React.FC<SIDVisualsTabProps> = ({ className }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('pianoroll');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<number[][]>(Array.from({ length: 3 }, () => new Array(BUFFER_FRAMES).fill(-1)));
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);

  // Simulated SID voice data (in real use, this would come from the engine)
  const addFrame = useCallback((voices: number[]) => {
    const idx = frameRef.current % BUFFER_FRAMES;
    for (let v = 0; v < 3; v++) {
      bufferRef.current[v][idx] = voices[v] ?? -1;
    }
    frameRef.current++;
  }, []);

  // Demo data generator for visual testing
  useEffect(() => {
    if (viewMode !== 'pianoroll') return;
    const interval = setInterval(() => {
      const t = Date.now() / 1000;
      addFrame([
        sidFreqToNote(Math.floor(2000 + 1500 * Math.sin(t * 0.7))),
        sidFreqToNote(Math.floor(4000 + 3000 * Math.sin(t * 0.5 + 1))),
        sidFreqToNote(Math.floor(1000 + 800 * Math.sin(t * 1.1 + 2))),
      ]);
    }, 50);
    return () => clearInterval(interval);
  }, [viewMode, addFrame]);

  // Canvas render loop
  useEffect(() => {
    if (viewMode !== 'pianoroll') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const { width, height } = canvas;
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);

      // Draw horizontal note grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let n = NOTE_MIN; n <= NOTE_MAX; n += 12) {
        const y = height - ((n - NOTE_MIN) / NOTE_RANGE) * height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '9px monospace';
        const octave = Math.floor(n / 12) - 1;
        ctx.fillText(`C${octave}`, 2, y - 2);
      }

      // Draw voice trails
      const current = frameRef.current;
      const colW = width / BUFFER_FRAMES;

      for (let v = 0; v < 3; v++) {
        const buf = bufferRef.current[v];
        ctx.strokeStyle = VOICE_COLORS[v];
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;

        for (let i = 0; i < BUFFER_FRAMES; i++) {
          const idx = (current + i) % BUFFER_FRAMES;
          const note = buf[idx];
          if (note < NOTE_MIN || note > NOTE_MAX) {
            started = false;
            continue;
          }
          const x = i * colW;
          const y = height - ((note - NOTE_MIN) / NOTE_RANGE) * height;
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        // Draw current note dot
        const lastIdx = (current - 1 + BUFFER_FRAMES) % BUFFER_FRAMES;
        const lastNote = buf[lastIdx];
        if (lastNote >= NOTE_MIN && lastNote <= NOTE_MAX) {
          const x = (BUFFER_FRAMES - 1) * colW;
          const y = height - ((lastNote - NOTE_MIN) / NOTE_RANGE) * height;
          ctx.fillStyle = VOICE_COLORS[v];
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = VOICE_COLORS_DIM[v];
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Voice legend
      for (let v = 0; v < 3; v++) {
        ctx.fillStyle = VOICE_COLORS[v];
        ctx.fillRect(width - 80, 8 + v * 14, 8, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '10px sans-serif';
        ctx.fillText(`Voice ${v + 1}`, width - 68, 16 + v * 14);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [viewMode]);

  // Resize canvas to container
  useEffect(() => {
    if (viewMode !== 'pianoroll') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [viewMode]);

  return (
    <div className={`flex flex-col h-full ${className ?? ''}`}>
      {/* View toggle */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-border">
        <button
          onClick={() => setViewMode('pianoroll')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors ${
            viewMode === 'pianoroll'
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          Piano Roll
        </button>
        <button
          onClick={() => setViewMode('memmap')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors ${
            viewMode === 'memmap'
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          Memory Map
        </button>
      </div>

      {/* Piano Roll View */}
      {viewMode === 'pianoroll' && (
        <div className="flex-1 relative min-h-[200px]">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full rounded-b" />
        </div>
      )}

      {/* Memory Map View */}
      {viewMode === 'memmap' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <h3 className="text-xs font-medium text-text-muted mb-2">C64 64KB Address Space</h3>
          <div className="relative w-full" style={{ height: 320 }}>
            {MEMORY_REGIONS.map((region) => {
              const top = (region.start / 0x10000) * 320;
              const height = ((region.end - region.start + 1) / 0x10000) * 320;
              return (
                <div
                  key={region.label}
                  className="absolute left-0 right-0 flex items-center px-2 border-b border-black/20 group cursor-default"
                  style={{
                    top,
                    height: Math.max(height, 14),
                    backgroundColor: region.color + '33',
                    borderLeft: `3px solid ${region.color}`,
                  }}
                  title={`$${region.start.toString(16).toUpperCase().padStart(4, '0')}-$${region.end.toString(16).toUpperCase().padStart(4, '0')}`}
                >
                  <span className="text-[10px] font-mono text-text-muted mr-2 shrink-0">
                    ${region.start.toString(16).toUpperCase().padStart(4, '0')}
                  </span>
                  <span className="text-[10px] text-text-primary truncate">{region.label}</span>
                  {region.label === 'SID Registers' && (
                    <span className="ml-auto text-[10px] font-bold" style={{ color: region.color }}>◆</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
