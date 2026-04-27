/**
 * MasterDubLane — 48px absolute-positioned column to the left of channel 0
 * showing all global dub.* automation curves (channelIndex = -1).
 * Visible only when dubBus is enabled (caller's responsibility to conditionally render).
 *
 * This is a vertical sibling to GlobalAutomationLane (which is a flex row).
 * Used in PatternEditorCanvas as an overlay lane for dub-specific automation.
 */

import React from 'react';
import { AutomationLane } from './AutomationLane';

export interface MasterDubLaneProps {
  patternId: string;
  patternLength: number;
  rowHeight: number;
  /** Pixel offset from the top of the scroll container (scrollYRef.current) */
  top: number;
  /** Total height of the lane: patternLength * rowHeight */
  height: number;
  /** Left edge in px — should equal LINE_NUMBER_WIDTH (40) */
  left: number;
}

export const MasterDubLane: React.FC<MasterDubLaneProps> = ({
  patternId,
  patternLength,
  rowHeight,
  top,
  height,
  left,
}) => {
  return (
    <div
      className="absolute flex flex-col border-r border-dark-border overflow-hidden bg-accent-highlight/5"
      style={{ left, top, width: 48, height, zIndex: 4, pointerEvents: 'auto' }}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-center border-b border-accent-highlight/30" style={{ height: 14 }}>
        <span className="text-[8px] font-mono font-bold text-accent-highlight uppercase tracking-widest">
          DUB
        </span>
      </div>

      {/* Lane content */}
      <div className="flex-1 min-h-0">
        <AutomationLane
          patternId={patternId}
          channelIndex={-1}
          patternLength={patternLength}
          rowHeight={rowHeight}
          compact={true}
        />
      </div>
    </div>
  );
};
