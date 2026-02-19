import React, { useRef, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Helper: computeRMS
// ---------------------------------------------------------------------------

function computeRMS(data: Float32Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}

// ---------------------------------------------------------------------------
// Helper: chebyshev polynomial T_n(x) via recurrence
// ---------------------------------------------------------------------------

function chebyshev(n: number, x: number): number {
  if (n === 0) return 1;
  if (n === 1) return x;
  let prev2 = 1;
  let prev1 = x;
  for (let k = 2; k <= n; k++) {
    const curr = 2 * x * prev1 - prev2;
    prev2 = prev1;
    prev1 = curr;
  }
  return prev1;
}

// ---------------------------------------------------------------------------
// 1. EffectOscilloscope — overlaid pre/post waveforms
// ---------------------------------------------------------------------------

interface EffectOscilloscopeProps {
  pre: Float32Array;
  post: Float32Array;
  color: string;
  width?: number;
  height?: number;
}

export const EffectOscilloscope: React.FC<EffectOscilloscopeProps> = ({
  pre,
  post,
  color,
  width = 300,
  height = 80,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // No dep array — Float32Array is mutated in-place by the analyser hook;
  // React can't diff it by reference, so we redraw on every parent render (30fps).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // Zero line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Find zero-crossing in pre for stable display
    let startIndex = 0;
    for (let i = 1; i < pre.length; i++) {
      if (pre[i - 1] < 0 && pre[i] >= 0) {
        startIndex = i;
        break;
      }
    }

    const drawWave = (
      data: Float32Array,
      strokeColor: string,
      lineWidth: number,
    ) => {
      const maxSamples = Math.min(1024, data.length - startIndex);
      if (maxSamples <= 0) return;

      const sliceWidth = width / maxSamples;

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();

      for (let i = 0; i < maxSamples; i++) {
        const sample = data[startIndex + i];
        const x = i * sliceWidth;
        const y = (1 - sample) * (height / 2);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    };

    // Draw pre waveform (gray, semi-transparent)
    drawWave(pre, 'rgba(160,160,160,0.5)', 1);

    // Draw post waveform (accent color)
    drawWave(post, color, 1.5);
  });

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: `${height}px`,
        borderRadius: 4,
        display: 'block',
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// 2. EffectSpectrum — FFT spectrum with log frequency axis
// ---------------------------------------------------------------------------

interface EffectSpectrumProps {
  pre: Float32Array;
  post: Float32Array;
  color: string;
  width?: number;
  height?: number;
  sampleRate?: number;
}

export const EffectSpectrum: React.FC<EffectSpectrumProps> = ({
  pre,
  post,
  color,
  width = 300,
  height = 80,
  sampleRate = 44100,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // No dep array — Float32Array is mutated in-place by the analyser hook;
  // React can't diff it by reference, so we redraw on every parent render (30fps).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    const binCount = pre.length;
    if (binCount === 0) return;

    const nyquist = sampleRate / 2;
    const minDb = -100;
    const maxDb = 0;

    // Map bin index to canvas x using log frequency axis
    const freqToX = (bin: number): number => {
      const freq = (bin / binCount) * nyquist;
      const safeFreq = Math.max(freq, 20);
      return (Math.log10(safeFreq / 20) / Math.log10(nyquist / 20)) * width;
    };

    const dbToY = (db: number): number => {
      const clamped = Math.max(minDb, Math.min(maxDb, db));
      return height - ((clamped - minDb) / (maxDb - minDb)) * height;
    };

    // Draw pre as gray fill
    ctx.fillStyle = 'rgba(120,120,120,0.25)';
    ctx.beginPath();
    ctx.moveTo(freqToX(1), height);
    for (let i = 1; i < binCount; i++) {
      const x = freqToX(i);
      const y = dbToY(pre[i]);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(freqToX(binCount - 1), height);
    ctx.closePath();
    ctx.fill();

    // Draw post as colored line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 1; i < binCount; i++) {
      const x = freqToX(i);
      const y = dbToY(post[i]);
      if (i === 1) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  });

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: `${height}px`,
        borderRadius: 4,
        display: 'block',
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// 3. WaveshaperCurve — static transfer function visualizer
// ---------------------------------------------------------------------------

interface WaveshaperCurveProps {
  type: 'Distortion' | 'Chebyshev' | 'TapeSaturation' | 'BitCrusher';
  drive?: number;
  order?: number;
  bits?: number;
  color: string;
  width?: number;
  height?: number;
}

export const WaveshaperCurve: React.FC<WaveshaperCurveProps> = ({
  type,
  drive = 0.5,
  order = 3,
  bits = 8,
  color,
  width = 120,
  height = 120,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // Crosshairs
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Transfer function curve
    const numPoints = width;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let px = 0; px < numPoints; px++) {
      // x in -1..+1
      const x = (px / (numPoints - 1)) * 2 - 1;
      let y = 0;

      if (type === 'Distortion') {
        const driveGain = Math.tanh(drive * 10 + 0.1);
        y = (Math.tanh((drive * 10 + 0.1) * x) / driveGain);
      } else if (type === 'Chebyshev') {
        const n = Math.max(1, Math.round(order));
        const normFactor = chebyshev(n, 1);
        y = normFactor !== 0 ? chebyshev(n, x) / normFactor : chebyshev(n, x);
        // Clamp to -1..1 range for display
        y = Math.max(-1, Math.min(1, y));
      } else if (type === 'TapeSaturation') {
        const gain = drive * 5 + 0.1;
        const sign = x < 0 ? -1 : 1;
        const absX = Math.abs(x);
        const satNorm = Math.tanh(gain);
        y = satNorm !== 0 ? (sign * Math.tanh(absX * gain)) / satNorm : sign * Math.tanh(absX * gain);
      } else if (type === 'BitCrusher') {
        const levels = Math.pow(2, Math.max(1, Math.round(bits)));
        y = Math.round(x * levels) / levels;
        // Clamp to -1..1
        y = Math.max(-1, Math.min(1, y));
      }

      // Map y (-1..+1) to canvas coordinates
      const canvasY = (1 - y) * (height / 2);

      if (px === 0) {
        ctx.moveTo(px, canvasY);
      } else {
        ctx.lineTo(px, canvasY);
      }
    }

    ctx.stroke();
  }, [type, drive, order, bits, color, width, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: `${height}px`,
        borderRadius: 4,
        display: 'block',
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// 4. GainReductionMeter — compressor GR meter
// ---------------------------------------------------------------------------

interface GainReductionMeterProps {
  pre: Float32Array;
  post: Float32Array;
  width?: number;
  height?: number;
}

export const GainReductionMeter: React.FC<GainReductionMeterProps> = ({
  pre,
  post,
  width = 80,
  height = 120,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // No dep array — Float32Array is mutated in-place by the analyser hook;
  // React can't diff it by reference, so we redraw on every parent render (30fps).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    const rmsPre = computeRMS(pre);
    const rmsPost = computeRMS(post);

    const minDb = -60;
    const maxDb = 0;
    const toNorm = (db: number) =>
      Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));

    // Level bar (left half)
    const levelBarX = 4;
    const levelBarW = width / 2 - 8;
    const barH = height - 24;

    // Background track
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(levelBarX, 8, levelBarW, barH);

    const postDb = rmsPost > 0 ? 20 * Math.log10(rmsPost) : minDb;
    const levelNorm = toNorm(postDb);
    const levelBarHeight = levelNorm * barH;

    // Color: green/amber/red
    let levelColor = '#4ade80';
    if (postDb > -6) levelColor = '#ef4444';
    else if (postDb > -12) levelColor = '#f59e0b';

    ctx.fillStyle = levelColor;
    ctx.fillRect(levelBarX, 8 + barH - levelBarHeight, levelBarW, levelBarHeight);

    // GR bar (right half)
    const grBarX = width / 2 + 4;
    const grBarW = width / 2 - 8;

    // Background track
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(grBarX, 8, grBarW, barH);

    if (rmsPre > 0 && rmsPost > 0) {
      const grDb = 20 * Math.log10(rmsPost / rmsPre);
      const grClamped = Math.max(-20, Math.min(0, grDb));
      // GR: 0 = no reduction (top), -20 = max reduction (fills bar downward)
      const grNorm = Math.abs(grClamped) / 20;
      const grBarHeight = grNorm * barH;

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(grBarX, 8, grBarW, grBarHeight);

      // GR value text
      const grText = `${grClamped.toFixed(1)}`;
      ctx.fillStyle = '#ef4444';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(grText, width - 2, height - 2);
    }

    // Labels
    ctx.fillStyle = '#666';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LEVEL', levelBarX, height - 2);

    ctx.textAlign = 'right';
    ctx.fillText('GR', width - 2, height - 12);
  });

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: 4,
        display: 'block',
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// 5. MiniOutputMeter — 48×16px chain card meter
// ---------------------------------------------------------------------------

interface MiniOutputMeterProps {
  post: Float32Array;
  pre?: Float32Array;
  color?: string;
  grMode?: boolean;
}

export const MiniOutputMeter: React.FC<MiniOutputMeterProps> = ({
  post,
  pre,
  color = '#4ade80',
  grMode = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = 48;
  const H = 16;

  // No dep array — Float32Array is mutated in-place by the analyser hook;
  // React can't diff it by reference, so we redraw on every parent render (30fps).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    if (grMode && pre && pre.length > 0) {
      // GR bar in red
      const rmsPre = computeRMS(pre);
      const rmsPost = computeRMS(post);

      if (rmsPre > 0 && rmsPost > 0) {
        const grDb = 20 * Math.log10(rmsPost / rmsPre);
        const grClamped = Math.max(-20, Math.min(0, grDb));
        const grNorm = Math.abs(grClamped) / 20;
        const barW = Math.round(grNorm * (W - 2));

        ctx.fillStyle = '#ef4444';
        ctx.fillRect(0, 1, barW, H - 2);
      }
    } else {
      // Normal level bar
      const rmsPost = computeRMS(post);
      const minDb = -60;
      const maxDb = 0;
      const postDb = rmsPost > 0 ? 20 * Math.log10(rmsPost) : minDb;
      const levelNorm = Math.max(0, Math.min(1, (postDb - minDb) / (maxDb - minDb)));
      const barW = Math.round(levelNorm * (W - 2));

      let barColor = color;
      if (postDb > -6) barColor = '#ef4444';
      else if (postDb > -12) barColor = '#f59e0b';

      ctx.fillStyle = barColor;
      ctx.fillRect(0, 1, barW, H - 2);
    }

    // Peak tick at right edge
    ctx.fillStyle = '#333';
    ctx.fillRect(W - 2, 0, 2, H);
  });

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${W}px`,
        height: `${H}px`,
        display: 'block',
      }}
    />
  );
};
