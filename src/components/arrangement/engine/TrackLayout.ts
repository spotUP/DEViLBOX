/**
 * TrackLayout - Computes cumulative Y offsets for variable-height tracks
 *
 * Handles collapsed groups, automation lane sub-rows, and per-track heights.
 * Used for vertical culling and hit testing.
 */

import type { ArrangementTrack, TrackGroup, TimelineAutomationLane } from '@/types/arrangement';

export interface TrackLayoutEntry {
  trackId: string;
  trackIndex: number;
  y: number;           // Top Y position in track-space
  height: number;      // Total height including automation lanes
  bodyHeight: number;  // Track body height (without automation)
  automationY: number; // Y offset where automation lanes start
  automationHeight: number; // Total automation lane height
  visible: boolean;    // False if inside collapsed group
}

const AUTOMATION_LANE_HEIGHT = 40;
const TRACK_SEPARATOR = 1;

export class TrackLayout {
  private entries: TrackLayoutEntry[] = [];
  private totalHeight = 0;

  /** Rebuild layout from tracks, groups, and automation lanes */
  rebuild(
    tracks: ArrangementTrack[],
    groups: TrackGroup[],
    automationLanes: TimelineAutomationLane[],
  ): void {
    const collapsedGroupIds = new Set(
      groups.filter(g => g.collapsed).map(g => g.id)
    );

    const foldedGroupIds = new Set(
      groups.filter(g => g.folded).map(g => g.id)
    );

    const sortedTracks = [...tracks].sort((a, b) => a.index - b.index);

    this.entries = [];
    let y = 0;

    for (const track of sortedTracks) {
      const visible = !track.groupId || (!collapsedGroupIds.has(track.groupId) && !foldedGroupIds.has(track.groupId));

      // Count visible automation lanes for this track
      const trackAutoLanes = automationLanes.filter(
        l => l.trackId === track.id && l.visible
      );
      const automationHeight = track.automationVisible
        ? trackAutoLanes.length * AUTOMATION_LANE_HEIGHT
        : 0;

      const bodyHeight = track.collapsed ? 24 : track.height;
      const totalHeight = bodyHeight + automationHeight;

      this.entries.push({
        trackId: track.id,
        trackIndex: track.index,
        y,
        height: visible ? totalHeight : 0,
        bodyHeight: visible ? bodyHeight : 0,
        automationY: y + bodyHeight,
        automationHeight: visible ? automationHeight : 0,
        visible,
      });

      if (visible) {
        y += totalHeight + TRACK_SEPARATOR;
      }
    }

    this.totalHeight = y;
  }

  /** Get total height of all tracks */
  getTotalHeight(): number {
    return this.totalHeight;
  }

  /** Get all layout entries */
  getEntries(): TrackLayoutEntry[] {
    return this.entries;
  }

  /** Get only entries visible within a scroll window */
  getVisibleEntries(scrollY: number, viewHeight: number): TrackLayoutEntry[] {
    return this.entries.filter(e => {
      if (!e.visible) return false;
      const bottom = e.y + e.height;
      return bottom > scrollY && e.y < scrollY + viewHeight;
    });
  }

  /** Find which track/zone a Y coordinate hits */
  hitTestY(trackSpaceY: number): {
    trackIndex: number;
    trackId: string;
    zone: 'body' | 'resize-handle' | 'automation';
  } | null {
    for (const entry of this.entries) {
      if (!entry.visible) continue;
      if (trackSpaceY < entry.y) continue;
      if (trackSpaceY > entry.y + entry.height) continue;

      const relY = trackSpaceY - entry.y;

      // Resize handle zone (bottom 4px of body)
      if (relY >= entry.bodyHeight - 4 && relY <= entry.bodyHeight) {
        return { trackIndex: entry.trackIndex, trackId: entry.trackId, zone: 'resize-handle' };
      }

      // Automation zone
      if (relY > entry.bodyHeight) {
        return { trackIndex: entry.trackIndex, trackId: entry.trackId, zone: 'automation' };
      }

      return { trackIndex: entry.trackIndex, trackId: entry.trackId, zone: 'body' };
    }

    return null;
  }

  /** Get layout entry for a specific track */
  getEntryForTrack(trackId: string): TrackLayoutEntry | undefined {
    return this.entries.find(e => e.trackId === trackId);
  }
}
