/**
 * LiveModeIndicator - Visual badge showing current mode (EDIT/LIVE)
 * With optional pending pattern countdown
 */

import React from 'react';
import { Radio, Edit3, Clock } from 'lucide-react';
import { useLiveModeStore } from '@stores/useLiveModeStore';

interface LiveModeIndicatorProps {
  showCountdown?: boolean;
  compact?: boolean;
}

export const LiveModeIndicator: React.FC<LiveModeIndicatorProps> = ({
  showCountdown = true,
  compact = false,
}) => {
  const {
    isLiveMode,
    toggleLiveMode,
    pendingPatternIndex,
    barsUntilSwitch,
    showQueueCountdown,
  } = useLiveModeStore();

  const hasPending = pendingPatternIndex !== null;

  if (compact) {
    return (
      <button
        onClick={toggleLiveMode}
        className={`
          px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition-all border
          ${isLiveMode
            ? 'bg-accent-error/20 text-accent-error border-accent-error animate-pulse'
            : 'bg-ft2-bg text-ft2-text border-ft2-border hover:bg-ft2-header'
          }
        `}
        title={`Switch to ${isLiveMode ? 'Edit' : 'Live'} Mode (L)`}
      >
        {isLiveMode ? 'LIVE' : 'EDIT'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Mode toggle button */}
      <button
        onClick={toggleLiveMode}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold
          transition-all duration-200 border
          ${isLiveMode
            ? 'bg-accent-error/10 text-accent-error border-accent-error/30 hover:bg-accent-error/20'
            : 'bg-ft2-bg text-ft2-text border-ft2-border hover:bg-ft2-header'
          }
        `}
        title={`Switch to ${isLiveMode ? 'Edit' : 'Live'} Mode (L)`}
      >
        {isLiveMode ? (
          <>
            <Radio size={14} className="animate-pulse" />
            <span>LIVE</span>
          </>
        ) : (
          <>
            <Edit3 size={14} />
            <span>EDIT</span>
          </>
        )}
      </button>

      {/* Pending pattern indicator */}
      {isLiveMode && hasPending && showCountdown && showQueueCountdown && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-ft2-bg text-ft2-highlight border border-ft2-border rounded text-xs animate-pulse">
          <Clock size={12} />
          <span>
            Pattern {String(pendingPatternIndex).padStart(2, '0')} in {barsUntilSwitch} bars
          </span>
        </div>
      )}
    </div>
  );
};

// Simple toggle button for space-constrained areas
export const LiveModeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isLiveMode, toggleLiveMode } = useLiveModeStore();

  return (
    <button
      onClick={toggleLiveMode}
      className={`
        relative w-12 h-6 rounded-full transition-colors duration-200
        ${isLiveMode ? 'bg-accent-error' : 'bg-ft2-bg border border-ft2-border'}
        ${className}
      `}
      title={`Switch to ${isLiveMode ? 'Edit' : 'Live'} Mode (L)`}
    >
      <span
        className={`
          absolute top-1 w-4 h-4 rounded-full transition-transform duration-200
          ${isLiveMode ? 'bg-white translate-x-7' : 'bg-ft2-text translate-x-1'}
        `}
      />
    </button>
  );
};
