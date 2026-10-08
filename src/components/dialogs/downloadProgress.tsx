/**
 * The progress of the downloads a result list is running, drawn as the bottom
 * border of the row being downloaded (UI7). The numbers come from one place,
 * modlandApi's DownloadProgress callback; a row without a Content-Length
 * (or a source that reports none) shows the indeterminate bar.
 */
import { useCallback, useState } from 'react';
import type { DownloadProgress } from '@/lib/modlandApi';

export type DownloadProgressMap = Record<string, DownloadProgress>;

/** Percent done (0-100), or null while the total is unknown. */
export function progressPercent(progress: DownloadProgress | undefined): number | null {
  if (!progress || !progress.total) return null;
  return Math.max(0, Math.min(100, Math.round((progress.received / progress.total) * 100)));
}

/** Progress per row key: `report(key)` is the callback a download takes, `clear(key)` ends the row's bar. */
export function useDownloadProgress(): {
  progress: DownloadProgressMap;
  report: (key: string) => (p: DownloadProgress) => void;
  clear: (key: string) => void;
} {
  const [progress, setProgress] = useState<DownloadProgressMap>({});
  const report = useCallback((key: string) => (p: DownloadProgress) => setProgress((prev) => ({ ...prev, [key]: p })), []);
  const clear = useCallback((key: string) => setProgress((prev) => {
    if (!(key in prev)) return prev;
    const { [key]: _gone, ...rest } = prev;
    return rest;
  }), []);
  return { progress, report, clear };
}

/** Fills along the bottom edge of a `relative` row as the download proceeds; pulses across it while the length is unknown. */
export function DownloadProgressBorder({ progress }: { progress?: DownloadProgress }) {
  const percent = progressPercent(progress);
  return (
    <div
      role="progressbar"
      aria-label="Download progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      data-testid="download-progress"
      className={`absolute bottom-0 left-0 h-0.5 bg-accent-primary ${percent === null ? 'w-full animate-pulse' : 'transition-[width] duration-150'}`}
      style={percent === null ? undefined : { width: `${percent}%` }}
    />
  );
}
