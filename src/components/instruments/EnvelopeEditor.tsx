import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { TrackerEnvelope, TrackerEnvelopePoint } from '@typedefs/instrument';
import { Activity, Repeat, Anchor, Trash2, Copy } from 'lucide-react';

interface EnvelopeEditorProps {
  envelope: TrackerEnvelope;
  title: string;
  color: string;
  onChange: (updates: Partial<TrackerEnvelope>) => void;
}

const MAX_X = 325; // Ticks
const MAX_Y = 64;  // Value

export const EnvelopeEditor: React.FC<EnvelopeEditorProps> = ({ 
  envelope, title, color, onChange 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Draw logic
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const padding = 20;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const toPx = (point: TrackerEnvelopePoint) => ({
      x: padding + (point.x / MAX_X) * chartW,
      y: padding + chartH - (point.y / MAX_Y) * chartH
    });

    // Clear
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#1c1c22';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (i / 4) * chartH;
      ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke();
    }

    if (!envelope.enabled) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.textAlign = 'center';
      ctx.font = '10px monospace';
      ctx.fillText('ENVELOPE DISABLED', width / 2, height / 2);
      return;
    }

    // Connect points
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    envelope.points.forEach((p, i) => {
      const { x, y } = toPx(p);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Markers (Sustain/Loop)
    const drawVerticalMarker = (tick: number, mColor: string, label: string) => {
      const x = padding + (tick / MAX_X) * chartW;
      ctx.strokeStyle = mColor;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(x, padding); ctx.lineTo(x, height - padding); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = mColor;
      ctx.font = '9px monospace';
      ctx.fillText(label, x - 5, padding - 5);
    };

    if (envelope.sustainEnabled) {
      const p = envelope.points[envelope.sustainPoint];
      if (p) drawVerticalMarker(p.x, '#fbbf24', 'S');
    }
    if (envelope.loopEnabled) {
      const pS = envelope.points[envelope.loopStart];
      const pE = envelope.points[envelope.loopEnd];
      if (pS) drawVerticalMarker(pS.x, '#3b82f6', 'LS');
      if (pE) drawVerticalMarker(pE.x, '#3b82f6', 'LE');
    }

    // Points
    envelope.points.forEach((p, i) => {
      const { x, y } = toPx(p);
      ctx.fillStyle = selectedPoint === i ? '#fff' : color;
      ctx.beginPath();
      ctx.arc(x, y, selectedPoint === i ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (selectedPoint === i) {
        ctx.strokeStyle = '#000';
        ctx.stroke();
      }
    });
  }, [envelope, color, selectedPoint]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!envelope.enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const padding = 20;
    const chartW = canvas.width - padding * 2;
    const chartH = canvas.height - padding * 2;

    // Hit test points
    const hitIdx = envelope.points.findIndex(p => {
      const x = padding + (p.x / MAX_X) * chartW;
      const y = padding + chartH - (p.y / MAX_Y) * chartH;
      return Math.sqrt((x - px) ** 2 + (y - py) ** 2) < 8;
    });

    if (hitIdx !== -1) {
      setSelectedPoint(hitIdx);
      setIsDragging(true);
    } else if (envelope.points.length < 12) {
      // Add new point
      const nx = Math.round(((px - padding) / chartW) * MAX_X);
      const ny = Math.round((1 - (py - padding) / chartH) * MAX_Y);
      const newPoints = [...envelope.points, { x: Math.max(0, Math.min(MAX_X, nx)), y: Math.max(0, Math.min(MAX_Y, ny)) }]
        .sort((a, b) => a.x - b.x);
      onChange({ points: newPoints });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || selectedPoint === null || !envelope.enabled || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const padding = 20;
    const chartW = canvasRef.current.width - padding * 2;
    const chartH = canvasRef.current.height - padding * 2;

    const nx = Math.round(((e.clientX - rect.left - padding) / chartW) * MAX_X);
    const ny = Math.round((1 - (e.clientY - rect.top - padding) / chartH) * MAX_Y);

    const newPoints = [...envelope.points];
    newPoints[selectedPoint] = {
      x: Math.max(0, Math.min(MAX_X, nx)),
      y: Math.max(0, Math.min(MAX_Y, ny))
    };
    
    // Sort and update selected index if it moved
    newPoints.sort((a, b) => a.x - b.x);
    setSelectedPoint(newPoints.findIndex(p => p.x === nx && p.y === ny));
    
    onChange({ points: newPoints });
  };

  const deletePoint = () => {
    if (selectedPoint === null || envelope.points.length <= 2) return;
    const newPoints = envelope.points.filter((_, i) => i !== selectedPoint);
    onChange({ points: newPoints });
    setSelectedPoint(null);
  };

  return (
    <div className="bg-dark-bgSecondary/40 border border-dark-border rounded p-3 space-y-3 font-mono">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold uppercase flex items-center gap-2" style={{ color }}>
          <Activity size={12} /> {title}
        </h4>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 cursor-pointer">
            <input 
              type="checkbox" checked={envelope.enabled} 
              onChange={e => onChange({ enabled: e.target.checked })}
              className="w-3 h-3 accent-accent-primary"
            />
            <span className="text-[9px] text-text-muted uppercase">Enabled</span>
          </label>
        </div>
      </div>

      <div className="relative">
        <canvas 
          ref={canvasRef} width={600} height={120} 
          className="w-full h-24 cursor-crosshair bg-dark-bg border border-white/5 rounded"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => onChange({ sustainEnabled: !envelope.sustainEnabled })}
              className={`flex-1 text-[9px] py-1 border border-dark-border rounded uppercase flex items-center justify-center gap-1 transition-colors ${envelope.sustainEnabled ? 'bg-accent-warning/20 text-accent-warning border-accent-warning/30' : 'bg-dark-bgActive/20 text-text-muted hover:bg-dark-bgActive/40'}`}
            >
              <Anchor size={10} /> Sustain
            </button>
            <select 
              disabled={!envelope.sustainEnabled}
              value={envelope.sustainPoint}
              onChange={e => onChange({ sustainPoint: parseInt(e.target.value) })}
              className="bg-dark-bg border border-dark-border text-[9px] rounded px-1 py-1 text-text-primary disabled:opacity-30 outline-none focus:border-accent-primary"
            >
              {envelope.points.map((_, i) => <option key={i} value={i}>Point {i}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => onChange({ loopEnabled: !envelope.loopEnabled })}
              className={`flex-1 text-[9px] py-1 border border-dark-border rounded uppercase flex items-center justify-center gap-1 transition-colors ${envelope.loopEnabled ? 'bg-accent-secondary/20 text-accent-secondary border-accent-secondary/30' : 'bg-dark-bgActive/20 text-text-muted hover:bg-dark-bgActive/40'}`}
            >
              <Repeat size={10} /> Loop
            </button>
            <div className="flex gap-1">
              <select 
                disabled={!envelope.loopEnabled}
                value={envelope.loopStart}
                onChange={e => onChange({ loopStart: parseInt(e.target.value) })}
                className="bg-dark-bg border border-dark-border text-[9px] rounded px-1 py-1 text-text-primary disabled:opacity-30 outline-none focus:border-accent-primary"
              >
                {envelope.points.map((_, i) => <option key={i} value={i}>S{i}</option>)}
              </select>
              <select 
                disabled={!envelope.loopEnabled}
                value={envelope.loopEnd}
                onChange={e => onChange({ loopEnd: parseInt(e.target.value) })}
                className="bg-dark-bg border border-dark-border text-[9px] rounded px-1 py-1 text-text-primary disabled:opacity-30 outline-none focus:border-accent-primary"
              >
                {envelope.points.map((_, i) => <option key={i} value={i}>E{i}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between items-end">
          <div className="text-[10px] text-text-muted uppercase font-bold">
            {selectedPoint !== null ? (
              <span className="text-text-primary">Point {selectedPoint}: {envelope.points[selectedPoint].x}, {envelope.points[selectedPoint].y}</span>
            ) : 'Click to add points'}
          </div>
          <div className="flex gap-1">
            <button onClick={deletePoint} disabled={selectedPoint === null} className="p-1.5 bg-accent-error/10 text-accent-error border border-accent-error/20 rounded hover:bg-accent-error/20 disabled:opacity-20 transition-colors">
              <Trash2 size={12} />
            </button>
            <button className="p-1.5 bg-dark-bgActive/20 text-text-muted border border-dark-border rounded hover:bg-dark-bgActive/40 transition-colors" title="Copy Envelope">
              <Copy size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
