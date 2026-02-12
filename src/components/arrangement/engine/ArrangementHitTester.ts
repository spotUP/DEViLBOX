/**
 * ArrangementHitTester - Spatial hit detection for arrangement canvas
 *
 * Detects clicks on clips (body, resize handles), empty areas,
 * and supports rubber-band selection.
 *
 * Adapted from src/components/pianoroll/engine/HitTester.ts
 */

import { ArrangementViewport } from './ArrangementViewport';
import type { TrackLayout } from './TrackLayout';
import type { ArrangementClip, ArrangementTrack } from '@/types/arrangement';
import type { Pattern } from '@/types/tracker';

const HANDLE_WIDTH = 6;

export type ClipHitZone = 'body' | 'resize-start' | 'resize-end';

export type HitTestResult =
  | { type: 'clip'; clipId: string; zone: ClipHitZone; trackId: string; row: number }
  | { type: 'empty'; trackId: string; trackIndex: number; row: number }
  | { type: 'ruler'; row: number }
  | { type: 'track-resize'; trackId: string }
  | { type: 'automation'; trackId: string; row: number }
  | { type: 'none' };

interface ClipRect {
  clip: ArrangementClip;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class ArrangementHitTester {
  private clipRects: ClipRect[] = [];

  /**
   * Rebuild the spatial index from clips and current viewport/layout.
   */
  rebuild(
    clips: ArrangementClip[],
    _tracks: ArrangementTrack[],
    patterns: Pattern[],
    vp: ArrangementViewport,
    layout: TrackLayout,
  ): void {
    const patternMap = new Map(patterns.map(p => [p.id, p]));

    this.clipRects = [];

    for (const clip of clips) {
      const entry = layout.getEntryForTrack(clip.trackId);
      if (!entry || !entry.visible) continue;

      const pattern = patternMap.get(clip.patternId);
      const clipLen = clip.clipLengthRows ?? (pattern ? pattern.length - clip.offsetRows : 64);

      const x = vp.rowToPixelX(clip.startRow);
      const y = vp.trackYToScreenY(entry.y);
      const w = clipLen * vp.pixelsPerRow;
      const h = entry.bodyHeight;

      this.clipRects.push({ clip, x, y, w, h });
    }
  }

  /**
   * Test a point (canvas CSS coordinates) against all clips and layout.
   */
  hitTest(
    px: number,
    py: number,
    vp: ArrangementViewport,
    layout: TrackLayout,
    rulerHeight: number,
  ): HitTestResult {
    // Ruler area
    if (py < rulerHeight) {
      return { type: 'ruler', row: Math.max(0, Math.round(vp.pixelXToRow(px))) };
    }

    // Adjust py for ruler offset
    const canvasY = py - rulerHeight;
    const row = Math.max(0, Math.round(vp.pixelXToRow(px)));

    // Check clips (last drawn = topmost)
    let bestClip: ClipRect | null = null;
    let bestZone: ClipHitZone = 'body';

    for (const r of this.clipRects) {
      const adjustedY = r.y;
      if (px < r.x || px > r.x + r.w) continue;
      if (canvasY < adjustedY || canvasY > adjustedY + r.h) continue;

      const relX = px - r.x;
      let zone: ClipHitZone = 'body';
      if (relX <= HANDLE_WIDTH && r.w > HANDLE_WIDTH * 3) {
        zone = 'resize-start';
      } else if (relX >= r.w - HANDLE_WIDTH && r.w > HANDLE_WIDTH * 3) {
        zone = 'resize-end';
      }

      bestClip = r;
      bestZone = zone;
    }

    if (bestClip) {
      return {
        type: 'clip',
        clipId: bestClip.clip.id,
        zone: bestZone,
        trackId: bestClip.clip.trackId,
        row,
      };
    }

    // Check track layout
    const trackSpaceY = vp.screenYToTrackY(canvasY);
    const trackHit = layout.hitTestY(trackSpaceY);

    if (trackHit) {
      if (trackHit.zone === 'resize-handle') {
        return { type: 'track-resize', trackId: trackHit.trackId };
      }
      if (trackHit.zone === 'automation') {
        return { type: 'automation', trackId: trackHit.trackId, row };
      }
      return { type: 'empty', trackId: trackHit.trackId, trackIndex: trackHit.trackIndex, row };
    }

    return { type: 'none' };
  }

  /**
   * Find all clips within a rectangular selection box (canvas CSS coords).
   */
  findClipsInRect(x1: number, y1: number, x2: number, y2: number): string[] {
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);

    const result: string[] = [];
    for (const r of this.clipRects) {
      if (r.x + r.w < left || r.x > right) continue;
      if (r.y + r.h < top || r.y > bottom) continue;
      result.push(r.clip.id);
    }
    return result;
  }

  /**
   * Get the cursor style for a given hit result and tool.
   */
  getCursor(hit: HitTestResult, tool: string): string {
    if (tool === 'draw') return 'crosshair';
    if (tool === 'erase') return 'not-allowed';
    if (tool === 'split') return 'col-resize';

    if (hit.type === 'clip') {
      switch (hit.zone) {
        case 'resize-start':
        case 'resize-end':
          return 'ew-resize';
        case 'body':
          return 'move';
      }
    }

    if (hit.type === 'track-resize') return 'ns-resize';
    if (hit.type === 'ruler') return 'pointer';

    return 'default';
  }
}
