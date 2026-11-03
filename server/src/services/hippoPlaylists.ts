/**
 * The 74 HippoPlayer playlists (.prg), converted by tools/convert-hippo-playlists.ts
 * into server/src/data/hippo-playlists.json. Read-only: the server is the only owner.
 * The JSON is imported (esbuild inlines it into dist), so it ships with the server build.
 */
import { createHash } from 'crypto';
import seed from '../data/hippo-playlists.json';

export interface HippoPlaylistTrack {
  fileName: string;
  trackName: string;
  format: string;
  bpm: number;
  duration: number;
  addedAt: number;
}
export interface HippoPlaylist {
  id: string;
  name: string;
  tracks: HippoPlaylistTrack[];
  createdAt: number;
  updatedAt: number;
}
export interface HippoPlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
  /** Content hash of the playlist; changes when its tracks or sources change. */
  revision: string;
}

const hash = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16);

export interface HippoPlaylistService {
  list(): HippoPlaylistSummary[];
  get(id: string): HippoPlaylist | undefined;
  /** Hash of the whole set, used as the ETag of the list responses. */
  setRevision(): string;
  all(): HippoPlaylist[];
}

export function createHippoPlaylistService(playlists: HippoPlaylist[] = seed as HippoPlaylist[]): HippoPlaylistService {
  const byId = new Map(playlists.map((p) => [p.id, p]));
  const summaries = playlists.map((p) => ({ id: p.id, name: p.name, trackCount: p.tracks.length, revision: hash(p) }));
  const setRevision = hash(summaries);
  return {
    list: () => summaries,
    get: (id) => byId.get(id),
    setRevision: () => setRevision,
    all: () => playlists,
  };
}
