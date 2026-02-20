/**
 * Serato Database V2 Parser
 *
 * Parses ~/Music/_Serato_/database V2 — the main Serato library database.
 *
 * File structure:
 *   - Header: "vrsn" TLV (version info, UTF-16 BE string)
 *   - Track entries: sequence of "otrk" TLVs, each containing nested child TLVs
 *
 * Each "otrk" container holds track metadata as child TLVs:
 *   - "ptrk" / "pfil": file path (UTF-16 BE)
 *   - "tsng": song title
 *   - "tart": artist
 *   - "talb": album
 *   - "tgen": genre
 *   - "tbpm": BPM (UTF-16 BE string, e.g. "128.00")
 *   - "tlen": duration string (e.g. "234")
 *   - "tbit": bitrate string
 *   - "tsmp": sample rate string
 *   - "tkey": musical key
 *   - "tadd": date added
 *   - "tsiz": file size
 *   - "ttyp": file type (e.g. "mp3")
 */

import {
  parseTLVStream,
  parseNestedTLV,
  decodeUTF16BE,
} from './seratoParser';

// ============================================================================
// TYPES
// ============================================================================

export interface SeratoTrack {
  filePath: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  bpm: number;
  duration: number;       // seconds
  bitrate: number;
  sampleRate: number;
  key: string;
  fileType: string;
  fileSize: number;
  dateAdded: string;
}

// ============================================================================
// PARSER
// ============================================================================

/**
 * Parse a Serato database V2 file into an array of track entries.
 */
export function parseSeratoDatabase(buffer: ArrayBuffer): SeratoTrack[] {
  const entries = parseTLVStream(buffer);
  const tracks: SeratoTrack[] = [];

  for (const entry of entries) {
    if (entry.tag !== 'otrk') continue;

    const children = parseNestedTLV(entry.data);
    const track = parseTrackEntry(children);
    if (track.filePath) {
      tracks.push(track);
    }
  }

  return tracks;
}

/**
 * Parse child TLVs of an "otrk" container into a SeratoTrack.
 */
function parseTrackEntry(children: { tag: string; data: Uint8Array }[]): SeratoTrack {
  const track: SeratoTrack = {
    filePath: '',
    title: '',
    artist: '',
    album: '',
    genre: '',
    bpm: 0,
    duration: 0,
    bitrate: 0,
    sampleRate: 0,
    key: '',
    fileType: '',
    fileSize: 0,
    dateAdded: '',
  };

  for (const child of children) {
    const text = decodeUTF16BE(child.data);

    switch (child.tag) {
      case 'pfil':  // file path
      case 'ptrk':  // alternate path tag
        if (!track.filePath) track.filePath = text;
        break;
      case 'tsng':  // song title
        track.title = text;
        break;
      case 'tart':  // artist
        track.artist = text;
        break;
      case 'talb':  // album
        track.album = text;
        break;
      case 'tgen':  // genre
        track.genre = text;
        break;
      case 'tbpm':  // BPM (string, e.g. "128.00")
        track.bpm = parseFloat(text) || 0;
        break;
      case 'tlen':  // duration (string, seconds or "MM:SS")
        track.duration = parseDuration(text);
        break;
      case 'tbit':  // bitrate
        track.bitrate = parseInt(text, 10) || 0;
        break;
      case 'tsmp':  // sample rate
        track.sampleRate = parseInt(text, 10) || 0;
        break;
      case 'tkey':  // musical key
        track.key = text;
        break;
      case 'ttyp':  // file type
        track.fileType = text;
        break;
      case 'tsiz':  // file size
        track.fileSize = parseInt(text, 10) || 0;
        break;
      case 'tadd':  // date added
        track.dateAdded = text;
        break;
    }
  }

  // If no title, derive from filename
  if (!track.title && track.filePath) {
    const parts = track.filePath.replace(/\\/g, '/').split('/');
    const filename = parts[parts.length - 1] || '';
    track.title = filename.replace(/\.[^.]+$/, '');
  }

  return track;
}

/**
 * Parse a duration string to seconds. Handles both "234" (seconds) and "3:54" (MM:SS).
 */
function parseDuration(text: string): number {
  if (text.includes(':')) {
    const parts = text.split(':');
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  }
  return parseInt(text, 10) || 0;
}
