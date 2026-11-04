/**
 * songTabInfo - what the active project tab shows about the loaded song: display name,
 * authors and tooltip. Pure; fed from useFormatStore (songDBInfo / sidMetadata).
 */
import type { useFormatStore } from '@/stores/useFormatStore';
import type { GenreResult } from '@/stores/useTrackerAnalysisStore';

type FormatState = ReturnType<typeof useFormatStore.getState>;

export interface SongTabInfoInput {
  tabName: string;
  songDBInfo: FormatState['songDBInfo'];
  sidMetadata: FormatState['sidMetadata'];
  /** The genre the tracker analysis shows (ModArchive tag when known, else the audio model's guess), or null. */
  genre: Pick<GenreResult, 'primary' | 'subgenre'> | null;
}

export interface SongTabInfo {
  /** SID title, else the tab's own name. The song database album is the release the track appears on, never the track's name: it goes in the tooltip only. */
  displayName: string;
  /** Authors text (without the "by"), or '' when unknown. */
  authors: string;
  /** Genre text ("Electronic - Techno"), or '' when not known yet. */
  genre: string;
  /** Full description for the tab tooltip, or '' when there is no song info. */
  tooltip: string;
}

export function songTabInfo({ tabName, songDBInfo, sidMetadata, genre }: SongTabInfoInput): SongTabInfo {
  const fallback = tabName || 'Untitled';
  const displayName = sidMetadata?.title || fallback;
  const dbAuthors = songDBInfo?.authors?.length ? songDBInfo.authors.join(', ') : '';
  const authors = sidMetadata?.author || dbAuthors;

  const parts: string[] = [];
  if (sidMetadata) {
    if (sidMetadata.title) parts.push(sidMetadata.title);
    if (sidMetadata.author) parts.push(`by ${sidMetadata.author}`);
    if (sidMetadata.chipModel !== 'Unknown') parts.push(`[MOS ${sidMetadata.chipModel}]`);
    if (sidMetadata.clockSpeed !== 'Unknown') parts.push(sidMetadata.clockSpeed);
    if (sidMetadata.subsongs > 1) parts.push(`Sub ${sidMetadata.currentSubsong + 1}/${sidMetadata.subsongs}`);
  }
  if (songDBInfo) {
    if (songDBInfo.album) parts.push(songDBInfo.album);
    if (songDBInfo.year) parts.push(`(${songDBInfo.year})`);
    if (songDBInfo.format) parts.push(`[${songDBInfo.format}]`);
    if (dbAuthors) parts.push(`by ${dbAuthors}`);
  }
  const genreText = genre?.primary
    ? (genre.subgenre && genre.subgenre !== genre.primary ? `${genre.primary} - ${genre.subgenre}` : genre.primary)
    : '';
  if (genreText) parts.push(`Genre: ${genreText}`);
  return { displayName, authors, genre: genreText, tooltip: parts.join(' ') };
}
