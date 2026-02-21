/**
 * CollaborationSplitView — Layout for collab mode, driven by listenMode.
 *
 * shared  → both panels, navigation synced (Google Docs style)
 * both    → two full TrackerViews side by side, independent navigation
 * mine    → only your editor (full width)
 * theirs  → only friend's view (full width, read-only)
 */

import React from 'react';
import { useCollaborationStore } from '@stores/useCollaborationStore';
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
  const listenMode = useCollaborationStore((s) => s.listenMode);

  // 'shared' = full tracker with peer cursor overlay (handled inside PatternEditorCanvas)
  const showYours = listenMode !== 'theirs';
  const showTheirs = listenMode === 'both' || listenMode === 'theirs';

  const trackerProps = {
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
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <CollaborationToolbar />

      {/* Panels */}
      <div className="flex flex-1 min-h-0 min-w-0">
        {showYours && (
          <div className={`flex flex-col min-h-0 min-w-0 ${showTheirs ? 'flex-1 border-r border-dark-border' : 'flex-1'}`}>
            <TrackerView {...trackerProps} />
          </div>
        )}

        {showTheirs && (
          <div className="flex flex-col flex-1 min-h-0 min-w-0">
            {listenMode === 'both' ? (
              /* "Both" mode: full TrackerView so friend's side is a complete editor */
              <TrackerView {...trackerProps} />
            ) : (
              /* "Theirs" mode: read-only view of friend's pattern */
              <RemotePatternView />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
