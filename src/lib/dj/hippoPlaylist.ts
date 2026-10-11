/**
 * HippoPlayer playlists (`.prg`, first line `HiPPrg`) -> DJ seed playlists.
 *
 * A `.prg` is plain text: the `HiPPrg` header, then one entry per line. An
 * entry is a full URL, optionally followed by HippoPlayer's own markers
 * `#name=<display name>` and `#song=<subsong>`. Every other line (blank, or a
 * divider/title line HippoPlayer prefixes with 0xF7) is decoration.
 *
 * The whole point of this module is that each entry keeps its SOURCE: the
 * Modland and HVSC URLs become the loader's `modland:` / `hvsc:` forms, and
 * every other URL is kept as the URL itself (`playlistTrackSource` treats an
 * http(s) URL as a source). The first seed was built by a converter that
 * kept only the bare file name for non-Modland URLs, so 515 entries could
 * never load.
 *
 * Used by `tools/convert-hippo-playlists.ts`, which builds
 * `public/data/playlists/imported-prg.json`.
 */

import { decodePathEscapes } from './playlistTrackSource';

/** The seed playlists' fixed timestamp (2024-03-24), kept so regenerating the seed changes only sources. */
export const SEED_TIMESTAMP = 1711305600000;

export interface SeedTrack {
  fileName: string;
  trackName: string;
  format: string;
  bpm: number;
  duration: number;
  addedAt: number;
}

export interface SeedPlaylist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tracks: SeedTrack[];
}

const MODLAND_URL = /^https?:\/\/ftp\.modland\.com\/(pub\/modules\/.+)$/i;
const HVSC_URL = /^https?:\/\/(?:www\.)?hvsc\.c64\.org\/download\/C64Music\/(.+)$/i;
/** HippoPlayer's markers. A bare `#` is part of many Modland names ("superchip #2.xm"). */
const MARKER = /#(name|song)=/;

/** `.prg` files are UTF-8 or ISO-8859-1 depending on who saved them. */
export function decodePrgBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('iso-8859-1').decode(bytes);
  }
}

export interface PrgEntry {
  /** The URL as the playlist holds it, markers removed. */
  url: string;
  /** `#name=` marker, when present. */
  name?: string;
  /** Everything from `#name=` on, as the first seed kept it in the track name ("... (TFMX)#song=4"). */
  marker?: string;
}

/** The URL entries of a `.prg`, in order. Throws when the text is not a HippoPlayer playlist. */
export function parsePrgEntries(text: string): PrgEntry[] {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== 'HiPPrg') throw new Error('Not a HippoPlayer playlist (missing HiPPrg header)');
  const entries: PrgEntry[] = [];
  for (const line of lines.slice(1)) {
    if (!/^https?:\/\//i.test(line)) continue;
    const m = MARKER.exec(line);
    if (!m) {
      entries.push({ url: line.trimEnd() });
      continue;
    }
    const url = line.slice(0, m.index).trimEnd();
    const marker = line.slice(m.index);
    const nameMatch = /#name=([^#]*)/.exec(marker);
    const name = nameMatch?.[1].trim() || undefined;
    entries.push({ url, name, marker: name ? marker.slice('#name='.length).trim() : undefined });
  }
  return entries;
}

/**
 * The playlist source for an entry URL: `modland:<path>` / `hvsc:<path>` for
 * the two archives the loader downloads by path, the URL itself otherwise.
 *
 * @param pickModlandPath chooses between the URL's raw and %-decoded Modland
 *   path (the converter checks which one the Modland index holds); default: decoded
 */
export function sourceForUrl(
  url: string,
  pickModlandPath: (raw: string, decoded: string) => string = (_raw, decoded) => decoded,
): string {
  // A TAWS link that plays a module: the module URL is the source.
  const playmod = /^https?:\/\/hippoplayer\.se\/WB\.html\?playmod=(.+)$/i.exec(url);
  if (playmod) return sourceForUrl(playmod[1], pickModlandPath);
  const modland = MODLAND_URL.exec(url);
  if (modland) return `modland:${pickModlandPath(modland[1], decodePathEscapes(modland[1]))}`;
  const hvsc = HVSC_URL.exec(url);
  if (hvsc) return `hvsc:${decodePathEscapes(hvsc[1])}`;
  return url;
}

/** Last path segment of a URL, without query. */
function urlBaseName(url: string): string {
  const path = url.replace(/\?.*$/, '');
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Format label: the extension, upper-cased (PlaySID's `.psid` is a SID); no extension -> MOD. */
export function formatForName(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'MOD';
  const ext = name.slice(dot + 1).toUpperCase();
  return ext === 'PSID' ? 'SID' : ext;
}

/** "Anathema-Imbasille_3.prg" -> "Anathema-Imbasille 3". */
export function playlistNameForFile(fileName: string): string {
  return fileName.replace(/\.prg$/i, '').replace(/_/g, ' ');
}

/**
 * "Anathema-Imbasille 3" -> "playlist-prg-anathema-imbasille-3". Dots stay
 * ("playlist-prg-ne7s-faves-vol.-1"): the first seed's ids are what persisted
 * copies are matched by, so they must not change.
 */
export function playlistIdForName(name: string): string {
  return `playlist-prg-${name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

/** One `.prg` file as a seed playlist; every URL entry becomes one track carrying its source. */
export function playlistFromPrg(
  fileName: string,
  bytes: Uint8Array,
  pickModlandPath?: (raw: string, decoded: string) => string,
): SeedPlaylist {
  const name = playlistNameForFile(fileName);
  const tracks = parsePrgEntries(decodePrgBytes(bytes)).map((entry): SeedTrack => {
    const base = urlBaseName(entry.url.replace(/^.*[?&]playmod=/i, ''));
    return {
      fileName: sourceForUrl(entry.url, pickModlandPath),
      trackName: entry.marker ?? base,
      format: formatForName(base),
      bpm: 0,
      duration: 0,
      addedAt: SEED_TIMESTAMP,
    };
  });
  return { id: playlistIdForName(name), name, createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP, tracks };
}
