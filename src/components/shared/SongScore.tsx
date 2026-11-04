/**
 * SongScore - the community score (average rating and vote count) of a song, for the song info bar.
 * Reads the shared ratings store; shows nothing while the song has no votes or is not a rated source.
 */

import React, { useEffect } from 'react';
import { Star } from 'lucide-react';
import { ratingId, ratingTargetOfFileName, useRatingsStore } from '@/stores/useRatingsStore';

export const SongScore: React.FC<{ fileName: string | null | undefined }> = ({ fileName }) => {
  const target = ratingTargetOfFileName(fileName);
  const source = target?.source;
  const key = target?.key;
  const info = useRatingsStore((s) => (source && key ? s.ratings[ratingId(source, key)] : undefined));

  useEffect(() => {
    if (source && key) void useRatingsStore.getState().load(source, key);
  }, [source, key]);

  if (!info || info.count <= 0) return null;
  const label = `Average rating ${info.avg.toFixed(1)} from ${info.count} ${info.count === 1 ? 'vote' : 'votes'}`;
  return (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0 text-amber-500" title={label} aria-label={label}>
      <Star size={10} fill="currentColor" aria-hidden="true" />
      <span className="text-[10px] tabular-nums">{info.avg.toFixed(1)}</span>
      <span className="text-[9px] text-text-muted/50">({info.count})</span>
    </span>
  );
};
