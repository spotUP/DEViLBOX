/**
 * Cable routing utilities for modular synth patch cables
 *
 * Implements orthogonal (Manhattan-style) routing that avoids UI elements
 * and creates clean 90-degree paths between ports.
 */

export interface Point {
  x: number;
  y: number;
}

export interface RoutingOptions {
  horizontalFirst?: boolean; // Start with horizontal segment
  bendRadius?: number; // Radius for rounded corners (0 = sharp 90-degree)
  padding?: number; // Extra space around obstacles
  laneOffset?: number; // Horizontal lane offset for cable spreading (0 = center)
  obstacles?: { x: number; y: number; w: number; h: number }[]; // Module bounding boxes
}

/**
 * Calculate orthogonal path waypoints between two points
 *
 * Creates a path with horizontal and vertical segments only.
 * The path uses smart heuristics to route around the middle area.
 */
export function calculateOrthogonalPath(
  start: Point,
  end: Point,
  options: RoutingOptions = {}
): Point[] {
  const {
    horizontalFirst = true,
    laneOffset = 0,
    obstacles = [],
  } = options;

  const waypoints: Point[] = [start];

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // If ports are horizontally aligned, route with single vertical bend
  if (Math.abs(dy) < 5) {
    waypoints.push(end);
    return waypoints;
  }

  // If ports are vertically aligned, route with single horizontal bend
  if (Math.abs(dx) < 5) {
    waypoints.push(end);
    return waypoints;
  }

  // Standard orthogonal routing with balanced spacing
  // Creates paths with equal space above and below horizontal segments

  const isInputOnLeft = dx > 0; // Source is left, target is right

  // Calculate routing waypoints with cable spreading
  const baseHorizontalOffset = 30; // Base horizontal exit/entry distance from ports
  const laneSpacing = 10; // Horizontal spacing between parallel cables
  const horizontalOffset = baseHorizontalOffset + (Math.abs(laneOffset) * laneSpacing);

  // Padding around modules
  const padding = 20;

  // Find all modules that are horizontally between the start and end points
  const minX = Math.min(start.x, end.x) - padding;
  const maxX = Math.max(start.x, end.x) + padding;
  
  const relevantObstacles = obstacles.filter(obs => {
    const obsMaxX = obs.x + obs.w;
    return obsMaxX > minX && obs.x < maxX;
  });

  // Calculate a Y coordinate that clears all relevant obstacles
  let horizontalY: number;
  
  if (relevantObstacles.length === 0) {
    // No obstacles, use simple middle-gap heuristic
    horizontalY = (start.y + end.y) / 2;
  } else {
    // Find the highest and lowest points of the obstacles
    const obsMinY = Math.min(...relevantObstacles.map(o => o.y)) - padding;
    const obsMaxY = Math.max(...relevantObstacles.map(o => o.y + o.h)) + padding;

    // Decide whether to route above or below the obstacles
    // Default to the side that's closer to the average of start/end Y
    const midY = (start.y + end.y) / 2;
    if (Math.abs(midY - obsMinY) < Math.abs(midY - obsMaxY)) {
      horizontalY = obsMinY - (Math.abs(laneOffset) * 5); // Route above
    } else {
      horizontalY = obsMaxY + (Math.abs(laneOffset) * 5); // Route below
    }
  }

  if (horizontalFirst && isInputOnLeft) {
    // Route: horizontal exit → vertical to safe area → horizontal → vertical entry
    waypoints.push({ x: start.x + horizontalOffset, y: start.y });
    waypoints.push({ x: start.x + horizontalOffset, y: horizontalY });
    waypoints.push({ x: end.x - horizontalOffset, y: horizontalY });
    waypoints.push({ x: end.x - horizontalOffset, y: end.y });
  } else if (horizontalFirst && !isInputOnLeft) {
    // Routing backward (right to left)
    waypoints.push({ x: start.x + horizontalOffset, y: start.y });
    waypoints.push({ x: start.x + horizontalOffset, y: horizontalY });
    waypoints.push({ x: end.x - horizontalOffset, y: horizontalY });
    waypoints.push({ x: end.x - horizontalOffset, y: end.y });
  } else {
    // Route: vertical → horizontal → vertical
    waypoints.push({ x: start.x, y: horizontalY });
    waypoints.push({ x: end.x, y: horizontalY });
  }

  waypoints.push(end);

  return waypoints;
}

/**
 * Convert waypoints to SVG path data with optional rounded corners
 */
export function waypointsToPath(waypoints: Point[], bendRadius: number = 0): string {
  if (waypoints.length < 2) {
    return '';
  }

  if (bendRadius === 0 || waypoints.length === 2) {
    // Simple straight line or polyline
    const pathParts = waypoints.map((point, i) => {
      return i === 0 ? `M ${point.x},${point.y}` : `L ${point.x},${point.y}`;
    });
    return pathParts.join(' ');
  }

  // Rounded corners using quadratic curves
  const pathParts: string[] = [];
  pathParts.push(`M ${waypoints[0].x},${waypoints[0].y}`);

  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];

    // Calculate direction vectors
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    // Calculate distances
    const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    // Limit bend radius to half the shortest segment
    const maxRadius = Math.min(dist1, dist2) / 2;
    const radius = Math.min(bendRadius, maxRadius);

    if (radius < 1) {
      // Too small for rounded corner, use sharp corner
      pathParts.push(`L ${curr.x},${curr.y}`);
      continue;
    }

    // Calculate points before and after corner
    const beforeX = curr.x - (dx1 / dist1) * radius;
    const beforeY = curr.y - (dy1 / dist1) * radius;
    const afterX = curr.x + (dx2 / dist2) * radius;
    const afterY = curr.y + (dy2 / dist2) * radius;

    // Draw line to corner approach point, then quadratic curve
    pathParts.push(`L ${beforeX},${beforeY}`);
    pathParts.push(`Q ${curr.x},${curr.y} ${afterX},${afterY}`);
  }

  // Final segment to end point
  const lastPoint = waypoints[waypoints.length - 1];
  pathParts.push(`L ${lastPoint.x},${lastPoint.y}`);

  return pathParts.join(' ');
}

/**
 * Calculate smart cable path between two ports
 *
 * Uses orthogonal routing with rounded corners for a clean look.
 */
export function calculateCablePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  useOrthogonal: boolean = true,
  bendRadius: number = 8,
  laneOffset: number = 0,
  obstacles: { x: number; y: number; w: number; h: number }[] = []
): string {
  if (!useOrthogonal) {
    // Fallback to simple bezier
    const dx = x2 - x1;
    const controlPointOffset = Math.min(Math.abs(dx) * 0.5, 100);
    const c1x = x1 + controlPointOffset;
    const c1y = y1;
    const c2x = x2 - controlPointOffset;
    const c2y = y2;
    return `M ${x1},${y1} C ${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
  }

  // Calculate orthogonal path with waypoints and lane offset
  const waypoints = calculateOrthogonalPath(
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    { horizontalFirst: true, laneOffset, obstacles }
  );

  return waypointsToPath(waypoints, bendRadius);
}
