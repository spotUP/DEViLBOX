/**
 * drawSampleWaveform - Pure canvas rendering for sample waveform display
 * 
 * Extracted from SampleEditor to enable reuse (main view + minimap).
 * All rendering is driven by the options object — no React state.
 */

// ─── Types ─────────────────────────────────────────────────────────────

export interface WaveformDrawOptions {
  audioBuffer: AudioBuffer | null;
  
  // View window (0–1 normalized, for zoom/scroll)
  viewStart: number;
  viewEnd: number;

  // Selection range (sample indices, -1 = no selection)
  selectionStart: number;
  selectionEnd: number;
  
  // Loop
  loopEnabled: boolean;
  loopStart: number; // 0–1 normalized
  loopEnd: number;
  loopType: 'off' | 'forward' | 'pingpong';
  
  // Playback
  playbackPosition: number; // 0–1 normalized, 0 = not playing
  
  // Granular
  granularPosition?: number; // 0–100
  
  // Drag highlight
  activeDrag: string | null;
  
  // Beat slicer markers (frame positions)
  slices?: Array<{ id: string; startFrame: number; endFrame: number; confidence?: number }>;
  selectedSliceId?: string | null;

  /** 9xx sample offset markers — hex values (0x01-0xFF) to draw as vertical ticks */
  offsetMarkers?: number[];

  // Display mode
  showSpectrum?: boolean;
  
  // Simplified mode (for minimap)
  simplified?: boolean;
  viewportRect?: { start: number; end: number }; // viewport indicator for minimap
}

// ─── Colors ────────────────────────────────────────────────────────────

const COLORS = {
  bg: '#0f0c0c',
  grid: '#1d1818',
  center: '#2f2525',
  waveform: '#ef4444',
  waveformDim: '#a83232',
  selection: 'rgba(59, 130, 246, 0.3)',
  selectionBorder: '#3b82f6',
  loop: 'rgba(59, 130, 246, 0.15)',
  loopLine: '#3b82f6',
  loopActive: '#60a5fa',
  playback: '#fbbf24',
  granular: '#a855f7',
  sliceMarker: '#a855f7',
  sliceMarkerDim: 'rgba(168, 85, 247, 0.35)',
  sliceLabel: 'rgba(168, 85, 247, 0.7)',
  dimOverlay: 'rgba(0, 0, 0, 0.6)',
  viewport: 'rgba(255, 255, 255, 0.15)',
  viewportBorder: 'rgba(255, 255, 255, 0.4)',
  placeholder: '#888080',
  placeholderSub: '#585050',
  handleText: '#000',
  loopHandleText: '#fff',
  spectrumLow: '#1e40af',
  spectrumMid: '#ef4444',
  spectrumHigh: '#fbbf24',
};

const HANDLE_H = 18;
const HANDLE_W = 10;

// ─── Main Draw ─────────────────────────────────────────────────────────

