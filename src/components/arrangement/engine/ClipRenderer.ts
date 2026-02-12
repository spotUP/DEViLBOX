/**
 * ClipRenderer - Draws arrangement clips with rich DAW-quality visuals
 *
 * Handles:
 * - Clip body (rounded rectangle with gradient fill)
 * - Top color header bar (4px, full saturation, like Ableton clips)
 * - Subtle inner shadows at top/bottom edges
 * - Clip name label (bold, slight text shadow)
 * - Note density preview (mini horizontal lines for each note)
 * - Selection ring
 * - Muted overlay
 * - Resize handles (gradient fade instead of solid blocks)
 * - Ghost clips during drag
 */

import { ArrangementViewport } from './ArrangementViewport';
import type { TrackLayoutEntry } from './TrackLayout';
import type { ArrangementClip, ArrangementTrack } from '@/types/arrangement';
import type { Pattern } from '@/types/tracker';

const CLIP_RADIUS = 4;
const CLIP_PADDING = 1;
const HANDLE_WIDTH = 6;
const HEADER_BAR_HEIGHT = 4;
const LABEL_HEIGHT = 16;
const LABEL_FONT = 'bold 10px Inter, system-ui, sans-serif';

// Note density preview cache
interface PreviewCacheEntry {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
}

const MAX_CACHE_SIZE = 64;

