/**
 * SongLoadPanel - the pattern editor's loading panel (plan
 * 2026-10-07-one-load-save-export-path, U6 part 2).
 *
 * Centred over the editor while a song opens: the file name, the phase the open
 * is in, the seconds it has taken, and Cancel. Reads useSongLoadStore, the one
 * loading state the status bar reads too. Cancel calls the store's cancel hook,
 * which aborts the running openSong; the outgoing song is already unloaded
 * (owner decision D3), so a cancelled open leaves silence. The silent boot
 * restore shows no panel.
 */
import React, { useEffect, useState } from 'react';
import { Button } from '@components/ui/Button';
import { useSongLoadStore, OPEN_PHASE_LABEL } from '@/stores/useSongLoadStore';

export const SongLoadPanel: React.FC = () => {
  // The silent boot restore covers the editor without a panel (useSongLoadStore.silent).
  const label = useSongLoadStore((s) => (s.depth > 0 && !s.silent ? s.label || 'song' : null));
  const phase = useSongLoadStore((s) => s.phase);
  const startedAt = useSongLoadStore((s) => s.startedAt);
  const cancel = useSongLoadStore((s) => s.cancel);
  const cancelled = useSongLoadStore((s) => s.cancelled);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (label === null) return;
    const tick = () => setSeconds(Math.max(0, Math.floor((performance.now() - startedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [label, startedAt]);

  if (label === null) return null;
  const phaseLabel = cancelled ? 'Cancelling' : OPEN_PHASE_LABEL[phase];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-dark-bg/60" data-testid="song-load-panel">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 px-6 py-4 rounded border border-dark-border bg-dark-bgSecondary text-text-primary min-w-[16rem] max-w-[28rem]"
      >
        <div className="text-sm font-semibold truncate max-w-full" title={label}>{label}</div>
        <div className="text-xs text-text-secondary">
          {phaseLabel ? `${phaseLabel}... ` : ''}{seconds} {seconds === 1 ? 'second' : 'seconds'}
        </div>
        <Button variant="default" size="sm" onClick={() => cancel?.()} disabled={!cancel || cancelled}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