export function drawSampleWaveform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: WaveformDrawOptions,
): void {
  const midY = height / 2;

  // Resolve theme colors from CSS variables (canvas can't use var() directly)
  const cs = getComputedStyle(ctx.canvas);
  const bgColor = cs.getPropertyValue('--color-bg').trim() || COLORS.bg;
  const gridColor = cs.getPropertyValue('--color-bg-secondary').trim() || COLORS.grid;
  const centerColor = cs.getPropertyValue('--color-border').trim() || COLORS.center;
  const textMuted = cs.getPropertyValue('--color-text-muted').trim() || COLORS.placeholder;
  const textSubtle = cs.getPropertyValue('--color-text-subtle').trim() || COLORS.placeholderSub;
  const accentColor = cs.getPropertyValue('--color-accent-primary').trim() || '#10b981';

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  if (opts.simplified) {
    drawSimplified(ctx, width, height, opts);
    return;
  }

  // Grid
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (height / 4) * i);
    ctx.lineTo(width, (height / 4) * i);
    ctx.stroke();
  }
  ctx.strokeStyle = centerColor;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(width, midY);
  ctx.stroke();

  if (!opts.audioBuffer) {
    ctx.textAlign = 'center';
    // Clear a band behind the text so grid lines don't cut through it
    const textBlockTop = midY - 30;
    const textBlockHeight = 60;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, textBlockTop, width, textBlockHeight);
    // Main heading — uses muted text token
    ctx.fillStyle = textMuted;
    ctx.font = 'bold 18px "JetBrains Mono", "Consolas", monospace';
    ctx.fillText('EMPTY SAMPLE', width / 2, midY - 10);
    // Subtitle — list the ways to load audio
    ctx.fillStyle = textSubtle;
    ctx.font = '12px "JetBrains Mono", "Consolas", monospace';
    ctx.fillText('Drag & drop a file, use Replace, or Record from mic', width / 2, midY + 8);
    // Hint — accent color for the format list
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 11px "JetBrains Mono", "Consolas", monospace';
    ctx.fillText('WAV · MP3 · OGG · FLAC · AIFF · M4A', width / 2, midY + 24);
    return;
  }

  if (opts.showSpectrum) {
    drawSpectrumView(ctx, width, height, opts);
    return;
  }

  drawWaveformData(ctx, width, height, midY, opts);
  drawOverlays(ctx, width, height, opts);
}

// ─── Waveform rendering ────────────────────────────────────────────────

