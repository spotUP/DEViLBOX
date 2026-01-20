import React from 'react';
import { useTrackerStore } from '@stores';
import { Maximize2, Minimize2, MoveVertical } from 'lucide-react';

export const PatternResolutionControls: React.FC = () => {
  const { currentPatternIndex, expandPattern, shrinkPattern } = useTrackerStore();

  return (
    <div className="flex items-center gap-1 bg-ft2-panel/10 p-1 border border-ft2-border rounded-md font-ft2">
      <span className="text-[9px] text-ft2-textDim uppercase px-1 flex items-center gap-1">
        <MoveVertical size={10} /> Pattern Res
      </span>
      <button 
        onClick={() => expandPattern(currentPatternIndex)}
        className="px-2 py-1 bg-black/20 hover:bg-ft2-panel/20 border border-ft2-border rounded text-[9px] uppercase font-bold text-white flex items-center gap-1"
        title="Double pattern length (Expand)"
      >
        <Maximize2 size={10} /> Expand
      </button>
      <button 
        onClick={() => shrinkPattern(currentPatternIndex)}
        className="px-2 py-1 bg-black/20 hover:bg-ft2-panel/20 border border-ft2-border rounded text-[9px] uppercase font-bold text-white flex items-center gap-1"
        title="Halve pattern length (Shrink)"
      >
        <Minimize2 size={10} /> Shrink
      </button>
    </div>
  );
};
