/**
 * BarChart — Shared bar chart for table data (uint8/int8 values).
 * Replaces inline copies in SonicArrangerControls and InStereo2Controls.
 */

import React, { useRef, useEffect } from 'react';

interface BarChartMarker {
  pos: number;
  color: string;
  label?: string;
}

interface BarChartProps {
  data: number[];
  width: number;
  height: number;
  color: string;
  signed?: boolean;
  markers?: BarChartMarker[];
  /** Max values to render (default 128) */
  maxValues?: number;
}

export const BarChart: React.FC<BarChartProps> = ({
  data, width, height, color, signed, markers, maxValues = 128,
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

    if (data.length === 0) return;

    const len = Math.min(data.length, maxValues);
    const barW = Math.max(1, width / len);

    if (signed) {
      ctx.strokeStyle = 'rgba(128,128,128,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      ctx.fillStyle = color;
      for (let i = 0; i < len; i++) {
        const v = data[i];
        const normH = (Math.abs(v) / 128) * (height / 2);
        const x = (i / len) * width;
        if (v >= 0) {
          ctx.fillRect(x, height / 2 - normH, barW, normH);
        } else {
          ctx.fillRect(x, height / 2, barW, normH);
        }
      }
    } else {
      ctx.fillStyle = color;
      for (let i = 0; i < len; i++) {
        const v = data[i];
        const barH = (v / 255) * height;
        const x = (i / len) * width;
        ctx.fillRect(x, height - barH, barW, barH);
      }
    }

    if (markers) {
      for (const m of markers) {
        if (m.pos >= 0 && m.pos < len) {
          const x = (m.pos / len) * width;
          ctx.strokeStyle = m.color;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
          ctx.setLineDash([]);
          if (m.label) {
            ctx.fillStyle = m.color;
            ctx.font = '8px monospace';
            ctx.fillText(m.label, x + 2, 9);
          }
        }
      }
    }
  }, [data, width, height, color, signed, markers, maxValues]);

  return <canvas ref={canvasRef} width={width} height={height} className="rounded" />;
};
