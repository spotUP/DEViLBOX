/**
 * Header of the GLOBAL lane (channelIndex -1: bus-wide dub params and
 * song-level globals), with the "+" that adds a parameter to it - the same
 * picker the channel lanes use, inline. Used by both header rows of
 * PatternEditorCanvas.
 */
import React from 'react';
import { AutomationParameterPicker } from '@components/automation/AutomationParameterPicker';

export interface GlobalLaneHeaderProps {
  width: number;
  patternId?: string;
}

export const GlobalLaneHeader: React.FC<GlobalLaneHeaderProps> = ({ width, patternId }) => (
  <div
    className="flex-shrink-0 flex items-center justify-center gap-0.5 px-1 border-r border-accent-highlight/40 bg-accent-highlight/10"
    style={{ width }}
    title="Global FX lane — bus-wide dub params + song-level BPM / master vol"
  >
    <span className="text-[8px] font-mono font-bold text-accent-highlight uppercase tracking-wider">⬢ GLOBAL</span>
    <AutomationParameterPicker inline channelIndex={-1} patternId={patternId} />
  </div>
);
