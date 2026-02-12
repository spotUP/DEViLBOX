/**
 * AutomationLaneRenderer - Draws automation curves for arrangement tracks
 *
 * Renders connected line segments with control point dots and
 * a subtle fill gradient below the curve.
 * Supports interactive point editing (add, move, delete).
 */

import { ArrangementViewport } from './ArrangementViewport';
import type { TrackLayoutEntry } from './TrackLayout';
import type { TimelineAutomationLane, TimelineAutomationPoint } from '@/types/arrangement';

const POINT_RADIUS = 3;
const POINT_HIT_RADIUS = 8; // Larger hit area for easier clicking
const LINE_HIT_TOLERANCE = 6; // Distance from line to register click
const LINE_WIDTH = 1.5;
const AUTOMATION_LANE_HEIGHT = 40;

/**
 * Interpolate between two automation points based on curve type
 */
function interpolate(p1: TimelineAutomationPoint, p2: TimelineAutomationPoint, t: number): number {
  const curve = p1.curve || 'linear';
  const tension = p1.tension ?? 0.5;

  switch (curve) {
    case 'exponential':
      // Exponential curve - fast start, slow end
      return p1.value + (p2.value - p1.value) * Math.pow(t, 1 + tension * 3);

    case 'logarithmic':
      // Logarithmic curve - slow start, fast end
      return p1.value + (p2.value - p1.value) * (1 - Math.pow(1 - t, 1 + tension * 3));

    case 's-curve':
      // S-curve (smoothstep) - slow start and end, fast middle
      const smoothstep = t * t * (3 - 2 * t);
      return p1.value + (p2.value - p1.value) * smoothstep;

    case 'linear':
    default:
      // Linear interpolation
      return p1.value + (p2.value - p1.value) * t;
  }
}

export interface AutomationHitResult {
  type: 'point' | 'segment' | 'none';
  laneId: string;
  pointIndex?: number; // For 'point' type
  insertAfterIndex?: number; // For 'segment' type
  row?: number; // For 'segment' type - where to insert
  value?: number; // For 'segment' type - interpolated value
}

