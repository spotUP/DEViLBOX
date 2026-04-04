/**
 * WaveformLineCanvas — Shared signed int8 waveform line visualization.
 * Replaces inline copies in SonicArrangerControls and InStereo2Controls.
 */

import React, { useRef, useEffect } from 'react';

interface WaveformLineCanvasProps {
  data: number[];
  width: number;
  height: number;
  color: string;
  label?: string;
  /** Max samples to render (default 256) */
  maxSamples?: number;
}

export const WaveformLineCanvas: React.FC<WaveformLineCanvasProps> = ({
  data, width, height, color, label, maxSamples = 256,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // centre line
    ctx.strokeStyle = 'rgba(128,128,128,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (data.length === 0) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const len = Math.min(data.length, maxSamples);
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * width;
      const y = ((1 - (data[i] + 128) / 255) * (height - 2)) + 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (label) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.font = '9px monospace';
      ctx.fillText(label, 4, 10);
      ctx.globalAlpha = 1;
    }
  }, [data, width, height, color, label, maxSamples]);

  return <canvas ref={canvasRef} width={width} height={height} className="rounded" />;
};
