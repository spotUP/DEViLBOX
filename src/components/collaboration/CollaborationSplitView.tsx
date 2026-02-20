/**
 * CollaborationSplitView — Side-by-side layout for collab mode.
 *
 * Left: Your normal TrackerView (full editing).
 * Right: RemotePatternView (friend's current pattern, read-only).
 */

import React from 'react';
import { TrackerView } from '@components/tracker/TrackerView';
import { RemotePatternView } from './RemotePatternView';
import { CollaborationToolbar } from './CollaborationToolbar';

interface CollaborationSplitViewProps {
  onShowPatterns?: () => void;
  onShowExport?: () => void;
  onShowHelp?: (tab?: string) => void;
  onShowMasterFX?: () => void;
  onShowInstrumentFX?: () => void;
  onShowInstruments?: () => void;
  onShowDrumpads?: () => void;
  showPatterns?: boolean;
  showMasterFX?: boolean;
  showInstrumentFX?: boolean;
}

export const CollaborationSplitView: React.FC<CollaborationSplitViewProps> = ({
  onShowPatterns,
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowInstrumentFX,
  onShowInstruments,
  onShowDrumpads,
  showPatterns,
  showMasterFX,
  showInstrumentFX,
}) => {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <CollaborationToolbar />

      {/* Split panels */}
      <div className="flex flex-1 min-h-0 min-w-0">
        {/* Left — Your editor */}
        <div className="flex flex-col flex-1 min-h-0 min-w-0 border-r border-dark-border">
          <TrackerView
            onShowPatterns={onShowPatterns}
            onShowExport={onShowExport}
            onShowHelp={onShowHelp}
            onShowMasterFX={onShowMasterFX}
            onShowInstrumentFX={onShowInstrumentFX}
            onShowInstruments={onShowInstruments}
            onShowDrumpads={onShowDrumpads}
            showPatterns={showPatterns}
            showMasterFX={showMasterFX}
            showInstrumentFX={showInstrumentFX}
          />
        </div>

        {/* Right — Friend's view */}
        <div className="flex flex-col flex-1 min-h-0 min-w-0">
          <RemotePatternView />
        </div>
      </div>
    </div>
  );
};
