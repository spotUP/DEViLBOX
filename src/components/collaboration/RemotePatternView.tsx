/**
 * RemotePatternView — Shows the peer's current pattern as a read-only canvas.
 *
 * The peer's pattern is whatever pattern is at `peerPatternIndex` in the
 * SHARED local store (synced via WebRTC). ReadOnlyPatternCanvas just
 * needs the Pattern object — no Zustand reads of its own.
 */

import React from 'react';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { ReadOnlyPatternCanvas } from '@components/tracker/ReadOnlyPatternCanvas';
import { Users } from 'lucide-react';

export const RemotePatternView: React.FC = () => {
  const peerPatternIndex = useCollaborationStore((s) => s.peerPatternIndex);
  const patterns = useTrackerStore((s) => s.patterns);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const currentRow = useTransportStore((s) => s.currentRow);

  const pattern = patterns[peerPatternIndex] ?? null;
  const numChannels = pattern?.channels.length ?? 1;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-bgTertiary border-b border-dark-border shrink-0">
        <Users size={13} className="text-accent-secondary" />
        <span className="text-xs text-text-muted">Friend's view</span>
        {pattern && (
          <>
            <div className="w-px h-3 bg-dark-border" />
            <span className="text-xs font-mono text-accent-secondary">
              {peerPatternIndex.toString().padStart(2, '0')} {pattern.name}
            </span>
          </>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        {pattern ? (
          <ReadOnlyPatternCanvas
            pattern={pattern}
            currentRow={currentRow}
            numChannels={numChannels}
            isPlaying={isPlaying}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-text-muted text-sm">
            <div className="text-center">
              <Users size={24} className="mx-auto mb-2 opacity-30" />
              <p>Waiting for friend's view...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
