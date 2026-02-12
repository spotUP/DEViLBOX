/**
 * AutomationLaneRenderer - Draws automation curves for arrangement tracks
 *
 * Renders connected line segments with control point dots and
 * a subtle fill gradient below the curve.
 */

import { ArrangementViewport } from './ArrangementViewport';
import type { TrackLayoutEntry } from './TrackLayout';
import type { TimelineAutomationLane } from '@/types/arrangement';

const POINT_RADIUS = 3;
const LINE_WIDTH = 1.5;
const AUTOMATION_LANE_HEIGHT = 40;

export class AutomationLaneRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    vp: ArrangementViewport,
    lanes: TimelineAutomationLane[],
    entries: TrackLayoutEntry[],
  ): void {
    const entryMap = new Map(entries.map(e => [e.trackId, e]));
    const range = vp.getVisibleRowRange();

    // Group visible lanes by track to compute per-lane Y offsets
    const lanesByTrack = new Map<string, TimelineAutomationLane[]>();
    for (const lane of lanes) {
      if (!lane.visible || !lane.enabled || lane.points.length === 0) continue;
      const arr = lanesByTrack.get(lane.trackId) ?? [];
      arr.push(lane);
      lanesByTrack.set(lane.trackId, arr);
    }

    for (const [trackId, trackLanes] of lanesByTrack) {
      const entry = entryMap.get(trackId);
      if (!entry || !entry.visible || entry.automationHeight <= 0) continue;

      for (let i = 0; i < trackLanes.length; i++) {
        const laneY = vp.trackYToScreenY(entry.automationY) + i * AUTOMATION_LANE_HEIGHT;
        const laneH = AUTOMATION_LANE_HEIGHT;

        if (laneY + laneH < 0 || laneY > vp.height) continue;

        this.drawLane(ctx, vp, trackLanes[i], laneY, laneH, range.startRow, range.endRow);
      }
    }
  }

  private drawLane(
    ctx: CanvasRenderingContext2D,
    vp: ArrangementViewport,
    lane: TimelineAutomationLane,
    laneY: number,
    laneH: number,
    _startRow: number,
    endRow: number,
  ): void {
    const points = lane.points;
    if (points.length === 0) return;

    ctx.save();

    // Clip to lane bounds
    ctx.beginPath();
    ctx.rect(0, laneY, vp.width, laneH);
    ctx.clip();

    // Build path
    const pathPoints: { x: number; y: number }[] = [];
    for (const pt of points) {
      if (pt.row > endRow + 10) break;
      const x = vp.rowToPixelX(pt.row);
      const y = laneY + laneH - pt.value * laneH;
      pathPoints.push({ x, y });
    }

    if (pathPoints.length === 0) {
      ctx.restore();
      return;
    }

    // Fill below curve
    ctx.beginPath();
    ctx.moveTo(pathPoints[0].x, laneY + laneH);
    for (const pt of pathPoints) {
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.lineTo(pathPoints[pathPoints.length - 1].x, laneY + laneH);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, laneY, 0, laneY + laneH);
    gradient.addColorStop(0, 'rgba(59,130,246,0.2)');
    gradient.addColorStop(1, 'rgba(59,130,246,0.02)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
    for (let i = 1; i < pathPoints.length; i++) {
      ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
    }
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = LINE_WIDTH;
    ctx.stroke();

    // Draw control points
    ctx.fillStyle = '#3b82f6';
    for (const pt of pathPoints) {
      if (pt.x < -POINT_RADIUS || pt.x > vp.width + POINT_RADIUS) continue;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
