/**
 * VoiceTakeWaveform - the raw audio of a Voice to Notes take with markers for
 * what was heard in it: drum hits, detected notes, the row grid and where each
 * event was written.
 *
 * Presentation only. The waveform itself is drawn by the sample editor's
 * drawSampleWaveform so both views look alike; markers are drawn on top here.
 * Without a canvas backend (jsdom) the canvas still mounts and carries the
 * marker count, so tests can see what the take holds.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { drawSampleWaveform } from '@/utils/audio/drawSampleWaveform';

export type WaveformMarkerKind = 'hit' | 'note' | 'grid' | 'snapped';

export interface WaveformMarker {
  id: string;
  timeSeconds: number;
  /** Notes span to here; hits have no end. */
  endSeconds?: number;
  label: string;
  kind: WaveformMarkerKind;
}

export interface VoiceTakeWaveformProps {
  audio: Float32Array | null;
  sampleRate: number;
  markers: readonly WaveformMarker[];
  /** Row length in seconds; draws the row grid when set. */
  rowSeconds?: number;
  /** Rows per beat, for the stronger beat lines. */
  rowsPerBeat?: number;
  /** Current position while recording or playing, in seconds. */
  playhead?: number | null;
  /**
   * Time the pattern has left from the start row, in seconds. The axis covers
   * at least this, so a take growing while recording stays in scale and the
   * pattern end is marked.
   */
  spanSeconds?: number;
  /** Shown over the empty waveform. */
  placeholder?: string;
}

const HEIGHT = 160;
const LABEL_FONT = '9px ui-monospace, monospace';

function themeColour(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** A one-channel AudioBuffer around the take, or null where AudioBuffer is missing (jsdom). */
function toAudioBuffer(audio: Float32Array | null, sampleRate: number): AudioBuffer | null {
  if (!audio || audio.length === 0 || typeof AudioBuffer === 'undefined') return null;
  try {
    const buffer = new AudioBuffer({ length: audio.length, sampleRate, numberOfChannels: 1 });
    buffer.getChannelData(0).set(audio);
    return buffer;
  } catch {
    return null;
  }
}

function drawMarkers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seconds: number,
  markers: readonly WaveformMarker[],
  rowSeconds: number | undefined,
  rowsPerBeat: number,
  playhead: number | null | undefined,
  spanSeconds: number | undefined,
): void {
  const x = (t: number) => (t / seconds) * width;
  const accent = themeColour('--color-accent-primary', '#10b981');
  const text = themeColour('--color-text-primary', '#e5e7eb');
  const muted = themeColour('--color-text-muted', '#6b7280');
  const warning = themeColour('--color-accent-warning', '#f59e0b');

  // Past the pattern end: shaded, and a line where the pattern runs out.
  if (spanSeconds !== undefined && spanSeconds > 0 && spanSeconds <= seconds) {
    const end = Math.round(x(spanSeconds)) + 0.5;
    if (spanSeconds < seconds) {
      ctx.fillStyle = muted;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(end, 0, width - end, height);
    }
    ctx.strokeStyle = warning;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(end, 0);
    ctx.lineTo(end, height);
    ctx.stroke();
    ctx.fillStyle = warning;
    ctx.globalAlpha = 1;
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('Pattern end', end - 3, 2);
    ctx.textAlign = 'left';
  }

  if (rowSeconds && rowSeconds > 0) {
    for (let row = 0; row * rowSeconds < seconds; row++) {
      const beat = row % rowsPerBeat === 0;
      ctx.strokeStyle = muted;
      ctx.globalAlpha = beat ? 0.45 : 0.18;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x(row * rowSeconds)) + 0.5, 0);
      ctx.lineTo(Math.round(x(row * rowSeconds)) + 0.5, height);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  ctx.font = LABEL_FONT;
  ctx.textBaseline = 'top';
  for (const m of markers) {
    const start = x(m.timeSeconds);
    if (m.kind === 'grid') {
      ctx.strokeStyle = muted;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([2, 3]);
    } else if (m.kind === 'snapped') {
      ctx.strokeStyle = warning;
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([3, 2]);
    } else {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }
    ctx.lineWidth = m.kind === 'hit' ? 2 : 1;
    if (m.kind === 'note' && m.endSeconds !== undefined) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(start, 0, Math.max(1, x(m.endSeconds) - start), height);
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.moveTo(Math.round(start) + 0.5, 0);
    ctx.lineTo(Math.round(start) + 0.5, height);
    ctx.stroke();
    ctx.setLineDash([]);
    if (m.label) {
      ctx.fillStyle = m.kind === 'snapped' ? warning : text;
      ctx.globalAlpha = 1;
      ctx.fillText(m.label, start + 2, m.kind === 'snapped' ? 12 : 2);
    }
  }

  if (playhead !== null && playhead !== undefined && playhead >= 0) {
    ctx.strokeStyle = text;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x(playhead)) + 0.5, 0);
    ctx.lineTo(Math.round(x(playhead)) + 0.5, height);
    ctx.stroke();
  }
}