function drawWaveformData(
  ctx: CanvasRenderingContext2D,
  width: number,
  _height: number,
  midY: number,
  opts: WaveformDrawOptions,
): void {
  const buffer = opts.audioBuffer!;
  const channelData = buffer.getChannelData(0);
  const totalSamples = channelData.length;
  
  const viewStartSample = Math.floor(opts.viewStart * totalSamples);
  const viewEndSample = Math.floor(opts.viewEnd * totalSamples);
  const visibleSamples = viewEndSample - viewStartSample;
  const samplesPerPixel = visibleSamples / width;

  ctx.shadowColor = COLORS.waveform;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = COLORS.waveform;
  ctx.lineWidth = 1;
  ctx.beginPath();

  if (samplesPerPixel <= 1) {
    // Draw individual samples as lines to center
    for (let x = 0; x < width; x++) {
      const si = viewStartSample + Math.floor(x * samplesPerPixel);
      if (si >= totalSamples) break;
      const val = channelData[si];
      const y = midY - val * midY * 0.85;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else {
    // Min/max peak pairs per pixel
    for (let x = 0; x < width; x++) {
      const sampleStart = viewStartSample + Math.floor(x * samplesPerPixel);
      const sampleEnd = viewStartSample + Math.floor((x + 1) * samplesPerPixel);
      let min = 1, max = -1;
      for (let i = sampleStart; i < sampleEnd && i < totalSamples; i++) {
        const val = channelData[i];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      const minY = midY - min * midY * 0.85;
      const maxY = midY - max * midY * 0.85;
      if (x === 0) ctx.moveTo(x, minY);
      ctx.lineTo(x, minY);
      ctx.lineTo(x, maxY);
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Secondary channel (if stereo) — drawn dimmer underneath
  if (buffer.numberOfChannels >= 2) {
    const ch2 = buffer.getChannelData(1);
    ctx.shadowColor = COLORS.waveformDim;
    ctx.shadowBlur = 4;
    ctx.strokeStyle = COLORS.waveformDim;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const sampleStart = viewStartSample + Math.floor(x * samplesPerPixel);
      const sampleEnd = viewStartSample + Math.floor((x + 1) * samplesPerPixel);
      let min = 1, max = -1;
      for (let i = sampleStart; i < sampleEnd && i < totalSamples; i++) {
        const val = ch2[i];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      const minY = midY - min * midY * 0.85;
      const maxY = midY - max * midY * 0.85;
      if (x === 0) ctx.moveTo(x, minY);
      ctx.lineTo(x, minY);
      ctx.lineTo(x, maxY);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

// ─── Overlays: selection, handles, loop, playback ──────────────────────

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: WaveformDrawOptions,
): void {
  const { viewStart, viewEnd } = opts;
  const viewRange = viewEnd - viewStart;

  // Convert normalized position to pixel X
  const normToX = (norm: number) => ((norm - viewStart) / viewRange) * width;

  // ─── Selection range ──────────────────
  if (opts.selectionStart >= 0 && opts.selectionEnd > opts.selectionStart && opts.audioBuffer) {
    const totalSamples = opts.audioBuffer.length;
    const selStartNorm = opts.selectionStart / totalSamples;
    const selEndNorm = opts.selectionEnd / totalSamples;
    const selX1 = normToX(selStartNorm);
    const selX2 = normToX(selEndNorm);
    
    ctx.fillStyle = COLORS.selection;
    ctx.fillRect(selX1, 0, selX2 - selX1, height);
    
    // Selection borders
    ctx.strokeStyle = COLORS.selectionBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(selX1, 0); ctx.lineTo(selX1, height);
    ctx.moveTo(selX2, 0); ctx.lineTo(selX2, height);
    ctx.stroke();
  }

  // ─── Loop region ─────────────────────
  if (opts.loopEnabled) {
    const loopStartX = normToX(opts.loopStart);
    const loopEndX = normToX(opts.loopEnd);

    ctx.fillStyle = COLORS.loop;
    ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, height);

    // Loop start line
    ctx.strokeStyle = COLORS.loopLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(loopStartX, 0); ctx.lineTo(loopStartX, height);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLoopHandle(ctx, loopStartX, height, 'loopStart', opts.activeDrag === 'loopStart', opts.loopType);

    // Loop end line
    ctx.strokeStyle = COLORS.loopLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(loopEndX, 0); ctx.lineTo(loopEndX, height);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLoopHandle(ctx, loopEndX, height, 'loopEnd', opts.activeDrag === 'loopEnd', opts.loopType);
  }

  // ─── Selected slice highlight ────────
  if (opts.selectedSliceId && opts.slices && opts.slices.length > 0 && opts.audioBuffer) {
    const totalFrames = opts.audioBuffer.length;
    const selectedSlice = opts.slices.find(s => s.id === opts.selectedSliceId);
    if (selectedSlice) {
      const startX = normToX(selectedSlice.startFrame / totalFrames);
      const endX = normToX(selectedSlice.endFrame / totalFrames);
      ctx.fillStyle = 'rgba(255, 165, 0, 0.15)'; // Orange tint
      ctx.fillRect(startX, 0, endX - startX, height);
    }
  }

  // ─── Slice markers ───────────────────
  if (opts.slices && opts.slices.length > 0 && opts.audioBuffer) {
    const totalFrames = opts.audioBuffer.length;
    ctx.lineWidth = 1;

    for (let i = 0; i < opts.slices.length; i++) {
      const slice = opts.slices[i];
      // Draw start boundary of each slice
      const startNorm = slice.startFrame / totalFrames;
      const startX = normToX(startNorm);

      // Only draw if in view
      if (startX >= 0 && startX <= width) {
        // Vary line style based on confidence
        const confidence = slice.confidence ?? 1.0;
        const lineWidth = 1 + confidence;  // 1-2px based on confidence
        const alpha = 0.5 + confidence * 0.5;  // 0.5-1.0 opacity

        // Dashed line with confidence-based styling
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;  // Purple with variable opacity
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;  // Reset

        // Slice number label
        ctx.fillStyle = `rgba(168, 85, 247, ${0.7 + confidence * 0.3})`;  // Label opacity 0.7-1.0
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText(String(i + 1), startX + 3, 11);
      }

      // Draw end boundary of last slice
      if (i === opts.slices.length - 1) {
        const endNorm = slice.endFrame / totalFrames;
        const endX = normToX(endNorm);
        if (endX >= 0 && endX <= width) {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = COLORS.sliceMarkerDim;
          ctx.beginPath();
          ctx.moveTo(endX, 0);
          ctx.lineTo(endX, height);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }

  // ─── Granular scan position ──────────
  if (opts.granularPosition != null && opts.granularPosition >= 0) {
    const scanNorm = opts.granularPosition / 100;
    const scanX = normToX(scanNorm);
    ctx.strokeStyle = COLORS.granular;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(scanX, 0); ctx.lineTo(scanX, height);
    ctx.stroke();
    ctx.fillStyle = COLORS.granular;
    ctx.font = '10px sans-serif';
    ctx.fillText('G', scanX + 3, height - 4);
  }

  // ─── 9xx offset markers ───────────────
  if (opts.offsetMarkers && opts.offsetMarkers.length > 0 && opts.audioBuffer) {
    const totalSamples = opts.audioBuffer.length;
    const viewStartSample = Math.floor(opts.viewStart * totalSamples);
    const viewEndSample = Math.floor(opts.viewEnd * totalSamples);
    const visibleSamples = viewEndSample - viewStartSample;

    ctx.save();
    const markerColor = 'rgba(0, 210, 210, 0.7)';
    const labelColor = 'rgba(0, 210, 210, 0.9)';

    for (const val of opts.offsetMarkers) {
      const samplePos = val * 128; // 9xx → sample index
      if (samplePos < viewStartSample || samplePos > viewEndSample) continue;

      const px = ((samplePos - viewStartSample) / visibleSamples) * width;

      // Vertical tick line (dashed)
      ctx.strokeStyle = markerColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = labelColor;
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`9${val.toString(16).toUpperCase().padStart(2, '0')}`, px, 10);
    }
    ctx.restore();
  }

  // ─── Playback position ───────────────
  if (opts.playbackPosition > 0) {
    const posX = normToX(opts.playbackPosition);
    ctx.strokeStyle = COLORS.playback;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(posX, 0); ctx.lineTo(posX, height);
    ctx.stroke();
  }
}

// ─── Handle drawing ────────────────────────────────────────────────────

function drawLoopHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  height: number,
  type: 'loopStart' | 'loopEnd',
  active: boolean,
  loopType: 'off' | 'forward' | 'pingpong',
): void {
  const isStart = type === 'loopStart';
  const color = active ? COLORS.loopActive : COLORS.loopLine;
  const symbol = loopType === 'pingpong' ? '↔' : (isStart ? '→' : '←');

  ctx.fillStyle = color;
  ctx.beginPath();
  if (isStart) {
    ctx.moveTo(x, height);
    ctx.lineTo(x + HANDLE_W, height);
    ctx.lineTo(x, height - HANDLE_H);
  } else {
    ctx.moveTo(x, height);
    ctx.lineTo(x - HANDLE_W, height);
    ctx.lineTo(x, height - HANDLE_H);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = COLORS.loopHandleText;
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText(symbol, isStart ? x + 1 : x - 9, height - 5);
}

// ─── Spectrum view ─────────────────────────────────────────────────────

function drawSpectrumView(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: WaveformDrawOptions,
): void {
  const buffer = opts.audioBuffer!;
  const channelData = buffer.getChannelData(0);
  const totalSamples = channelData.length;
  const viewStartSample = Math.floor(opts.viewStart * totalSamples);
  const viewEndSample = Math.floor(opts.viewEnd * totalSamples);

  const fftSize = 1024;
  const halfFFT = fftSize / 2;
  const numColumns = Math.min(width, Math.floor((viewEndSample - viewStartSample) / (fftSize / 4)));
  if (numColumns <= 0) return;
  
  const colWidth = width / numColumns;
  const hopSize = Math.floor((viewEndSample - viewStartSample) / numColumns);

  // Hann window
  const hann = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / fftSize));
  }

  for (let col = 0; col < numColumns; col++) {
    const offset = viewStartSample + col * hopSize;
    
    // Extract windowed frame
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      const idx = offset + i;
      real[i] = idx < totalSamples ? channelData[idx] * hann[i] : 0;
    }

    // DFT (simple radix-2 for power-of-2)
    fftInPlace(real, imag, fftSize);

    // Draw column
    const x = col * colWidth;
    for (let bin = 0; bin < halfFFT; bin++) {
      const mag = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin]) / halfFFT;
      const dB = 20 * Math.log10(Math.max(mag, 1e-10));
      const norm = Math.max(0, Math.min(1, (dB + 80) / 80)); // -80dB to 0dB

      // Map bin to Y (log frequency scale)
      const freqFrac = bin / halfFFT;
      const logFrac = Math.log2(1 + freqFrac * 15) / Math.log2(16); // log scale
      const y = height - logFrac * height;
      const binH = Math.max(1, height / halfFFT * 2);

      // Color: blue → red → yellow
      const r = norm < 0.5 ? norm * 2 * 239 : 239 + (norm - 0.5) * 2 * (251 - 239);
      const g = norm < 0.5 ? norm * 2 * 68 : 68 + (norm - 0.5) * 2 * (191 - 68);
      const b = norm < 0.5 ? 175 - norm * 2 * 107 : 68 - (norm - 0.5) * 2 * 68;

      ctx.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${0.3 + norm * 0.7})`;
      ctx.fillRect(x, y - binH / 2, colWidth, binH);
    }
  }

  // Draw overlays on top of spectrum too
  drawOverlays(ctx, width, height, opts);
}

// Simple in-place FFT (Cooley-Tukey radix-2 DIT)
function fftInPlace(real: Float32Array, imag: Float32Array, n: number): void {
  // Bit reversal
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (j > i) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) { j -= m; m >>= 1; }
    j += m;
  }
  // Butterfly
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const angle = -2 * Math.PI / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const tr = real[i + k + half] * wr - imag[i + k + half] * wi;
        const ti = real[i + k + half] * wi + imag[i + k + half] * wr;
        real[i + k + half] = real[i + k] - tr;
        imag[i + k + half] = imag[i + k] - ti;
        real[i + k] += tr;
        imag[i + k] += ti;
      }
    }
  }
}

// ─── Simplified (minimap) ──────────────────────────────────────────────

function drawSimplified(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: WaveformDrawOptions,
): void {
  const midY = height / 2;

  if (!opts.audioBuffer) return;

  const channelData = opts.audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;
  const samplesPerPixel = totalSamples / width;

  // Waveform
  ctx.strokeStyle = COLORS.waveformDim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    const sampleStart = Math.floor(x * samplesPerPixel);
    const sampleEnd = Math.floor((x + 1) * samplesPerPixel);
    let min = 1, max = -1;
    for (let i = sampleStart; i < sampleEnd && i < totalSamples; i++) {
      const val = channelData[i];
      if (val < min) min = val;
      if (val > max) max = val;
    }
    const minY = midY - min * midY * 0.8;
    const maxY = midY - max * midY * 0.8;
    if (x === 0) ctx.moveTo(x, minY);
    ctx.lineTo(x, minY);
    ctx.lineTo(x, maxY);
  }
  ctx.stroke();

  // Viewport rectangle
  if (opts.viewportRect) {
    const vpX = opts.viewportRect.start * width;
    const vpW = (opts.viewportRect.end - opts.viewportRect.start) * width;
    ctx.fillStyle = COLORS.viewport;
    ctx.fillRect(vpX, 0, vpW, height);
    ctx.strokeStyle = COLORS.viewportBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(vpX, 0, vpW, height);
  }

  // Selection indicator
  if (opts.selectionStart >= 0 && opts.selectionEnd > opts.selectionStart) {
    const selStartNorm = opts.selectionStart / totalSamples;
    const selEndNorm = opts.selectionEnd / totalSamples;
    ctx.fillStyle = COLORS.selection;
    ctx.fillRect(selStartNorm * width, 0, (selEndNorm - selStartNorm) * width, height);
  }
}
