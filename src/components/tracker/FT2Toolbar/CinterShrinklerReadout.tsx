/**
 * CinterShrinklerReadout — shows the Shrinkler-compressed size of the current Cinter
 * song's .cinter4 in the main toolbar. Shrinkler-crunched size is the metric Cinter
 * musicians optimize, so it belongs next to the song's top-level stats.
 *
 * The crunch is CPU-heavy (~0.5–1 s) so it runs off the render path and only when the
 * song bytes change (deferred via a timeout). Renders nothing for non-Cinter songs.
 */
import React, { useEffect, useState } from 'react';
import { useFormatStore } from '@stores/useFormatStore';
import { shrinklerCompressedSize, preloadShrinkler } from '@/engine/shrinkler/ShrinklerSize';

export const CinterShrinklerReadout: React.FC = () => {
  const cinter4FileData = useFormatStore((s) => s.cinter4FileData);
  const [size, setSize] = useState<number | null>(null);

  useEffect(() => { preloadShrinkler(); }, []);
  useEffect(() => {
    if (!cinter4FileData) { setSize(null); return; }
    let cancelled = false;
    setSize(null);
    const id = window.setTimeout(() => {
      shrinklerCompressedSize(new Uint8Array(cinter4FileData))
        .then((sz) => { if (!cancelled) setSize(sz); })
        .catch(() => { if (!cancelled) setSize(null); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [cinter4FileData]);

  if (!cinter4FileData) return null;

  return (
    <span
      className="text-[10px] font-mono text-accent-primary ml-1.5 flex-shrink-0"
      title="Shrinkler-compressed .cinter4 size (the metric Cinter musicians optimize)"
    >
      {size == null ? '…' : `${size.toLocaleString()} B`}
    </span>
  );
};
