/**
 * UpdateNotification - Prompts user to refresh when a new version is available
 */

import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from './Button';

interface UpdateNotificationProps {
  onRefresh: () => void;
  onDismiss: () => void;
  currentVersion: string;
  latestVersion: string;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  onRefresh,
  onDismiss,
  currentVersion,
  latestVersion,
}) => {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-md w-full px-4">
      <div
        className="
          flex items-center gap-3 px-4 py-3 rounded-lg border shadow-2xl
          bg-accent-primary/20 border-accent-primary/40 backdrop-blur-sm
          animate-slide-in-top
        "
        role="alert"
      >
        <RefreshCw size={20} className="text-accent-primary flex-shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary mb-1">
            Update Available
          </p>
          <p className="text-xs text-text-muted">
            Version {latestVersion} is now available (current: {currentVersion})
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            onClick={onRefresh}
            className="px-3 py-1.5 text-xs bg-accent-primary hover:bg-accent-primary/80 text-white font-medium rounded"
          >
            Refresh
          </Button>
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-dark-bgHover transition-colors"
            aria-label="Dismiss update notification"
          >
            <X size={16} className="text-text-muted" />
          </button>
        </div>
      </div>
    </div>
  );
};
