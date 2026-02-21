/**
 * PixiArrangementCanvas — Main arrangement grid with timeline, clips, and automation.
 * Renders grid lines, clip rectangles, playhead, and selection region.
 */

import { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';

/** Pre-processed clip data ready for rendering */
export interface ClipRenderData {
  id: string;
  startRow: number;
  lengthRows: number;
  trackIndex: number;
  color: number;
  name: string;
  muted: boolean;
  selected: boolean;
}

interface PixiArrangementCanvasProps {
  width: number;
  height: number;
  /** Beats per bar */
  beatsPerBar?: number;
  /** Pixels per beat (zoom level) */
  pixelsPerBeat?: number;
  /** Scroll offset in beats */
  scrollBeat?: number;
  /** Total beats in the arrangement */
  totalBeats?: number;
  /** Current playback beat position */
  playbackBeat?: number;
  /** Pre-processed clips for rendering */
  clips?: ClipRenderData[];
  /** Track height in pixels */
  trackHeight?: number;
}

const CLIP_PADDING = 2;

export const PixiArrangementCanvas: React.FC<PixiArrangementCanvasProps> = ({
  width,
  height,
  beatsPerBar = 4,
  pixelsPerBeat = 20,
  scrollBeat = 0,
  totalBeats = 128,
  playbackBeat,
  clips = [],
  trackHeight = 40,
}) => {
  const theme = usePixiTheme();

  const RULER_HEIGHT = 24;
  const gridHeight = height - RULER_HEIGHT;

  const drawGrid = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });

    // Ruler background
    g.rect(0, 0, width, RULER_HEIGHT);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, RULER_HEIGHT - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });

    // Track row separators
    const numTracks = clips.length > 0
      ? Math.max(...clips.map(c => c.trackIndex)) + 1
      : 0;
    for (let t = 1; t <= numTracks; t++) {
      const ty = RULER_HEIGHT + t * trackHeight;
      if (ty > height) break;
      g.rect(0, ty, width, 1);
      g.fill({ color: theme.border.color, alpha: 0.15 });
    }

    // Grid lines
    const startBeat = Math.floor(scrollBeat);
    const endBeat = Math.ceil(scrollBeat + width / pixelsPerBeat);

    for (let beat = startBeat; beat <= Math.min(endBeat, totalBeats); beat++) {
      const x = (beat - scrollBeat) * pixelsPerBeat;
      if (x < 0 || x > width) continue;

      const isBar = beat % beatsPerBar === 0;

      // Vertical grid line
      g.rect(x, RULER_HEIGHT, 1, gridHeight);
      g.fill({ color: theme.border.color, alpha: isBar ? 0.3 : 0.1 });

      // Ruler tick + label
      if (isBar) {
        g.rect(x, RULER_HEIGHT - 8, 1, 8);
        g.fill({ color: theme.textMuted.color, alpha: 0.5 });
      }
    }

    // Clips
    for (const clip of clips) {
      const cx = (clip.startRow - scrollBeat) * pixelsPerBeat;
      const cw = clip.lengthRows * pixelsPerBeat;
      const cy = RULER_HEIGHT + clip.trackIndex * trackHeight + CLIP_PADDING;
      const ch = trackHeight - CLIP_PADDING * 2;

      // Skip clips outside visible range
      if (cx + cw < 0 || cx > width) continue;

      // Clip body
      g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, ch, 3);
      g.fill({ color: clip.color, alpha: clip.muted ? 0.15 : 0.35 });

      // Clip top color bar (4px header)
      g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, 4, 3);
      g.fill({ color: clip.color, alpha: clip.muted ? 0.3 : 0.8 });

      // Clip border
      g.roundRect(cx + CLIP_PADDING, cy, cw - CLIP_PADDING * 2, ch, 3);
      g.stroke({
        color: clip.selected ? 0xffffff : clip.color,
        alpha: clip.selected ? 0.8 : 0.4,
        width: clip.selected ? 2 : 1,
      });

      // Playback progress within clip
      if (playbackBeat != null && playbackBeat >= clip.startRow && playbackBeat < clip.startRow + clip.lengthRows) {
        const progress = (playbackBeat - clip.startRow) / clip.lengthRows;
        const pw = Math.max(2, progress * (cw - CLIP_PADDING * 4));
        g.roundRect(cx + CLIP_PADDING + 1, cy + 1, pw, ch - 2, 2);
        g.fill({ color: clip.color, alpha: 0.2 });
      }
    }

    // Playhead (drawn last, on top)
    if (playbackBeat != null) {
      const px = (playbackBeat - scrollBeat) * pixelsPerBeat;
      if (px >= 0 && px <= width) {
        g.rect(px, 0, 2, height);
        g.fill({ color: theme.accent.color, alpha: 0.8 });
      }
    }
  }, [width, height, scrollBeat, pixelsPerBeat, totalBeats, beatsPerBar, playbackBeat, theme, RULER_HEIGHT, gridHeight, clips, trackHeight]);

  // Ruler bar numbers
  const barLabels = useMemo(() => {
    const labels: { x: number; text: string }[] = [];
    const startBeat = Math.floor(scrollBeat);
    const endBeat = Math.ceil(scrollBeat + width / pixelsPerBeat);
    for (let beat = startBeat; beat <= Math.min(endBeat, totalBeats); beat++) {
      if (beat % beatsPerBar === 0) {
        const x = (beat - scrollBeat) * pixelsPerBeat;
        if (x >= 0 && x <= width) {
          labels.push({ x, text: String(Math.floor(beat / beatsPerBar) + 1) });
        }
      }
    }
    return labels;
  }, [scrollBeat, width, pixelsPerBeat, totalBeats, beatsPerBar]);

  // Visible clip labels
  const clipLabels = useMemo(() => {
    const labels: { x: number; y: number; text: string; color: number; muted: boolean }[] = [];
    for (const clip of clips) {
      const cx = (clip.startRow - scrollBeat) * pixelsPerBeat;
      const cw = clip.lengthRows * pixelsPerBeat;
      if (cx + cw < 0 || cx > width) continue;
      // Only show label if clip is wide enough
      if (cw > 30) {
        labels.push({
          x: cx + CLIP_PADDING + 4,
          y: RULER_HEIGHT + clip.trackIndex * trackHeight + CLIP_PADDING + 6,
          text: clip.name.length > 20 ? clip.name.slice(0, 18) + '..' : clip.name,
          color: clip.color,
          muted: clip.muted,
        });
      }
    }
    return labels;
  }, [clips, scrollBeat, pixelsPerBeat, width, trackHeight]);

  return (
    <pixiContainer layout={{ width, height }}>
      <pixiGraphics draw={drawGrid} layout={{ position: 'absolute', width, height }} />

      {/* Bar number labels */}
      {barLabels.map(({ x, text }) => (
        <pixiBitmapText
          key={`bar-${text}`}
          text={text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ position: 'absolute', left: x + 3, top: 3 }}
        />
      ))}

      {/* Clip name labels */}
      {clipLabels.map(({ x, y, text, color, muted }) => (
        <pixiBitmapText
          key={`clip-${text}-${x}`}
          text={text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
          tint={muted ? theme.textMuted.color : color}
          alpha={muted ? 0.5 : 0.9}
          layout={{ position: 'absolute', left: x, top: y }}
        />
      ))}
    </pixiContainer>
  );
};