/** Parse hex color to {r,g,b} */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h.slice(0, 6), 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export class ClipRenderer {
  private previewCache = new Map<string, PreviewCacheEntry>();

  /**
   * Render all clips for visible tracks.
   */
  render(
    ctx: CanvasRenderingContext2D,
    vp: ArrangementViewport,
    clips: ArrangementClip[],
    tracks: ArrangementTrack[],
    entries: TrackLayoutEntry[],
    patterns: Pattern[],
    selectedClipIds: Set<string>,
    ghostClips: ArrangementClip[] | null,
    playbackRow?: number,
    isPlaying?: boolean,
    hoveredClipId?: string | null,
  ): void {
    const trackMap = new Map(tracks.map(t => [t.id, t]));
    const entryMap = new Map(entries.map(e => [e.trackId, e]));
    const patternMap = new Map(patterns.map(p => [p.id, p]));
    const range = vp.getVisibleRowRange();

    // Virtual scrolling: Pre-filter visible clips
    const visibleClips = clips.filter(clip => {
      const pattern = patternMap.get(clip.patternId);
      const clipLen = clip.clipLengthRows ?? (pattern ? pattern.length - clip.offsetRows : 64);
      const clipEnd = clip.startRow + clipLen;

      // Include clips that overlap with visible range (with small buffer)
      const buffer = 10;
      return clipEnd >= range.startRow - buffer && clip.startRow <= range.endRow + buffer;
    });

    // Draw regular clips (pre-filtered for performance)
    for (const clip of visibleClips) {
      const entry = entryMap.get(clip.trackId);
      if (!entry || !entry.visible) continue;
      const track = trackMap.get(clip.trackId);
      if (!track) continue;

      const pattern = patternMap.get(clip.patternId);
      const clipLen = clip.clipLengthRows ?? (pattern ? pattern.length - clip.offsetRows : 64);
      const clipEnd = clip.startRow + clipLen;

      const selected = selectedClipIds.has(clip.id);
      const isActive = isPlaying && playbackRow !== undefined && playbackRow >= clip.startRow && playbackRow < clipEnd;
      const isHovered = hoveredClipId === clip.id;
      this.drawClip(ctx, vp, clip, track, entry, pattern, clipLen, selected, false, isActive, playbackRow, isHovered);
    }

    // Draw ghost clips (drag preview)
    if (ghostClips) {
      for (const clip of ghostClips) {
        const entry = entryMap.get(clip.trackId);
        if (!entry || !entry.visible) continue;
        const track = trackMap.get(clip.trackId);
        if (!track) continue;

        const pattern = patternMap.get(clip.patternId);
        const clipLen = clip.clipLengthRows ?? (pattern ? pattern.length - clip.offsetRows : 64);
        this.drawClip(ctx, vp, clip, track, entry, pattern, clipLen, false, true, false, undefined, false);
      }
    }
  }

  private drawClip(
    ctx: CanvasRenderingContext2D,
    vp: ArrangementViewport,
    clip: ArrangementClip,
    track: ArrangementTrack,
    entry: TrackLayoutEntry,
    pattern: Pattern | undefined,
    clipLen: number,
    selected: boolean,
    ghost: boolean,
    isActive: boolean = false,
    playbackRow?: number,
    isHovered: boolean = false,
  ): void {
    const x = vp.rowToPixelX(clip.startRow) + CLIP_PADDING;
    const y = vp.trackYToScreenY(entry.y) + CLIP_PADDING;
    const w = clipLen * vp.pixelsPerRow - CLIP_PADDING * 2;
    const h = entry.bodyHeight - CLIP_PADDING * 2;

    if (w < 2 || h < 4) return;

    const color = clip.color ?? track.color ?? '#3b82f6';
    const rgb = hexToRgb(color);

    ctx.save();

    if (ghost) {
      ctx.globalAlpha = 0.4;
    }

    // Clip body - rounded rectangle
    ctx.beginPath();
    this.roundRect(ctx, x, y, w, h, CLIP_RADIUS);

    // Gradient fill (lighter top -> darker bottom)
    if (clip.muted) {
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.18)`;
    } else {
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.55)`);
      grad.addColorStop(1, `rgba(${Math.floor(rgb.r * 0.6)},${Math.floor(rgb.g * 0.6)},${Math.floor(rgb.b * 0.6)},0.45)`);
      ctx.fillStyle = grad;
    }
    ctx.fill();

    // Border
    if (selected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (isHovered && !ghost) {
      ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.9)`;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.7)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Ghost clips: dashed outline
    if (ghost) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#ffffffaa';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Clip to clip bounds for inner content
    ctx.beginPath();
    this.roundRect(ctx, x, y, w, h, CLIP_RADIUS);
    ctx.clip();

    // Top color header bar (full saturation, like Ableton)
    if (!clip.muted) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, HEADER_BAR_HEIGHT);
    } else {
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`;
      ctx.fillRect(x, y, w, HEADER_BAR_HEIGHT);
    }

    // Inner shadow at top edge (subtle highlight)
    const topShadow = ctx.createLinearGradient(x, y + HEADER_BAR_HEIGHT, x, y + HEADER_BAR_HEIGHT + 6);
    topShadow.addColorStop(0, 'rgba(255,255,255,0.07)');
    topShadow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = topShadow;
    ctx.fillRect(x, y + HEADER_BAR_HEIGHT, w, 6);

    // Inner shadow at bottom edge (subtle darkening)
    const bottomShadow = ctx.createLinearGradient(x, y + h - 8, x, y + h);
    bottomShadow.addColorStop(0, 'rgba(0,0,0,0)');
    bottomShadow.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = bottomShadow;
    ctx.fillRect(x, y + h - 8, w, 8);

    // Note density preview (if clip is wide enough and we have pattern data)
    if (w > 20 && h > 20 && pattern) {
      this.drawNoteDensityPreview(ctx, vp, clip, pattern, x, y + LABEL_HEIGHT, w, h - LABEL_HEIGHT);
    }

    // Clip name label (bold, with text shadow)
    if (w > 30) {
      const label = pattern?.name ?? clip.patternId;
      const maxLabelWidth = w - 8;

      // Text shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = LABEL_FONT;
      ctx.textBaseline = 'top';
      ctx.fillText(label, x + 5, y + HEADER_BAR_HEIGHT + 3, maxLabelWidth);

      // Label text
      ctx.fillStyle = clip.muted ? '#ffffff55' : '#ffffffee';
      ctx.fillText(label, x + 4, y + HEADER_BAR_HEIGHT + 2, maxLabelWidth);
    }

    // Active clip playback feedback (progress bar + glow)
    if (isActive && playbackRow !== undefined && !ghost) {
      const progress = (playbackRow - clip.startRow) / clipLen;
      const progressX = x + (w * progress);

      // Subtle fill up to playback position
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.2)`;
      ctx.fillRect(x, y, progressX - x, h);

      // Glowing vertical line at playback position
      const glowGrad = ctx.createLinearGradient(progressX - 4, y, progressX + 4, y);
      glowGrad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      glowGrad.addColorStop(0.5, `rgba(${Math.min(255, rgb.r + 60)},${Math.min(255, rgb.g + 60)},${Math.min(255, rgb.b + 60)},0.8)`);
      glowGrad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      ctx.fillStyle = glowGrad;
      ctx.fillRect(progressX - 4, y, 8, h);

      // Bright center line
      ctx.strokeStyle = `rgba(255,255,255,0.9)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(progressX, y);
      ctx.lineTo(progressX, y + h);
      ctx.stroke();

      // Enhanced top bar for active clips
      ctx.fillStyle = `rgba(255,255,255,0.15)`;
      ctx.fillRect(x, y, w, HEADER_BAR_HEIGHT);
    }

    // Fade in overlay
    if (clip.fadeInRows && clip.fadeInRows > 0 && !ghost) {
      const fadeWidth = Math.min(w * 0.4, clip.fadeInRows * vp.pixelsPerRow);
      if (fadeWidth > 2) {
        const fadeCurve = clip.fadeInCurve || 'linear';
        const gradient = ctx.createLinearGradient(x, y, x + fadeWidth, y);

        if (fadeCurve === 'exponential') {
          // Dark to transparent (exponential)
          gradient.addColorStop(0, 'rgba(0,0,0,0.6)');
          gradient.addColorStop(0.3, 'rgba(0,0,0,0.3)');
          gradient.addColorStop(1, 'rgba(0,0,0,0)');
        } else if (fadeCurve === 'logarithmic') {
          // Dark to transparent (logarithmic)
          gradient.addColorStop(0, 'rgba(0,0,0,0.6)');
          gradient.addColorStop(0.7, 'rgba(0,0,0,0.3)');
          gradient.addColorStop(1, 'rgba(0,0,0,0)');
        } else {
          // Linear
          gradient.addColorStop(0, 'rgba(0,0,0,0.5)');
          gradient.addColorStop(1, 'rgba(0,0,0,0)');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, fadeWidth, h);

        // Fade handle (small triangle at fade end)
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(x + fadeWidth - 6, y);
        ctx.lineTo(x + fadeWidth, y);
        ctx.lineTo(x + fadeWidth, y + 6);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Fade out overlay
    if (clip.fadeOutRows && clip.fadeOutRows > 0 && !ghost) {
      const fadeWidth = Math.min(w * 0.4, clip.fadeOutRows * vp.pixelsPerRow);
      if (fadeWidth > 2) {
        const fadeCurve = clip.fadeOutCurve || 'linear';
        const gradient = ctx.createLinearGradient(x + w - fadeWidth, y, x + w, y);

        if (fadeCurve === 'exponential') {
          gradient.addColorStop(0, 'rgba(0,0,0,0)');
          gradient.addColorStop(0.7, 'rgba(0,0,0,0.3)');
          gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
        } else if (fadeCurve === 'logarithmic') {
          gradient.addColorStop(0, 'rgba(0,0,0,0)');
          gradient.addColorStop(0.3, 'rgba(0,0,0,0.3)');
          gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
        } else {
          gradient.addColorStop(0, 'rgba(0,0,0,0)');
          gradient.addColorStop(1, 'rgba(0,0,0,0.5)');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(x + w - fadeWidth, y, fadeWidth, h);

        // Fade handle (small triangle at fade start)
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(x + w - fadeWidth, y);
        ctx.lineTo(x + w - fadeWidth + 6, y);
        ctx.lineTo(x + w - fadeWidth, y + 6);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Muted overlay
    if (clip.muted && !ghost) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x, y, w, h);

      // Diagonal lines pattern for muted
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      for (let i = -h; i < w; i += 8) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i + h, y + h);
        ctx.stroke();
      }
    }

    // Resize handles (gradient fade instead of solid blocks)
    if (selected && !ghost && w > HANDLE_WIDTH * 4) {
      // Left handle - gradient fade from white to transparent
      const leftGrad = ctx.createLinearGradient(x, y, x + HANDLE_WIDTH, y);
      leftGrad.addColorStop(0, 'rgba(255,255,255,0.25)');
      leftGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = leftGrad;
      ctx.fillRect(x, y, HANDLE_WIDTH, h);

      // Right handle - gradient fade from transparent to white
      const rightGrad = ctx.createLinearGradient(x + w - HANDLE_WIDTH, y, x + w, y);
      rightGrad.addColorStop(0, 'rgba(255,255,255,0)');
      rightGrad.addColorStop(1, 'rgba(255,255,255,0.25)');
      ctx.fillStyle = rightGrad;
      ctx.fillRect(x + w - HANDLE_WIDTH, y, HANDLE_WIDTH, h);
    }

    ctx.restore();
  }

  /**
   * Draw note density preview inside a clip.
   * Shows tiny horizontal bars for each note event.
   */
  private drawNoteDensityPreview(
    ctx: CanvasRenderingContext2D,
    _vp: ArrangementViewport,
    clip: ArrangementClip,
    pattern: Pattern,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const channel = pattern.channels[clip.sourceChannelIndex];
    if (!channel) return;

    const previewW = Math.round(w);
    const previewH = Math.round(h);
    if (previewW < 10 || previewH < 10) return;

    // Check cache
    const cacheKey = `${clip.patternId}_${clip.sourceChannelIndex}_${previewW}_${previewH}`;
    let cached = this.previewCache.get(cacheKey);

    if (!cached) {
      // Evict oldest entries if cache is full
      if (this.previewCache.size >= MAX_CACHE_SIZE) {
        const firstKey = this.previewCache.keys().next().value;
        if (firstKey) this.previewCache.delete(firstKey);
      }

      // Generate preview
      const offscreen = new OffscreenCanvas(previewW, previewH);
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return;

      // Scan notes
      const rows = channel.rows;
      const clipLen = clip.clipLengthRows ?? (pattern.length - clip.offsetRows);
      const startOffset = clip.offsetRows;

      // Find note range
      let minNote = 127;
      let maxNote = 0;
      for (let r = startOffset; r < startOffset + clipLen && r < rows.length; r++) {
        const note = rows[r]?.note ?? 0;
        if (note > 0 && note < 97) {
          const midi = note + 11;
          if (midi < minNote) minNote = midi;
          if (midi > maxNote) maxNote = midi;
        }
      }

      if (minNote > maxNote) {
        // No notes, nothing to draw
        cached = { canvas: offscreen, width: previewW, height: previewH };
        this.previewCache.set(cacheKey, cached);
        return;
      }

      // Add padding to range
      minNote = Math.max(0, minNote - 2);
      maxNote = Math.min(127, maxNote + 2);
      const noteRange = maxNote - minNote + 1;

      offCtx.fillStyle = 'rgba(255,255,255,0.35)';

      for (let r = startOffset; r < startOffset + clipLen && r < rows.length; r++) {
        const note = rows[r]?.note ?? 0;
        if (note <= 0 || note >= 97) continue;

        const midi = note + 11;
        const rx = ((r - startOffset) / clipLen) * previewW;
        const ry = ((maxNote - midi) / noteRange) * previewH;
        const rw = Math.max(1, previewW / clipLen);
        const rh = Math.max(1, previewH / noteRange);

        offCtx.fillRect(rx, ry, rw, rh);
      }

      cached = { canvas: offscreen, width: previewW, height: previewH };
      this.previewCache.set(cacheKey, cached);
    }

    ctx.drawImage(cached.canvas, x, y, previewW, previewH);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /** Invalidate note density preview cache (call when pattern data changes) */
  invalidateCache(patternId?: string): void {
    if (patternId) {
      const toDelete = [...this.previewCache.keys()].filter(k => k.startsWith(patternId));
      for (const key of toDelete) this.previewCache.delete(key);
    } else {
      this.previewCache.clear();
    }
  }

  /** Release all cached resources */
  dispose(): void {
    this.previewCache.clear();
  }
}