export class AutomationLaneRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    vp: ArrangementViewport,
    lanes: TimelineAutomationLane[],
    entries: TrackLayoutEntry[],
    activeLaneId?: string | null,
    activePointIndex?: number | null,
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
        const lane = trackLanes[i];
        const laneY = vp.trackYToScreenY(entry.automationY) + i * AUTOMATION_LANE_HEIGHT;
        const laneH = AUTOMATION_LANE_HEIGHT;

        if (laneY + laneH < 0 || laneY > vp.height) continue;

        const isActiveLane = activeLaneId === lane.id;
        this.drawLane(ctx, vp, lane, laneY, laneH, range.startRow, range.endRow, isActiveLane, activePointIndex ?? undefined);
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
    isActiveLane: boolean = false,
    activePointIndex?: number,
  ): void {
    const points = lane.points;
    if (points.length === 0) return;

    ctx.save();

    // Clip to lane bounds
    ctx.beginPath();
    ctx.rect(0, laneY, vp.width, laneH);
    ctx.clip();

    // Build path with curve interpolation
    const pathPoints: { x: number; y: number }[] = [];

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (pt.row > endRow + 10) break;

      const x = vp.rowToPixelX(pt.row);
      const y = laneY + laneH - pt.value * laneH;
      pathPoints.push({ x, y });

      // Add interpolated points between this point and the next
      if (i < points.length - 1) {
        const nextPt = points[i + 1];
        const rowDiff = nextPt.row - pt.row;

        // Only interpolate if points are far enough apart (> 4 pixels)
        if (rowDiff * vp.pixelsPerRow > 4) {
          const steps = Math.min(20, Math.floor(rowDiff * vp.pixelsPerRow / 4));

          for (let step = 1; step < steps; step++) {
            const t = step / steps;
            const interpRow = pt.row + rowDiff * t;
            const interpValue = interpolate(pt, nextPt, t);

            const interpX = vp.rowToPixelX(interpRow);
            const interpY = laneY + laneH - interpValue * laneH;
            pathPoints.push({ x: interpX, y: interpY });
          }
        }
      }
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
    for (let i = 0; i < pathPoints.length; i++) {
      const pt = pathPoints[i];
      if (pt.x < -POINT_RADIUS || pt.x > vp.width + POINT_RADIUS) continue;

      const isActivePoint = isActiveLane && activePointIndex === i;

      // Highlight active point
      if (isActivePoint) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, POINT_RADIUS + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, POINT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /**
   * Hit test automation lanes at a given canvas coordinate.
   * Returns which point was clicked or which segment to insert into.
   */
  hitTest(
    px: number,
    py: number,
    vp: ArrangementViewport,
    lanes: TimelineAutomationLane[],
    entries: TrackLayoutEntry[],
  ): AutomationHitResult {
    const entryMap = new Map(entries.map(e => [e.trackId, e]));

    // Group visible lanes by track
    const lanesByTrack = new Map<string, TimelineAutomationLane[]>();
    for (const lane of lanes) {
      if (!lane.visible || !lane.enabled || lane.points.length === 0) continue;
      const arr = lanesByTrack.get(lane.trackId) ?? [];
      arr.push(lane);
      lanesByTrack.set(lane.trackId, arr);
    }

    // Test each lane
    for (const [trackId, trackLanes] of lanesByTrack) {
      const entry = entryMap.get(trackId);
      if (!entry || !entry.visible || entry.automationHeight <= 0) continue;

      for (let i = 0; i < trackLanes.length; i++) {
        const lane = trackLanes[i];
        const laneY = vp.trackYToScreenY(entry.automationY) + i * AUTOMATION_LANE_HEIGHT;
        const laneH = AUTOMATION_LANE_HEIGHT;

        // Check if Y is within lane bounds
        if (py < laneY || py > laneY + laneH) continue;

        // Test points first (they have priority)
        for (let j = 0; j < lane.points.length; j++) {
          const pt = lane.points[j];
          const x = vp.rowToPixelX(pt.row);
          const y = laneY + laneH - pt.value * laneH;

          const dist = Math.hypot(px - x, py - y);
          if (dist <= POINT_HIT_RADIUS) {
            return {
              type: 'point',
              laneId: lane.id,
              pointIndex: j,
            };
          }
        }

        // Test line segments (for adding new points)
        for (let j = 0; j < lane.points.length - 1; j++) {
          const p1 = lane.points[j];
          const p2 = lane.points[j + 1];

          const x1 = vp.rowToPixelX(p1.row);
          const y1 = laneY + laneH - p1.value * laneH;
          const x2 = vp.rowToPixelX(p2.row);
          const y2 = laneY + laneH - p2.value * laneH;

          // Check if X is within segment bounds
          if (px < Math.min(x1, x2) || px > Math.max(x1, x2)) continue;

          // Calculate distance from point to line segment
          const lineLen = Math.hypot(x2 - x1, y2 - y1);
          if (lineLen < 0.1) continue; // Degenerate segment

          const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (lineLen * lineLen)));
          const projX = x1 + t * (x2 - x1);
          const projY = y1 + t * (y2 - y1);
          const dist = Math.hypot(px - projX, py - projY);

          if (dist <= LINE_HIT_TOLERANCE) {
            // Calculate row and value for insertion
            const row = Math.round(vp.pixelXToRow(px));
            const value = Math.max(0, Math.min(1, (laneY + laneH - py) / laneH));

            return {
              type: 'segment',
              laneId: lane.id,
              insertAfterIndex: j,
              row,
              value,
            };
          }
        }
      }
    }

    return { type: 'none', laneId: '' };
  }

  /**
   * Get the screen position of an automation point.
   */
  getPointScreenPos(
    point: TimelineAutomationPoint,
    vp: ArrangementViewport,
    _lane: TimelineAutomationLane,
    entry: TrackLayoutEntry,
    laneIndex: number,
  ): { x: number; y: number } {
    const laneY = vp.trackYToScreenY(entry.automationY) + laneIndex * AUTOMATION_LANE_HEIGHT;
    const laneH = AUTOMATION_LANE_HEIGHT;
    const x = vp.rowToPixelX(point.row);
    const y = laneY + laneH - point.value * laneH;
    return { x, y };
  }
}
