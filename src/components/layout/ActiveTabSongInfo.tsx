/**
 * ActiveTabSongInfo - the loaded song's info inside the active project tab:
 * name, community score, authors and genre. The tooltip text comes from the same helper (useActiveTabSongInfo).
 */
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFormatStore } from '@stores';
import { useTrackerAnalysisStore, selectGenre } from '@/stores/useTrackerAnalysisStore';
import { SongScore } from '@/components/shared/SongScore';
import { songTabInfo, type SongTabInfo } from '@/lib/song/songTabInfo';

export function useActiveTabSongInfo(tabName: string): SongTabInfo & { songSourceKey: string | null } {
  const { songDBInfo, sidMetadata, songSourceKey } = useFormatStore(
    useShallow((s) => ({ songDBInfo: s.songDBInfo, sidMetadata: s.sidMetadata, songSourceKey: s.songSourceKey }))
  );
  const genre = useTrackerAnalysisStore(selectGenre);
  return { ...songTabInfo({ tabName, songDBInfo, sidMetadata, genre }), songSourceKey };
}

export const ActiveTabSongInfo: React.FC<{ info: SongTabInfo & { songSourceKey: string | null } }> = ({ info }) => (
  <>
    <span>{info.displayName}</span>
    {info.songSourceKey && <span className="ml-1.5 inline-flex"><SongScore fileName={info.songSourceKey} /></span>}
    {info.authors && <span className="ml-1.5 text-xs text-text-muted">by {info.authors}</span>}
    {info.genre && <span className="ml-1.5 text-xs text-accent-primary">{info.genre}</span>}
  </>
);
