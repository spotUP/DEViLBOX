/**
 * OfflineNotice — standard offline state for intrinsically-online features.
 *
 * Render this INSTEAD of a blank pane / silent failure when useOnlineStatus()
 * reports offline and the feature cannot work without the network (Modland,
 * HVSC, CSDB, YouTube upload, online ratings, radio streams).
 */

import React from 'react';
import { WifiOff } from 'lucide-react';

interface OfflineNoticeProps {
  /** What the user is missing, e.g. "Modland browsing" */
  feature: string;
  /** Optional extra hint, e.g. "Downloaded songs remain available in your library." */
  hint?: string;
  compact?: boolean;
}

export const OfflineNotice: React.FC<OfflineNoticeProps> = ({ feature, hint, compact }) => {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-accent-warning" title={`${feature} needs an internet connection`}>
        <WifiOff size={10} />
        Offline
      </span>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
      <WifiOff size={24} className="text-text-muted" />
      <div className="text-sm font-mono text-text-secondary">{feature} needs an internet connection</div>
      {hint && <div className="text-xs font-mono text-text-muted max-w-xs">{hint}</div>}
    </div>
  );
};
