// Modland metadata extraction utilities

import type { ModlandHashFile } from '../modlandApi';

export interface ModlandMetadata {
  artist: string;
  title: string;
  format: string;
}

/**
 * Extract metadata from Modland URL path structure
 * Example: /pub/modules/Protracker/Tip/acidjazzed.mod
 * Returns: { artist: "Tip", title: "acidjazzed", format: "Protracker" }
 */
export function extractMetadata(file: ModlandHashFile): ModlandMetadata {
  const url = decodeURIComponent(file.url);
  const parts = url.split('/').filter(Boolean);

  // Default values
  let format = 'Unknown';
  let artist = 'Unknown';
  let title = 'Unknown';

  // Extract format from path structure
  if (parts.length >= 3 && parts[0] === 'pub' && parts[1] === 'modules') {
    format = parts[2];
  }

  // Extract artist (usually second-to-last segment)
  if (parts.length >= 2) {
    artist = parts[parts.length - 2];
    // Clean up artist name
    if (artist === '- unknown') artist = 'Unknown';
  }

  // Extract title from filename (last segment)
  if (parts.length >= 1) {
    const filename = parts[parts.length - 1];
    // Remove extension
    title = filename.replace(/\.[^.]+$/, '');
    // Clean up title
    title = title.replace(/%20/g, ' ');
  }

  return { artist, title, format };
}

/**
 * Get friendly format name from extension
 */
export function getFormatName(extension: string): string {
  const formats: Record<string, string> = {
    '.mod': 'ProTracker MOD',
    '.xm': 'FastTracker 2',
    '.it': 'Impulse Tracker',
    '.s3m': 'Scream Tracker 3',
    '.fur': 'Furnace',
    '.ftm': 'FamiTracker',
    '.sid': 'Commodore 64 SID',
    '.spc': 'SNES SPC700',
    '.nsf': 'NES NSF',
    '.sap': 'Atari SAP',
    '.psf': 'PlayStation PSF',
    '.vgz': 'Sega Genesis VGZ',
    '.mid': 'MIDI',
  };

  return formats[extension.toLowerCase()] || extension.toUpperCase();
}

/**
 * Build Modland CDN URL for downloading
 */
export function getModlandDownloadUrl(file: ModlandHashFile): string {
  return `https://ftp.modland.com${encodeURI(file.url)}`;
}
