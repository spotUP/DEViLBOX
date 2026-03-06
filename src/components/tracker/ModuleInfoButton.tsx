/**
 * ModuleInfoButton — Format badge + info button for non-SID modules.
 * Displayed when a tracker module is loaded and metadata is available.
 */

import React, { useState } from 'react';
import { useTrackerStore , useFormatStore } from '@stores';
import { Info } from 'lucide-react';
import { ModuleInfoModal } from '@components/dialogs/ModuleInfoModal';

export const ModuleInfoButton: React.FC = React.memo(() => {
  const sidMetadata = useFormatStore((s) => s.sidMetadata);
  const songDBInfo = useFormatStore((s) => s.songDBInfo);
  const patterns = useTrackerStore((s) => s.patterns);
  const [showInfo, setShowInfo] = useState(false);

  const importMeta = patterns[0]?.importMetadata;
  const hasMetadata = !!(songDBInfo || importMeta?.modData);

  // Don't show for SID files (they have SIDSubsongSelector)
  if (sidMetadata || !hasMetadata) return null;

  const format = importMeta?.sourceFormat ?? songDBInfo?.format ?? '';

  return (
    <>
      <div className="flex items-center gap-1">
        {format && (
          <button
            onClick={() => setShowInfo(true)}
            className="px-1.5 py-0.5 text-[10px] font-bold text-blue-300 bg-blue-500/20 border border-blue-500/40 rounded hover:bg-blue-500/30 transition-colors"
          >
            {format}
          </button>
        )}
        <button
          onClick={() => setShowInfo(true)}
          className="text-text-secondary hover:text-blue-300 transition-colors p-0.5"
          title="Module Info"
        >
          <Info size={14} />
        </button>
      </div>
      <ModuleInfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} />
    </>
  );
});

ModuleInfoButton.displayName = 'ModuleInfoButton';
