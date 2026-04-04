/**
 * MusicLineWaveformVisualizer -- Real-time waveform display for MusicLine playback.
 *
 * Connects an AnalyserNode to the MusicLineEngine output and draws the
 * time-domain waveform on a small canvas (256x64), matching the original
 * MusicLine Editor's waveform display.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { MusicLineEngine } from '@/engine/musicline/MusicLineEngine';

const WIDTH = 256;
const HEIGHT = 64;
const BG_COLOR = '#0a0a14';
const LINE_COLOR = '#40e040';
const CENTER_COLOR = '#1a3a1a';

export const MusicLineWaveformVisualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!canvas || !analyser || !data) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Center line
    ctx.strokeStyle = CENTER_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT / 2);
    ctx.lineTo(WIDTH, HEIGHT / 2);
    ctx.stroke();

    // Waveform
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();

    const sliceWidth = WIDTH / data.length;
    let x = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0; // 0..2 range, 1 = center
      const y = (v * HEIGHT) / 2;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    ctx.stroke();

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    if (!MusicLineEngine.hasInstance()) return;

    const engine = MusicLineEngine.getInstance();
    const audioContext = engine.output.context as AudioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512; // 256 samples of time-domain data
    analyser.smoothingTimeConstant = 0;
    analyserRef.current = analyser;
    dataRef.current = new Uint8Array(analyser.frequencyBinCount);

    // Connect engine output -> analyser (tap, not interrupting audio chain)
    engine.output.connect(analyser);

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        engine.output.disconnect(analyser);
      } catch {
        // already disconnected
      }
      analyserRef.current = null;
      dataRef.current = null;
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      style={{
        width: WIDTH,
        height: HEIGHT,
        borderRadius: 4,
        border: '1px solid #2a2a4a',
        imageRendering: 'pixelated',
      }}
    />
  );
};