export const VoiceTakeWaveform: React.FC<VoiceTakeWaveformProps> = ({
  audio,
  sampleRate,
  markers,
  rowSeconds,
  rowsPerBeat = 4,
  playhead,
  spanSeconds,
  placeholder = 'Record a take to see its waveform',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buffer = useMemo(() => toAudioBuffer(audio, sampleRate), [audio, sampleRate]);
  const audioSeconds = audio && audio.length > 0 ? audio.length / sampleRate : 0;
  /** The axis: the longer of the audio and the pattern span. */
  const seconds = Math.max(audioSeconds, spanSeconds ?? 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const width = Math.max(1, Math.floor(wrap.clientWidth));
      const scale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      canvas.width = Math.floor(width * scale);
      canvas.height = Math.floor(HEIGHT * scale);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${HEIGHT}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = themeColour('--color-bg', '#111');
      ctx.fillRect(0, 0, width, HEIGHT);
      if (!buffer) {
        if (seconds > 0) drawMarkers(ctx, width, HEIGHT, seconds, markers, rowSeconds, rowsPerBeat, playhead, spanSeconds);
        ctx.fillStyle = themeColour('--color-text-muted', '#6b7280');
        ctx.globalAlpha = 1;
        ctx.font = LABEL_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(placeholder, width / 2, HEIGHT / 2);
        return;
      }
      // The audio takes its share of the axis; the rest is the pattern still to come.
      const audioWidth = Math.max(1, Math.round((width * audioSeconds) / seconds));
      drawSampleWaveform(ctx, audioWidth, HEIGHT, {
        audioBuffer: buffer,
        viewStart: 0,
        viewEnd: 1,
        selectionStart: -1,
        selectionEnd: -1,
        loopEnabled: false,
        loopStart: 0,
        loopEnd: 0,
        loopType: 'off',
        playbackPosition: 0,
        activeDrag: null,
        colors: { waveform: themeColour('--color-accent-primary', '#10b981') },
      });
      drawMarkers(ctx, width, HEIGHT, seconds, markers, rowSeconds, rowsPerBeat, playhead, spanSeconds);
    };

    draw();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(draw);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [buffer, seconds, audioSeconds, markers, rowSeconds, rowsPerBeat, playhead, spanSeconds, placeholder]);

  return (
    <div ref={wrapRef} className="w-full bg-dark-bgTertiary border border-dark-borderLight rounded overflow-hidden">
      <canvas
        ref={canvasRef}
        data-testid="voice-take-waveform"
        data-markers={markers.length}
        data-seconds={seconds.toFixed(2)}
        data-audio={audioSeconds.toFixed(2)}
        className="block w-full"
        style={{ height: HEIGHT }}
        role="img"
        aria-label="Take waveform"
      />
    </div>
  );
};
