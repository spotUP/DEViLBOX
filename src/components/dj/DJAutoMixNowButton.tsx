import React, { useCallback, useState } from 'react';
import { SkipForward } from 'lucide-react';
import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { skipAutoDJ } from '@/engine/dj/DJActions';

export const DJAutoMixNowButton: React.FC = () => {
  const status = useDJStore((s) => s.autoDJStatus);
  const nextIdx = useDJStore((s) => s.autoDJNextTrackIndex);
  const activePlaylistId = useDJPlaylistStore((s) => s.activePlaylistId);
  const playlists = useDJPlaylistStore((s) => s.playlists);
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId);
  const nextTrack = activePlaylist?.tracks[nextIdx];

  const [mixing, setMixing] = useState(false);

  const isTransitioning = status === 'transitioning';
  const disabled = isTransitioning || mixing;

  const handleMixNow = useCallback(async () => {
    setMixing(true);
    try {
      await skipAutoDJ();
    } finally {
      setMixing(false);
    }
  }, []);

  return (
    <button
      onClick={handleMixNow}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-bold border transition-all ${
        isTransitioning
          ? 'border-cyan-500 bg-cyan-900/30 text-cyan-400 animate-pulse cursor-wait'
          : mixing
            ? 'border-amber-500 bg-amber-900/30 text-amber-400 animate-pulse cursor-wait'
            : 'border-accent-primary bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 active:scale-95'
      }`}
      title={nextTrack ? `Mix now into: ${nextTrack.trackName}` : 'Mix to next track'}
    >
      <SkipForward size={14} />
      {isTransitioning ? 'MIXING...' : 'MIX NOW'}
    </button>
  );
};
